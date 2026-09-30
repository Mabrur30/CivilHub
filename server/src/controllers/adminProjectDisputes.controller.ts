import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type AdminRequest, adminError } from "../middleware/adminAuth.middleware";
import { Conversation } from "../models/Conversation.model";
import { Message } from "../models/Message.model";
import { type IPayment, Payment } from "../models/Payment.model";
import { Project } from "../models/Project.model";
import {
  type IProjectDispute,
  ProjectDispute,
  type ProjectDisputeOutcome,
  type ProjectDisputeStatus,
} from "../models/ProjectDispute.model";
import { ProjectPhase } from "../models/ProjectPhase.model";
import { casesAwaitingAdmin, evidenceContextFor, loadCase, threadsForAdmin } from "../utils/disputeCases";
import { evidenceView } from "../utils/evidence";
import {
  announcePendingDecision,
  appealDeadlineFrom,
  assertCanReviewAppeal,
  checkProjectOutcome,
  decisionReview,
  finalizeDueDecisions,
  finalizeProjectDispute,
} from "../utils/disputeDecisions";
import { getHeldMoney, projectTitle } from "../utils/projectMoney";
import { sendAdminCaseMessage } from "./caseMessage.controller";
import { PAGE_SIZE, logAction, objectId, pageOf, requireReason } from "./admin.controller";
import { REASON_LABELS } from "./projectDispute.controller";
import { canApproveWithoutPayment } from "./projectProgress.controller";

/**
 * Project disputes: a client or provider asked CivilHub to step in. The
 * project is paused until an admin resumes it, approves a waiting phase for
 * the client, or cancels it and splits the money CivilHub holds. Decisions
 * other than resuming wait out an appeal window (see utils/disputeDecisions).
 */

/** List tabs: open cases under review or waiting to take effect, appeals, and closed ones. */
const TABS = ["open", "appealed", "resolved", "withdrawn"] as const;
type Tab = (typeof TABS)[number];

const tabFilter = (tab: Tab): Record<string, unknown> =>
  tab === "open"
    ? { status: "open", stage: { $ne: "appealed" } }
    : tab === "appealed"
      ? { status: "open", stage: "appealed" }
      : { status: tab as ProjectDisputeStatus };
const MESSAGE_LIMIT = 200;

interface PopulatedParty {
  _id: Types.ObjectId;
  name: string;
  email?: string;
  role?: string;
}

const party = (value: unknown) => {
  const user = value as PopulatedParty | null;
  return user && typeof user === "object" && "name" in user
    ? { id: user._id.toString(), name: user.name, email: user.email ?? "", role: user.role ?? "" }
    : null;
};

const toRow = (dispute: IProjectDispute) => {
  const project = dispute.project as unknown as { _id: Types.ObjectId; title?: string; name?: string } | null;
  return {
    id: dispute._id.toString(),
    projectId: project?._id?.toString() ?? dispute.project.toString(),
    projectTitle: project ? projectTitle(project) : "Project",
    client: party(dispute.client),
    provider: party(dispute.provider),
    openedByRole: dispute.openedByRole,
    reason: dispute.reason,
    reasonLabel: REASON_LABELS[dispute.reason],
    description: dispute.description,
    status: dispute.status,
    stage: dispute.stage ?? "review",
    openedAt: dispute.createdAt.toISOString(),
    decision: dispute.decision
      ? {
          outcome: dispute.decision.outcome,
          note: dispute.decision.note,
          phase: dispute.decision.phase?.toString() ?? null,
          providerAmount: dispute.decision.providerAmount ?? null,
          decidedBy: dispute.decision.decidedBy.toString(),
          decidedAt: dispute.decision.decidedAt.toISOString(),
          appealDeadline: dispute.decision.appealDeadline.toISOString(),
          acceptedBy: dispute.decision.acceptedBy.map((id) =>
            id.toString() === idOf(dispute.client).toString() ? "client" : "provider",
          ),
        }
      : null,
    appeal: dispute.appeal
      ? {
          role: dispute.appeal.role,
          reason: dispute.appeal.reason,
          openedAt: dispute.appeal.openedAt.toISOString(),
          decision: dispute.appeal.decision ?? null,
          note: dispute.appeal.note ?? null,
          decidedAt: dispute.appeal.decidedAt?.toISOString() ?? null,
        }
      : null,
    resolution: dispute.resolution
      ? {
          outcome: dispute.resolution.outcome,
          note: dispute.resolution.note,
          providerAmount: dispute.resolution.providerAmount ?? null,
          refundAmount: dispute.resolution.refundAmount ?? null,
          decidedAt: dispute.resolution.decidedAt.toISOString(),
        }
      : null,
  };
};

const populated = (query: ReturnType<typeof ProjectDispute.findOne>) =>
  query
    .populate("project", "title name")
    .populate("client", "name email role")
    .populate("provider", "name email role");

export const listProjectDisputes = async (req: AdminRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    await finalizeDueDecisions();
    const tab = TABS.find((value) => value === req.query.status) ?? "open";
    const filter = tabFilter(tab);
    const page = pageOf(req.query.page);
    const [rows, total] = await Promise.all([
      ProjectDispute.find(filter)
        .sort(tab === "open" || tab === "appealed" ? { createdAt: 1 } : { updatedAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate("project", "title name")
        .populate("client", "name email role")
        .populate("provider", "name email role")
        .exec(),
      ProjectDispute.countDocuments(filter).exec(),
    ]);
    const waiting = await casesAwaitingAdmin("project", rows.map((row) => row._id as Types.ObjectId));
    res.json({
      items: rows.map((row) => ({ ...toRow(row), newReply: waiting.has(row._id.toString()) })),
      page,
      pageSize: PAGE_SIZE,
      total,
    });
  } catch (error: unknown) {
    next(error);
  }
};

const loadDispute = async (disputeId: string | undefined): Promise<IProjectDispute> => {
  const dispute = await populated(ProjectDispute.findOne({ _id: objectId(disputeId, "Dispute") })).exec();
  if (!dispute) throw adminError("Dispute not found", 404);
  return dispute;
};

/** Everything an admin needs to decide: the work, the money and the conversation. */
export const getProjectDispute = async (req: AdminRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    await finalizeDueDecisions();
    const dispute = await loadDispute(req.params.disputeId);
    const projectId = (dispute.project as unknown as { _id: Types.ObjectId })._id ?? dispute.project;
    const project = await Project.findById(projectId).exec();
    if (!project) throw adminError("The project no longer exists.", 404);

    const clientId = (dispute.client as unknown as { _id: Types.ObjectId })._id;
    const providerId = (dispute.provider as unknown as { _id: Types.ObjectId })._id;
    const pairKey = [clientId.toString(), providerId.toString()].sort().join(":");

    const [phases, payments, money, conversation, history] = await Promise.all([
      ProjectPhase.find({ project: project._id }).sort({ order: 1 }).exec(),
      Payment.find({ project: project._id, status: { $in: ["paid", "initiated"] } })
        .sort({ createdAt: 1 })
        .lean<IPayment[]>()
        .exec(),
      project.status === "in-progress" ? getHeldMoney(project._id as Types.ObjectId) : Promise.resolve(null),
      Conversation.findOne({ pairKey }).select("_id").lean().exec(),
      ProjectDispute.find({ project: project._id, _id: { $ne: dispute._id } }).sort({ createdAt: -1 }).lean().exec(),
    ]);
    const info = await loadCase("project", dispute._id as Types.ObjectId);
    const threads = info ? await threadsForAdmin(info) : {};
    const evidenceContext = info ? await evidenceContextFor(info) : {};
    const messages = conversation
      ? (
          await Message.find({ conversation: conversation._id })
            .sort({ createdAt: -1 })
            .limit(MESSAGE_LIMIT)
            .lean()
            .exec()
        ).reverse()
      : [];

    res.json({
      ...toRow(dispute),
      project: {
        id: project._id.toString(),
        title: projectTitle(project),
        status: project.status,
        paused: Boolean(project.disputeOpen),
        totalAgreedValue: project.totalAgreedValue ?? null,
        paymentPlan: project.paymentPlan ?? null,
        fundsBeforeWork: project.fundingRule === "before_work",
        phasePlanStatus: project.phasePlanStatus,
        advancePaid: project.advancePaid,
        cancellation: project.cancellation ?? null,
        proposal: project.cancellationProposal ?? null,
      },
      held: money?.held ?? null,
      phases: phases.map((phase) => ({
        id: phase._id.toString(),
        name: phase.name,
        order: phase.order,
        status: phase.status,
        price: phase.price,
        paymentStatus: phase.paymentStatus,
        dueDate: phase.dueDate?.toISOString() ?? null,
        completedAt: phase.completedAt?.toISOString() ?? null,
        changeRequest: phase.changeRequest
          ? { note: phase.changeRequest.note, requestedAt: phase.changeRequest.requestedAt.toISOString() }
          : null,
        submissions: phase.submissions.map((submission) => ({
          note: submission.note,
          submittedAt: submission.submittedAt.toISOString(),
          files: submission.files.map((file) => ({
            name: file.name,
            url: file.url,
            mimeType: file.mimeType,
            isImage: file.resourceType === "image",
            ...evidenceView(file, evidenceContext),
          })),
        })),
        canApproveForClient: project.status === "in-progress" && canApproveWithoutPayment(project, phase, phases),
      })),
      payments: payments.map((payment) => ({
        id: payment._id.toString(),
        type: payment.type,
        status: payment.status,
        amount: payment.amount,
        payeeAmount: payment.payeeAmount ?? 0,
        paidAt: payment.paidAt?.toISOString() ?? null,
        description: payment.description ?? null,
      })),
      messages: messages.map((message) => ({
        id: message._id.toString(),
        fromRole: message.sender.toString() === clientId.toString() ? "client" : "provider",
        type: message.messageType,
        content: message.content ?? null,
        attachmentName: message.attachmentName ?? null,
        attachmentUrl: message.attachmentUrl ?? null,
        aboutThisProject: message.project?.toString() === project._id.toString(),
        at: message.createdAt.toISOString(),
      })),
      // CivilHub's private threads with each side, with their evidence.
      threads,
      review: await decisionReview(req.admin.id, dispute.decision?.decidedBy),
      earlierDisputes: history.map((item) => ({
        status: item.status,
        reason: REASON_LABELS[item.reason],
        openedAt: item.createdAt.toISOString(),
        outcome: item.resolution?.outcome ?? null,
      })),
    });
  } catch (error: unknown) {
    next(error);
  }
};

/** Writes to the client or the provider in their private thread. */
export const messageProjectDisputeParty = async (
  req: AdminRequest<{ to?: unknown; text?: unknown; replyByDays?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { message } = await sendAdminCaseMessage(req, "project", req.params.disputeId);
    res.status(201).json(message);
  } catch (error: unknown) {
    next(error);
  }
};

const OUTCOMES: ProjectDisputeOutcome[] = ["resumed", "phase_approved", "cancelled"];

const pickOutcome = (value: unknown): ProjectDisputeOutcome => {
  const outcome = OUTCOMES.find((item) => item === value);
  if (!outcome) throw adminError("Choose resume, approve a phase, or cancel the project.", 400);
  return outcome;
};

const loadOpenProject = async (dispute: IProjectDispute) => {
  const projectId = (dispute.project as unknown as { _id: Types.ObjectId })._id ?? dispute.project;
  const project = await Project.findById(projectId).exec();
  if (!project || project.status !== "in-progress") throw adminError("This project isn't under way any more.", 409);
  return project;
};

const idOf = (value: unknown): Types.ObjectId =>
  ((value as { _id?: Types.ObjectId })?._id ?? value) as Types.ObjectId;

/**
 * An admin decides a dispute. Resuming takes effect at once. Approving a
 * phase or cancelling waits APPEAL_DAYS for an appeal, with the project still
 * paused, unless both sides accept it sooner.
 */
export const resolveProjectDispute = async (
  req: AdminRequest<{ outcome?: unknown; note?: unknown; phaseId?: unknown; providerAmount?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const outcome = pickOutcome(req.body.outcome);
    const note = requireReason(req.body.note);
    const dispute = await loadDispute(req.params.disputeId);
    if (dispute.status !== "open") throw adminError("This dispute has already been closed.", 409);
    if (dispute.stage !== "review") throw adminError("This dispute already has a decision.", 409);
    const project = await loadOpenProject(dispute);
    const checked = await checkProjectOutcome(project, { outcome, phaseId: req.body.phaseId, providerAmount: req.body.providerAmount });
    const now = new Date();
    const adminId = new Types.ObjectId(req.admin.id);

    if (outcome === "resumed") {
      const closed = await finalizeProjectDispute(
        dispute._id as Types.ObjectId,
        { outcome, note, decidedBy: adminId, decidedAt: now },
        ["review"],
        "",
      );
      if (!closed) throw adminError("This dispute has already been closed.", 409);
    } else {
      const appealDeadline = appealDeadlineFrom(now);
      const pending = await ProjectDispute.findOneAndUpdate(
        { _id: dispute._id, status: "open", stage: "review" },
        {
          $set: {
            stage: "awaiting_final",
            decision: {
              outcome,
              note,
              phase: checked.phase,
              providerAmount: checked.providerAmount,
              decidedBy: adminId,
              decidedAt: now,
              appealDeadline,
              acceptedBy: [],
            },
          },
        },
        { returnDocument: "after" },
      ).exec();
      if (!pending) throw adminError("This dispute already has a decision.", 409);
      await announcePendingDecision(
        [idOf(dispute.client), idOf(dispute.provider)],
        { project: project._id as Types.ObjectId },
        `CivilHub decided to ${checked.summary} on ${projectTitle(project)}.`,
        note,
        appealDeadline,
      );
    }

    await logAction(req, "project.dispute_resolve", {
      targetType: "project",
      targetId: project._id as Types.ObjectId,
      subjectUser: idOf(dispute.provider),
      reason: note,
      meta: {
        outcome,
        disputeId: dispute._id.toString(),
        phase: checked.phase?.toString() ?? null,
        providerAmount: checked.providerAmount,
        takesEffect: outcome === "resumed" ? "now" : "after the appeal window",
      },
    });
    res.json(toRow(await loadDispute(dispute._id.toString())));
  } catch (error: unknown) {
    next(error);
  }
};

/**
 * An appeal against a decision. Another admin upholds it, or changes it to
 * any outcome; either way it takes effect at once and is final.
 */
export const decideProjectAppeal = async (
  req: AdminRequest<{ decision?: unknown; note?: unknown; outcome?: unknown; phaseId?: unknown; providerAmount?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const choice = req.body.decision === "uphold" || req.body.decision === "change" ? req.body.decision : null;
    if (!choice) throw adminError("Choose to uphold the decision or change it.", 400);
    const note = requireReason(req.body.note);
    const dispute = await loadDispute(req.params.disputeId);
    if (dispute.status !== "open" || dispute.stage !== "appealed" || !dispute.decision || !dispute.appeal) {
      throw adminError("There's no appeal waiting on this dispute.", 409);
    }
    await assertCanReviewAppeal(req.admin.id, dispute.decision.decidedBy);
    const project = await loadOpenProject(dispute);
    const now = new Date();
    const adminId = new Types.ObjectId(req.admin.id);

    const original = dispute.decision;
    let input;
    if (choice === "uphold") {
      input = {
        outcome: original.outcome,
        note,
        phase: original.phase ?? null,
        providerAmount: original.providerAmount ?? null,
        decidedBy: adminId,
        decidedAt: now,
      };
    } else {
      const outcome = pickOutcome(req.body.outcome);
      const checked = await checkProjectOutcome(project, { outcome, phaseId: req.body.phaseId, providerAmount: req.body.providerAmount });
      input = { outcome, note, phase: checked.phase, providerAmount: checked.providerAmount, decidedBy: adminId, decidedAt: now };
    }

    const recorded = await ProjectDispute.updateOne(
      { _id: dispute._id, stage: "appealed", "appeal.decision": null },
      {
        $set: {
          "appeal.decision": choice === "uphold" ? "upheld" : "changed",
          "appeal.note": note,
          "appeal.decidedBy": adminId,
          "appeal.decidedAt": now,
        },
      },
    ).exec();
    if (recorded.modifiedCount !== 1) throw adminError("This appeal has already been decided.", 409);

    const closed = await finalizeProjectDispute(
      dispute._id as Types.ObjectId,
      input,
      ["appealed"],
      choice === "uphold"
        ? "CivilHub reviewed the appeal and upheld its decision."
        : "CivilHub reviewed the appeal and changed its decision.",
      "dispute_appeal_decided",
    );
    if (!closed) throw adminError("This dispute has already been closed.", 409);

    await logAction(req, "project.dispute_appeal", {
      targetType: "project",
      targetId: project._id as Types.ObjectId,
      subjectUser: dispute.appeal.by,
      reason: note,
      meta: { disputeId: dispute._id.toString(), decision: choice, outcome: input.outcome, providerAmount: input.providerAmount },
    });
    res.json(toRow(await loadDispute(dispute._id.toString())));
  } catch (error: unknown) {
    next(error);
  }
};

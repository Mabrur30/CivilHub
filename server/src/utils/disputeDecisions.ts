import { Types } from "mongoose";
import { approvePhaseForClient, canApproveWithoutPayment } from "../controllers/projectProgress.controller";
import { Admin } from "../models/Admin.model";
import { type DepositDisputeDecision, EquipmentBooking, type IEquipmentBooking } from "../models/EquipmentBooking.model";
import { Notification, type NotificationType } from "../models/Notification.model";
import { type IProject, Project } from "../models/Project.model";
import {
  type IProjectDispute,
  ProjectDispute,
  type ProjectDisputeOutcome,
  type ProjectDisputeResolution,
} from "../models/ProjectDispute.model";
import { ProjectPhase } from "../models/ProjectPhase.model";
import { formatTaka } from "./money";
import { cancelProject, getHeldMoney, projectTitle } from "./projectMoney";

/**
 * How dispute decisions take effect.
 *
 * Resuming a project takes effect at once: nothing is taken from anyone. Every
 * other decision (approving a phase for the client, cancelling a project with
 * a split, and any deposit decision) waits APPEAL_DAYS, during which either
 * side can appeal once, or both can accept it to end the wait. Nothing moves
 * until then: the project stays paused and the deposit claim stays on hold.
 * An appeal is reviewed by another admin where there is one, and that
 * decision is final.
 */

export const APPEAL_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export const appealDeadlineFrom = (now: Date): Date => new Date(now.getTime() + APPEAL_DAYS * DAY_MS);

type StatusError = Error & { statusCode: number };
const decisionError = (message: string, statusCode: number): StatusError =>
  Object.assign(new Error(message), { statusCode });

const formatDay = (date: Date): string =>
  date.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Asia/Dhaka" });

/**
 * Whether this admin may decide an appeal against their own decision: only
 * when no other active admin could.
 */
export const assertCanReviewAppeal = async (adminId: string, decidedBy: Types.ObjectId | null | undefined): Promise<void> => {
  if (!decidedBy || decidedBy.toString() !== adminId) return;
  const others = await Admin.countDocuments({ _id: { $ne: decidedBy }, isActive: true }).exec();
  if (others > 0) throw decisionError("Another admin needs to review an appeal against your own decision.", 409);
};

/** Who made a decision, and whether the admin looking at it may review an appeal against it. */
export const decisionReview = async (
  adminId: string,
  decidedBy: Types.ObjectId | null | undefined,
): Promise<{ decidedByName: string | null; isOwnDecision: boolean; mayReview: boolean } | null> => {
  if (!decidedBy) return null;
  const [decider, others] = await Promise.all([
    Admin.findById(decidedBy).select("name").lean().exec(),
    Admin.countDocuments({ _id: { $ne: decidedBy }, isActive: true }).exec(),
  ]);
  const isOwnDecision = decidedBy.toString() === adminId;
  return { decidedByName: decider?.name ?? null, isOwnDecision, mayReview: !isOwnDecision || others === 0 };
};

// ---------------------------------------------------------------- projects

export interface ProjectOutcomeInput {
  outcome: ProjectDisputeOutcome;
  note: string;
  phase?: Types.ObjectId | null;
  providerAmount?: number | null;
  decidedBy: Types.ObjectId;
  decidedAt: Date;
}

/** Checks an outcome can be carried out on this project, and normalises it. */
export const checkProjectOutcome = async (
  project: IProject,
  input: { outcome: ProjectDisputeOutcome; phaseId?: unknown; providerAmount?: unknown },
): Promise<{ phase: Types.ObjectId | null; providerAmount: number | null; summary: string }> => {
  if (input.outcome === "phase_approved") {
    const phaseId = typeof input.phaseId === "string" && Types.ObjectId.isValid(input.phaseId) ? input.phaseId : "";
    const phases = await ProjectPhase.find({ project: project._id }).exec();
    const phase = phases.find((item) => item._id.toString() === phaseId);
    if (!phase || !canApproveWithoutPayment(project, phase, phases)) {
      throw decisionError("That phase can't be approved for the client; it isn't waiting, or approving it needs a payment.", 409);
    }
    return { phase: phase._id as Types.ObjectId, providerAmount: null, summary: `approve ${phase.name} for the client` };
  }
  if (input.outcome === "cancelled") {
    const providerAmount = Math.round(Number(input.providerAmount) * 100) / 100;
    const { held } = await getHeldMoney(project._id as Types.ObjectId);
    if (!Number.isFinite(providerAmount) || providerAmount < 0 || providerAmount > held) {
      throw decisionError(`The provider's share must be between ${formatTaka(0)} and ${formatTaka(held)}.`, 400);
    }
    return {
      phase: null,
      providerAmount,
      summary: `end the project: the provider keeps ${formatTaka(providerAmount)} of the ${formatTaka(held)} CivilHub holds, and the client is refunded ${formatTaka(Math.round((held - providerAmount) * 100) / 100)}`,
    };
  }
  return { phase: null, providerAmount: null, summary: "resume the project" };
};

const notifyBoth = (
  dispute: Pick<IProjectDispute, "client" | "provider" | "project">,
  type: NotificationType,
  message: string,
) =>
  Notification.insertMany(
    [dispute.client, dispute.provider].map((recipient) => ({ recipient, type, message, project: dispute.project })),
  );

/**
 * Carries out an outcome and closes the dispute, once: the dispute is marked
 * resolved first, conditionally, so a sweep and an acceptance racing each
 * other can't both apply it. If carrying it out fails, the dispute goes back
 * to an admin for review.
 */
export const finalizeProjectDispute = async (
  disputeId: Types.ObjectId,
  input: ProjectOutcomeInput,
  fromStages: Array<IProjectDispute["stage"]>,
  lead: string,
  type: NotificationType = "project_dispute_resolved",
): Promise<IProjectDispute | null> => {
  const now = new Date();
  const resolution: ProjectDisputeResolution = {
    outcome: input.outcome,
    note: input.note,
    ...(input.phase ? { phase: input.phase } : {}),
    decidedBy: input.decidedBy,
    decidedAt: input.decidedAt,
    finalAt: now,
  };
  const claimed = await ProjectDispute.findOneAndUpdate(
    { _id: disputeId, status: "open", stage: { $in: fromStages } },
    { $set: { status: "resolved", resolution } },
    { returnDocument: "after" },
  ).exec();
  if (!claimed) return null;

  const project = await Project.findById(claimed.project).exec();
  const title = project ? projectTitle(project) : "your project";
  let summary: string;
  try {
    if (!project || project.status !== "in-progress") throw decisionError("This project isn't under way any more.", 409);
    if (input.outcome === "phase_approved") {
      await Project.updateOne({ _id: project._id }, { $set: { disputeOpen: false } }).exec();
      const approved = input.phase ? await approvePhaseForClient(project._id as Types.ObjectId, input.phase.toString()) : false;
      if (!approved) {
        await Project.updateOne({ _id: project._id }, { $set: { disputeOpen: true } }).exec();
        throw decisionError("That phase can't be approved for the client any more.", 409);
      }
      const phase = await ProjectPhase.findById(input.phase).select("name").lean().exec();
      summary = `CivilHub approved ${phase?.name ?? "the phase"} for the client, and the project has resumed.`;
    } else if (input.outcome === "cancelled") {
      const cancelled = await cancelProject(
        project._id as Types.ObjectId,
        input.providerAmount ?? 0,
        "admin",
        "by CivilHub after a dispute",
      );
      if (!cancelled?.cancellation) throw decisionError("The money CivilHub holds on this project changed.", 409);
      await ProjectDispute.updateOne(
        { _id: disputeId },
        {
          $set: {
            "resolution.providerAmount": cancelled.cancellation.providerAmount,
            "resolution.refundAmount": cancelled.cancellation.refundAmount,
          },
        },
      ).exec();
      summary = `CivilHub decided the dispute on ${title}.`;
    } else {
      await Project.updateOne({ _id: project._id }, { $set: { disputeOpen: false } }).exec();
      summary = `CivilHub closed the dispute on ${title}, and the project has resumed.`;
    }
  } catch (error: unknown) {
    // Back to an admin: the decision couldn't be carried out as it stood.
    await ProjectDispute.updateOne(
      { _id: disputeId },
      { $set: { status: "open", stage: "review", resolution: null, decision: null } },
    ).exec();
    throw error;
  }

  await notifyBoth(claimed, type, `${lead ? `${lead} ` : ""}${summary} Note from CivilHub: ${input.note}`);
  return ProjectDispute.findById(disputeId).exec();
};

// ---------------------------------------------------------------- deposits

export interface DepositOutcomeInput {
  decision: DepositDisputeDecision;
  /** What the owner keeps. */
  amount: number;
  note: string;
  decidedBy: Types.ObjectId;
  decidedAt: Date;
}

const titleOf = (booking: IEquipmentBooking): string => {
  const equipment = booking.equipment as unknown as { title?: string } | null;
  return equipment && typeof equipment === "object" && equipment.title ? equipment.title : "your rental";
};

/** Works out what the owner keeps under a decision, checking a reduced amount. */
export const checkDepositOutcome = (claimed: number, decision: DepositDisputeDecision, amount: unknown): number => {
  if (decision === "rejected") return 0;
  if (decision === "upheld") return claimed;
  const reduced = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(reduced) || reduced <= 0 || reduced >= claimed) {
    throw decisionError(`The reduced claim must be more than 0 and less than ${formatTaka(claimed)}.`, 400);
  }
  return reduced;
};

export const describeDepositOutcome = (
  title: string,
  claimed: number,
  input: Pick<DepositOutcomeInput, "decision" | "amount">,
): string =>
  input.decision === "upheld"
    ? `CivilHub upheld the ${formatTaka(claimed)} deposit claim for ${title}.`
    : input.decision === "reduced"
      ? `CivilHub reduced the deposit claim for ${title} from ${formatTaka(claimed)} to ${formatTaka(input.amount)}.`
      : `CivilHub rejected the ${formatTaka(claimed)} deposit claim for ${title}.`;

/**
 * Carries out a deposit decision, once: the claim is settled at the decided
 * amount, and the renter's refund of the rest follows (see utils/refunds.ts).
 */
export const finalizeDepositDispute = async (
  bookingId: Types.ObjectId,
  input: DepositOutcomeInput,
  fromStages: string[],
  lead: string,
  type: NotificationType = "equipment_deposit_decided",
): Promise<IEquipmentBooking | null> => {
  const decided = {
    "depositDispute.status": "decided",
    "depositDispute.decision": input.decision,
    "depositDispute.decisionNote": input.note,
    "depositDispute.decidedBy": input.decidedBy,
    "depositDispute.decidedAt": input.decidedAt,
  };
  const filter: Record<string, unknown> = {
    _id: bookingId,
    "depositDispute.status": "open",
    // Older disputes have no stage; they count as under review.
    "depositDispute.stage": { $in: fromStages.includes("review") ? [...fromStages, null] : fromStages },
  };
  const updated = await EquipmentBooking.findOneAndUpdate(
    filter,
    input.decision === "rejected"
      ? { $set: { ...decided, depositResolution: "released" }, $unset: { depositClaimAmount: 1 } }
      : { $set: { ...decided, depositClaimAmount: input.amount } },
    { returnDocument: "after" },
  )
    .populate("equipment", "title")
    .exec();
  if (!updated?.depositDispute) return null;

  const claimed = updated.depositDispute.originalClaimAmount;
  const outcome = describeDepositOutcome(titleOf(updated), claimed, input);
  const refundBack = updated.securityDeposit - input.amount;
  const prefix = lead ? `${lead} ` : "";
  const equipmentId = (updated.equipment as unknown as { _id?: Types.ObjectId })?._id ?? updated.equipment;
  const common = { type, equipment: equipmentId, equipmentBooking: updated._id };
  await Notification.insertMany([
    {
      ...common,
      recipient: updated.renter,
      message:
        refundBack > 0
          ? `${prefix}${outcome} CivilHub will refund you ${formatTaka(refundBack)}. Note from CivilHub: ${input.note}`
          : `${prefix}${outcome} Note from CivilHub: ${input.note}`,
    },
    {
      ...common,
      recipient: updated.owner,
      message:
        input.amount > 0
          ? `${prefix}${outcome} ${formatTaka(input.amount)} will be paid to you with your earnings. Note from CivilHub: ${input.note}`
          : `${prefix}${outcome} Note from CivilHub: ${input.note}`,
    },
  ]);
  return updated;
};

// ---------------------------------------------------------------- the wait

/** Tells both sides a decision was made and when it takes effect. */
export const announcePendingDecision = (
  recipients: Types.ObjectId[],
  links: { project?: Types.ObjectId; equipment?: Types.ObjectId; equipmentBooking?: Types.ObjectId },
  what: string,
  note: string,
  deadline: Date,
) =>
  Notification.insertMany(
    recipients.map((recipient) => ({
      recipient,
      type: "dispute_decided" as const,
      message: `${what} It takes effect on ${formatDay(deadline)} unless either of you appeals; you can also accept it now. Note from CivilHub: ${note}`,
      ...links,
    })),
  );

/** Carries out the decisions whose appeal window has passed unused. */
export const finalizeDueDecisions = async (now: Date = new Date()): Promise<number> => {
  let finalized = 0;
  const projectDisputes = await ProjectDispute.find({
    status: "open",
    stage: "awaiting_final",
    "decision.appealDeadline": { $lte: now },
  }).exec();
  for (const dispute of projectDisputes) {
    const decision = dispute.decision;
    if (!decision) continue;
    try {
      const done = await finalizeProjectDispute(
        dispute._id as Types.ObjectId,
        {
          outcome: decision.outcome,
          note: decision.note,
          phase: decision.phase ?? null,
          providerAmount: decision.providerAmount ?? null,
          decidedBy: decision.decidedBy,
          decidedAt: decision.decidedAt,
        },
        ["awaiting_final"],
        "Nobody appealed, so CivilHub's decision has taken effect.",
      );
      if (done) finalized += 1;
    } catch (error: unknown) {
      console.error("A dispute decision couldn't be carried out; it's back with the admins", error);
    }
  }

  const bookings = await EquipmentBooking.find({
    "depositDispute.status": "open",
    "depositDispute.stage": "awaiting_final",
    "depositDispute.pendingDecision.appealDeadline": { $lte: now },
  })
    .select("depositDispute")
    .exec();
  for (const booking of bookings) {
    const pending = booking.depositDispute?.pendingDecision;
    if (!pending) continue;
    const done = await finalizeDepositDispute(
      booking._id,
      pending,
      ["awaiting_final"],
      "Nobody appealed, so CivilHub's decision has taken effect.",
    );
    if (done) finalized += 1;
  }
  return finalized;
};

/** A decision waiting to take effect, and any appeal against it, as the two sides see them. */
export interface PendingDecisionView {
  appealDeadline: string;
  /** Which sides have accepted it: "client"/"provider" or "renter"/"owner". */
  acceptedBy: string[];
  note: string;
}

export interface AppealView {
  role: string;
  reason: string;
  openedAt: string;
  decision: "upheld" | "changed" | null;
  note: string | null;
}

export const toAppealView = (
  appeal: { role: string; reason: string; openedAt: Date; decision?: "upheld" | "changed" | null; note?: string | null } | null | undefined,
): AppealView | null =>
  appeal
    ? {
        role: appeal.role,
        reason: appeal.reason,
        openedAt: appeal.openedAt.toISOString(),
        decision: appeal.decision ?? null,
        note: appeal.note ?? null,
      }
    : null;

export { formatDay as formatDecisionDay };

import { type NextFunction, type Response } from "express";
import { finalizeDueDecisions, toAppealView } from "../utils/disputeDecisions";
import { Types } from "mongoose";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Notification, type NotificationType } from "../models/Notification.model";
import { type IProject, Project } from "../models/Project.model";
import {
  type IProjectDispute,
  PROJECT_DISPUTE_REASONS,
  ProjectDispute,
  type ProjectDisputeReason,
} from "../models/ProjectDispute.model";
import { ProjectPhase } from "../models/ProjectPhase.model";
import { User } from "../models/User.model";
import { formatTaka } from "../utils/money";
import {
  NO_RESPONSE_DAYS,
  cancelProject,
  fundingWait,
  getHeldMoney,
  lastHandOver,
  projectTitle,
} from "../utils/projectMoney";

/**
 * When something goes wrong mid-project. Either side can ask CivilHub to
 * step in (which pauses the project until an admin decides), or propose
 * ending the project early with a split of the money CivilHub holds, which
 * the other side accepts or declines.
 */

interface StatusError extends Error {
  statusCode: number;
}

const disputeError = (message: string, statusCode: number): StatusError => {
  const error = new Error(message) as StatusError;
  error.statusCode = statusCode;
  return error;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 2000;
const NOTE_MAX = 1000;

interface Party {
  project: IProject;
  role: "client" | "provider";
  otherId: Types.ObjectId | undefined;
}

/** The project, if the signed-in user is its client or its assigned provider. */
const loadAsParty = async (req: AuthenticatedRequest): Promise<Party> => {
  const { projectId } = req.params as { projectId?: string };
  if (!projectId || !Types.ObjectId.isValid(projectId)) throw disputeError("Project not found", 404);
  const project = await Project.findById(projectId).exec();
  if (!project) throw disputeError("Project not found", 404);
  const userId = req.user.userId;
  if (project.client?.toString() === userId) {
    return { project, role: "client", otherId: project.assignedEngineer ?? undefined };
  }
  if (project.assignedEngineer?.toString() === userId) {
    return { project, role: "provider", otherId: project.client };
  }
  throw disputeError("Only the client and the hired engineer or company can do this.", 403);
};

const requireInProgress = (project: IProject): void => {
  if (project.status !== "in-progress" || !project.assignedEngineer) {
    throw disputeError("This only applies to a project that's under way.", 409);
  }
};

const notify = (recipient: Types.ObjectId | undefined, type: NotificationType, message: string, project: IProject) =>
  recipient ? Notification.create({ recipient, type, message, project: project._id }) : Promise.resolve(null);

const roundTaka = (value: number): number => Math.round(value * 100) / 100;

export const REASON_LABELS: Record<ProjectDisputeReason, string> = {
  quality: "The work isn't up to standard",
  delay: "The work is late",
  scope: "Disagreement about what's included",
  payment: "A payment problem",
  communication: "The other side isn't communicating",
  no_response: "The client hasn't answered a hand-over or funded the next phase",
  other: "Something else",
};

const toDisputeView = (dispute: IProjectDispute | null) =>
  dispute
    ? {
        id: dispute._id.toString(),
        status: dispute.status,
        stage: dispute.stage ?? "review",
        // The decision waiting out its appeal window: what would happen, and when.
        decision: dispute.decision
          ? {
              outcome: dispute.decision.outcome,
              note: dispute.decision.note,
              phase: dispute.decision.phase?.toString() ?? null,
              providerAmount: dispute.decision.providerAmount ?? null,
              appealDeadline: dispute.decision.appealDeadline.toISOString(),
              acceptedBy: dispute.decision.acceptedBy.map((id) =>
                id.toString() === dispute.client.toString() ? "client" : "provider",
              ),
            }
          : null,
        appeal: toAppealView(dispute.appeal),
        openedByRole: dispute.openedByRole,
        openedBy: dispute.openedBy.toString(),
        reason: dispute.reason,
        reasonLabel: REASON_LABELS[dispute.reason],
        description: dispute.description,
        openedAt: dispute.createdAt.toISOString(),
        resolution: dispute.resolution
          ? {
              outcome: dispute.resolution.outcome,
              note: dispute.resolution.note,
              providerAmount: dispute.resolution.providerAmount ?? null,
              refundAmount: dispute.resolution.refundAmount ?? null,
              decidedAt: dispute.resolution.decidedAt.toISOString(),
            }
          : null,
      }
    : null;

/** The project's dispute state, pending proposal, cancellation and held money. */
export const getProjectDisputeState = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await finalizeDueDecisions();
    const { project } = await loadAsParty(req);
    const [open, latest, money, allPhases] = await Promise.all([
      ProjectDispute.findOne({ project: project._id, status: "open" }).exec(),
      ProjectDispute.findOne({ project: project._id, status: "resolved" }).sort({ updatedAt: -1 }).exec(),
      project.status === "in-progress" ? getHeldMoney(project._id as Types.ObjectId) : Promise.resolve(null),
      ProjectPhase.find({ project: project._id }).exec(),
    ]);
    const phases = allPhases.filter((phase) => phase.status === "awaiting_approval");
    const cutoff = Date.now() - NO_RESPONSE_DAYS * DAY_MS;
    const wait = fundingWait(project, allPhases);
    const proposal = project.cancellationProposal;
    res.json({
      status: project.status,
      paused: Boolean(project.disputeOpen),
      held: money?.held ?? null,
      dispute: toDisputeView(open),
      lastResolved: toDisputeView(latest),
      // The provider can escalate a hand-over the client has left unanswered.
      canReportNoResponse:
        (wait !== null && wait.since.getTime() <= cutoff) ||
        phases.some((phase) => {
          const handedOver = lastHandOver(phase);
          return handedOver !== null && handedOver.getTime() <= cutoff;
        }),
      // The phase the provider can't start until the client funds it.
      waitingForFunding: wait
        ? { phaseId: wait.phase._id.toString(), phase: wait.phase.name, since: wait.since.toISOString() }
        : null,
      proposal: proposal
        ? {
            proposedBy: proposal.proposedBy.toString(),
            providerAmount: proposal.providerAmount,
            note: proposal.note ?? null,
            proposedAt: proposal.proposedAt.toISOString(),
          }
        : null,
      cancellation: project.cancellation
        ? { ...project.cancellation, cancelledAt: project.cancelledAt?.toISOString() ?? null }
        : null,
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const openProjectDispute = async (
  req: AuthenticatedRequest<{ reason?: unknown; description?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { project, role, otherId } = await loadAsParty(req);
    requireInProgress(project);

    const reason = PROJECT_DISPUTE_REASONS.find((value) => value === req.body.reason);
    if (!reason) throw disputeError("Choose what the problem is about.", 400);
    const description = typeof req.body.description === "string" ? req.body.description.trim() : "";
    if (description.length < DESCRIPTION_MIN) {
      throw disputeError("Describe what went wrong in a few sentences, so CivilHub can look into it.", 400);
    }
    if (description.length > DESCRIPTION_MAX) {
      throw disputeError(`Keep it under ${DESCRIPTION_MAX} characters.`, 400);
    }
    if (reason === "no_response") {
      if (role !== "provider") throw disputeError("Only the provider can report an unanswered hand-over.", 400);
      const cutoff = Date.now() - NO_RESPONSE_DAYS * DAY_MS;
      const phases = await ProjectPhase.find({ project: project._id }).exec();
      const wait = fundingWait(project, phases);
      const overdue =
        (wait !== null && wait.since.getTime() <= cutoff) ||
        phases.some((phase) => {
          const handedOver = phase.status === "awaiting_approval" ? lastHandOver(phase) : null;
          return handedOver !== null && handedOver.getTime() <= cutoff;
        });
      if (!overdue) {
        throw disputeError(
          `You can report the client as unresponsive once a hand-over or the next phase's funding has waited ${NO_RESPONSE_DAYS} days.`,
          400,
        );
      }
    }

    let dispute: IProjectDispute;
    try {
      dispute = await ProjectDispute.create({
        project: project._id,
        client: project.client,
        provider: project.assignedEngineer ?? undefined,
        openedBy: req.user.userId,
        openedByRole: role,
        reason,
        description,
      });
    } catch (error: unknown) {
      if ((error as { code?: number }).code === 11000) {
        throw disputeError("CivilHub is already looking into a problem on this project.", 409);
      }
      throw error;
    }
    // Pause the project; a waiting cancellation proposal is now CivilHub's call.
    await Project.updateOne({ _id: project._id }, { $set: { disputeOpen: true, cancellationProposal: null } }).exec();

    const opener = await User.findById(req.user.userId).select("name").lean().exec();
    await notify(
      otherId,
      "project_dispute_opened",
      `${opener?.name ?? "The other side"} asked CivilHub to step in on ${projectTitle(project)}: ${REASON_LABELS[reason].toLowerCase()}. The project is paused until CivilHub decides; you can still message each other.`,
      project,
    );
    res.status(201).json({ dispute: toDisputeView(dispute) });
  } catch (error: unknown) {
    next(error);
  }
};

export const withdrawProjectDispute = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { project, otherId } = await loadAsParty(req);
    // Once CivilHub has decided, the decision is accepted or appealed instead.
    const dispute = await ProjectDispute.findOneAndUpdate(
      { project: project._id, status: "open", stage: "review", openedBy: req.user.userId },
      { $set: { status: "withdrawn", withdrawnAt: new Date() } },
      { returnDocument: "after" },
    ).exec();
    if (!dispute) throw disputeError("There's no dispute of yours to withdraw. If CivilHub has decided, accept or appeal the decision.", 409);
    await Project.updateOne({ _id: project._id }, { $set: { disputeOpen: false } }).exec();
    await notify(
      otherId,
      "project_dispute_resolved",
      `The dispute on ${projectTitle(project)} was withdrawn, and the project has resumed.`,
      project,
    );
    res.json({ dispute: toDisputeView(dispute) });
  } catch (error: unknown) {
    next(error);
  }
};

export const proposeCancellation = async (
  req: AuthenticatedRequest<{ providerAmount?: unknown; note?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { project, role, otherId } = await loadAsParty(req);
    requireInProgress(project);
    if (project.disputeOpen) {
      throw disputeError("CivilHub is reviewing a dispute on this project; it will decide how it ends.", 409);
    }
    if (project.cancellationProposal) {
      throw disputeError("There's already a cancellation proposal waiting for an answer.", 409);
    }
    const { held } = await getHeldMoney(project._id as Types.ObjectId);
    const providerAmount = roundTaka(Number(req.body.providerAmount));
    if (!Number.isFinite(providerAmount) || providerAmount < 0 || providerAmount > held) {
      throw disputeError(`The provider's share must be between ${formatTaka(0)} and ${formatTaka(held)}.`, 400);
    }
    const note = typeof req.body.note === "string" ? req.body.note.trim().slice(0, NOTE_MAX) : "";

    const updated = await Project.findOneAndUpdate(
      { _id: project._id, status: "in-progress", disputeOpen: { $ne: true }, cancellationProposal: null },
      {
        $set: {
          cancellationProposal: {
            proposedBy: new Types.ObjectId(req.user.userId),
            providerAmount,
            ...(note ? { note } : {}),
            proposedAt: new Date(),
          },
        },
      },
      { returnDocument: "after" },
    ).exec();
    if (!updated) throw disputeError("The project changed while you were proposing. Reload and try again.", 409);

    const who = role === "client" ? "The client" : "The provider";
    await notify(
      otherId,
      "project_cancellation_proposed",
      `${who} proposed ending ${projectTitle(project)} early: the provider keeps ${formatTaka(providerAmount)} and the client is refunded ${formatTaka(roundTaka(held - providerAmount))}. Accept or decline it on the project page.`,
      project,
    );
    res.status(201).json({ proposal: updated.cancellationProposal });
  } catch (error: unknown) {
    next(error);
  }
};

export const answerCancellation = (answer: "accept" | "decline" | "withdraw") =>
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { project, otherId } = await loadAsParty(req);
      const proposal = project.cancellationProposal;
      if (!proposal) throw disputeError("There's no cancellation proposal waiting.", 409);
      const isProposer = proposal.proposedBy.toString() === req.user.userId;
      if (answer === "withdraw" ? !isProposer : isProposer) {
        throw disputeError(
          answer === "withdraw" ? "Only the person who proposed it can withdraw it." : "The other side answers your proposal.",
          403,
        );
      }

      if (answer === "accept") {
        const cancelled = await cancelProject(
          project._id as Types.ObjectId,
          proposal.providerAmount,
          "agreement",
          "by agreement between the client and the provider",
        );
        if (!cancelled) {
          await Project.updateOne({ _id: project._id }, { $set: { cancellationProposal: null } }).exec();
          await notify(
            otherId,
            "project_cancellation_declined",
            `The cancellation of ${projectTitle(project)} couldn't go ahead because the money CivilHub holds has changed. Please propose it again.`,
            project,
          );
          throw disputeError(
            "The money CivilHub holds has changed since this was proposed, so it can't go ahead. Ask for a new proposal.",
            409,
          );
        }
        res.json({ status: cancelled.status, cancellation: cancelled.cancellation });
        return;
      }

      await Project.updateOne({ _id: project._id }, { $set: { cancellationProposal: null } }).exec();
      if (answer === "decline") {
        await notify(
          otherId,
          "project_cancellation_declined",
          `Your proposal to end ${projectTitle(project)} early was declined. You can talk it through, or ask CivilHub to step in.`,
          project,
        );
      }
      res.json({ proposal: null });
    } catch (error: unknown) {
      next(error);
    }
  };

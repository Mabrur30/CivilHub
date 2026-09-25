import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import {
  Notification,
  type NotificationType,
} from "../models/Notification.model";
import { type IPayment, type PaymentType } from "../models/Payment.model";
import { Project, type IProject } from "../models/Project.model";
import {
  ProjectPhase,
  type IProjectPhase,
  type ProjectPhaseStatus,
} from "../models/ProjectPhase.model";
import {
  getAdvanceAmount,
  getAmountsPaidByPhase,
  getPhaseAmountsDue,
  getRemainingBalance,
} from "../utils/phasePayments";
import {
  describePaymentMethod,
  hasCheckoutInFlight,
  payeeShareNote,
} from "../services/payments";
import { formatTaka } from "../utils/money";

interface ProjectProgressError extends Error {
  statusCode: number;
}

interface ProjectParams {
  projectId?: string;
  phaseId?: string;
}

export interface UpdateProjectPhaseBody {
  status?: ProjectPhaseStatus;
}

export interface RequestPhaseChangesBody {
  note?: string;
}

interface ProjectProgressPhaseResponse {
  id: string;
  name: string;
  description: string;
  order: number;
  status: ProjectPhaseStatus;
  dueDate: string | null;
  completedAt: string | null;
  updatedAt: string;
  price: number;
  paymentStatus: IProjectPhase["paymentStatus"];
  paidAt: string | null;
  /** What approving this phase costs on the phase-by-phase plan. */
  amountDue: number;
  /** What has actually been charged for this phase so far. */
  amountPaid: number;
  changeRequest: { note: string; requestedAt: string } | null;
}

interface ProjectProgressResponse {
  project: {
    id: string;
    name: string;
    status: IProject["status"];
    clientId: string | null;
    assignedEngineerId: string | null;
    currentPhaseName: string;
    progressPercentage: number;
    nextMilestone: string;
    nextMilestoneDueDate: string | null;
  };
  phases: ProjectProgressPhaseResponse[];
  canUpdate: boolean;
}

const validStatuses: ProjectPhaseStatus[] = [
  "not_started",
  "in_progress",
  "awaiting_approval",
  "completed",
  "delayed",
];

const statusLabels: Record<ProjectPhaseStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  awaiting_approval: "Awaiting approval",
  completed: "Completed",
  delayed: "Delayed",
};

// The only moves an engineer can make. Completing a phase is the client's
// decision (approve), and so is sending it back (request changes), so neither
// appears here, and a completed phase can never be reopened.
const engineerTransitions: Record<ProjectPhaseStatus, ProjectPhaseStatus[]> = {
  not_started: ["in_progress"],
  in_progress: ["delayed", "awaiting_approval"],
  delayed: ["in_progress", "awaiting_approval"],
  awaiting_approval: [],
  completed: [],
};

const CHANGE_NOTE_LIMIT = 500;

const createProjectProgressError = (
  message: string,
  statusCode: number,
): ProjectProgressError => {
  const error = new Error(message) as ProjectProgressError;
  error.statusCode = statusCode;
  return error;
};

const getParams = (req: AuthenticatedRequest): ProjectParams =>
  req.params as unknown as ProjectParams;

const isProjectPhaseStatus = (value: unknown): value is ProjectPhaseStatus =>
  typeof value === "string" &&
  validStatuses.includes(value as ProjectPhaseStatus);

const projectLabel = (project: IProject, fallback: string): string =>
  project.title ?? project.name ?? fallback;

const calculateProgressPercentage = (phases: IProjectPhase[]): number => {
  if (phases.length === 0) {
    return 0;
  }

  const completedCount = phases.filter(
    (phase) => phase.status === "completed",
  ).length;

  return Math.round((completedCount / phases.length) * 100);
};

const getCurrentPhaseName = (phases: IProjectPhase[]): string => {
  const activePhase = phases.find(
    (phase) =>
      phase.status === "in_progress" ||
      phase.status === "awaiting_approval" ||
      phase.status === "delayed",
  );

  if (activePhase) {
    return activePhase.name;
  }

  const nextPhase = phases.find((phase) => phase.status === "not_started");
  if (nextPhase) {
    return nextPhase.name;
  }

  return phases.length > 0 ? "Completed" : "Not started";
};

const getNextMilestone = (
  phases: IProjectPhase[],
): { name: string; dueDate: Date | null } => {
  const pendingPhase = phases.find((phase) => phase.status !== "completed");

  if (!pendingPhase) {
    return { name: "Project complete", dueDate: null };
  }

  return {
    name: pendingPhase.name,
    dueDate: pendingPhase.dueDate ?? null,
  };
};

const toPhaseResponse = (
  phase: IProjectPhase,
  amountsDue: Map<string, number>,
  amountsPaid: Map<string, number>,
): ProjectProgressPhaseResponse => {
  const id = phase._id.toString();
  return {
    id,
    name: phase.name,
    description: phase.description ?? "",
    order: phase.order,
    status: phase.status,
    dueDate: phase.dueDate ? phase.dueDate.toISOString() : null,
    completedAt: phase.completedAt ? phase.completedAt.toISOString() : null,
    updatedAt: phase.updatedAt.toISOString(),
    price: phase.price,
    paymentStatus: phase.paymentStatus,
    paidAt: phase.paidAt ? phase.paidAt.toISOString() : null,
    amountDue: amountsDue.get(id) ?? 0,
    amountPaid: amountsPaid.get(id) ?? 0,
    changeRequest: phase.changeRequest
      ? {
          note: phase.changeRequest.note,
          requestedAt: phase.changeRequest.requestedAt.toISOString(),
        }
      : null,
  };
};

const syncProjectProgressSnapshot = async (
  project: IProject,
): Promise<void> => {
  const phases = await ProjectPhase.find({ project: project._id })
    .sort({ order: 1 })
    .exec();

  const nextMilestone = getNextMilestone(phases);
  project.progressPercentage = calculateProgressPercentage(phases);
  project.currentPhaseName = getCurrentPhaseName(phases);
  project.nextMilestone = nextMilestone.name;
  project.nextMilestoneDueDate = nextMilestone.dueDate ?? undefined;
  await project.save();
};

export const isProjectFullyComplete = async (
  project: IProject,
): Promise<boolean> => {
  const phases = await ProjectPhase.find({ project: project._id }).exec();
  if (
    phases.length === 0 ||
    phases.some((phase) => phase.status !== "completed")
  ) {
    return false;
  }

  if (project.paymentPlan === "phase_by_phase") {
    return phases.every((phase) => phase.paymentStatus === "paid");
  }

  return project.paymentPlan === "full_upfront" && project.fullPaymentPaid;
};

export const syncProjectCompletionStatus = async (
  project: IProject,
): Promise<boolean> => {
  if (!(await isProjectFullyComplete(project))) {
    return false;
  }

  if (project.status !== "completed" || !project.completedAt) {
    project.status = "completed";
    project.completedAt = project.completedAt ?? new Date();
    await project.save();
  }
  return true;
};

export const backfillCompletedProjectStatuses = async (): Promise<void> => {
  const projects = await Project.find({ status: { $ne: "completed" } }).exec();
  for (const project of projects) {
    await syncProjectCompletionStatus(project);
  }
};

// Payments change the project with conditional single-document updates, so
// the in-memory copy is out of date afterwards. Re-read it before deriving
// progress or completion from it.
const refreshProjectState = async (projectId: Types.ObjectId): Promise<void> => {
  const fresh = await Project.findById(projectId).exec();
  if (!fresh) return;
  await syncProjectProgressSnapshot(fresh);
  await syncProjectCompletionStatus(fresh);
};

const loadProjectForViewer = async (
  req: AuthenticatedRequest,
): Promise<{ project: IProject; canUpdate: boolean }> => {
  if (!req.user?.userId) {
    throw createProjectProgressError("Authentication required", 401);
  }

  const { projectId } = getParams(req);
  if (!projectId || !Types.ObjectId.isValid(projectId)) {
    throw createProjectProgressError("Project not found", 404);
  }

  const project = await Project.findById(projectId).exec();
  if (!project) {
    throw createProjectProgressError("Project not found", 404);
  }

  const isClient = project.client?.toString() === req.user.userId;
  const isAssignedEngineer =
    project.assignedEngineer?.toString() === req.user.userId;

  if (!isClient && !isAssignedEngineer) {
    throw createProjectProgressError("Forbidden", 403);
  }

  return { project, canUpdate: isAssignedEngineer };
};

const loadOwnedProject = async (
  req: AuthenticatedRequest,
): Promise<IProject> => {
  if (!req.user?.userId || req.user.role !== "client") {
    throw createProjectProgressError("Client access required", 403);
  }

  const { projectId } = getParams(req);
  if (!projectId || !Types.ObjectId.isValid(projectId)) {
    throw createProjectProgressError("Project not found", 404);
  }

  const project = await Project.findById(projectId).exec();
  if (!project) {
    throw createProjectProgressError("Project not found", 404);
  }

  if (project.client?.toString() !== req.user.userId) {
    throw createProjectProgressError("You do not own this project", 403);
  }
  return project;
};

const loadPhase = async (
  req: AuthenticatedRequest,
  project: IProject,
): Promise<IProjectPhase> => {
  const { phaseId } = getParams(req);
  if (!phaseId || !Types.ObjectId.isValid(phaseId)) {
    throw createProjectProgressError("Project phase not found", 404);
  }

  const phase = await ProjectPhase.findOne({
    _id: phaseId,
    project: project._id,
  }).exec();
  if (!phase) {
    throw createProjectProgressError("Project phase not found", 404);
  }
  return phase;
};

const requireApprovedPlan = (project: IProject): void => {
  if (project.phasePlanStatus !== "approved") {
    throw createProjectProgressError(
      "The phase plan has to be approved before phases can change",
      409,
    );
  }
};

export const getProjectProgress = async (
  req: AuthenticatedRequest,
  res: Response<ProjectProgressResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { project, canUpdate } = await loadProjectForViewer(req);
    const phases = await ProjectPhase.find({ project: project._id })
      .sort({ order: 1 })
      .exec();
    const amountsDue = getPhaseAmountsDue(project, phases);
    const amountsPaid = await getAmountsPaidByPhase(project._id);
    const nextMilestone = getNextMilestone(phases);

    res.status(200).json({
      project: {
        id: project._id.toString(),
        name: projectLabel(project, "Untitled project"),
        status: project.status,
        clientId: project.client ? project.client.toString() : null,
        assignedEngineerId: project.assignedEngineer
          ? project.assignedEngineer.toString()
          : null,
        currentPhaseName: getCurrentPhaseName(phases),
        progressPercentage: calculateProgressPercentage(phases),
        nextMilestone: nextMilestone.name,
        nextMilestoneDueDate: nextMilestone.dueDate
          ? nextMilestone.dueDate.toISOString()
          : null,
      },
      phases: phases.map((phase) =>
        toPhaseResponse(phase, amountsDue, amountsPaid),
      ),
      canUpdate,
    });
  } catch (error: unknown) {
    next(error);
  }
};

const engineerUpdateMessages: Partial<
  Record<ProjectPhaseStatus, (phase: string, project: string) => string>
> = {
  in_progress: (phase, project) => `Work on ${phase} has started for ${project}.`,
  delayed: (phase, project) => `${phase} is running late on ${project}.`,
  awaiting_approval: (phase, project) =>
    `${phase} is ready for your approval on ${project}.`,
};

export const updateProjectPhase = async (
  req: AuthenticatedRequest<UpdateProjectPhaseBody>,
  res: Response<{ success: true; phase: ProjectProgressPhaseResponse }>,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId || req.user.role !== "engineer") {
      throw createProjectProgressError("Engineer access required", 403);
    }

    const { project, canUpdate } = await loadProjectForViewer(req);
    if (!canUpdate) {
      throw createProjectProgressError("Forbidden", 403);
    }
    requireApprovedPlan(project);

    const { status } = req.body;
    if (!isProjectPhaseStatus(status)) {
      throw createProjectProgressError("Invalid phase status", 400);
    }

    const phase = await loadPhase(req, project);
    const from = phase.status;

    if (from === status) {
      throw createProjectProgressError(
        `${phase.name} is already ${statusLabels[status].toLowerCase()}`,
        409,
      );
    }
    if (!engineerTransitions[from].includes(status)) {
      const reason =
        from === "completed"
          ? `${phase.name} is complete and can no longer change`
          : from === "awaiting_approval"
            ? `${phase.name} is waiting for the client to approve it or request changes`
            : status === "completed"
              ? "The client completes a phase by approving it. Submit it for approval instead"
              : `${phase.name} can't move from ${statusLabels[from]} to ${statusLabels[status]}`;
      throw createProjectProgressError(reason, 409);
    }

    // Starting a phase for the first time needs the advance and a finished
    // previous phase. Resuming a delayed phase has already passed these.
    if (from === "not_started" && status === "in_progress") {
      if (!project.advancePaid) {
        throw createProjectProgressError(
          "Advance payment required before work can begin",
          409,
        );
      }
      if (phase.order > 0) {
        const previousPhase = await ProjectPhase.findOne({
          project: project._id,
          order: phase.order - 1,
        }).exec();
        const previousDone =
          previousPhase?.status === "completed" &&
          (project.paymentPlan !== "phase_by_phase" ||
            previousPhase.paymentStatus === "paid");
        if (!previousDone) {
          throw createProjectProgressError(
            `${previousPhase?.name ?? "The previous phase"} has to be approved before this phase can start`,
            409,
          );
        }
      }
    }

    // Conditional on the status we just checked, so two quick clicks can't
    // both apply a transition.
    const updated = await ProjectPhase.findOneAndUpdate(
      { _id: phase._id, status: from },
      { $set: { status } },
      { returnDocument: "after" },
    ).exec();
    if (!updated) {
      throw createProjectProgressError(
        "This phase was just updated. Refresh to see its current status.",
        409,
      );
    }

    await refreshProjectState(project._id);

    const message = engineerUpdateMessages[status];
    if (message && project.client) {
      await Notification.create({
        recipient: project.client,
        type: "project_phase_updated",
        message: message(updated.name, projectLabel(project, "your project")),
        project: project._id,
      });
    }

    const phases = await ProjectPhase.find({ project: project._id }).exec();
    res.status(200).json({
      success: true,
      phase: toPhaseResponse(
        updated,
        getPhaseAmountsDue(project, phases),
        await getAmountsPaidByPhase(project._id),
      ),
    });
  } catch (error: unknown) {
    next(error);
  }
};

// ============ Client phase decisions ============

/** What approving a phase charges right now, or null when approval is free. */
export interface PhaseCharge {
  type: "phase" | "full_remaining";
  amount: number;
}

const getPhaseCharge = (
  project: IProject,
  phase: IProjectPhase,
  phases: IProjectPhase[],
): PhaseCharge | null => {
  if (project.paymentPlan === "phase_by_phase") {
    return {
      type: "phase",
      amount: getPhaseAmountsDue(project, phases).get(phase._id.toString()) ?? 0,
    };
  }
  const isFinalPhase =
    phase.order === Math.max(...phases.map((item) => item.order));
  if (
    project.paymentPlan === "full_upfront" &&
    isFinalPhase &&
    !project.fullPaymentPaid
  ) {
    return { type: "full_remaining", amount: getRemainingBalance(project) };
  }
  return null;
};

/**
 * Checks the client can approve this phase now. Phases an engineer marked
 * complete under the old rules were never paid for; approving them now
 * settles the payment, so they count as approvable too.
 */
const assertPhaseApprovable = (
  project: IProject,
  phase: IProjectPhase,
): { isLegacyUnpaid: boolean } => {
  const isLegacyUnpaid =
    project.paymentPlan === "phase_by_phase" &&
    phase.status === "completed" &&
    phase.paymentStatus === "unpaid";

  if (phase.status === "completed" && !isLegacyUnpaid) {
    throw createProjectProgressError(
      `${phase.name} has already been approved`,
      409,
    );
  }
  if (phase.status !== "awaiting_approval" && !isLegacyUnpaid) {
    throw createProjectProgressError(
      `${phase.name} hasn't been submitted for approval yet`,
      409,
    );
  }
  if (!project.advancePaid) {
    throw createProjectProgressError(
      "Pay the advance before approving phases",
      409,
    );
  }
  return { isLegacyUnpaid };
};

/** Completes the phase once, however many requests race for it. */
const completePhase = (
  project: IProject,
  phase: IProjectPhase,
  isLegacyUnpaid: boolean,
  now: Date,
): Promise<IProjectPhase | null> =>
  ProjectPhase.findOneAndUpdate(
    isLegacyUnpaid
      ? { _id: phase._id, status: "completed", paymentStatus: "unpaid" }
      : { _id: phase._id, status: "awaiting_approval" },
    {
      $set: {
        status: "completed",
        completedAt: isLegacyUnpaid ? (phase.completedAt ?? now) : now,
        changeRequest: null,
        ...(project.paymentPlan === "phase_by_phase"
          ? { paymentStatus: "paid", paidAt: now }
          : {}),
      },
    },
    { returnDocument: "after" },
  ).exec();

/** Marks the remaining balance paid once; false if it already was. */
const claimRemainingBalance = async (
  projectId: Types.ObjectId,
  paidAt: Date,
): Promise<boolean> => {
  const claimed = await Project.findOneAndUpdate(
    { _id: projectId, advancePaid: true, fullPaymentPaid: false },
    { $set: { fullPaymentPaid: true, fullPaymentPaidAt: paidAt } },
    { returnDocument: "after" },
  ).exec();
  return Boolean(claimed);
};

/**
 * Approves a phase that costs nothing to approve: any phase on the full
 * upfront plan except a final one with the balance still unpaid. Phases that
 * need a payment are approved by paying for them (see payment.controller).
 */
export const approvePhase = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const project = await loadOwnedProject(req);
    requireApprovedPlan(project);
    const phase = await loadPhase(req, project);
    const { isLegacyUnpaid } = assertPhaseApprovable(project, phase);

    const phases = await ProjectPhase.find({ project: project._id }).exec();
    const charge = getPhaseCharge(project, phase, phases);
    if (charge && charge.amount > 0) {
      throw createProjectProgressError(
        `Approving ${phase.name} needs a payment of ${formatTaka(charge.amount)}. Use Approve & pay.`,
        409,
      );
    }

    const now = new Date();
    const approved = await completePhase(project, phase, isLegacyUnpaid, now);
    if (!approved) {
      throw createProjectProgressError(
        `${phase.name} has already been approved`,
        409,
      );
    }
    // A zero balance (the advance covered everything) settles without a charge.
    if (charge?.type === "full_remaining") {
      await claimRemainingBalance(project._id, now);
    }

    await refreshProjectState(project._id);

    if (project.assignedEngineer) {
      await Notification.create({
        recipient: project.assignedEngineer,
        type: "project_phase_updated",
        message: `The client approved ${phase.name} on ${projectLabel(project, "your project")}.`,
        project: project._id,
      });
    }

    res.status(200).json({
      success: true,
      phase: phase.name,
      amountCharged: 0,
      paidAt: null,
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const requestPhaseChanges = async (
  req: AuthenticatedRequest<RequestPhaseChangesBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const project = await loadOwnedProject(req);
    requireApprovedPlan(project);
    const phase = await loadPhase(req, project);
    if (await hasCheckoutInFlight({ phase: phase._id })) {
      throw createProjectProgressError(
        "A payment for this phase is in progress. Finish or cancel it before requesting changes.",
        409,
      );
    }

    const note = typeof req.body.note === "string" ? req.body.note.trim() : "";
    if (!note) {
      throw createProjectProgressError(
        "Say what needs to change so the engineer knows what to fix",
        400,
      );
    }
    if (note.length > CHANGE_NOTE_LIMIT) {
      throw createProjectProgressError(
        `Keep the note to ${CHANGE_NOTE_LIMIT} characters or fewer`,
        400,
      );
    }

    const updated = await ProjectPhase.findOneAndUpdate(
      { _id: phase._id, status: "awaiting_approval" },
      {
        $set: {
          status: "in_progress",
          changeRequest: { note, requestedAt: new Date() },
        },
      },
      { returnDocument: "after" },
    ).exec();
    if (!updated) {
      throw createProjectProgressError(
        `${phase.name} isn't waiting for your approval`,
        409,
      );
    }

    await refreshProjectState(project._id);

    if (project.assignedEngineer) {
      await Notification.create({
        recipient: project.assignedEngineer,
        type: "project_phase_updated",
        message: `The client asked for changes to ${phase.name} on ${projectLabel(project, "your project")}: "${note}"`,
        project: project._id,
      });
    }

    res.status(200).json({ success: true, phase: updated.name });
  } catch (error: unknown) {
    next(error);
  }
};

// ============ Gateway payments ============
// Checkouts start in payment.controller. These rules decide what a client may
// pay for and how much, and what a verified payment does to the project.

export interface ProjectCharge {
  project: IProject;
  phase: IProjectPhase | null;
  type: PaymentType;
  amount: number;
  payee: Types.ObjectId;
  productName: string;
  returnPath: string;
}

export type ProjectChargePurpose = "advance" | "phase" | "full_remaining";

const findClientProject = async (
  userId: string,
  role: string,
  projectId: unknown,
): Promise<IProject> => {
  if (role !== "client") {
    throw createProjectProgressError("Client access required", 403);
  }
  if (typeof projectId !== "string" || !Types.ObjectId.isValid(projectId)) {
    throw createProjectProgressError("Project not found", 404);
  }
  const project = await Project.findById(projectId).exec();
  if (!project) {
    throw createProjectProgressError("Project not found", 404);
  }
  if (project.client?.toString() !== userId) {
    throw createProjectProgressError("You do not own this project", 403);
  }
  return project;
};

/** Works out what the client owes for this purpose, or explains why nothing is due. */
export const prepareProjectCharge = async (
  userId: string,
  role: string,
  purpose: ProjectChargePurpose,
  projectId: unknown,
  phaseId: unknown,
): Promise<ProjectCharge> => {
  const project = await findClientProject(userId, role, projectId);
  if (!project.assignedEngineer) {
    throw createProjectProgressError(
      "This project has no engineer to pay yet",
      409,
    );
  }
  const label = projectLabel(project, "Project");
  const base = {
    project,
    payee: project.assignedEngineer,
    returnPath: `/dashboard/client/projects/${project._id.toString()}`,
  };

  if (purpose === "advance") {
    if (project.phasePlanStatus !== "approved") {
      throw createProjectProgressError(
        "Phase plan must be approved before payment",
        409,
      );
    }
    if (project.advancePaid) {
      throw createProjectProgressError(
        "Advance payment has already been made",
        409,
      );
    }
    return {
      ...base,
      phase: null,
      type: "advance",
      amount: getAdvanceAmount(project),
      productName: `Advance for ${label}`,
    };
  }

  if (purpose === "full_remaining") {
    if (project.paymentPlan !== "full_upfront") {
      throw createProjectProgressError(
        "This project uses a different payment plan",
        409,
      );
    }
    if (!project.advancePaid) {
      throw createProjectProgressError(
        "Advance payment must be made first",
        409,
      );
    }
    if (project.fullPaymentPaid) {
      throw createProjectProgressError(
        "Full payment has already been made",
        409,
      );
    }
    return {
      ...base,
      phase: null,
      type: "full_remaining",
      amount: getRemainingBalance(project),
      productName: `Remaining balance for ${label}`,
    };
  }

  requireApprovedPlan(project);
  if (typeof phaseId !== "string" || !Types.ObjectId.isValid(phaseId)) {
    throw createProjectProgressError("Project phase not found", 404);
  }
  const phase = await ProjectPhase.findOne({
    _id: phaseId,
    project: project._id,
  }).exec();
  if (!phase) {
    throw createProjectProgressError("Project phase not found", 404);
  }
  assertPhaseApprovable(project, phase);
  const phases = await ProjectPhase.find({ project: project._id }).exec();
  const charge = getPhaseCharge(project, phase, phases);
  if (!charge || charge.amount <= 0) {
    throw createProjectProgressError(
      `${phase.name} has nothing to pay. Approve it instead.`,
      409,
    );
  }
  return {
    ...base,
    phase,
    type: charge.type,
    amount: charge.amount,
    productName: `${phase.name} - ${label}`,
  };
};

/**
 * Applies a verified payment to its project. Returns false when there was
 * nothing left to pay for (already paid, or the phase moved on), so the
 * caller can flag the money for a refund.
 */
export const applyProjectPayment = async (
  payment: IPayment,
): Promise<boolean> => {
  const project = payment.project
    ? await Project.findById(payment.project).exec()
    : null;
  if (!project) return false;

  const paidAt = payment.paidAt ?? new Date();
  const label = projectLabel(project, "your project");
  const via = ` via ${describePaymentMethod(payment.cardType)}`;
  const share = payeeShareNote(payment);
  let applied = false;
  let type: NotificationType = "phase_payment_received";
  let message = `Remaining payment of ${formatTaka(payment.amount)} received${via} for ${label}.${share}`;

  if (payment.type === "advance") {
    const claimed = await Project.findOneAndUpdate(
      { _id: project._id, phasePlanStatus: "approved", advancePaid: false },
      { $set: { advancePaid: true, advancePaidAt: paidAt } },
      { returnDocument: "after" },
    ).exec();
    applied = Boolean(claimed);
    type = "advance_payment_received";
    message = `Advance payment of ${formatTaka(payment.amount)} received${via} for ${label}. Work can now begin.${share}`;
  } else if (payment.type === "full_remaining" && !payment.phase) {
    applied = await claimRemainingBalance(project._id, paidAt);
    type = "full_payment_received";
  } else if (payment.phase) {
    const phase = await ProjectPhase.findById(payment.phase).exec();
    let approvable: { isLegacyUnpaid: boolean } | null = null;
    try {
      approvable = phase ? assertPhaseApprovable(project, phase) : null;
    } catch {
      approvable = null;
    }

    // On the full-upfront plan the balance is owed whatever the phase does.
    if (payment.type === "full_remaining") {
      applied = await claimRemainingBalance(project._id, paidAt);
      type = "full_payment_received";
    }
    const completed =
      phase && approvable
        ? await completePhase(project, phase, approvable.isLegacyUnpaid, paidAt)
        : null;
    if (payment.type === "phase") applied = Boolean(completed);
    if (completed) {
      message = `The client approved ${completed.name} on ${label} and paid ${formatTaka(payment.amount)}${via}.${share}`;
    }
  }

  await refreshProjectState(project._id);

  if (applied && project.assignedEngineer) {
    await Notification.create({
      recipient: project.assignedEngineer,
      type,
      message,
      project: project._id,
    });
  }
  return applied;
};

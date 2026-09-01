import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Notification } from "../models/Notification.model";
import { Payment } from "../models/Payment.model";
import { Project, type IProject } from "../models/Project.model";
import {
  ProjectPhase,
  type IProjectPhase,
  type ProjectPhaseStatus,
} from "../models/ProjectPhase.model";

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

interface ProjectProgressPhaseResponse {
  id: string;
  name: string;
  order: number;
  status: ProjectPhaseStatus;
  dueDate: string | null;
  completedAt: string | null;
  updatedAt: string;
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
): ProjectProgressPhaseResponse => ({
  id: phase._id.toString(),
  name: phase.name,
  order: phase.order,
  status: phase.status,
  dueDate: phase.dueDate ? phase.dueDate.toISOString() : null,
  completedAt: phase.completedAt ? phase.completedAt.toISOString() : null,
  updatedAt: phase.updatedAt.toISOString(),
});

const syncProjectProgressSnapshot = async (
  project: IProject,
): Promise<{
  currentPhaseName: string;
  progressPercentage: number;
  nextMilestone: string;
}> => {
  const phases = await ProjectPhase.find({ project: project._id })
    .sort({ order: 1 })
    .exec();

  const progressPercentage = calculateProgressPercentage(phases);
  const currentPhaseName = getCurrentPhaseName(phases);
  const nextMilestone = getNextMilestone(phases);

  project.progressPercentage = progressPercentage;
  project.currentPhaseName = currentPhaseName;
  project.nextMilestone = nextMilestone.name;
  project.nextMilestoneDueDate = nextMilestone.dueDate ?? undefined;
  await project.save();

  return {
    currentPhaseName,
    progressPercentage,
    nextMilestone: nextMilestone.name,
  };
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

    const progressPercentage = calculateProgressPercentage(phases);
    const currentPhaseName = getCurrentPhaseName(phases);
    const nextMilestone = getNextMilestone(phases);

    res.status(200).json({
      project: {
        id: project._id.toString(),
        name: project.title ?? project.name ?? "Untitled project",
        status: project.status,
        clientId: project.client ? project.client.toString() : null,
        assignedEngineerId: project.assignedEngineer
          ? project.assignedEngineer.toString()
          : null,
        currentPhaseName,
        progressPercentage,
        nextMilestone: nextMilestone.name,
        nextMilestoneDueDate: nextMilestone.dueDate
          ? nextMilestone.dueDate.toISOString()
          : null,
      },
      phases: phases.map(toPhaseResponse),
      canUpdate,
    });
  } catch (error: unknown) {
    next(error);
  }
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

    const { phaseId } = getParams(req);
    if (!phaseId || !Types.ObjectId.isValid(phaseId)) {
      throw createProjectProgressError("Project phase not found", 404);
    }

    const { status } = req.body;
    if (!isProjectPhaseStatus(status)) {
      throw createProjectProgressError("Invalid phase status", 400);
    }

    const phase = await ProjectPhase.findOne({
      _id: phaseId,
      project: project._id,
    }).exec();

    if (!phase) {
      throw createProjectProgressError("Project phase not found", 404);
    }

    // ===== NEW GATING RULES =====

    // Rule 1: Block any phase from moving to 'in_progress' if advance not paid
    if (status === "in_progress" && !project.advancePaid) {
      throw createProjectProgressError(
        "Advance payment required before work can begin",
        403,
      );
    }

    // Rule 2: Enforce sequential order - phase can only move to 'in_progress' if previous phase is completed
    if (status === "in_progress" && phase.order > 0) {
      const previousPhase = await ProjectPhase.findOne({
        project: project._id,
        order: phase.order - 1,
      }).exec();

      if (!previousPhase || previousPhase.status !== "completed") {
        throw createProjectProgressError(
          `Complete and pay for phase "${previousPhase?.name || "the previous phase"}" first`,
          403,
        );
      }

      // If phase_by_phase payment, also check if previous phase is paid
      if (project.paymentPlan === "phase_by_phase") {
        if (previousPhase.paymentStatus !== "paid") {
          throw createProjectProgressError(
            `Previous phase must be paid before this phase can start`,
            403,
          );
        }
      }
    }

    // Rule 3: If full_upfront, block final phase from completing until remaining balance paid
    if (
      status === "completed" &&
      project.paymentPlan === "full_upfront" &&
      phase.order ===
        (await ProjectPhase.countDocuments({ project: project._id })) - 1
    ) {
      if (!project.fullPaymentPaid) {
        throw createProjectProgressError(
          "Final payment required before project completion",
          403,
        );
      }
    }

    // ===== END GATING RULES =====

    phase.status = status;
    phase.completedAt = status === "completed" ? new Date() : undefined;
    await phase.save();

    await syncProjectProgressSnapshot(project);

    if (
      (status === "completed" ||
        status === "delayed" ||
        status === "awaiting_approval") &&
      project.client
    ) {
      await Notification.create({
        recipient: project.client,
        type: "project_phase_updated",
        message: `${phase.name} is now ${status.replace(/_/g, " ")} for ${project.title ?? project.name ?? "your project"}.`,
        project: project._id,
      });
    }

    res.status(200).json({
      success: true,
      phase: toPhaseResponse(phase),
    });
  } catch (error: unknown) {
    next(error);
  }
};

// ============ Payment Methods ============

export interface PayAdvanceRequestBody {
  // Mock payment - no additional data needed
}

export interface PayForPhaseRequestBody {
  // Mock payment - no additional data needed
}

export interface PayFullRemainingRequestBody {
  // Mock payment - no additional data needed
}

export const payAdvance = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId || req.user.role !== "client") {
      throw createProjectProgressError("Client access required", 403);
    }

    const { projectId } = getParams(req);
    if (!projectId) {
      throw createProjectProgressError("Project ID is required", 400);
    }

    const project = await Project.findById(projectId).exec();
    if (!project) {
      throw createProjectProgressError("Project not found", 404);
    }

    if (project.client?.toString() !== req.user.userId) {
      throw createProjectProgressError("You do not own this project", 403);
    }

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

    const advanceAmount = project.advanceRequiredAmount || 0;
    const paymentDate = new Date();

    // Create payment record
    await Payment.create({
      project: project._id,
      type: "advance",
      amount: advanceAmount,
      paidBy: req.user.userId,
      method: "mock",
      paidAt: paymentDate,
    });

    // Update project
    project.advancePaid = true;
    project.advancePaidAt = paymentDate;
    await project.save();

    // Notify engineer
    if (project.assignedEngineer) {
      await Notification.create({
        recipient: project.assignedEngineer,
        type: "advance_payment_received",
        message: `Advance payment of $${advanceAmount.toFixed(2)} received for ${project.title ?? project.name ?? "your project"}. Work can now begin.`,
        project: project._id,
      });
    }

    res.status(200).json({
      success: true,
      message: "Advance payment processed (mock)",
      amount: advanceAmount,
      paidAt: paymentDate.toISOString(),
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const payForPhase = async (
  req: AuthenticatedRequest<PayForPhaseRequestBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId || req.user.role !== "client") {
      throw createProjectProgressError("Client access required", 403);
    }

    const { projectId, phaseId } = getParams(req);
    if (!projectId || !phaseId) {
      throw createProjectProgressError(
        "Project ID and phase ID are required",
        400,
      );
    }

    if (!Types.ObjectId.isValid(phaseId)) {
      throw createProjectProgressError("Invalid phase ID", 400);
    }

    const project = await Project.findById(projectId).exec();
    if (!project) {
      throw createProjectProgressError("Project not found", 404);
    }

    if (project.client?.toString() !== req.user.userId) {
      throw createProjectProgressError("You do not own this project", 403);
    }

    if (project.paymentPlan !== "phase_by_phase") {
      throw createProjectProgressError(
        "This project uses a different payment plan",
        409,
      );
    }

    const phase = await ProjectPhase.findOne({
      _id: phaseId,
      project: project._id,
    }).exec();

    if (!phase) {
      throw createProjectProgressError("Phase not found", 404);
    }

    if (phase.status !== "awaiting_approval" && phase.status !== "completed") {
      throw createProjectProgressError(
        "Phase must be completed or awaiting approval to pay",
        409,
      );
    }

    if (phase.paymentStatus === "paid") {
      throw createProjectProgressError("This phase has already been paid", 409);
    }

    const paymentDate = new Date();
    const phasePrice = phase.price;

    // Create payment record
    await Payment.create({
      project: project._id,
      phase: phase._id,
      type: "phase",
      amount: phasePrice,
      paidBy: req.user.userId,
      method: "mock",
      paidAt: paymentDate,
    });

    // Update phase
    phase.paymentStatus = "paid";
    phase.paidAt = paymentDate;
    await phase.save();

    // Notify engineer
    if (project.assignedEngineer) {
      await Notification.create({
        recipient: project.assignedEngineer,
        type: "phase_payment_received",
        message: `Payment of $${phasePrice.toFixed(2)} received for phase "${phase.name}" in ${project.title ?? project.name ?? "your project"}.`,
        project: project._id,
      });
    }

    res.status(200).json({
      success: true,
      message: "Phase payment processed (mock)",
      phase: phase.name,
      amount: phasePrice,
      paidAt: paymentDate.toISOString(),
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const payFullRemaining = async (
  req: AuthenticatedRequest<PayFullRemainingRequestBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId || req.user.role !== "client") {
      throw createProjectProgressError("Client access required", 403);
    }

    const { projectId } = getParams(req);
    if (!projectId) {
      throw createProjectProgressError("Project ID is required", 400);
    }

    const project = await Project.findById(projectId).exec();
    if (!project) {
      throw createProjectProgressError("Project not found", 404);
    }

    if (project.client?.toString() !== req.user.userId) {
      throw createProjectProgressError("You do not own this project", 403);
    }

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

    const paymentDate = new Date();
    const remainingAmount =
      (project.totalAgreedValue || 0) - (project.advanceRequiredAmount || 0);

    // Create payment record
    await Payment.create({
      project: project._id,
      type: "full_remaining",
      amount: remainingAmount,
      paidBy: req.user.userId,
      method: "mock",
      paidAt: paymentDate,
    });

    // Update project
    project.fullPaymentPaid = true;
    project.fullPaymentPaidAt = paymentDate;
    await project.save();

    // Notify engineer
    if (project.assignedEngineer) {
      await Notification.create({
        recipient: project.assignedEngineer,
        type: "full_payment_received",
        message: `Remaining payment of $${remainingAmount.toFixed(2)} received for ${project.title ?? project.name ?? "your project"}.`,
        project: project._id,
      });
    }

    res.status(200).json({
      success: true,
      message: "Remaining payment processed (mock)",
      amount: remainingAmount,
      paidAt: paymentDate.toISOString(),
    });
  } catch (error: unknown) {
    next(error);
  }
};

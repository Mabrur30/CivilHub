import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Notification } from "../models/Notification.model";
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

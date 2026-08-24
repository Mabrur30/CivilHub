import { type NextFunction, type Request, type Response } from "express";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Project, type IProject } from "../models/Project.model";

interface ProjectResponse {
  id: string;
  projectName: string;
  clientName: string;
  currentPhaseName: string;
  progressPercentage: number;
  nextMilestone: string;
  nextMilestoneDueDate: string;
}

export interface OpenProjectResponse {
  id: string;
  title: string;
  clientName: string;
  description: string;
  budgetRange: string;
  location: string;
  postedDate: string;
  category: string;
}

interface EngineerOverviewResponse {
  activeProjects: number;
  pendingBids: number;
  unreadMessages: number;
  upcomingMilestones: number;
  recentActivity: RecentActivity[];
}

interface RecentActivity {
  type: string;
  message: string;
  timestamp: string;
}

interface ProjectError extends Error {
  statusCode: number;
}

const createProjectError = (
  message: string,
  statusCode: number,
): ProjectError => {
  const error = new Error(message) as ProjectError;
  error.statusCode = statusCode;
  return error;
};

const toProjectResponse = (project: IProject): ProjectResponse => ({
  id: project._id.toString(),
  projectName: project.name,
  clientName: project.clientName,
  currentPhaseName: project.currentPhaseName,
  progressPercentage: project.progressPercentage,
  nextMilestone: project.nextMilestone,
  nextMilestoneDueDate: project.nextMilestoneDueDate.toISOString(),
});

const toOpenProjectResponse = (project: IProject): OpenProjectResponse => ({
  id: project._id.toString(),
  title: project.name,
  clientName: project.clientName,
  description: project.description ?? "Project brief available on request.",
  budgetRange: project.budgetRange ?? "Budget to be discussed",
  location: project.location ?? "Location to be confirmed",
  postedDate: (project.postedDate ?? project.createdAt).toISOString(),
  category: project.category ?? "Civil engineering",
});

export const getMyProjects = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId || req.user.role !== "engineer") {
      throw createProjectError("Engineer access required", 403);
    }

    const projects = await Project.find({ assignedEngineer: req.user.userId })
      .sort({ nextMilestoneDueDate: 1 })
      .exec();

    res.status(200).json(projects.map(toProjectResponse));
  } catch (error: unknown) {
    next(error);
  }
};

export const getOpenProjects = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const projects = await Project.find({ status: "open_for_bids" })
      .sort({ postedDate: -1 })
      .exec();

    res.status(200).json(projects.map(toOpenProjectResponse));
  } catch (error: unknown) {
    next(error);
  }
};

export const getEngineerOverview = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId || req.user.role !== "engineer") {
      throw createProjectError("Engineer access required", 403);
    }

    const engineerFilter = { assignedEngineer: req.user.userId };
    const [activeProjects, upcomingMilestones] = await Promise.all([
      Project.countDocuments({
        ...engineerFilter,
        status: { $in: ["active", "in-progress"] },
      }),
      Project.countDocuments({
        ...engineerFilter,
        nextMilestoneDueDate: { $gt: new Date() },
        status: { $ne: "completed" },
      }),
    ]);

    // Bid, Message, ProjectPhase, and Notification models do not exist yet.
    const overview: EngineerOverviewResponse = {
      activeProjects,
      pendingBids: 0,
      unreadMessages: 0,
      upcomingMilestones,
      recentActivity: [],
    };

    res.status(200).json(overview);
  } catch (error: unknown) {
    next(error);
  }
};

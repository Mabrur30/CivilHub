import { type NextFunction, type Response } from "express";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Project, type IProject } from "../models/Project.model";
import { ProjectPhase } from "../models/ProjectPhase.model";
import { Review } from "../models/Review.model";
import { syncProjectCompletionStatus } from "./projectProgress.controller";

type HistoryProject = Omit<IProject, "client" | "assignedEngineer"> & {
  client: { _id: string; name: string };
  assignedEngineer: { _id: string; name: string };
};

interface ProjectHistoryItem {
  id: string;
  title: string;
  otherParty: { id: string; name: string } | null;
  completedAt: string;
  totalValuePaid: number;
  rating: number | null;
}

const toHistoryProject = (project: IProject): HistoryProject =>
  project as unknown as HistoryProject;

export const getMyProjectHistory = async (
  req: AuthenticatedRequest,
  res: Response<ProjectHistoryItem[]>,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId) {
      res.status(401).json([]);
      return;
    }

    const ownerFilter =
      req.user.role === "client"
        ? { client: req.user.userId }
        : { assignedEngineer: req.user.userId };
    const projects = await Project.find({ ...ownerFilter, status: "completed" })
      .populate("client", "name")
      .populate("assignedEngineer", "name")
      .sort({ completedAt: -1, updatedAt: -1 })
      .exec();

    const history = await Promise.all(
      projects.map(async (rawProject): Promise<ProjectHistoryItem> => {
        const project = toHistoryProject(rawProject);
        await syncProjectCompletionStatus(rawProject);
        const phases = await ProjectPhase.find({ project: project._id }).exec();
        const review = await Review.findOne({ project: project._id }).exec();
        const otherParty =
          req.user.role === "client"
            ? project.assignedEngineer
            : project.client;
        const totalValuePaid =
          project.paymentPlan === "phase_by_phase"
            ? phases.reduce((sum, phase) => sum + phase.price, 0)
            : (project.totalAgreedValue ?? 0);

        return {
          id: project._id.toString(),
          title: project.title ?? project.name ?? "Untitled project",
          otherParty: otherParty
            ? { id: otherParty._id.toString(), name: otherParty.name }
            : null,
          completedAt: (project.completedAt ?? project.updatedAt).toISOString(),
          totalValuePaid,
          rating: review?.rating ?? null,
        };
      }),
    );

    res.status(200).json(history);
  } catch (error: unknown) {
    next(error);
  }
};

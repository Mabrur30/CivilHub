import { type NextFunction, type Request, type Response } from "express";
import { Types } from "mongoose";
import { getTotalUnreadMessageCount } from "./message.controller";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Bid } from "../models/Bid.model";
import {
  Notification,
  type NotificationType,
} from "../models/Notification.model";
import {
  Project,
  type IProject,
  type PhasePlanStatus,
  type PaymentPlan,
} from "../models/Project.model";
import { ProjectPhase, type IProjectPhase } from "../models/ProjectPhase.model";
import { User } from "../models/User.model";
import {
  getAdvanceAmount,
  getPhaseAmountsDue,
  getRemainingBalance,
} from "../utils/phasePayments";
import { budgetLabel, formatTaka } from "../utils/money";

export interface CreateProjectRequestBody {
  title: string;
  description: string;
  category: string;
  budgetMin: number;
  budgetMax: number;
  location: string;
  targetStartDate: string;
  targetCompletionDate: string;
}

interface ProjectResponse {
  id: string;
  projectName: string;
  clientName: string;
  currentPhaseName: string;
  progressPercentage: number;
  nextMilestone: string;
  nextMilestoneDueDate: string;
}

export interface ClientPostedProjectResponse {
  id: string;
  projectName: string;
  assignedEngineer: string | null;
  assignedEngineerUserId: string | null;
  currentPhaseName: string;
  progressPercentage: number;
  nextMilestone: string;
  /** Null until the project has a real milestone date. */
  nextMilestoneDueDate: string | null;
  status: IProject["status"];
  postedDate: string;
  budgetRange: string;
  category: string;
  bidCount: number;
  pendingBidCount: number;
  phasePlanStatus: PhasePlanStatus;
  advancePaid: boolean;
  phasesAwaitingApproval: number;
}

interface PostedProjectCounts {
  bidCount: number;
  pendingBidCount: number;
  phasesAwaitingApproval: number;
}

export interface OpenProjectResponse {
  id: string;
  title: string;
  clientId: string | null;
  clientName: string;
  description: string;
  budgetRange: string;
  location: string;
  postedDate: string;
  category: string;
}

interface CreateProjectSuccessResponse {
  id: string;
  title: string;
  description: string;
  category: string;
  budgetMin: number;
  budgetMax: number;
  location: string;
  targetStartDate: string;
  targetCompletionDate: string;
  client: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface EngineerOverviewResponse {
  activeProjects: number;
  pendingBids: number;
  unreadMessages: number;
  upcomingMilestones: number;
  recentActivity: RecentActivity[];
}

interface NotificationFeedEntry {
  source: "notification";
  type: NotificationType;
  message: string;
  timestamp: string;
  projectId: string | null;
  equipmentId: string | null;
  bidId: string | null;
  conversationId: string | null;
  messageId: string | null;
}

interface OwnBidFeedEntry {
  source: "own_bid";
  bidId: string;
  projectId: string;
  projectTitle: string;
  timestamp: string;
}

interface OwnPhaseCompletionFeedEntry {
  source: "own_phase_completion";
  phaseId: string;
  projectId: string;
  projectTitle: string;
  phaseTitle: string;
  timestamp: string;
}

type RecentActivity =
  | NotificationFeedEntry
  | OwnBidFeedEntry
  | OwnPhaseCompletionFeedEntry;

const RECENT_ACTIVITY_LIMIT = 5;

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
  projectName: project.name ?? project.title ?? "Untitled project",
  clientName: project.clientName ?? "Client",
  currentPhaseName: project.currentPhaseName ?? "Project briefing",
  progressPercentage: project.progressPercentage ?? 0,
  nextMilestone: project.nextMilestone ?? "Awaiting milestone plan",
  nextMilestoneDueDate: project.nextMilestoneDueDate
    ? project.nextMilestoneDueDate.toISOString()
    : new Date().toISOString(),
});

const toOpenProjectResponse = (project: IProject): OpenProjectResponse => ({
  id: project._id.toString(),
  title: project.title ?? project.name ?? "Untitled project",
  clientId: project.client?.toString() ?? null,
  clientName: project.clientName ?? "Client",
  description: project.description ?? "Project brief available on request.",
  budgetRange: budgetLabel(project),
  location: project.location ?? "Location to be confirmed",
  postedDate: (project.postedDate ?? project.createdAt).toISOString(),
  category: project.category ?? "Civil engineering",
});

const toClientPostedProjectResponse = (
  project: IProject & {
    assignedEngineer?: {
      _id?: { toString: () => string };
      name?: string;
    } | null;
  },
  counts: PostedProjectCounts,
): ClientPostedProjectResponse => ({
  id: project._id.toString(),
  projectName: project.title ?? project.name ?? "Untitled project",
  assignedEngineer:
    typeof project.assignedEngineer === "object" &&
    project.assignedEngineer !== null &&
    typeof project.assignedEngineer.name === "string"
      ? project.assignedEngineer.name
      : null,
  assignedEngineerUserId:
    typeof project.assignedEngineer === "object" &&
    project.assignedEngineer !== null &&
    project.assignedEngineer._id
      ? project.assignedEngineer._id.toString()
      : null,
  currentPhaseName: project.currentPhaseName ?? "Reviewing bids",
  progressPercentage: project.progressPercentage ?? 0,
  nextMilestone: project.nextMilestone ?? "Select engineering partner",
  nextMilestoneDueDate: project.nextMilestoneDueDate
    ? project.nextMilestoneDueDate.toISOString()
    : null,
  status: project.status,
  postedDate: (project.postedDate ?? project.createdAt).toISOString(),
  budgetRange: budgetLabel(project),
  category: project.category ?? "General",
  bidCount: counts.bidCount,
  pendingBidCount: counts.pendingBidCount,
  phasePlanStatus: project.phasePlanStatus,
  advancePaid: project.advancePaid,
  phasesAwaitingApproval: counts.phasesAwaitingApproval,
});

export const createProject = async (
  req: AuthenticatedRequest<CreateProjectRequestBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId || req.user.role !== "client") {
      throw createProjectError("Client access required", 403);
    }

    const {
      title,
      description,
      category,
      budgetMin,
      budgetMax,
      location,
      targetStartDate,
      targetCompletionDate,
    } = req.body;

    if (
      !title?.trim() ||
      !description?.trim() ||
      !category?.trim() ||
      !location?.trim() ||
      !targetStartDate ||
      !targetCompletionDate
    ) {
      throw createProjectError("All project fields are required", 400);
    }

    const parsedBudgetMin = Number(budgetMin);
    const parsedBudgetMax = Number(budgetMax);

    if (
      !Number.isFinite(parsedBudgetMin) ||
      !Number.isFinite(parsedBudgetMax) ||
      parsedBudgetMin < 0 ||
      parsedBudgetMax < 0 ||
      parsedBudgetMin >= parsedBudgetMax
    ) {
      throw createProjectError(
        "Budget minimum must be less than the maximum budget",
        400,
      );
    }

    const startDate = new Date(targetStartDate);
    const completionDate = new Date(targetCompletionDate);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(completionDate.getTime())
    ) {
      throw createProjectError("Target dates must be valid ISO dates", 400);
    }

    if (completionDate <= startDate) {
      throw createProjectError(
        "Target completion date must be after the target start date",
        400,
      );
    }

    const currentUser = await User.findById(req.user.userId);
    const project = await Project.create({
      title: title.trim(),
      name: title.trim(),
      client: req.user.userId,
      clientName: currentUser?.name ?? "Client",
      description: description.trim(),
      category: category.trim(),
      budgetMin: parsedBudgetMin,
      budgetMax: parsedBudgetMax,
      budgetRange: `${formatTaka(parsedBudgetMin)} - ${formatTaka(parsedBudgetMax)}`,
      location: location.trim(),
      targetStartDate: startDate,
      targetCompletionDate: completionDate,
      assignedEngineer: null,
      status: "open_for_bids",
      postedDate: new Date(),
    });

    const response: CreateProjectSuccessResponse = {
      id: project._id.toString(),
      title: project.title ?? project.name ?? "Untitled project",
      description: project.description ?? "",
      category: project.category ?? "",
      budgetMin: project.budgetMin ?? parsedBudgetMin,
      budgetMax: project.budgetMax ?? parsedBudgetMax,
      location: project.location ?? "",
      targetStartDate: project.targetStartDate
        ? project.targetStartDate.toISOString()
        : startDate.toISOString(),
      targetCompletionDate: project.targetCompletionDate
        ? project.targetCompletionDate.toISOString()
        : completionDate.toISOString(),
      client: project.client?.toString() ?? req.user.userId,
      status: project.status,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };

    res.status(201).json(response);
  } catch (error: unknown) {
    next(error);
  }
};

export const getMyProjects = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId || req.user.role !== "engineer") {
      throw createProjectError("Engineer access required", 403);
    }

    const projects = await Project.find({
      assignedEngineer: req.user.userId,
      status: { $ne: "completed" },
    })
      .sort({ nextMilestoneDueDate: 1 })
      .exec();

    res.status(200).json(projects.map(toProjectResponse));
  } catch (error: unknown) {
    next(error);
  }
};

export const getMyPostedProjects = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId || req.user.role !== "client") {
      throw createProjectError("Client access required", 403);
    }

    const projects = await Project.find({
      client: req.user.userId,
      status: { $ne: "completed" },
    })
      .populate("assignedEngineer", "name")
      .sort({ createdAt: -1 })
      .exec();

    const projectIds = projects.map((project) => project._id);
    const [bidRows, phaseRows] = await Promise.all([
      Bid.aggregate<{ _id: Types.ObjectId; total: number; pending: number }>([
        { $match: { project: { $in: projectIds } } },
        {
          $group: {
            _id: "$project",
            total: { $sum: 1 },
            pending: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
            },
          },
        },
      ]).exec(),
      ProjectPhase.aggregate<{ _id: Types.ObjectId; count: number }>([
        {
          $match: {
            project: { $in: projectIds },
            status: "awaiting_approval",
          },
        },
        { $group: { _id: "$project", count: { $sum: 1 } } },
      ]).exec(),
    ]);
    const bidsByProject = new Map(
      bidRows.map((row) => [row._id.toString(), row]),
    );
    const awaitingByProject = new Map(
      phaseRows.map((row) => [row._id.toString(), row.count]),
    );

    res.status(200).json(
      projects.map((project) => {
        const id = project._id.toString();
        return toClientPostedProjectResponse(project, {
          bidCount: bidsByProject.get(id)?.total ?? 0,
          pendingBidCount: bidsByProject.get(id)?.pending ?? 0,
          phasesAwaitingApproval: awaitingByProject.get(id) ?? 0,
        });
      }),
    );
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
    const [
      activeProjects,
      upcomingMilestones,
      notifications,
      pendingBids,
      unreadMessages,
      ownBids,
      engineerProjects,
    ] = await Promise.all([
      Project.countDocuments({
        ...engineerFilter,
        status: { $in: ["active", "in-progress"] },
      }),
      Project.countDocuments({
        ...engineerFilter,
        nextMilestoneDueDate: { $gt: new Date() },
        status: { $ne: "completed" },
      }),
      Notification.find({ recipient: req.user.userId })
        .sort({ createdAt: -1 })
        .limit(RECENT_ACTIVITY_LIMIT)
        .exec(),
      Bid.countDocuments({ engineer: req.user.userId, status: "pending" }),
      getTotalUnreadMessageCount(req.user.userId),
      Bid.find({ engineer: req.user.userId })
        .populate("project", "title name")
        .sort({ createdAt: -1 })
        .limit(RECENT_ACTIVITY_LIMIT)
        .exec(),
      Project.find(engineerFilter).select("_id title name").exec(),
    ]);

    // Phases carry no engineer reference, so they can only be scoped through
    // the engineer's projects - this query depends on the lookup above.
    const projectTitleById = new Map(
      engineerProjects.map((project) => [
        project._id.toString(),
        project.title ?? project.name ?? "Untitled project",
      ]),
    );
    const completedPhases = await ProjectPhase.find({
      project: { $in: engineerProjects.map((project) => project._id) },
      status: "completed",
      completedAt: { $ne: null },
    })
      .sort({ completedAt: -1 })
      .limit(RECENT_ACTIVITY_LIMIT)
      .exec();

    const notificationEntries: RecentActivity[] = notifications.map(
      (notification) => ({
        source: "notification",
        type: notification.type,
        message: notification.message,
        timestamp: notification.createdAt.toISOString(),
        projectId: notification.project?.toString() ?? null,
        equipmentId: notification.equipment?.toString() ?? null,
        bidId: notification.bid?.toString() ?? null,
        conversationId: notification.conversation?.toString() ?? null,
        messageId: notification.messageRef?.toString() ?? null,
      }),
    );

    const bidEntries: RecentActivity[] = ownBids.map((bid) => {
      const project = bid.project as unknown as {
        _id: { toString: () => string };
        title?: string;
        name?: string;
      };
      return {
        source: "own_bid",
        bidId: bid._id.toString(),
        projectId: project._id.toString(),
        projectTitle: project.title ?? project.name ?? "Untitled project",
        timestamp: bid.createdAt.toISOString(),
      };
    });

    const phaseEntries: RecentActivity[] = completedPhases.map((phase) => ({
      source: "own_phase_completion",
      phaseId: phase._id.toString(),
      projectId: phase.project.toString(),
      projectTitle:
        projectTitleById.get(phase.project.toString()) ?? "Untitled project",
      phaseTitle: phase.name,
      timestamp: (phase.completedAt ?? phase.updatedAt).toISOString(),
    }));

    const overview: EngineerOverviewResponse = {
      activeProjects,
      pendingBids,
      unreadMessages,
      upcomingMilestones,
      recentActivity: [...notificationEntries, ...bidEntries, ...phaseEntries]
        .sort(
          (first, second) =>
            new Date(second.timestamp).getTime() -
            new Date(first.timestamp).getTime(),
        )
        .slice(0, RECENT_ACTIVITY_LIMIT),
    };

    res.status(200).json(overview);
  } catch (error: unknown) {
    next(error);
  }
};

// ============ Phase Planning Methods ============

export interface CreatePhasePlanRequestBody {
  phases: Array<{
    title: string;
    description: string;
    price: number;
    estimatedDueDate: string;
    order: number;
  }>;
}

export interface PhasePlanPhaseResponse {
  id: string;
  title: string;
  description: string;
  price: number;
  estimatedDueDate: string;
  order: number;
  paymentStatus: string;
  /** What approving this phase costs on the phase-by-phase plan. */
  amountDue: number;
}

export interface PhasePlanResponse {
  projectId: string;
  phasePlanStatus: PhasePlanStatus;
  totalAgreedValue: number | undefined;
  paymentPlan: PaymentPlan | null | undefined;
  advanceRequiredAmount: number | null | undefined;
  advancePaid: boolean;
  advancePaidAt: string | undefined;
  fullPaymentPaid: boolean;
  fullPaymentPaidAt: string | undefined;
  /** The advance this plan needs, known before the client approves it. */
  advanceAmount: number;
  /** Everything after the advance. */
  remainingBalance: number;
  phasePlanFeedback: { note: string; rejectedAt: string } | null;
  phases: PhasePlanPhaseResponse[];
}

const toPhasePlanResponse = (
  project: IProject,
  phases: IProjectPhase[],
): PhasePlanResponse => {
  const amountsDue = getPhaseAmountsDue(project, phases);
  return {
    projectId: project._id.toString(),
    phasePlanStatus: project.phasePlanStatus,
    totalAgreedValue: project.totalAgreedValue,
    paymentPlan: project.paymentPlan,
    advanceRequiredAmount: project.advanceRequiredAmount,
    advancePaid: project.advancePaid,
    advancePaidAt: project.advancePaidAt?.toISOString(),
    fullPaymentPaid: project.fullPaymentPaid,
    fullPaymentPaidAt: project.fullPaymentPaidAt?.toISOString(),
    advanceAmount: getAdvanceAmount(project),
    remainingBalance: getRemainingBalance(project),
    phasePlanFeedback: project.phasePlanFeedback
      ? {
          note: project.phasePlanFeedback.note,
          rejectedAt: project.phasePlanFeedback.rejectedAt.toISOString(),
        }
      : null,
    phases: [...phases]
      .sort((a, b) => a.order - b.order)
      .map((phase) => ({
        id: phase._id.toString(),
        title: phase.name,
        description: phase.description || "",
        price: phase.price,
        estimatedDueDate: (phase.dueDate || new Date()).toISOString(),
        order: phase.order,
        paymentStatus: phase.paymentStatus,
        amountDue: amountsDue.get(phase._id.toString()) ?? 0,
      })),
  };
};

const PLAN_FEEDBACK_LIMIT = 1000;

export interface ApprovePhasePlanRequestBody {
  paymentPlan: PaymentPlan;
}

export interface RejectPhasePlanRequestBody {
  feedback: string;
}

export const createPhasePlan = async (
  req: AuthenticatedRequest<CreatePhasePlanRequestBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId || req.user.role !== "engineer") {
      throw createProjectError("Engineer access required", 403);
    }

    const { projectId } = req.params as unknown as { projectId?: string };
    if (!projectId) {
      throw createProjectError("Project ID is required", 400);
    }

    const project = await Project.findById(projectId).exec();
    if (!project) {
      throw createProjectError("Project not found", 404);
    }

    if (project.assignedEngineer?.toString() !== req.user.userId) {
      throw createProjectError("You are not assigned to this project", 403);
    }

    if (
      project.phasePlanStatus !== "not_created" &&
      project.phasePlanStatus !== "draft"
    ) {
      throw createProjectError(
        "Phase plan cannot be edited in its current status",
        409,
      );
    }

    const { phases } = req.body;
    if (!Array.isArray(phases) || phases.length === 0) {
      throw createProjectError("At least one phase is required", 400);
    }

    // Validate and normalize phases
    const validatedPhases = phases.map((phase, index) => {
      if (
        !phase.title ||
        !phase.description ||
        typeof phase.price !== "number" ||
        !phase.estimatedDueDate
      ) {
        throw createProjectError(
          "Each phase must have title, description, price, and estimatedDueDate",
          400,
        );
      }
      if (!Number.isFinite(phase.price) || phase.price < 0) {
        throw createProjectError("Phase price cannot be negative", 400);
      }
      const dueDate = new Date(phase.estimatedDueDate);
      if (Number.isNaN(dueDate.getTime())) {
        throw createProjectError(
          `"${phase.title}" has a due date that isn't a valid date`,
          400,
        );
      }
      return {
        project: project._id,
        name: phase.title,
        description: phase.description,
        price: phase.price,
        dueDate,
        order: index,
        status: "not_started" as const,
        paymentStatus: "unpaid" as const,
      };
    });

    // Delete existing draft phases for this project
    await ProjectPhase.deleteMany({ project: project._id }).exec();

    // Create new phases
    const createdPhases = await ProjectPhase.insertMany(validatedPhases);

    project.phasePlanStatus = "draft";
    await project.save();

    const response = toPhasePlanResponse(project, createdPhases);

    res.status(201).json(response);
  } catch (error: unknown) {
    next(error);
  }
};

export const submitPhasePlanForApproval = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId || req.user.role !== "engineer") {
      throw createProjectError("Engineer access required", 403);
    }

    const { projectId } = req.params as unknown as { projectId?: string };
    if (!projectId) {
      throw createProjectError("Project ID is required", 400);
    }

    const project = await Project.findById(projectId).exec();
    if (!project) {
      throw createProjectError("Project not found", 404);
    }

    if (project.assignedEngineer?.toString() !== req.user.userId) {
      throw createProjectError("You are not assigned to this project", 403);
    }

    if (project.phasePlanStatus !== "draft") {
      throw createProjectError(
        "Phase plan must be in draft status to submit for approval",
        409,
      );
    }

    const phases = await ProjectPhase.find({ project: project._id })
      .sort({ order: 1 })
      .exec();

    if (phases.length === 0) {
      throw createProjectError(
        "At least one phase must exist before submission",
        400,
      );
    }

    const totalPrice = phases.reduce((sum, phase) => sum + phase.price, 0);
    const totalAgreedValue = project.totalAgreedValue || 0;
    const difference = Math.abs(totalPrice - totalAgreedValue);

    if (difference > 0.01) {
      throw createProjectError(
        `Phase prices total ${formatTaka(totalPrice)} but must equal the agreed project value of ${formatTaka(totalAgreedValue)}. Difference: ${formatTaka(difference)}`,
        400,
      );
    }

    project.phasePlanStatus = "pending_client_approval";
    project.phasePlanFeedback = null;
    await project.save();

    // Notify client
    if (project.client) {
      await Notification.create({
        recipient: project.client,
        type: "phase_plan_submitted",
        message: `The engineer has submitted a phase plan for ${project.title ?? project.name ?? "your project"} for your approval.`,
        project: project._id,
      });
    }

    res.status(200).json({
      phasePlanStatus: project.phasePlanStatus,
      message: "Phase plan submitted for client approval",
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const getPhasePlan = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId) {
      throw createProjectError("Authentication required", 401);
    }

    const { projectId } = req.params as unknown as { projectId?: string };
    if (!projectId) {
      throw createProjectError("Project ID is required", 400);
    }

    const project = await Project.findById(projectId).exec();
    if (!project) {
      throw createProjectError("Project not found", 404);
    }

    const isClient = project.client?.toString() === req.user.userId;
    const isAssignedEngineer =
      project.assignedEngineer?.toString() === req.user.userId;

    if (!isClient && !isAssignedEngineer) {
      throw createProjectError("Forbidden", 403);
    }

    const phases = await ProjectPhase.find({ project: project._id })
      .sort({ order: 1 })
      .exec();

    const response = toPhasePlanResponse(project, phases);

    res.status(200).json(response);
  } catch (error: unknown) {
    next(error);
  }
};

export const approvePhasePlan = async (
  req: AuthenticatedRequest<ApprovePhasePlanRequestBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId || req.user.role !== "client") {
      throw createProjectError("Client access required", 403);
    }

    const { projectId } = req.params as unknown as { projectId?: string };
    if (!projectId) {
      throw createProjectError("Project ID is required", 400);
    }

    const project = await Project.findById(projectId).exec();
    if (!project) {
      throw createProjectError("Project not found", 404);
    }

    if (project.client?.toString() !== req.user.userId) {
      throw createProjectError("You do not own this project", 403);
    }

    if (project.phasePlanStatus !== "pending_client_approval") {
      throw createProjectError("Phase plan is not awaiting approval", 409);
    }

    const { paymentPlan } = req.body;
    if (paymentPlan !== "phase_by_phase" && paymentPlan !== "full_upfront") {
      throw createProjectError(
        "Invalid payment plan. Must be 'phase_by_phase' or 'full_upfront'",
        400,
      );
    }

    project.phasePlanStatus = "approved";
    project.paymentPlan = paymentPlan;
    project.advanceRequiredAmount = getAdvanceAmount(project);
    project.phasePlanFeedback = null;

    await project.save();

    // Notify engineer
    if (project.assignedEngineer) {
      await Notification.create({
        recipient: project.assignedEngineer,
        type: "phase_plan_approved",
        message: `Your phase plan for ${project.title ?? project.name ?? "this project"} has been approved. Awaiting advance payment before work begins.`,
        project: project._id,
      });
    }

    res.status(200).json({
      phasePlanStatus: project.phasePlanStatus,
      paymentPlan: project.paymentPlan,
      advanceRequiredAmount: project.advanceRequiredAmount,
      message: "Phase plan approved",
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const rejectPhasePlan = async (
  req: AuthenticatedRequest<RejectPhasePlanRequestBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId || req.user.role !== "client") {
      throw createProjectError("Client access required", 403);
    }

    const { projectId } = req.params as unknown as { projectId?: string };
    if (!projectId) {
      throw createProjectError("Project ID is required", 400);
    }

    const project = await Project.findById(projectId).exec();
    if (!project) {
      throw createProjectError("Project not found", 404);
    }

    if (project.client?.toString() !== req.user.userId) {
      throw createProjectError("You do not own this project", 403);
    }

    if (project.phasePlanStatus !== "pending_client_approval") {
      throw createProjectError("Phase plan is not awaiting approval", 409);
    }

    const feedback =
      typeof req.body.feedback === "string" ? req.body.feedback.trim() : "";
    if (!feedback) {
      throw createProjectError("Feedback is required", 400);
    }
    if (feedback.length > PLAN_FEEDBACK_LIMIT) {
      throw createProjectError(
        `Keep the feedback to ${PLAN_FEEDBACK_LIMIT} characters or fewer`,
        400,
      );
    }

    project.phasePlanStatus = "draft";
    project.phasePlanFeedback = { note: feedback, rejectedAt: new Date() };
    await project.save();

    // Notify engineer with feedback
    if (project.assignedEngineer) {
      await Notification.create({
        recipient: project.assignedEngineer,
        type: "phase_plan_rejected",
        message: `Your phase plan for ${project.title ?? project.name ?? "this project"} requires changes: "${feedback}"`,
        project: project._id,
      });
    }

    res.status(200).json({
      phasePlanStatus: project.phasePlanStatus,
      message: "Phase plan returned to draft for revision",
    });
  } catch (error: unknown) {
    next(error);
  }
};

import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Bid } from "../models/Bid.model";
import {
  Notification,
  type NotificationType,
} from "../models/Notification.model";
import { Payment } from "../models/Payment.model";
import { Project, type IProject } from "../models/Project.model";
import { ProjectPhase, type IProjectPhase } from "../models/ProjectPhase.model";
import {
  getAdvanceAmount,
  getPhaseAmountsDue,
  getRemainingBalance,
} from "../utils/phasePayments";
import { getTotalUnreadMessageCount } from "./message.controller";

export type ClientActionKind =
  | "plan_review"
  | "advance_due"
  | "phase_review"
  | "phase_payment"
  | "bids_review";

/** One decision the client has to make before a project can move on. */
export interface ClientActionItem {
  kind: ClientActionKind;
  projectId: string;
  projectTitle: string;
  phaseId: string | null;
  phaseName: string | null;
  /** What acting on this costs, when it costs anything. */
  amount: number | null;
  /** How many bids are waiting, for bid reviews. */
  count: number | null;
  /** When this started waiting on the client. */
  since: string;
  href: string;
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

export interface ClientOverviewResponse {
  activeProjects: number;
  pendingBidReviews: number;
  unreadMessages: number;
  actionItems: ClientActionItem[];
  money: {
    /** Agreed value of every project with an engineer hired. */
    committed: number;
    /** Everything this client has actually paid. */
    paidToDate: number;
    /** What the waiting decisions would cost if approved now. */
    dueNow: number;
  };
  recentActivity: NotificationFeedEntry[];
}

interface ClientDashboardError extends Error {
  statusCode: number;
}

const RECENT_ACTIVITY_LIMIT = 8;
const HIRED_STATUSES = new Set(["active", "in-progress", "completed"]);

const createClientDashboardError = (
  message: string,
  statusCode: number,
): ClientDashboardError => {
  const error = new Error(message) as ClientDashboardError;
  error.statusCode = statusCode;
  return error;
};

const toCents = (amount: number): number => Math.round(amount * 100);

const projectTitle = (project: IProject): string =>
  project.title ?? project.name ?? "Untitled project";

const projectHref = (project: IProject): string =>
  `/dashboard/client/projects/${project._id.toString()}`;

// Every place a project waits on its client: a plan to review, an advance to
// pay, a finished phase to approve (and pay for), or bids to choose between.
const collectActionItems = (
  projects: IProject[],
  phasesByProject: Map<string, IProjectPhase[]>,
  pendingBids: Map<string, { count: number; oldest: Date }>,
): ClientActionItem[] => {
  const items: ClientActionItem[] = [];

  for (const project of projects) {
    const id = project._id.toString();
    const base = {
      projectId: id,
      projectTitle: projectTitle(project),
      phaseId: null,
      phaseName: null,
      count: null,
    };

    if (project.status === "open_for_bids") {
      const bids = pendingBids.get(id);
      if (bids) {
        items.push({
          ...base,
          kind: "bids_review",
          amount: null,
          count: bids.count,
          since: bids.oldest.toISOString(),
          href: `/dashboard/client/bids?project=${id}`,
        });
      }
      continue;
    }
    if (project.status === "cancelled" || project.status === "completed") {
      continue;
    }

    if (project.phasePlanStatus === "pending_client_approval") {
      items.push({
        ...base,
        kind: "plan_review",
        amount: null,
        since: project.updatedAt.toISOString(),
        href: projectHref(project),
      });
      continue;
    }
    if (project.phasePlanStatus !== "approved") continue;

    if (!project.advancePaid) {
      items.push({
        ...base,
        kind: "advance_due",
        amount: getAdvanceAmount(project),
        since: project.updatedAt.toISOString(),
        href: projectHref(project),
      });
      continue;
    }

    const phases = phasesByProject.get(id) ?? [];
    const amountsDue = getPhaseAmountsDue(project, phases);
    const finalOrder = Math.max(...phases.map((phase) => phase.order));
    const isPhaseByPhase = project.paymentPlan === "phase_by_phase";

    for (const phase of phases) {
      const phaseBase = {
        ...base,
        phaseId: phase._id.toString(),
        phaseName: phase.name,
        href: projectHref(project),
      };
      if (phase.status === "awaiting_approval") {
        items.push({
          ...phaseBase,
          kind: "phase_review",
          amount: isPhaseByPhase
            ? (amountsDue.get(phase._id.toString()) ?? 0)
            : phase.order === finalOrder && !project.fullPaymentPaid
              ? getRemainingBalance(project)
              : null,
          since: phase.updatedAt.toISOString(),
        });
      } else if (
        isPhaseByPhase &&
        phase.status === "completed" &&
        phase.paymentStatus === "unpaid"
      ) {
        items.push({
          ...phaseBase,
          kind: "phase_payment",
          amount: amountsDue.get(phase._id.toString()) ?? 0,
          since: (phase.completedAt ?? phase.updatedAt).toISOString(),
        });
      }
    }
  }

  // Whatever has waited longest comes first.
  return items.sort(
    (a, b) => new Date(a.since).getTime() - new Date(b.since).getTime(),
  );
};

export const getClientOverview = async (
  req: AuthenticatedRequest,
  res: Response<ClientOverviewResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId || req.user.role !== "client") {
      throw createClientDashboardError("Client access required", 403);
    }
    const clientId = new Types.ObjectId(req.user.userId);

    const [projects, paidRows, unreadMessages, notifications] =
      await Promise.all([
        Project.find({ client: clientId })
          .select(
            "_id title name status assignedEngineer phasePlanStatus paymentPlan totalAgreedValue advanceRequiredAmount advancePaid fullPaymentPaid updatedAt",
          )
          .exec(),
        Payment.aggregate<{ total: number }>([
          { $match: { paidBy: clientId, status: "paid" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]).exec(),
        getTotalUnreadMessageCount(req.user.userId),
        Notification.find({ recipient: clientId })
          .sort({ createdAt: -1 })
          .limit(RECENT_ACTIVITY_LIMIT)
          .exec(),
      ]);

    const approvedIds = projects
      .filter((project) => project.phasePlanStatus === "approved")
      .map((project) => project._id);
    const openIds = projects
      .filter((project) => project.status === "open_for_bids")
      .map((project) => project._id);
    const allIds = projects.map((project) => project._id);

    const [phases, pendingBidRows, pendingBidReviews] = await Promise.all([
      approvedIds.length > 0
        ? ProjectPhase.find({ project: { $in: approvedIds } }).exec()
        : Promise.resolve([]),
      openIds.length > 0
        ? Bid.aggregate<{ _id: Types.ObjectId; count: number; oldest: Date }>([
            { $match: { project: { $in: openIds }, status: "pending" } },
            {
              $group: {
                _id: "$project",
                count: { $sum: 1 },
                oldest: { $min: "$createdAt" },
              },
            },
          ]).exec()
        : Promise.resolve([]),
      allIds.length > 0
        ? Bid.countDocuments({ project: { $in: allIds }, status: "pending" })
        : Promise.resolve(0),
    ]);

    const phasesByProject = new Map<string, IProjectPhase[]>();
    for (const phase of phases) {
      const key = phase.project.toString();
      phasesByProject.set(key, [...(phasesByProject.get(key) ?? []), phase]);
    }
    const pendingBids = new Map(
      pendingBidRows.map((row) => [
        row._id.toString(),
        { count: row.count, oldest: row.oldest },
      ]),
    );

    const actionItems = collectActionItems(
      projects,
      phasesByProject,
      pendingBids,
    );
    const committedCents = projects
      .filter(
        (project) =>
          project.status !== "cancelled" &&
          (project.assignedEngineer || HIRED_STATUSES.has(project.status)),
      )
      .reduce((sum, project) => sum + toCents(project.totalAgreedValue ?? 0), 0);
    const dueNowCents = actionItems.reduce(
      (sum, item) => sum + toCents(item.amount ?? 0),
      0,
    );

    res.status(200).json({
      activeProjects: projects.filter(
        (project) =>
          project.status === "active" || project.status === "in-progress",
      ).length,
      pendingBidReviews,
      unreadMessages,
      actionItems,
      money: {
        committed: committedCents / 100,
        paidToDate: toCents(paidRows[0]?.total ?? 0) / 100,
        dueNow: dueNowCents / 100,
      },
      recentActivity: notifications.map((notification) => ({
        source: "notification",
        type: notification.type,
        message: notification.message,
        timestamp: notification.createdAt.toISOString(),
        projectId: notification.project?.toString() ?? null,
        equipmentId: notification.equipment?.toString() ?? null,
        bidId: notification.bid?.toString() ?? null,
        conversationId: notification.conversation?.toString() ?? null,
        messageId: notification.messageRef?.toString() ?? null,
      })),
    });
  } catch (error: unknown) {
    next(error);
  }
};

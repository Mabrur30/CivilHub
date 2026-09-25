import { type FeedEntry, isFeedEntry } from "../ActivityFeedItem";

export type ClientActionKind =
  | "plan_review"
  | "advance_due"
  | "phase_review"
  | "phase_payment"
  | "bids_review";

export interface ClientActionItem {
  kind: ClientActionKind;
  projectId: string;
  projectTitle: string;
  phaseId: string | null;
  phaseName: string | null;
  amount: number | null;
  count: number | null;
  since: string;
  href: string;
}

export interface ClientOverview {
  activeProjects: number;
  pendingBidReviews: number;
  unreadMessages: number;
  actionItems: ClientActionItem[];
  money: { committed: number; paidToDate: number; dueNow: number };
  recentActivity: FeedEntry[];
}

export type PhasePlanStatus =
  | "not_created"
  | "draft"
  | "pending_client_approval"
  | "approved";

export type ProjectStatus =
  | "active"
  | "in-progress"
  | "completed"
  | "open_for_bids"
  | "cancelled";

export interface ClientProject {
  id: string;
  projectName: string;
  assignedEngineer: string | null;
  assignedEngineerUserId: string | null;
  currentPhaseName: string;
  progressPercentage: number;
  nextMilestone: string;
  nextMilestoneDueDate: string | null;
  status: ProjectStatus;
  postedDate: string;
  budgetRange: string;
  category: string;
  bidCount: number;
  pendingBidCount: number;
  phasePlanStatus: PhasePlanStatus;
  advancePaid: boolean;
  phasesAwaitingApproval: number;
}

export type ProjectStage = "taking_bids" | "planning" | "in_delivery" | "cancelled";

export const stageLabels: Record<ProjectStage, string> = {
  taking_bids: "Taking bids",
  planning: "Planning",
  in_delivery: "In delivery",
  cancelled: "Cancelled",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isStringOrNull = (value: unknown): value is string | null =>
  typeof value === "string" || value === null;

const isNumberOrNull = (value: unknown): value is number | null =>
  typeof value === "number" || value === null;

const actionKinds: ClientActionKind[] = [
  "plan_review",
  "advance_due",
  "phase_review",
  "phase_payment",
  "bids_review",
];

const isActionItem = (value: unknown): value is ClientActionItem =>
  isRecord(value) &&
  actionKinds.includes(value.kind as ClientActionKind) &&
  typeof value.projectId === "string" &&
  typeof value.projectTitle === "string" &&
  isStringOrNull(value.phaseId) &&
  isStringOrNull(value.phaseName) &&
  isNumberOrNull(value.amount) &&
  isNumberOrNull(value.count) &&
  typeof value.since === "string" &&
  typeof value.href === "string";

/**
 * Validates the overview, keeping only the activity entries this client knows
 * how to show. A new notification type from the server should hide one feed
 * row, not fail the whole dashboard.
 */
export const parseClientOverview = (value: unknown): ClientOverview | null => {
  if (!isRecord(value) || !isRecord(value.money)) return null;
  const isValid =
    typeof value.activeProjects === "number" &&
    typeof value.pendingBidReviews === "number" &&
    typeof value.unreadMessages === "number" &&
    Array.isArray(value.actionItems) &&
    value.actionItems.every(isActionItem) &&
    typeof value.money.committed === "number" &&
    typeof value.money.paidToDate === "number" &&
    typeof value.money.dueNow === "number" &&
    Array.isArray(value.recentActivity);
  if (!isValid) return null;
  return {
    ...(value as unknown as ClientOverview),
    recentActivity: (value.recentActivity as unknown[]).filter(isFeedEntry),
  };
};

export const isClientProject = (value: unknown): value is ClientProject =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.projectName === "string" &&
  isStringOrNull(value.assignedEngineer) &&
  isStringOrNull(value.assignedEngineerUserId) &&
  typeof value.currentPhaseName === "string" &&
  typeof value.progressPercentage === "number" &&
  typeof value.nextMilestone === "string" &&
  isStringOrNull(value.nextMilestoneDueDate) &&
  typeof value.status === "string" &&
  typeof value.postedDate === "string" &&
  typeof value.budgetRange === "string" &&
  typeof value.category === "string" &&
  typeof value.bidCount === "number" &&
  typeof value.pendingBidCount === "number" &&
  typeof value.phasePlanStatus === "string" &&
  typeof value.advancePaid === "boolean" &&
  typeof value.phasesAwaitingApproval === "number";

export const getProjectStage = (project: ClientProject): ProjectStage => {
  if (project.status === "open_for_bids") return "taking_bids";
  if (project.status === "cancelled") return "cancelled";
  if (project.phasePlanStatus !== "approved" || !project.advancePaid) {
    return "planning";
  }
  return "in_delivery";
};

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** One line saying where the project is, and whether it is waiting on you. */
export const describeProjectState = (
  project: ClientProject,
): { text: string; needsYou: boolean } => {
  switch (getProjectStage(project)) {
    case "taking_bids":
      if (project.pendingBidCount > 0) {
        return {
          text: `${plural(project.pendingBidCount, "bid", "bids")} to review`,
          needsYou: true,
        };
      }
      return {
        text: project.bidCount > 0 ? "Every bid answered" : "Waiting for bids",
        needsYou: false,
      };
    case "planning":
      if (project.phasePlanStatus === "pending_client_approval") {
        return { text: "Phase plan ready for your review", needsYou: true };
      }
      if (project.phasePlanStatus === "approved") {
        return { text: "Advance payment due", needsYou: true };
      }
      return {
        text: `${project.assignedEngineer ?? "Your engineer"} is drafting the phase plan`,
        needsYou: false,
      };
    case "in_delivery":
      if (project.phasesAwaitingApproval > 0) {
        return {
          text: `${plural(project.phasesAwaitingApproval, "phase", "phases")} to approve`,
          needsYou: true,
        };
      }
      return { text: project.currentPhaseName, needsYou: false };
    case "cancelled":
      return { text: "Cancelled", needsYou: false };
  }
};

/** Where a project row leads: bids while taking bids, progress afterwards. */
export const projectHref = (project: ClientProject): string =>
  getProjectStage(project) === "taking_bids"
    ? `/dashboard/client/bids?project=${project.id}`
    : `/dashboard/client/projects/${project.id}`;

export const getErrorMessage = (value: unknown, fallback: string): string =>
  isRecord(value) && typeof value.message === "string"
    ? value.message
    : fallback;

/** "today", "1 day", "12 days": how long something has been waiting. */
export const formatWaiting = (since: string): string => {
  const start = new Date(since);
  if (Number.isNaN(start.getTime())) return "";
  const days = Math.floor((Date.now() - start.getTime()) / 86_400_000);
  if (days <= 0) return "since today";
  return `for ${plural(days, "day", "days")}`;
};

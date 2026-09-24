export interface ProjectProgress {
  id: string;
  projectName: string;
  clientName: string;
  currentPhaseName: string;
  progressPercentage: number;
  nextMilestone: string;
  nextMilestoneDueDate: string;
}

export const isProjectProgress = (value: unknown): value is ProjectProgress => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const project = value as Record<string, unknown>;
  return (
    typeof project.id === "string" &&
    typeof project.projectName === "string" &&
    typeof project.clientName === "string" &&
    typeof project.currentPhaseName === "string" &&
    typeof project.progressPercentage === "number" &&
    typeof project.nextMilestone === "string" &&
    typeof project.nextMilestoneDueDate === "string"
  );
};

// The server reports this placeholder, together with a due date of "now", for
// projects whose client has not approved a phase plan yet. That date is not a
// real deadline, so it must never be shown as one.
export const NO_MILESTONE_PLACEHOLDER = "Awaiting milestone plan";

export type DueTone = "late" | "soon" | "later";

export interface DueLabel {
  text: string;
  tone: DueTone;
  fullDate: string;
}

const SOON_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

export const dueToneClassName: Record<DueTone, string> = {
  late: "text-primary",
  soon: "text-white/85",
  later: "text-white/50",
};

const startOfDay = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const pluralDays = (days: number): string =>
  `${days} ${days === 1 ? "day" : "days"}`;

export const hasMilestonePlan = (project: ProjectProgress): boolean =>
  project.nextMilestone !== NO_MILESTONE_PLACEHOLDER;

export const getDueLabel = (project: ProjectProgress): DueLabel | null => {
  if (!hasMilestonePlan(project)) return null;

  const due = new Date(project.nextMilestoneDueDate);
  if (Number.isNaN(due.getTime())) return null;

  const days = Math.round((startOfDay(due) - startOfDay(new Date())) / DAY_MS);
  const fullDate = due.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  if (days < 0) {
    return { text: `Overdue by ${pluralDays(-days)}`, tone: "late", fullDate };
  }
  if (days === 0) return { text: "Due today", tone: "soon", fullDate };
  if (days === 1) return { text: "Due tomorrow", tone: "soon", fullDate };
  return {
    text: `Due in ${pluralDays(days)}`,
    tone: days <= SOON_WINDOW_DAYS ? "soon" : "later",
    fullDate,
  };
};

export const clampPercentage = (value: number): number =>
  Math.min(100, Math.max(0, Math.round(value)));

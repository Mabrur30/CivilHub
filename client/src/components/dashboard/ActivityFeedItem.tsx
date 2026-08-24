import { type ReactElement } from "react";

export interface ActivityItem {
  message: string;
  timestamp: string;
  type: string;
}

export const activityColors: Record<string, string> = {
  success: "bg-emerald-400",
  review: "bg-amber-300",
  message: "bg-sky-400",
  milestone: "bg-primary",
  bid: "bg-primary",
  default: "bg-white/50",
};

export const isActivityItem = (value: unknown): value is ActivityItem => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const activity = value as Record<string, unknown>;
  return (
    typeof activity.message === "string" &&
    typeof activity.timestamp === "string" &&
    typeof activity.type === "string"
  );
};

interface ActivityFeedItemProps {
  activity: ActivityItem;
}

export function ActivityFeedItem({
  activity,
}: ActivityFeedItemProps): ReactElement {
  return (
    <div className="flex gap-4 py-5">
      <span
        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${activityColors[activity.type] ?? activityColors.default}`}
      />
      <div className="flex-1 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <p className="text-sm font-semibold text-white/85">
          {activity.message}
        </p>
        <p className="mt-1 text-xs text-white/40 sm:mt-0">
          {activity.timestamp}
        </p>
      </div>
    </div>
  );
}

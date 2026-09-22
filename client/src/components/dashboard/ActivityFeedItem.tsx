import { type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import {
  formatRelativeTime,
  getNotificationDotClassName,
  getNotificationTargetPath,
  isNotificationType,
  isNullableId,
  type NotificationType,
} from "./notificationUtils";

export interface NotificationFeedEntry {
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

export interface OwnBidFeedEntry {
  source: "own_bid";
  bidId: string;
  projectId: string;
  projectTitle: string;
  timestamp: string;
}

export interface OwnPhaseCompletionFeedEntry {
  source: "own_phase_completion";
  phaseId: string;
  projectId: string;
  projectTitle: string;
  phaseTitle: string;
  timestamp: string;
}

export type FeedEntry =
  | NotificationFeedEntry
  | OwnBidFeedEntry
  | OwnPhaseCompletionFeedEntry;

export const isFeedEntry = (value: unknown): value is FeedEntry => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const entry = value as Record<string, unknown>;
  if (typeof entry.timestamp !== "string") {
    return false;
  }

  if (entry.source === "own_bid") {
    return (
      typeof entry.bidId === "string" &&
      typeof entry.projectId === "string" &&
      typeof entry.projectTitle === "string"
    );
  }

  if (entry.source === "own_phase_completion") {
    return (
      typeof entry.phaseId === "string" &&
      typeof entry.projectId === "string" &&
      typeof entry.projectTitle === "string" &&
      typeof entry.phaseTitle === "string"
    );
  }

  return (
    entry.source === "notification" &&
    typeof entry.message === "string" &&
    isNotificationType(entry.type) &&
    isNullableId(entry.projectId) &&
    isNullableId(entry.equipmentId) &&
    isNullableId(entry.bidId) &&
    isNullableId(entry.conversationId) &&
    isNullableId(entry.messageId)
  );
};

export const getFeedEntryKey = (entry: FeedEntry): string => {
  if (entry.source === "own_bid") return `bid-${entry.bidId}`;
  if (entry.source === "own_phase_completion") return `phase-${entry.phaseId}`;
  return `notification-${entry.type}-${entry.timestamp}`;
};

export type ActivityCategory =
  | "all"
  | "bids"
  | "messages"
  | "network"
  | "projects"
  | "bookings";

const categoryByType: Record<NotificationType, ActivityCategory> = {
  bid_accepted: "bids",
  bid_declined: "bids",

  new_message: "messages",

  connection_accepted: "network",
  connection_post: "network",
  post_liked: "network",
  comment_received: "network",
  post_reposted: "network",

  project_phase_updated: "projects",
  phase_plan_submitted: "projects",
  phase_plan_approved: "projects",
  phase_plan_rejected: "projects",
  advance_payment_received: "projects",
  phase_payment_received: "projects",
  full_payment_received: "projects",
  review_received: "projects",
  review_reply: "projects",

  equipment_booking_request: "bookings",
  equipment_booking_approved: "bookings",
  equipment_booking_declined: "bookings",
  equipment_booking_auto_declined: "bookings",
  equipment_booking_payment_received: "bookings",
  equipment_pickup_confirmed: "bookings",
  equipment_return_confirmed: "bookings",
  equipment_deposit_released: "bookings",
  equipment_deposit_claimed: "bookings",
};

export const getFeedEntryCategory = (entry: FeedEntry): ActivityCategory => {
  if (entry.source === "own_bid") return "bids";
  if (entry.source === "own_phase_completion") return "projects";
  return categoryByType[entry.type];
};

const getFeedEntryMessage = (entry: FeedEntry): string => {
  if (entry.source === "own_bid") {
    return `You placed a bid on ${entry.projectTitle}`;
  }
  if (entry.source === "own_phase_completion") {
    return `You completed ${entry.phaseTitle} on ${entry.projectTitle}`;
  }
  return entry.message;
};

// Own actions get a hollow ring so they read as authored-by-you at a glance,
// rather than sharing the filled dots that mark things that happened to you.
const getFeedEntryDotClassName = (entry: FeedEntry): string => {
  if (entry.source === "own_bid") return "border-2 border-primary";
  if (entry.source === "own_phase_completion") return "border-2 border-white/55";
  return getNotificationDotClassName(entry.type);
};

const getFeedEntryTargetPath = (
  entry: FeedEntry,
  role: "client" | "engineer",
): string | null => {
  if (entry.source === "own_bid") {
    return `/dashboard/${role}/bids`;
  }
  if (entry.source === "own_phase_completion") {
    return `/dashboard/${role}/projects/${entry.projectId}`;
  }
  return getNotificationTargetPath(entry, role);
};

interface ActivityFeedItemProps {
  entry: FeedEntry;
  role: "client" | "engineer";
}

export function ActivityFeedItem({
  entry,
  role,
}: ActivityFeedItemProps): ReactElement {
  const navigate = useNavigate();
  const targetPath = getFeedEntryTargetPath(entry, role);
  const relativeTime = formatRelativeTime(entry.timestamp);

  const rowContent = (
    <>
      <span
        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${getFeedEntryDotClassName(entry)}`}
      />
      <div className="flex-1 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <p className="text-sm font-semibold text-white/85">
          {getFeedEntryMessage(entry)}
        </p>
        <p
          className="mt-1 text-xs text-white/40 sm:mt-0"
          title={entry.timestamp}
        >
          {relativeTime || entry.timestamp}
        </p>
      </div>
    </>
  );

  if (!targetPath) {
    return <div className="flex gap-4 py-5">{rowContent}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => navigate(targetPath)}
      className="flex w-full gap-4 py-5 text-left transition-colors hover:bg-white/5"
    >
      {rowContent}
    </button>
  );
}

import { activityColors } from "./ActivityFeedItem";

export type NotificationType =
  | "bid_accepted"
  | "bid_declined"
  | "connection_accepted"
  | "new_message"
  | "connection_post"
  | "post_liked"
  | "project_phase_updated";

export interface NotificationListItem {
  id: string;
  type: NotificationType;
  message: string;
  isRead: boolean;
  createdAt: string;
  projectId: string | null;
  bidId: string | null;
  connectionId: string | null;
  conversationId: string | null;
  messageId: string | null;
}

export interface NotificationListResponse {
  items: NotificationListItem[];
  page: number;
  limit: number;
  total: number;
  unreadCount: number;
}

const notificationTypes: NotificationType[] = [
  "bid_accepted",
  "bid_declined",
  "connection_accepted",
  "new_message",
  "connection_post",
  "post_liked",
  "project_phase_updated",
];

const isNotificationType = (value: unknown): value is NotificationType =>
  typeof value === "string" &&
  notificationTypes.includes(value as NotificationType);

const isNullableId = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

export const isNotificationListItem = (
  value: unknown,
): value is NotificationListItem => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    isNotificationType(item.type) &&
    typeof item.message === "string" &&
    typeof item.isRead === "boolean" &&
    typeof item.createdAt === "string" &&
    isNullableId(item.projectId) &&
    isNullableId(item.bidId) &&
    isNullableId(item.connectionId) &&
    isNullableId(item.conversationId) &&
    isNullableId(item.messageId)
  );
};

export const isNotificationListResponse = (
  value: unknown,
): value is NotificationListResponse => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const response = value as Record<string, unknown>;
  return (
    Array.isArray(response.items) &&
    response.items.every(isNotificationListItem) &&
    typeof response.page === "number" &&
    typeof response.limit === "number" &&
    typeof response.total === "number" &&
    typeof response.unreadCount === "number"
  );
};

export const mapNotificationTypeToActivityType = (
  type: NotificationType,
): string => {
  if (type === "bid_accepted") return "success";
  if (type === "new_message") return "message";
  if (type === "connection_accepted") return "milestone";
  if (type === "connection_post") return "review";
  if (type === "post_liked") return "bid";
  if (type === "project_phase_updated") return "milestone";
  return "review";
};

export const getNotificationDotClassName = (type: NotificationType): string =>
  activityColors[mapNotificationTypeToActivityType(type)] ??
  activityColors.default;

export const formatRelativeTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (60 * 1000));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
};

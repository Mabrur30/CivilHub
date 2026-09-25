import { equipmentPathsFor } from "./equipment/paths";
export type NotificationType =
  | "bid_accepted"
  | "bid_declined"
  | "equipment_booking_request"
  | "equipment_booking_approved"
  | "equipment_booking_declined"
  | "equipment_booking_auto_declined"
  | "equipment_booking_payment_received"
  | "equipment_pickup_confirmed"
  | "equipment_return_confirmed"
  | "equipment_deposit_released"
  | "equipment_deposit_claimed"
  | "connection_accepted"
  | "new_message"
  | "connection_post"
  | "post_liked"
  | "project_phase_updated"
  | "phase_plan_submitted"
  | "phase_plan_approved"
  | "phase_plan_rejected"
  | "advance_payment_received"
  | "phase_payment_received"
  | "full_payment_received"
  | "review_received"
  | "review_reply"
  | "comment_received"
  | "post_reposted"
  | "payment_refund_due";
export interface NotificationListItem {
  id: string;
  type: NotificationType;
  message: string;
  isRead: boolean;
  createdAt: string;
  projectId: string | null;
  equipmentId: string | null;
  bidId: string | null;
  equipmentBookingId: string | null;
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
  "equipment_booking_request",
  "equipment_booking_approved",
  "equipment_booking_declined",
  "equipment_booking_auto_declined",
  "equipment_booking_payment_received",
  "equipment_pickup_confirmed",
  "equipment_return_confirmed",
  "equipment_deposit_released",
  "equipment_deposit_claimed",
  "connection_accepted",
  "new_message",
  "connection_post",
  "post_liked",
  "project_phase_updated",
  "phase_plan_submitted",
  "phase_plan_approved",
  "phase_plan_rejected",
  "advance_payment_received",
  "phase_payment_received",
  "full_payment_received",
  "review_received",
  "review_reply",
  "comment_received",
  "post_reposted",
  "payment_refund_due",
];

export const isNotificationType = (value: unknown): value is NotificationType =>
  typeof value === "string" &&
  notificationTypes.includes(value as NotificationType);

export const isNullableId = (value: unknown): value is string | null =>
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
    isNullableId(item.equipmentId) &&
    isNullableId(item.bidId) &&
    isNullableId(item.equipmentBookingId) &&
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

const activityColors: Record<string, string> = {
  success: "bg-emerald-400",
  review: "bg-amber-300",
  message: "bg-sky-400",
  milestone: "bg-primary",
  bid: "bg-primary",
  default: "bg-white/50",
};

export const mapNotificationTypeToActivityType = (
  type: NotificationType,
): string => {
  if (type === "bid_accepted") return "success";
  if (type === "new_message") return "message";
  if (type === "connection_accepted") return "milestone";
  if (type === "connection_post") return "review";
  if (type === "post_liked") return "bid";
  if (
    type === "equipment_booking_request" ||
    type === "equipment_booking_approved" ||
    type === "equipment_booking_declined" ||
    type === "equipment_booking_auto_declined" ||
    type === "equipment_booking_payment_received" ||
    type === "equipment_pickup_confirmed" ||
    type === "equipment_return_confirmed" ||
    type === "equipment_deposit_released" ||
    type === "equipment_deposit_claimed" ||
    type === "project_phase_updated" ||
    type === "phase_plan_submitted" ||
    type === "phase_plan_approved" ||
    type === "phase_plan_rejected" ||
    type === "advance_payment_received" ||
    type === "phase_payment_received" ||
    type === "full_payment_received" ||
    type === "review_received" ||
    type === "review_reply" ||
    type === "comment_received" ||
    type === "post_reposted" ||
    type === "payment_refund_due"
  ) {
    return "milestone";
  }
  return "review";
};

export const getNotificationDotClassName = (type: NotificationType): string =>
  activityColors[mapNotificationTypeToActivityType(type)] ??
  activityColors.default;

export interface NotificationTargetRefs {
  type: NotificationType;
  projectId?: string | null;
  equipmentId?: string | null;
  equipmentBookingId?: string | null;
  bidId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
}

export const getNotificationTargetPath = (
  notification: NotificationTargetRefs,
  role: "client" | "engineer",
): string | null => {
  if (notification.type === "new_message" && notification.conversationId) {
    return `/messages/${notification.conversationId}`;
  }

  // Equipment notifications open the booking itself, which both the owner and
  // the renter can view, inside the reader's own dashboard (clients rent too).
  if (
    notification.type.startsWith("equipment_") ||
    (notification.type === "payment_refund_due" &&
      notification.equipmentBookingId)
  ) {
    const equipment = equipmentPathsFor(role);
    if (notification.equipmentBookingId) {
      return equipment.booking(notification.equipmentBookingId);
    }
    if (notification.equipmentId) {
      return notification.type === "equipment_booking_request" &&
        role === "engineer"
        ? equipment.mine
        : equipment.bookings;
    }
  }

  if (
    (notification.type === "bid_accepted" ||
      notification.type === "bid_declined" ||
      notification.type === "project_phase_updated" ||
      notification.type === "phase_plan_submitted" ||
      notification.type === "phase_plan_approved" ||
      notification.type === "phase_plan_rejected" ||
      notification.type === "advance_payment_received" ||
      notification.type === "phase_payment_received" ||
      notification.type === "full_payment_received" ||
      notification.type === "payment_refund_due" ||
      notification.type === "review_received" ||
      notification.type === "review_reply") &&
    notification.projectId
  ) {
    return `/dashboard/${role}/projects/${notification.projectId}`;
  }

  if (notification.type === "connection_accepted") {
    return `/dashboard/${role}/network`;
  }

  if (
    notification.type === "connection_post" ||
    notification.type === "post_liked"
  ) {
    return "/feed";
  }

  return null;
};

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

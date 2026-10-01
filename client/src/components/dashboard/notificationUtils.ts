import { equipmentPathsFor } from "./equipment/paths";
import { type UserRole } from "../../context/AuthContext";
import { dashboardBase } from "../../lib/dashboardPaths";
export type NotificationType =
  | "bid_accepted"
  | "bid_declined"
  | "bid_invitation"
  | "bid_invitation_answered"
  | "equipment_booking_request"
  | "equipment_booking_approved"
  | "equipment_booking_declined"
  | "equipment_booking_auto_declined"
  | "equipment_booking_cancelled"
  | "equipment_booking_payment_received"
  | "equipment_pickup_confirmed"
  | "equipment_return_confirmed"
  | "equipment_deposit_released"
  | "equipment_deposit_claimed"
  | "equipment_deposit_disputed"
  | "equipment_deposit_decided"
  | "equipment_deposit_reminder"
  | "connection_accepted"
  | "connection_request"
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
  | "payment_refund_due"
  | "project_completed"
  | "customer_review_received"
  /** From the CivilHub team: content removed, account reinstated. */
  | "moderation_notice"
  /** CivilHub sent a payee what they'd earned. */
  | "payout_sent"
  | "payout_account_updated"
  /** CivilHub refunded a payer. */
  | "refund_issued"
  /** Verification: approved, rejected, lapsed, or a licence about to expire. */
  | "verification_approved"
  | "verification_rejected"
  | "verification_lapsed"
  | "verification_expiring"
  /** Project disputes, ending a project early, and hand-overs left waiting. */
  | "project_dispute_opened"
  | "project_dispute_resolved"
  | "project_cancellation_proposed"
  | "project_cancellation_declined"
  | "project_cancelled"
  | "phase_approval_reminder"
  /** The next phase is waiting for the client to fund it. */
  | "phase_funding_reminder"
  /** Disputes, on a project or a rental: CivilHub wrote, a decision, an appeal. */
  | "dispute_message"
  | "dispute_reply_reminder"
  | "dispute_decided"
  | "dispute_appealed"
  | "dispute_appeal_decided"
  /** The other side added their own pickup or return photos. */
  | "equipment_condition_report";
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
  /** The post a like, comment, repost or new-post alert is about. */
  postId?: string | null;
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
  "bid_invitation",
  "bid_invitation_answered",
  "equipment_booking_request",
  "equipment_booking_approved",
  "equipment_booking_declined",
  "equipment_booking_auto_declined",
  "equipment_booking_cancelled",
  "equipment_booking_payment_received",
  "equipment_pickup_confirmed",
  "equipment_return_confirmed",
  "equipment_deposit_released",
  "equipment_deposit_claimed",
  "equipment_deposit_disputed",
  "equipment_deposit_decided",
  "equipment_deposit_reminder",
  "connection_accepted",
  "connection_request",
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
  "project_completed",
  "customer_review_received",
  "moderation_notice",
  "payout_sent",
  "payout_account_updated",
  "refund_issued",
  "verification_approved",
  "verification_rejected",
  "verification_lapsed",
  "verification_expiring",
  "project_dispute_opened",
  "project_dispute_resolved",
  "project_cancellation_proposed",
  "project_cancellation_declined",
  "project_cancelled",
  "phase_approval_reminder",
  "phase_funding_reminder",
  "dispute_message",
  "dispute_reply_reminder",
  "dispute_decided",
  "dispute_appealed",
  "dispute_appeal_decided",
  "equipment_condition_report",
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
  if (type === "bid_accepted" || type === "project_completed" || type === "verification_approved") return "success";
  if (type === "new_message") return "message";
  if (type === "connection_accepted" || type === "connection_request") return "milestone";
  if (type === "connection_post") return "review";
  if (type === "post_liked") return "bid";
  if (
    type === "equipment_booking_request" ||
    type === "equipment_booking_approved" ||
    type === "equipment_booking_declined" ||
    type === "equipment_booking_auto_declined" ||
    type === "equipment_booking_cancelled" ||
    type === "equipment_booking_payment_received" ||
    type === "equipment_pickup_confirmed" ||
    type === "equipment_return_confirmed" ||
    type === "equipment_deposit_released" ||
    type === "equipment_deposit_claimed" ||
    type === "equipment_deposit_disputed" ||
    type === "equipment_deposit_decided" ||
    type === "equipment_deposit_reminder" ||
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
  postId?: string | null;
}

export const getNotificationTargetPath = (
  notification: NotificationTargetRefs,
  role: UserRole,
): string | null => {
  if (notification.type === "new_message" && notification.conversationId) {
    return `/messages/${notification.conversationId}`;
  }

  // Equipment notifications open the booking itself, which both the owner and
  // the renter can view, inside the reader's own dashboard (clients rent too).
  if (
    notification.type.startsWith("equipment_") ||
    ((notification.type === "payment_refund_due" ||
      notification.type === "refund_issued" ||
      notification.type === "customer_review_received" ||
      notification.type.startsWith("dispute_")) &&
      notification.equipmentBookingId)
  ) {
    const equipment = equipmentPathsFor(role);
    if (notification.equipmentBookingId) {
      return equipment.booking(notification.equipmentBookingId);
    }
    if (notification.equipmentId) {
      return notification.type === "equipment_booking_request" &&
        role !== "client"
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
      notification.type === "review_reply" ||
      notification.type === "project_completed" ||
      notification.type === "customer_review_received" ||
      notification.type.startsWith("project_dispute") ||
      notification.type.startsWith("project_cancel") ||
      notification.type.startsWith("dispute_") ||
      notification.type === "phase_approval_reminder" ||
      notification.type === "phase_funding_reminder") &&
    notification.projectId
  ) {
    return `${dashboardBase(role)}/projects/${notification.projectId}`;
  }

  // Invitations are listed on the engineer's bids page; the client sees
  // the answer with that project's bids.
  if (notification.type === "bid_invitation") {
    return `${dashboardBase(role)}/bids`;
  }
  if (notification.type === "bid_invitation_answered") {
    return notification.projectId
      ? `${dashboardBase(role)}/bids?project=${notification.projectId}`
      : `${dashboardBase(role)}/bids`;
  }

  // Payouts are listed with the payout account, under Settings, and
  // verification lives there too.
  if (notification.type === "payout_sent" || notification.type === "payout_account_updated") {
    return "/settings";
  }
  if (notification.type.startsWith("verification_")) {
    return "/settings#verification";
  }

  if (
    notification.type === "connection_accepted" ||
    notification.type === "connection_request"
  ) {
    return `${dashboardBase(role)}/network`;
  }

  // Post alerts open the post itself; older ones without a post go to the feed.
  if (
    notification.type === "connection_post" ||
    notification.type === "post_liked" ||
    notification.type === "comment_received" ||
    notification.type === "post_reposted"
  ) {
    return notification.postId ? `/posts/${notification.postId}` : "/feed";
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

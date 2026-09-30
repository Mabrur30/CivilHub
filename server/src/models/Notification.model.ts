import { Document, Model, Schema, Types, model } from "mongoose";

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
  /** The renter disputed the owner's deposit claim. */
  | "equipment_deposit_disputed"
  /** A CivilHub admin decided a deposit dispute. */
  | "equipment_deposit_decided"
  /** The owner hasn't settled a deposit that will soon release itself. */
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
  /** CivilHub refunded a payer. */
  | "refund_issued"
  /** Verification: approved, rejected, lapsed, or a licence about to expire. */
  | "verification_approved"
  | "verification_rejected"
  | "verification_lapsed"
  | "verification_expiring"
  /** Project disputes and cancelling a project early. */
  | "project_dispute_opened"
  | "project_dispute_resolved"
  | "project_cancellation_proposed"
  | "project_cancellation_declined"
  | "project_cancelled"
  /** A handed-over phase has been waiting for the client's decision. */
  | "phase_approval_reminder"
  /** The next phase is waiting for the client to fund it. */
  | "phase_funding_reminder"
  /** CivilHub wrote in a dispute, or a reply it asked for is almost due. */
  | "dispute_message"
  | "dispute_reply_reminder"
  /** A dispute decision waiting out its appeal window, an appeal, and its outcome. */
  | "dispute_decided"
  | "dispute_appealed"
  | "dispute_appeal_decided"
  /** The other side added their own pickup or return photos to a rental. */
  | "equipment_condition_report";

export interface INotification extends Document {
  recipient: Types.ObjectId;
  type: NotificationType;
  message: string;
  project?: Types.ObjectId;
  equipment?: Types.ObjectId;
  bid?: Types.ObjectId;
  equipmentBooking?: Types.ObjectId;
  connection?: Types.ObjectId;
  conversation?: Types.ObjectId;
  messageRef?: Types.ObjectId;
  /** The post a like, comment, repost or new-post notification is about. */
  post?: Types.ObjectId;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
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
      ],
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    post: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      required: false,
    },
    connection: {
      type: Schema.Types.ObjectId,
      ref: "Connection",
      required: false,
    },
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: false,
    },
    messageRef: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      required: false,
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: false,
    },
    equipment: {
      type: Schema.Types.ObjectId,
      ref: "Equipment",
      required: false,
    },
    bid: {
      type: Schema.Types.ObjectId,
      ref: "Bid",
      required: false,
    },
    equipmentBooking: {
      type: Schema.Types.ObjectId,
      ref: "EquipmentBooking",
      required: false,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

notificationSchema.index({ recipient: 1, createdAt: -1 });

export const Notification: Model<INotification> = model<INotification>(
  "Notification",
  notificationSchema,
);
export default Notification;

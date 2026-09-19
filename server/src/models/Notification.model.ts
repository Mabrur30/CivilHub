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
  | "post_reposted";

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
      ],
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
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

export const Notification: Model<INotification> = model<INotification>(
  "Notification",
  notificationSchema,
);
export default Notification;

import { Document, Model, Schema, Types, model } from "mongoose";

export type NotificationType =
  | "bid_accepted"
  | "bid_declined"
  | "connection_accepted"
  | "new_message"
  | "connection_post"
  | "post_liked";

export interface INotification extends Document {
  recipient: Types.ObjectId;
  type: NotificationType;
  message: string;
  project?: Types.ObjectId;
  bid?: Types.ObjectId;
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
        "connection_accepted",
        "new_message",
        "connection_post",
        "post_liked",
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
    bid: {
      type: Schema.Types.ObjectId,
      ref: "Bid",
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

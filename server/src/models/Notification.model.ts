import { Document, Model, Schema, Types, model } from "mongoose";

export type NotificationType = "bid_accepted" | "bid_declined";

export interface INotification extends Document {
  recipient: Types.ObjectId;
  type: NotificationType;
  message: string;
  project: Types.ObjectId;
  bid: Types.ObjectId;
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
      enum: ["bid_accepted", "bid_declined"],
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    bid: {
      type: Schema.Types.ObjectId,
      ref: "Bid",
      required: true,
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

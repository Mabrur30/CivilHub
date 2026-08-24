import { Document, Model, Schema, Types, model } from "mongoose";

export type ConnectionStatus = "pending" | "accepted" | "declined";

export interface IConnection extends Document {
  requester: Types.ObjectId;
  recipient: Types.ObjectId;
  status: ConnectionStatus;
  createdAt: Date;
  updatedAt: Date;
}

const connectionSchema = new Schema<IConnection>(
  {
    requester: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      required: true,
      default: "pending",
    },
  },
  { timestamps: true },
);

connectionSchema.index({ requester: 1, recipient: 1 }, { unique: true });

export const Connection: Model<IConnection> = model<IConnection>(
  "Connection",
  connectionSchema,
);
export default Connection;

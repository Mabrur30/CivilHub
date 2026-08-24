import { Document, Model, Schema, Types, model } from "mongoose";

export type BidStatus = "pending" | "accepted" | "declined";

export interface IBid extends Document {
  engineer: Types.ObjectId;
  project: Types.ObjectId;
  amount: number;
  message: string;
  status: BidStatus;
  createdAt: Date;
  updatedAt: Date;
}

const bidSchema = new Schema<IBid>(
  {
    engineer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
      required: true,
    },
  },
  { timestamps: true },
);

bidSchema.index(
  { engineer: 1, project: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);

export const Bid: Model<IBid> = model<IBid>("Bid", bidSchema);
export default Bid;

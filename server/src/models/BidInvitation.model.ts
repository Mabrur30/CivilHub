import { Document, Model, Schema, Types, model } from "mongoose";

export type BidInvitationStatus = "pending" | "accepted" | "declined";

export interface IBidInvitation extends Document {
  project: Types.ObjectId;
  client: Types.ObjectId;
  engineer: Types.ObjectId;
  status: BidInvitationStatus;
  respondedAt?: Date;
  resultingBid?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const bidInvitationSchema = new Schema<IBidInvitation>(
  {
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    client: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    engineer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
      required: true,
      index: true,
    },
    respondedAt: {
      type: Date,
      required: false,
    },
    resultingBid: {
      type: Schema.Types.ObjectId,
      ref: "Bid",
      required: false,
    },
  },
  { timestamps: true },
);

bidInvitationSchema.index({ engineer: 1, status: 1, createdAt: -1 });
// Prevent duplicate invitations targeting the same engineer for the same project.
bidInvitationSchema.index({ project: 1, engineer: 1 }, { unique: true });

export const BidInvitation: Model<IBidInvitation> = model<IBidInvitation>(
  "BidInvitation",
  bidInvitationSchema,
);

export default BidInvitation;

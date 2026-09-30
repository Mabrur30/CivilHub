import { Document, Model, Schema, Types, model } from "mongoose";

export const ADMIN_ACTIONS = [
  "admin.login",
  "report.dismiss",
  "report.action",
  "post.remove",
  "comment.remove",
  "user.suspend",
  "user.ban",
  "user.reinstate",
  "payout.record",
  "refund.gateway",
  "refund.manual",
  "refund.check",
  "deposit.decide",
  "verification.approve",
  "verification.reject",
  "verification.revoke",
  "project.dispute_resolve",
  "review.remove",
  "review.reply_remove",
  "listing.pause",
  "listing.unpause",
  "settings.commission",
  "dispute.message",
  "project.dispute_appeal",
  "deposit.appeal",
] as const;
export type AdminActionType = (typeof ADMIN_ACTIONS)[number];

/**
 * One thing an admin did. Append-only: nothing updates or deletes these, so
 * the log shows who did what, when and why.
 */
export interface IAdminAction extends Document {
  admin: Types.ObjectId;
  action: AdminActionType;
  targetType?: "user" | "post" | "comment" | "report" | "payment" | "payout" | "refund" | "booking" | "project" | "review" | "equipment";
  targetId?: Types.ObjectId;
  /** The account the action was about, for the user's history. */
  subjectUser?: Types.ObjectId;
  reason?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const adminActionSchema = new Schema<IAdminAction>(
  {
    admin: { type: Schema.Types.ObjectId, ref: "Admin", required: true, index: true },
    action: { type: String, enum: ADMIN_ACTIONS, required: true },
    targetType: {
      type: String,
      enum: ["user", "post", "comment", "report", "payment", "payout", "refund", "booking", "project", "review", "equipment"],
    },
    targetId: { type: Schema.Types.ObjectId },
    subjectUser: { type: Schema.Types.ObjectId, ref: "User", index: true },
    reason: { type: String, trim: true, maxlength: 500 },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

adminActionSchema.index({ createdAt: -1 });

export const AdminAction: Model<IAdminAction> = model<IAdminAction>(
  "AdminAction",
  adminActionSchema,
);
export default AdminAction;

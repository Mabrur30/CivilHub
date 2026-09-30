import { Document, Model, Schema, Types, model } from "mongoose";

export const REPORT_TARGETS = ["user", "post", "comment"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_REASONS = [
  "spam",
  "harassment",
  "fake_profile",
  "scam",
  "inappropriate",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * open: waiting for an admin.
 * dismissed: an admin found nothing wrong.
 * actioned: an admin removed the content or restricted the account.
 * reviewed: from before the admin dashboard; treated like dismissed.
 */
export type ReportStatus = "open" | "dismissed" | "actioned" | "reviewed";
export const REPORT_STATUSES: ReportStatus[] = ["open", "dismissed", "actioned", "reviewed"];

/** Something a user flagged for the CivilHub team to review. */
export interface IReport extends Document {
  reporter: Types.ObjectId;
  targetType: ReportTarget;
  targetId: Types.ObjectId;
  reason: ReportReason;
  note?: string;
  status: ReportStatus;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  /** What the admin did, e.g. "Removed the post" or "Nothing against the rules". */
  resolution?: string;
  createdAt: Date;
  updatedAt: Date;
}

const reportSchema = new Schema<IReport>(
  {
    reporter: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    targetType: { type: String, enum: REPORT_TARGETS, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true, index: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    note: { type: String, trim: true, maxlength: 500 },
    status: { type: String, enum: REPORT_STATUSES, default: "open", index: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    reviewedAt: { type: Date },
    resolution: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

// One open report per person per thing; reporting again updates it.
reportSchema.index(
  { reporter: 1, targetType: 1, targetId: 1 },
  { unique: true, partialFilterExpression: { status: "open" } },
);

export const Report: Model<IReport> = model<IReport>("Report", reportSchema);
export default Report;

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
 * Something a user flagged for review. Kept for the admin dashboard (a later
 * step); until then reports are only stored.
 */
export interface IReport extends Document {
  reporter: Types.ObjectId;
  targetType: ReportTarget;
  targetId: Types.ObjectId;
  reason: ReportReason;
  note?: string;
  status: "open" | "reviewed";
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
    status: { type: String, enum: ["open", "reviewed"], default: "open", index: true },
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

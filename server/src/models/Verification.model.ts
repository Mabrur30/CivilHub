import { Document, Model, Schema, Types, model } from "mongoose";

export type VerificationKind = "engineer" | "organisation";
export type VerificationStatus = "pending" | "verified" | "rejected" | "lapsed";
export type VerificationDocumentKind = "ieb_certificate" | "trade_licence" | "nid";

/**
 * A file sent for review. Stored in Cloudinary as an "authenticated" asset,
 * so it has no public URL; only the admin API hands out short-lived links.
 */
export interface VerificationDocument {
  kind: VerificationDocumentKind;
  publicId: string;
  resourceType: "image" | "raw";
  format: string;
  originalName: string;
  uploadedAt: Date;
}

/**
 * An engineer's or company's request to be verified, and its outcome. One per
 * account; submitting again replaces the details and files. The badge itself
 * is `User.verifiedAt`, kept in step by utils/verification.ts.
 */
export interface IVerification extends Document {
  user: Types.ObjectId;
  kind: VerificationKind;
  status: VerificationStatus;
  /** IEB membership number, e.g. "M/12345" (engineers). */
  iebNumber?: string;
  /** Trade licence number as on the profile when submitted (companies). */
  tradeLicenceNo?: string;
  nameAtSubmission: string;
  documents: VerificationDocument[];
  submittedAt: Date;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  /** Why it was rejected, revoked or lapsed; shown to the user. */
  note?: string;
  licenceExpiresAt?: Date;
  expiryReminderSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<VerificationDocument>(
  {
    kind: { type: String, enum: ["ieb_certificate", "trade_licence", "nid"], required: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, enum: ["image", "raw"], required: true },
    format: { type: String, default: "" },
    originalName: { type: String, trim: true, maxlength: 200, default: "" },
    uploadedAt: { type: Date, required: true },
  },
  { _id: false },
);

const verificationSchema = new Schema<IVerification>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    kind: { type: String, enum: ["engineer", "organisation"], required: true },
    status: { type: String, enum: ["pending", "verified", "rejected", "lapsed"], required: true },
    iebNumber: { type: String, trim: true, maxlength: 20 },
    tradeLicenceNo: { type: String, trim: true, maxlength: 60 },
    nameAtSubmission: { type: String, trim: true, required: true },
    documents: { type: [documentSchema], default: [] },
    submittedAt: { type: Date, required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    reviewedAt: { type: Date },
    note: { type: String, trim: true, maxlength: 500 },
    licenceExpiresAt: { type: Date },
    expiryReminderSentAt: { type: Date },
  },
  { timestamps: true },
);

verificationSchema.index({ status: 1, submittedAt: 1 });
verificationSchema.index({ status: 1, licenceExpiresAt: 1 });

export const Verification: Model<IVerification> = model<IVerification>("Verification", verificationSchema);
export default Verification;

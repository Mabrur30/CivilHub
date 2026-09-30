import { Document, Model, Schema, Types, model } from "mongoose";
import { type EvidenceFacts, evidenceFactFields } from "../utils/evidence";

/**
 * A message in a dispute between CivilHub and one side of it. Each side has
 * its own thread, which only they and admins can read; files are private
 * uploads, opened through short-lived signed links.
 */

export type CaseType = "project" | "deposit";
export type CasePartyRole = "client" | "provider" | "renter" | "owner";

export const CASE_TEXT_LIMIT = 2000;
export const CASE_FILE_LIMIT = 5;

export interface CaseFile extends EvidenceFacts {
  publicId: string;
  resourceType: "image" | "raw";
  format: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface ICaseMessage extends Document {
  caseType: CaseType;
  /** A ProjectDispute for "project", an EquipmentBooking for "deposit". */
  caseId: Types.ObjectId;
  /** The side this thread is with. */
  party: Types.ObjectId;
  partyRole: CasePartyRole;
  from: "admin" | "party";
  admin?: Types.ObjectId | null;
  text: string;
  files: CaseFile[];
  /** An admin asked for an answer by this date. */
  replyBy?: Date | null;
  /** The party was reminded that the reply is almost due. */
  reminderSentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const caseFileSchema = new Schema<CaseFile>(
  {
    publicId: { type: String, required: true },
    resourceType: { type: String, enum: ["image", "raw"], required: true },
    format: { type: String, default: "" },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    ...evidenceFactFields,
  },
  { _id: false },
);

const caseMessageSchema = new Schema<ICaseMessage>(
  {
    caseType: { type: String, enum: ["project", "deposit"], required: true },
    caseId: { type: Schema.Types.ObjectId, required: true },
    party: { type: Schema.Types.ObjectId, ref: "User", required: true },
    partyRole: { type: String, enum: ["client", "provider", "renter", "owner"], required: true },
    from: { type: String, enum: ["admin", "party"], required: true },
    admin: { type: Schema.Types.ObjectId, ref: "Admin", default: null },
    text: { type: String, trim: true, maxlength: CASE_TEXT_LIMIT, default: "" },
    files: { type: [caseFileSchema], default: [] },
    replyBy: { type: Date, default: null },
    reminderSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

caseMessageSchema.index({ caseType: 1, caseId: 1, party: 1, createdAt: 1 });
// The reply reminder sweep looks for questions with a deadline.
caseMessageSchema.index({ replyBy: 1, reminderSentAt: 1 });

export const CaseMessage: Model<ICaseMessage> = model<ICaseMessage>("CaseMessage", caseMessageSchema);
export default CaseMessage;

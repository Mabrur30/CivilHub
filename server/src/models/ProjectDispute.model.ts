import { Document, Model, Schema, Types, model } from "mongoose";

export const PROJECT_DISPUTE_REASONS = [
  "quality",
  "delay",
  "scope",
  "payment",
  "communication",
  "no_response",
  "other",
] as const;
export type ProjectDisputeReason = (typeof PROJECT_DISPUTE_REASONS)[number];
export type ProjectDisputeStatus = "open" | "resolved" | "withdrawn";
export type ProjectDisputeOutcome = "resumed" | "phase_approved" | "cancelled";

/**
 * Where an open dispute is: an admin is reviewing it; a decision is waiting
 * out its appeal window; or one side appealed and another admin is reviewing.
 */
export type DisputeStage = "review" | "awaiting_final" | "appealed";

/** One side's appeal against a decision, and how it was decided. */
export interface DisputeAppeal {
  by: Types.ObjectId;
  role: string;
  reason: string;
  openedAt: Date;
  decision?: "upheld" | "changed" | null;
  note?: string | null;
  decidedBy?: Types.ObjectId | null;
  decidedAt?: Date | null;
}

export const disputeAppealSchema = new Schema<DisputeAppeal>(
  {
    by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, required: true },
    reason: { type: String, trim: true, maxlength: 2000, required: true },
    openedAt: { type: Date, required: true },
    decision: { type: String, enum: ["upheld", "changed"], default: null },
    note: { type: String, trim: true, maxlength: 500, default: null },
    decidedBy: { type: Schema.Types.ObjectId, ref: "Admin", default: null },
    decidedAt: { type: Date, default: null },
  },
  { _id: false },
);

export const DISPUTE_STAGES: DisputeStage[] = ["review", "awaiting_final", "appealed"];

/**
 * An admin's decision that hasn't taken effect yet: either side can appeal it
 * until `appealDeadline`, or both can accept it to end the wait.
 */
export interface ProjectDisputeDecision {
  outcome: ProjectDisputeOutcome;
  note: string;
  phase?: Types.ObjectId | null;
  providerAmount?: number | null;
  decidedBy: Types.ObjectId;
  decidedAt: Date;
  appealDeadline: Date;
  acceptedBy: Types.ObjectId[];
}

export interface ProjectDisputeResolution {
  outcome: ProjectDisputeOutcome;
  note: string;
  phase?: Types.ObjectId;
  providerAmount?: number;
  refundAmount?: number;
  decidedBy: Types.ObjectId;
  decidedAt: Date;
  /** When it took effect: after the appeal window, on both sides' acceptance, or on appeal. */
  finalAt?: Date;
}

/**
 * A client or provider asking CivilHub to step into a project. While one is
 * open the project is paused (Project.disputeOpen); an admin resumes it,
 * approves a waiting phase, or cancels it and splits the money CivilHub holds.
 */
export interface IProjectDispute extends Document {
  project: Types.ObjectId;
  client: Types.ObjectId;
  provider: Types.ObjectId;
  openedBy: Types.ObjectId;
  openedByRole: "client" | "provider";
  reason: ProjectDisputeReason;
  description: string;
  status: ProjectDisputeStatus;
  /** While open: under review, a decision waiting to take effect, or appealed. */
  stage: DisputeStage;
  decision?: ProjectDisputeDecision | null;
  appeal?: DisputeAppeal | null;
  withdrawnAt?: Date;
  resolution?: ProjectDisputeResolution | null;
  createdAt: Date;
  updatedAt: Date;
}

const resolutionSchema = new Schema<ProjectDisputeResolution>(
  {
    outcome: { type: String, enum: ["resumed", "phase_approved", "cancelled"], required: true },
    note: { type: String, trim: true, maxlength: 500, required: true },
    phase: { type: Schema.Types.ObjectId, ref: "ProjectPhase" },
    providerAmount: { type: Number, min: 0 },
    refundAmount: { type: Number, min: 0 },
    decidedBy: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
    decidedAt: { type: Date, required: true },
    finalAt: { type: Date },
  },
  { _id: false },
);

const decisionSchema = new Schema<ProjectDisputeDecision>(
  {
    outcome: { type: String, enum: ["resumed", "phase_approved", "cancelled"], required: true },
    note: { type: String, trim: true, maxlength: 500, required: true },
    phase: { type: Schema.Types.ObjectId, ref: "ProjectPhase", default: null },
    providerAmount: { type: Number, min: 0, default: null },
    decidedBy: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
    decidedAt: { type: Date, required: true },
    appealDeadline: { type: Date, required: true },
    acceptedBy: { type: [Schema.Types.ObjectId], default: [] },
  },
  { _id: false },
);

const projectDisputeSchema = new Schema<IProjectDispute>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    client: { type: Schema.Types.ObjectId, ref: "User", required: true },
    provider: { type: Schema.Types.ObjectId, ref: "User", required: true },
    openedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    openedByRole: { type: String, enum: ["client", "provider"], required: true },
    reason: { type: String, enum: PROJECT_DISPUTE_REASONS, required: true },
    description: { type: String, trim: true, minlength: 20, maxlength: 2000, required: true },
    status: { type: String, enum: ["open", "resolved", "withdrawn"], default: "open", required: true },
    stage: { type: String, enum: ["review", "awaiting_final", "appealed"], default: "review", required: true },
    decision: { type: decisionSchema, default: null },
    appeal: { type: disputeAppealSchema, default: null },
    withdrawnAt: { type: Date },
    resolution: { type: resolutionSchema, default: null },
  },
  { timestamps: true },
);

projectDisputeSchema.index({ status: 1, createdAt: 1 });
// The sweep finds decisions whose appeal window has passed.
projectDisputeSchema.index({ stage: 1, "decision.appealDeadline": 1 });
// One open dispute per project at a time.
projectDisputeSchema.index(
  { project: 1 },
  { unique: true, partialFilterExpression: { status: "open" }, name: "one_open_dispute_per_project" },
);
projectDisputeSchema.index({ project: 1, createdAt: -1 });

export const ProjectDispute: Model<IProjectDispute> = model<IProjectDispute>("ProjectDispute", projectDisputeSchema);
export default ProjectDispute;

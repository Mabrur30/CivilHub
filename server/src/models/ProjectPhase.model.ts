import { Document, Model, Schema, Types, model } from "mongoose";

export type ProjectPhaseStatus =
  | "not_started"
  | "in_progress"
  | "awaiting_approval"
  | "completed"
  | "delayed";

export type PaymentStatus = "unpaid" | "paid";

/** The client's note when they send a submitted phase back for more work. */
export interface PhaseChangeRequest {
  note: string;
  requestedAt: Date;
}

export interface IProjectPhase extends Document {
  project: Types.ObjectId;
  name: string;
  description?: string;
  order: number;
  status: ProjectPhaseStatus;
  dueDate?: Date;
  completedAt?: Date;
  price: number;
  paymentStatus: PaymentStatus;
  paidAt?: Date;
  changeRequest?: PhaseChangeRequest | null;
  updatedAt: Date;
  createdAt: Date;
}

const projectPhaseSchema = new Schema<IProjectPhase>(
  {
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    order: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: [
        "not_started",
        "in_progress",
        "awaiting_approval",
        "completed",
        "delayed",
      ],
      required: true,
      default: "not_started",
      index: true,
    },
    dueDate: {
      type: Date,
      required: false,
    },
    completedAt: {
      type: Date,
      required: false,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid"],
      default: "unpaid",
      required: true,
    },
    paidAt: {
      type: Date,
      required: false,
    },
    changeRequest: {
      type: new Schema<PhaseChangeRequest>(
        {
          note: { type: String, required: true, trim: true, maxlength: 500 },
          requestedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
);

projectPhaseSchema.index({ project: 1, order: 1 }, { unique: true });
projectPhaseSchema.index({ project: 1, completedAt: -1 });

export const ProjectPhase: Model<IProjectPhase> = model<IProjectPhase>(
  "ProjectPhase",
  projectPhaseSchema,
);

export default ProjectPhase;

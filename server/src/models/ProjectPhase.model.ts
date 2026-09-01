import { Document, Model, Schema, Types, model } from "mongoose";

export type ProjectPhaseStatus =
  | "not_started"
  | "in_progress"
  | "awaiting_approval"
  | "completed"
  | "delayed";

export type PaymentStatus = "unpaid" | "paid";

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
  },
  { timestamps: true },
);

projectPhaseSchema.index({ project: 1, order: 1 }, { unique: true });

export const ProjectPhase: Model<IProjectPhase> = model<IProjectPhase>(
  "ProjectPhase",
  projectPhaseSchema,
);

export default ProjectPhase;

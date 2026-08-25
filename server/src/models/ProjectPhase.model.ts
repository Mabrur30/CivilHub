import { Document, Model, Schema, Types, model } from "mongoose";

export type ProjectPhaseStatus =
  | "not_started"
  | "in_progress"
  | "awaiting_approval"
  | "completed"
  | "delayed";

export interface IProjectPhase extends Document {
  project: Types.ObjectId;
  name: string;
  order: number;
  status: ProjectPhaseStatus;
  dueDate?: Date;
  completedAt?: Date;
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
  },
  { timestamps: true },
);

projectPhaseSchema.index({ project: 1, order: 1 }, { unique: true });

export const ProjectPhase: Model<IProjectPhase> = model<IProjectPhase>(
  "ProjectPhase",
  projectPhaseSchema,
);

export default ProjectPhase;

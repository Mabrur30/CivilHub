import { Document, Model, Schema, Types, model } from "mongoose";

export interface IProject extends Document {
  name: string;
  clientName: string;
  assignedEngineer?: Types.ObjectId;
  status: "active" | "in-progress" | "completed" | "open_for_bids";
  description?: string;
  budgetRange?: string;
  location?: string;
  postedDate?: Date;
  category?: string;
  currentPhaseName: string;
  progressPercentage: number;
  nextMilestone: string;
  nextMilestoneDueDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema<IProject>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    clientName: {
      type: String,
      required: true,
      trim: true,
    },
    assignedEngineer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "in-progress", "completed", "open_for_bids"],
      required: true,
      default: "active",
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    budgetRange: {
      type: String,
      trim: true,
    },
    location: {
      type: String,
      trim: true,
    },
    postedDate: {
      type: Date,
      default: Date.now,
    },
    category: {
      type: String,
      trim: true,
    },
    currentPhaseName: {
      type: String,
      required: true,
      trim: true,
    },
    progressPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    nextMilestone: {
      type: String,
      required: true,
      trim: true,
    },
    nextMilestoneDueDate: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

export const Project: Model<IProject> = model<IProject>(
  "Project",
  projectSchema,
);
export default Project;

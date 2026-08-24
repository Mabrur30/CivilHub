import { Document, Model, Schema, Types, model } from "mongoose";

export interface IProject extends Document {
  title?: string;
  name?: string;
  description?: string;
  category?: string;
  budgetMin?: number;
  budgetMax?: number;
  budgetRange?: string;
  location?: string;
  targetStartDate?: Date;
  targetCompletionDate?: Date;
  client?: Types.ObjectId;
  clientName?: string;
  assignedEngineer?: Types.ObjectId | null;
  status:
    | "active"
    | "in-progress"
    | "completed"
    | "open_for_bids"
    | "cancelled";
  postedDate?: Date;
  currentPhaseName?: string;
  progressPercentage?: number;
  nextMilestone?: string;
  nextMilestoneDueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema<IProject>(
  {
    title: {
      type: String,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
    client: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    clientName: {
      type: String,
      trim: true,
    },
    assignedEngineer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "active",
        "in-progress",
        "completed",
        "open_for_bids",
        "cancelled",
      ],
      required: true,
      default: "open_for_bids",
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    budgetMin: {
      type: Number,
      min: 0,
    },
    budgetMax: {
      type: Number,
      min: 0,
    },
    budgetRange: {
      type: String,
      trim: true,
    },
    location: {
      type: String,
      trim: true,
    },
    targetStartDate: {
      type: Date,
    },
    targetCompletionDate: {
      type: Date,
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
      trim: true,
    },
    progressPercentage: {
      type: Number,
      min: 0,
      max: 100,
    },
    nextMilestone: {
      type: String,
      trim: true,
    },
    nextMilestoneDueDate: {
      type: Date,
    },
  },
  { timestamps: true },
);

export const Project: Model<IProject> = model<IProject>(
  "Project",
  projectSchema,
);
export default Project;

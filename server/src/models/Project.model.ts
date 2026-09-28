import { Document, Model, Schema, Types, model } from "mongoose";
import {
  PROJECT_SERVICES,
  type ProjectRequirements,
} from "../utils/projectCriteria";
import { SITE_OPTIONS, type GeoPoint, type ProjectSite } from "../utils/projectSite";

export type PhasePlanStatus =
  | "not_created"
  | "draft"
  | "pending_client_approval"
  | "approved";
export type PaymentPlan = "phase_by_phase" | "full_upfront";

/** Why the client sent the phase plan back, kept so the engineer sees it while revising. */
export interface PhasePlanFeedback {
  note: string;
  rejectedAt: Date;
}

export interface IProject extends Document {
  title?: string;
  name?: string;
  description?: string;
  category?: string;
  budgetMin?: number;
  budgetMax?: number;
  budgetRange?: string;
  location?: string;
  /** Where the site is and how to reach it; null on briefs posted before pins. */
  site?: ProjectSite | null;
  /** The answers the project's category asks for, checked by projectCriteria. */
  requirements?: ProjectRequirements | null;
  servicesNeeded: string[];
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
  phasePlanStatus: PhasePlanStatus;
  phasePlanFeedback?: PhasePlanFeedback | null;
  totalAgreedValue?: number;
  paymentPlan?: PaymentPlan | null;
  advanceRequiredAmount?: number | null;
  advancePaid: boolean;
  advancePaidAt?: Date;
  fullPaymentPaid: boolean;
  fullPaymentPaidAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const pointSchema = new Schema<GeoPoint>(
  {
    type: { type: String, enum: ["Point"], required: true },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

const siteSchema = new Schema<ProjectSite>(
  {
    division: { type: String, required: true, trim: true },
    district: { type: String, required: true, trim: true },
    area: { type: String, required: true, trim: true, maxlength: 120 },
    point: { type: pointSchema, required: true },
    approxPoint: { type: pointSchema, required: true },
    addressLine: { type: String, trim: true, maxlength: 200 },
    directions: { type: String, trim: true, maxlength: 500 },
    vehicleAccess: {
      type: String,
      enum: SITE_OPTIONS.vehicleAccess.map((option) => option.value),
    },
    utilities: {
      type: [String],
      enum: SITE_OPTIONS.utilities.map((option) => option.value),
      default: [],
    },
    documentsAvailable: {
      type: [String],
      enum: SITE_OPTIONS.documentsAvailable.map((option) => option.value),
      default: [],
    },
  },
  { _id: false },
);

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
    site: {
      type: siteSchema,
      default: null,
    },
    requirements: {
      type: Schema.Types.Mixed,
      default: null,
    },
    servicesNeeded: {
      type: [String],
      enum: PROJECT_SERVICES.map((service) => service.value),
      default: [],
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
      index: true,
    },
    phasePlanStatus: {
      type: String,
      enum: ["not_created", "draft", "pending_client_approval", "approved"],
      default: "not_created",
      required: true,
    },
    phasePlanFeedback: {
      type: new Schema<PhasePlanFeedback>(
        {
          note: { type: String, required: true, trim: true, maxlength: 1000 },
          rejectedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    totalAgreedValue: {
      type: Number,
      min: 0,
    },
    paymentPlan: {
      type: String,
      enum: ["phase_by_phase", "full_upfront"],
      default: null,
    },
    advanceRequiredAmount: {
      type: Number,
      default: null,
      min: 0,
    },
    advancePaid: {
      type: Boolean,
      default: false,
    },
    advancePaidAt: {
      type: Date,
    },
    fullPaymentPaid: {
      type: Boolean,
      default: false,
    },
    fullPaymentPaidAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

// Lets the marketplace find briefs near an engineer later without exposing pins.
projectSchema.index({ "site.approxPoint": "2dsphere" });

export const Project: Model<IProject> = model<IProject>(
  "Project",
  projectSchema,
);
export default Project;

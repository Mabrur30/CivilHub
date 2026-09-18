import { Document, Model, Schema, Types, model } from "mongoose";

export interface ICostEstimate extends Document {
  user?: Types.ObjectId;
  title: string;
  inputs: {
    city: string;
    location?: string;
    floorArea: number;
    floors: number;
    totalBuiltArea: number;
    bedrooms: number;
    bathrooms: number;
    qualityTier: "standard" | "premium" | "luxury";
    constructionType:
      | "residential_apartment"
      | "independent_house"
      | "duplex"
      | "commercial_space";
  };
  matchedLocation?: string;
  dataConfidence?: string;
  rates: {
    constructionRatePerSqFtBDT: number;
    marketRatePerSqFtBDT: number;
    cityMedianRateBDT: number;
  };
  constructionEstimate: {
    totalCostBDT: number;
    minCostBDT: number;
    maxCostBDT: number;
    tierName: string;
    tierTagline?: string;
    buildingTypeName: string;
  };
  marketValuation: {
    totalValuationBDT: number;
    minValuationBDT: number;
    maxValuationBDT: number;
  };
  breakdown: Array<{
    key: string;
    title: string;
    percentage: number;
    amountBDT: number;
    description: string;
  }>;
  materials: Array<{
    name: string;
    quantity: number;
    unit: string;
    approxUnitRateBDT: number;
    approxSubtotalBDT: number;
    specification: string;
  }>;
  timeline: {
    estimatedMonths: number;
    phases: Array<{
      phase: string;
      durationWeeks: number;
      activities: string;
    }>;
  };
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const costEstimateSchema = new Schema<ICostEstimate>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    inputs: {
      city: { type: String, required: true },
      location: { type: String, default: "" },
      floorArea: { type: Number, required: true },
      floors: { type: Number, default: 1 },
      totalBuiltArea: { type: Number, required: true },
      bedrooms: { type: Number, default: 3 },
      bathrooms: { type: Number, default: 3 },
      qualityTier: {
        type: String,
        enum: ["standard", "premium", "luxury"],
        default: "standard",
      },
      constructionType: {
        type: String,
        enum: [
          "residential_apartment",
          "independent_house",
          "duplex",
          "commercial_space",
        ],
        default: "residential_apartment",
      },
    },
    matchedLocation: { type: String },
    dataConfidence: { type: String },
    rates: {
      constructionRatePerSqFtBDT: { type: Number, required: true },
      marketRatePerSqFtBDT: { type: Number, required: true },
      cityMedianRateBDT: { type: Number, required: true },
    },
    constructionEstimate: {
      totalCostBDT: { type: Number, required: true },
      minCostBDT: { type: Number, required: true },
      maxCostBDT: { type: Number, required: true },
      tierName: { type: String, required: true },
      tierTagline: { type: String },
      buildingTypeName: { type: String, required: true },
    },
    marketValuation: {
      totalValuationBDT: { type: Number, required: true },
      minValuationBDT: { type: Number, required: true },
      maxValuationBDT: { type: Number, required: true },
    },
    breakdown: [
      {
        key: { type: String },
        title: { type: String },
        percentage: { type: Number },
        amountBDT: { type: Number },
        description: { type: String },
      },
    ],
    materials: [
      {
        name: { type: String },
        quantity: { type: Number },
        unit: { type: String },
        approxUnitRateBDT: { type: Number },
        approxSubtotalBDT: { type: Number },
        specification: { type: String },
      },
    ],
    timeline: {
      estimatedMonths: { type: Number },
      phases: [
        {
          phase: { type: String },
          durationWeeks: { type: Number },
          activities: { type: String },
        },
      ],
    },
    notes: { type: String },
  },
  {
    timestamps: true,
  },
);

const CostEstimate: Model<ICostEstimate> = model<ICostEstimate>(
  "CostEstimate",
  costEstimateSchema,
);

export default CostEstimate;

import { Document, Model, Schema, Types, model } from "mongoose";

export interface DeveloperPortfolioItem {
  _id: Types.ObjectId;
  title: string;
  description: string;
  imageUrl: string;
  uploadedAt: Date;
}

export interface IDeveloper extends Document {
  user: Types.ObjectId;
  bio?: string;
  location?: string;
  disciplines: string[];
  portfolio: Types.DocumentArray<DeveloperPortfolioItem>;
  createdAt: Date;
  updatedAt: Date;
}

const portfolioItemSchema = new Schema<DeveloperPortfolioItem>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    imageUrl: { type: String, required: true },
    uploadedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: true },
);

const developerSchema = new Schema<IDeveloper>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    bio: { type: String, trim: true, maxlength: 500 },
    location: { type: String, trim: true, maxlength: 160 },
    disciplines: { type: [String], default: [] },
    portfolio: { type: [portfolioItemSchema], default: [] },
  },
  { timestamps: true },
);

export const Developer: Model<IDeveloper> = model<IDeveloper>(
  "Developer",
  developerSchema,
);
export default Developer;

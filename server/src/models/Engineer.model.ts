import { Document, Model, Schema, Types, model } from "mongoose";

interface StoredFile {
  fileUrl: string;
  publicId: string;
  resourceType: "image" | "raw";
}

export interface EngineerCertificate extends StoredFile {
  _id: Types.ObjectId;
  title: string;
  uploadedAt: Date;
}

export interface EngineerPortfolioItem extends StoredFile {
  _id: Types.ObjectId;
  title: string;
  description: string;
  imageUrl: string;
  uploadedAt: Date;
}

export interface EngineerProfilePhoto extends StoredFile {
  url: string;
}

export interface EngineerEducationEntry {
  _id: Types.ObjectId;
  institution?: string;
  degree?: string;
  fieldOfStudy?: string;
  graduationYear?: number;
}

export interface EngineerExperienceEntry {
  _id: Types.ObjectId;
  title?: string;
  organization?: string;
  startYear?: number;
  endYear?: number | null;
  description?: string;
}

export interface IEngineer extends Document {
  user: Types.ObjectId;
  bio?: string;
  startingRateMin?: number;
  startingRateMax?: number;
  location?: string;
  education: Types.DocumentArray<EngineerEducationEntry>;
  experience: Types.DocumentArray<EngineerExperienceEntry>;
  profilePhoto?: EngineerProfilePhoto;
  certificates: Types.DocumentArray<EngineerCertificate>;
  portfolio: Types.DocumentArray<EngineerPortfolioItem>;
  createdAt: Date;
  updatedAt: Date;
}

const storedFileFields = {
  fileUrl: { type: String, required: true },
  publicId: { type: String, required: true },
  resourceType: { type: String, enum: ["image", "raw"], required: true },
};

const engineerProfilePhotoSchema = new Schema<EngineerProfilePhoto>(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    fileUrl: { type: String, required: true },
    resourceType: { type: String, enum: ["image", "raw"], required: true },
  },
  { _id: false },
);

const engineerEducationSchema = new Schema<EngineerEducationEntry>(
  {
    institution: { type: String, trim: true, maxlength: 160 },
    degree: { type: String, trim: true, maxlength: 120 },
    fieldOfStudy: { type: String, trim: true, maxlength: 120 },
    graduationYear: { type: Number, min: 1900, max: 2100 },
  },
  { _id: true },
);

const engineerExperienceSchema = new Schema<EngineerExperienceEntry>(
  {
    title: { type: String, trim: true, maxlength: 160 },
    organization: { type: String, trim: true, maxlength: 160 },
    startYear: { type: Number, min: 1900, max: 2100 },
    endYear: { type: Number, min: 1900, max: 2100, default: null },
    description: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: true },
);

const engineerSchema = new Schema<IEngineer>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    startingRateMin: {
      type: Number,
      min: 0,
    },
    startingRateMax: {
      type: Number,
      min: 0,
    },
    location: {
      type: String,
      trim: true,
      maxlength: 160,
    },
    education: {
      type: [engineerEducationSchema],
      default: [],
    },
    experience: {
      type: [engineerExperienceSchema],
      default: [],
    },
    profilePhoto: {
      type: engineerProfilePhotoSchema,
      default: undefined,
    },
    certificates: [
      {
        ...storedFileFields,
        title: { type: String, required: true, trim: true },
        uploadedAt: { type: Date, required: true, default: Date.now },
      },
    ],
    portfolio: [
      {
        ...storedFileFields,
        title: { type: String, required: true, trim: true },
        description: { type: String, required: true, trim: true },
        imageUrl: { type: String, required: true },
        uploadedAt: { type: Date, required: true, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

export const Engineer: Model<IEngineer> = model<IEngineer>(
  "Engineer",
  engineerSchema,
);
export default Engineer;

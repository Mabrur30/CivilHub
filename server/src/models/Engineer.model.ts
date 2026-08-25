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

export interface IEngineer extends Document {
  user: Types.ObjectId;
  bio?: string;
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
    profilePhoto: {
      url: { type: String, required: true },
      publicId: { type: String, required: true },
      fileUrl: { type: String, required: true },
      resourceType: { type: String, enum: ["image", "raw"], required: true },
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

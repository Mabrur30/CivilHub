import { Document, Model, Schema, Types, model } from "mongoose";

export const CLIENT_TYPES = [
  "individual",
  "business",
  "developer",
  "institution",
] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

export interface ClientProfilePhoto {
  url: string;
  fileUrl: string;
  publicId: string;
  resourceType: "image" | "raw";
}

export interface IClient extends Document {
  user: Types.ObjectId;
  phone?: string;
  companyName?: string;
  bio?: string;
  clientType?: ClientType;
  location?: string;
  profilePhoto?: ClientProfilePhoto;
  createdAt: Date;
  updatedAt: Date;
}

const clientProfilePhotoSchema = new Schema<ClientProfilePhoto>(
  {
    url: { type: String, required: true },
    fileUrl: { type: String, required: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, enum: ["image", "raw"], required: true },
  },
  { _id: false },
);

const clientSchema = new Schema<IClient>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    companyName: {
      type: String,
      trim: true,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    clientType: {
      type: String,
      enum: CLIENT_TYPES,
    },
    location: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    profilePhoto: {
      type: clientProfilePhotoSchema,
      required: false,
    },
  },
  { timestamps: true },
);

export const Client: Model<IClient> = model<IClient>("Client", clientSchema);
export default Client;

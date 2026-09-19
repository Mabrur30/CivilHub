import { Document, Model, Schema, Types, model } from "mongoose";

export const EQUIPMENT_CATEGORIES = [
  "Excavator",
  "Crane",
  "Generator",
  "Scaffolding",
  "Concrete Mixer",
  "Bulldozer",
  "Compactor",
  "Loader",
  "Other",
] as const;

export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];
export type EquipmentStatus = "active" | "paused";

export interface EquipmentPhoto {
  url: string;
  publicId: string;
}

export interface IEquipment extends Document {
  owner: Types.ObjectId;
  title: string;
  description: string;
  category: EquipmentCategory;
  dailyRate: number;
  securityDeposit: number;
  location: string;
  photos: EquipmentPhoto[];
  status: EquipmentStatus;
  createdAt: Date;
  updatedAt: Date;
}

const equipmentPhotoSchema = new Schema<EquipmentPhoto>(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false },
);

const equipmentSchema = new Schema<IEquipment>(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    category: {
      type: String,
      enum: EQUIPMENT_CATEGORIES,
      required: true,
    },
    dailyRate: {
      type: Number,
      required: true,
      min: 0,
    },
    securityDeposit: {
      type: Number,
      required: true,
      min: 0,
    },
    location: {
      type: String,
      required: true,
      trim: true,
    },
    photos: {
      type: [equipmentPhotoSchema],
      required: true,
      validate: {
        validator: (photos: EquipmentPhoto[]) =>
          Array.isArray(photos) && photos.length > 0,
        message: "At least one photo is required",
      },
    },
    status: {
      type: String,
      enum: ["active", "paused"],
      default: "active",
      required: true,
    },
  },
  { timestamps: true },
);

equipmentSchema.index({ category: 1, status: 1, createdAt: -1 });
equipmentSchema.index({ title: "text", description: "text", location: "text" });

export const Equipment: Model<IEquipment> = model<IEquipment>(
  "Equipment",
  equipmentSchema,
);

export default Equipment;

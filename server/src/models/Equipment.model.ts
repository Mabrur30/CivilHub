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
/** none: bare machine. included: operator is part of the daily rate. optional: renter may add one at operatorDailyRate. */
export type EquipmentOperatorOption = "none" | "included" | "optional";
/** Who moves the machine: the renter collects it, the owner delivers it for a flat fee, or either. */
export type EquipmentTransportOption = "pickup" | "delivery" | "both";

export const EQUIPMENT_MAX_UNITS = 50;

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
  weeklyRate: number | null;
  monthlyRate: number | null;
  minRentalDays: number;
  /** Security deposit per unit. */
  securityDeposit: number;
  /** Identical units the owner can rent out at the same time. */
  quantity: number;
  operator: EquipmentOperatorOption;
  operatorDailyRate: number | null;
  transport: EquipmentTransportOption;
  /** Flat fee covering drop-off and collection. */
  deliveryFee: number | null;
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
    weeklyRate: { type: Number, min: 0, default: null },
    monthlyRate: { type: Number, min: 0, default: null },
    minRentalDays: { type: Number, min: 1, default: 1 },
    securityDeposit: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: { type: Number, min: 1, max: EQUIPMENT_MAX_UNITS, default: 1 },
    operator: {
      type: String,
      enum: ["none", "included", "optional"],
      default: "none",
    },
    operatorDailyRate: { type: Number, min: 0, default: null },
    transport: {
      type: String,
      enum: ["pickup", "delivery", "both"],
      default: "pickup",
    },
    deliveryFee: { type: Number, min: 0, default: null },
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

import { Document, Model, Schema, Types, model } from "mongoose";

/**
 * Platform-wide settings an admin can change, as a single document. Every
 * change is also written to the admin action log with the old and new values.
 */
export interface IPlatformSetting extends Document {
  key: "platform";
  /** Share of each payment (excluding held deposits) CivilHub keeps, 0 to 0.5. */
  commissionRate?: number;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const platformSettingSchema = new Schema<IPlatformSetting>(
  {
    key: { type: String, enum: ["platform"], required: true, unique: true, default: "platform" },
    commissionRate: { type: Number, min: 0, max: 0.5 },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

export const PlatformSetting: Model<IPlatformSetting> = model<IPlatformSetting>("PlatformSetting", platformSettingSchema);
export default PlatformSetting;

import { Document, Model, Schema, model } from "mongoose";

/**
 * A CivilHub staff account. Kept apart from User on purpose: admins can't be
 * created through signup, never appear in search or on profiles, and can only
 * reach /api/admin. Accounts are made with `npm run admin:create`.
 */
export interface IAdmin extends Document {
  name: string;
  email: string;
  passwordHash: string;
  /** Turned off with `admin:create --disable`; a disabled admin can't sign in. */
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const adminSchema = new Schema<IAdmin>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

adminSchema.index({ email: 1 }, { unique: true });

export const Admin: Model<IAdmin> = model<IAdmin>("Admin", adminSchema);
export default Admin;

import { Document, Model, Schema, model } from "mongoose";

/** Clients hire; engineers and organisations (companies) provide services. */
export type UserRole = "client" | "engineer" | "organisation";

/**
 * Set by an admin. Suspended and banned accounts can't sign in or use the
 * API, and are hidden from search, suggestions, feeds and profiles.
 */
export type AccountStatus = "active" | "suspended" | "banned";
export const ACCOUNT_STATUSES: AccountStatus[] = ["active", "suspended", "banned"];

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  /** Missing on accounts made before statuses existed; treat that as active. */
  status?: AccountStatus;
  /** When a suspension ends by itself. Not set for bans. */
  suspendedUntil?: Date | null;
  /** The admin's reason, shown to the person when they try to sign in. */
  statusReason?: string | null;
  /** Set while CivilHub has verified this engineer or company: the badge. */
  verifiedAt?: Date | null;
  /**
   * Goes up when the password changes; session tokens carry the version they
   * were issued at, so older sessions stop working. Missing means 0.
   */
  sessionVersion?: number;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ["client", "engineer", "organisation"],
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: ACCOUNT_STATUSES,
      default: "active",
      index: true,
    },
    suspendedUntil: { type: Date, default: null },
    statusReason: { type: String, trim: true, maxlength: 500, default: null },
    verifiedAt: { type: Date, default: null },
    sessionVersion: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

userSchema.index({ email: 1 }, { unique: true });

export const User: Model<IUser> = model<IUser>("User", userSchema);
export default User;

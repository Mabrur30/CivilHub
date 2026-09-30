import { Document, Model, Schema, Types, model } from "mongoose";

export const PAYOUT_METHODS = ["bkash", "nagad", "rocket", "bank"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

/**
 * Where an engineer or company wants CivilHub to send what they've earned.
 * An admin sends payouts by hand to this account, so it's shown to admins
 * only, never on a profile.
 */
export interface IPayoutAccount extends Document {
  user: Types.ObjectId;
  method: PayoutMethod;
  /** The name on the wallet or bank account. */
  accountName: string;
  /** Wallet phone number, or bank account number. */
  accountNumber: string;
  bankName?: string;
  branch?: string;
  routingNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

const payoutAccountSchema = new Schema<IPayoutAccount>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    method: { type: String, enum: PAYOUT_METHODS, required: true },
    accountName: { type: String, required: true, trim: true, maxlength: 120 },
    accountNumber: { type: String, required: true, trim: true, maxlength: 40 },
    bankName: { type: String, trim: true, maxlength: 120 },
    branch: { type: String, trim: true, maxlength: 120 },
    routingNumber: { type: String, trim: true, maxlength: 20 },
  },
  { timestamps: true },
);

payoutAccountSchema.index({ user: 1 }, { unique: true });

export const PayoutAccount: Model<IPayoutAccount> = model<IPayoutAccount>(
  "PayoutAccount",
  payoutAccountSchema,
);
export default PayoutAccount;

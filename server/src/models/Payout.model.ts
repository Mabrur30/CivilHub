import { Document, Model, Schema, Types, model } from "mongoose";
import { PAYOUT_METHODS, type PayoutMethod } from "./PayoutAccount.model";

/**
 * Money CivilHub sent a payee. An admin sends it from CivilHub's own account
 * (bKash, bank and so on) and records it here. The account details are
 * copied at the time, so a later change to the payee's account doesn't
 * rewrite history.
 */
export interface IPayout extends Document {
  payee: Types.ObjectId;
  amount: number;
  account: {
    method: PayoutMethod;
    accountName: string;
    accountNumber: string;
    bankName?: string;
    branch?: string;
  };
  /** The transaction id from bKash, the bank, etc. */
  reference: string;
  note?: string;
  admin: Types.ObjectId;
  paidAt: Date;
  createdAt: Date;
}

const payoutSchema = new Schema<IPayout>(
  {
    payee: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    account: {
      method: { type: String, enum: PAYOUT_METHODS, required: true },
      accountName: { type: String, required: true },
      accountNumber: { type: String, required: true },
      bankName: { type: String },
      branch: { type: String },
    },
    reference: { type: String, required: true, trim: true, maxlength: 120 },
    note: { type: String, trim: true, maxlength: 500 },
    admin: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
    paidAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const Payout: Model<IPayout> = model<IPayout>("Payout", payoutSchema);
export default Payout;

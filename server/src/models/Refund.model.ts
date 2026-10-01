import { Document, Model, Schema, Types, model } from "mongoose";

/**
 * overpayment: a payment arrived for something already paid or withdrawn
 *   (Payment.refundDue); the whole amount goes back.
 * deposit: a rental's security deposit, less anything the owner claimed.
 * cancellation: a cancelled project's held money, less the provider's share.
 */
export type RefundKind = "overpayment" | "deposit" | "cancellation";

/**
 * sslcommerz: CivilHub asked the gateway to return it to the card or wallet
 *   it came from. manual: an admin sent it and recorded the reference.
 */
export type RefundMethod = "sslcommerz" | "manual";

/** processing: the gateway accepted it but hasn't finished. failed: the gateway refused. */
export type RefundStatus = "processing" | "completed" | "failed";

export interface IRefund extends Document {
  payment: Types.ObjectId;
  payer: Types.ObjectId;
  kind: RefundKind;
  equipmentBooking?: Types.ObjectId;
  amount: number;
  method: RefundMethod;
  status: RefundStatus;
  /** The gateway's id for the refund, used to check on it. */
  gatewayRefundId?: string;
  /** The transaction id of a manual refund. */
  reference?: string;
  failureReason?: string;
  /**
   * "kind:paymentId" while the refund is processing or completed; removed if
   * it fails. Unique, so the same money can't be refunded twice at once.
   */
  openKey?: string;
  admin: Types.ObjectId;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const refundSchema = new Schema<IRefund>(
  {
    payment: { type: Schema.Types.ObjectId, ref: "Payment", required: true, index: true },
    payer: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["overpayment", "deposit", "cancellation"], required: true },
    equipmentBooking: { type: Schema.Types.ObjectId, ref: "EquipmentBooking" },
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, enum: ["sslcommerz", "manual"], required: true },
    status: { type: String, enum: ["processing", "completed", "failed"], required: true, index: true },
    gatewayRefundId: { type: String },
    reference: { type: String, trim: true, maxlength: 120 },
    failureReason: { type: String, trim: true, maxlength: 500 },
    openKey: { type: String, unique: true, sparse: true },
    admin: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

export const Refund: Model<IRefund> = model<IRefund>("Refund", refundSchema);
export default Refund;

import { Document, Model, Schema, Types, model } from "mongoose";

export type PaymentType =
  | "advance"
  | "phase"
  | "full_remaining"
  | "equipment_booking";
export type PaymentMethod = "mock" | "stripe" | "sslcommerz";

/**
 * initiated: the customer was sent to the gateway and we're waiting to hear.
 * paid: the gateway confirmed it (older mock payments were backfilled as paid).
 * failed / cancelled: the gateway said no, or the customer backed out.
 * expired: nothing came back within the checkout window.
 */
export type PaymentStatus =
  | "initiated"
  | "paid"
  | "failed"
  | "cancelled"
  | "expired";

export const PAYMENT_STATUSES: PaymentStatus[] = [
  "initiated",
  "paid",
  "failed",
  "cancelled",
  "expired",
];

export interface IPayment extends Document {
  project?: Types.ObjectId;
  equipmentBooking?: Types.ObjectId;
  phase?: Types.ObjectId;
  type: PaymentType;
  /** Everything the payer is charged, deposit included. */
  amount: number;
  paidBy: Types.ObjectId;
  method: PaymentMethod;
  status: PaymentStatus;
  /** Our reference at the gateway; unique per checkout attempt. */
  tranId?: string;
  valId?: string;
  bankTranId?: string;
  /** How the customer paid, as SSLCommerz reports it, e.g. "BKASH-BKash". */
  cardType?: string;
  /** Who the money is for: the project's engineer or the equipment owner. */
  payee?: Types.ObjectId;
  /** CivilHub's commission, taken out of the payee's share. */
  platformFee: number;
  /** What the payee is owed once payouts run. */
  payeeAmount: number;
  /** Held on the renter's behalf, never earned; refunded or claimed later. */
  depositAmount: number;
  /** Paid, but the thing it paid for was already settled or withdrawn. */
  refundDue: boolean;
  failureReason?: string;
  /** What the payer sees this was for, e.g. "Advance for Duplex in Mirpur". */
  description?: string;
  /** Client route to send the payer back to after checkout. */
  returnPath?: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: false,
      index: true,
    },
    equipmentBooking: {
      type: Schema.Types.ObjectId,
      ref: "EquipmentBooking",
      required: false,
      index: true,
    },
    phase: {
      type: Schema.Types.ObjectId,
      ref: "ProjectPhase",
      default: null,
    },
    type: {
      type: String,
      enum: ["advance", "phase", "full_remaining", "equipment_booking"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paidBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    method: {
      type: String,
      enum: ["mock", "stripe", "sslcommerz"],
      default: "mock",
      required: true,
    },
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "paid",
      required: true,
      index: true,
    },
    tranId: { type: String, unique: true, sparse: true },
    valId: { type: String },
    bankTranId: { type: String },
    cardType: { type: String },
    payee: { type: Schema.Types.ObjectId, ref: "User", index: true },
    platformFee: { type: Number, min: 0, default: 0 },
    payeeAmount: { type: Number, min: 0, default: 0 },
    depositAmount: { type: Number, min: 0, default: 0 },
    refundDue: { type: Boolean, default: false },
    failureReason: { type: String, maxlength: 300 },
    description: { type: String, maxlength: 300 },
    returnPath: { type: String, maxlength: 300 },
    paidAt: {
      type: Date,
      required: false,
    },
  },
  { timestamps: true },
);

export const Payment: Model<IPayment> = model<IPayment>(
  "Payment",
  paymentSchema,
);
export default Payment;

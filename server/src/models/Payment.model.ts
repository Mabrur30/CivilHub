import { Document, Model, Schema, Types, model } from "mongoose";

export type PaymentType = "advance" | "phase" | "full_remaining";
export type PaymentMethod = "mock" | "stripe" | "sslcommerz";

export interface IPayment extends Document {
  project: Types.ObjectId;
  phase?: Types.ObjectId;
  type: PaymentType;
  amount: number;
  paidBy: Types.ObjectId;
  method: PaymentMethod;
  paidAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    phase: {
      type: Schema.Types.ObjectId,
      ref: "ProjectPhase",
      default: null,
    },
    type: {
      type: String,
      enum: ["advance", "phase", "full_remaining"],
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
    paidAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { timestamps: true },
);

export const Payment: Model<IPayment> = model<IPayment>(
  "Payment",
  paymentSchema,
);
export default Payment;

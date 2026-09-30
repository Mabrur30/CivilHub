import { Document, Model, Schema, Types, model } from "mongoose";
import { type DisputeAppeal, type DisputeStage, disputeAppealSchema } from "./ProjectDispute.model";
import { type EvidenceFacts, evidenceFactFields } from "../utils/evidence";

export type EquipmentBookingStatus =
  | "pending"
  | "approved"
  | "in_progress"
  | "completed"
  | "declined"
  | "cancelled";

export type EquipmentBookingPaymentStatus = "unpaid" | "paid";

export type DepositResolutionStatus = "pending" | "released" | "claimed";
export type EquipmentFulfilment = "pickup" | "delivery";

export interface BookingConditionPhoto extends EvidenceFacts {
  url: string;
  publicId: string;
}

/** The side that didn't confirm a pickup or return adds their own record of it. */
export interface ConditionReport {
  stage: "pickup" | "return";
  by: Types.ObjectId;
  role: "renter" | "owner";
  notes?: string;
  photos: BookingConditionPhoto[];
  at: Date;
}

/** An admin's decision on a disputed claim, waiting out its appeal window. */
export interface PendingDepositDecision {
  decision: DepositDisputeDecision;
  /** What the owner would keep. */
  amount: number;
  note: string;
  decidedBy: Types.ObjectId;
  decidedAt: Date;
  appealDeadline: Date;
  acceptedBy: Types.ObjectId[];
}

export type DepositDisputeDecision = "upheld" | "reduced" | "rejected";

/** A renter's objection to the owner's deposit claim, decided by a CivilHub admin. */
export interface DepositDispute {
  /** "decided" once a decision has taken effect. */
  status: "open" | "decided";
  /** While open: under review, a decision waiting to take effect, or appealed. */
  stage?: DisputeStage;
  pendingDecision?: PendingDepositDecision | null;
  appeal?: DisputeAppeal | null;
  reason: string;
  openedAt: Date;
  decision?: DepositDisputeDecision;
  /** What the owner first claimed, kept when an admin reduces or rejects it. */
  originalClaimAmount: number;
  decisionNote?: string;
  decidedBy?: Types.ObjectId;
  decidedAt?: Date;
}

export interface IEquipmentBooking extends Document {
  equipment: Types.ObjectId;
  renter: Types.ObjectId;
  owner: Types.ObjectId;
  /** Both inclusive: a Mon-Wed booking holds three days. */
  startDate: Date;
  endDate: Date;
  units: number;
  rentalDays: number;
  rentalFee: number;
  operatorFee: number;
  deliveryFee: number;
  withOperator: boolean;
  fulfilment: EquipmentFulfilment;
  deliveryAddress?: string;
  /** Rental + operator + delivery; the deposit is held separately. */
  totalRentalFee: number;
  /** Deposit for all units on this booking. */
  securityDeposit: number;
  status: EquipmentBookingStatus;
  paymentStatus: EquipmentBookingPaymentStatus;
  paidAt?: Date;
  pickupConditionNotes?: string;
  pickupConditionPhotos: BookingConditionPhoto[];
  pickupConfirmedAt?: Date;
  pickupConfirmedBy?: Types.ObjectId | null;
  returnConditionNotes?: string;
  returnConditionPhotos: BookingConditionPhoto[];
  returnConfirmedAt?: Date;
  returnConfirmedBy?: Types.ObjectId | null;
  /** The other side's own photos and notes of the pickup or return. */
  counterReports: ConditionReport[];
  depositResolution: DepositResolutionStatus;
  depositClaimNotes?: string;
  depositClaimAmount?: number;
  /** When the owner claimed; the renter can dispute for a few days after. */
  depositClaimedAt?: Date;
  /** When the owner was warned the deposit is about to release itself. */
  depositReminderSentAt?: Date;
  depositDispute?: DepositDispute;
  createdAt: Date;
  updatedAt: Date;
}

const bookingConditionPhotoSchema = new Schema<BookingConditionPhoto>(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    ...evidenceFactFields,
  },
  { _id: false },
);

const conditionReportSchema = new Schema<ConditionReport>(
  {
    stage: { type: String, enum: ["pickup", "return"], required: true },
    by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["renter", "owner"], required: true },
    notes: { type: String, trim: true, maxlength: 2000 },
    photos: { type: [bookingConditionPhotoSchema], default: [] },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const pendingDepositDecisionSchema = new Schema<PendingDepositDecision>(
  {
    decision: { type: String, enum: ["upheld", "reduced", "rejected"], required: true },
    amount: { type: Number, min: 0, required: true },
    note: { type: String, trim: true, maxlength: 2000, required: true },
    decidedBy: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
    decidedAt: { type: Date, required: true },
    appealDeadline: { type: Date, required: true },
    acceptedBy: { type: [Schema.Types.ObjectId], default: [] },
  },
  { _id: false },
);

const depositDisputeSchema = new Schema<DepositDispute>(
  {
    status: { type: String, enum: ["open", "decided"], required: true },
    stage: { type: String, enum: ["review", "awaiting_final", "appealed"], default: "review" },
    pendingDecision: { type: pendingDepositDecisionSchema, default: null },
    appeal: { type: disputeAppealSchema, default: null },
    reason: { type: String, trim: true, maxlength: 2000, required: true },
    openedAt: { type: Date, required: true },
    decision: { type: String, enum: ["upheld", "reduced", "rejected"], required: false },
    originalClaimAmount: { type: Number, min: 0, required: true },
    decisionNote: { type: String, trim: true, maxlength: 2000, required: false },
    decidedBy: { type: Schema.Types.ObjectId, ref: "Admin", required: false },
    decidedAt: { type: Date, required: false },
  },
  { _id: false },
);

const equipmentBookingSchema = new Schema<IEquipmentBooking>(
  {
    equipment: {
      type: Schema.Types.ObjectId,
      ref: "Equipment",
      required: true,
      index: true,
    },
    renter: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    endDate: {
      type: Date,
      required: true,
      index: true,
    },
    units: { type: Number, min: 1, default: 1 },
    rentalDays: { type: Number, min: 1, default: 1 },
    rentalFee: { type: Number, min: 0, default: 0 },
    operatorFee: { type: Number, min: 0, default: 0 },
    deliveryFee: { type: Number, min: 0, default: 0 },
    withOperator: { type: Boolean, default: false },
    fulfilment: {
      type: String,
      enum: ["pickup", "delivery"],
      default: "pickup",
    },
    deliveryAddress: { type: String, trim: true, maxlength: 300, required: false },
    totalRentalFee: {
      type: Number,
      required: true,
      min: 0,
    },
    securityDeposit: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "approved",
        "in_progress",
        "completed",
        "declined",
        "cancelled",
      ],
      default: "pending",
      required: true,
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid"],
      default: "unpaid",
      required: true,
      index: true,
    },
    paidAt: {
      type: Date,
      required: false,
    },
    pickupConditionNotes: {
      type: String,
      trim: true,
      maxlength: 2000,
      required: false,
    },
    pickupConditionPhotos: {
      type: [bookingConditionPhotoSchema],
      default: [],
      required: false,
    },
    pickupConfirmedAt: {
      type: Date,
      required: false,
    },
    pickupConfirmedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    returnConditionNotes: {
      type: String,
      trim: true,
      maxlength: 2000,
      required: false,
    },
    returnConditionPhotos: {
      type: [bookingConditionPhotoSchema],
      default: [],
      required: false,
    },
    returnConfirmedAt: {
      type: Date,
      required: false,
    },
    returnConfirmedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    counterReports: { type: [conditionReportSchema], default: [] },
    depositResolution: {
      type: String,
      enum: ["pending", "released", "claimed"],
      default: "pending",
      required: true,
    },
    depositClaimNotes: {
      type: String,
      trim: true,
      maxlength: 2000,
      required: false,
    },
    depositClaimAmount: {
      type: Number,
      min: 0,
      required: false,
    },
    depositClaimedAt: { type: Date, required: false },
    depositReminderSentAt: { type: Date, required: false },
    depositDispute: { type: depositDisputeSchema, required: false },
  },
  { timestamps: true },
);

equipmentBookingSchema.index({
  equipment: 1,
  status: 1,
  startDate: 1,
  endDate: 1,
});
equipmentBookingSchema.index({ owner: 1, status: 1, createdAt: -1 });
equipmentBookingSchema.index({ renter: 1, createdAt: -1 });
// The hourly sweep that reminds owners and releases unsettled deposits.
equipmentBookingSchema.index({ depositResolution: 1, status: 1, returnConfirmedAt: 1 });
equipmentBookingSchema.index({ "depositDispute.status": 1, "depositDispute.openedAt": -1 }, { sparse: true });
// The sweep finds deposit decisions whose appeal window has passed.
equipmentBookingSchema.index(
  { "depositDispute.stage": 1, "depositDispute.pendingDecision.appealDeadline": 1 },
  { sparse: true },
);

export const EquipmentBooking: Model<IEquipmentBooking> =
  model<IEquipmentBooking>("EquipmentBooking", equipmentBookingSchema);

export default EquipmentBooking;

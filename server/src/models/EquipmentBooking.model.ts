import { Document, Model, Schema, Types, model } from "mongoose";

export type EquipmentBookingStatus =
  | "pending"
  | "approved"
  | "in_progress"
  | "completed"
  | "declined"
  | "cancelled";

export type EquipmentBookingPaymentStatus = "unpaid" | "paid";

export type DepositResolutionStatus = "pending" | "released" | "claimed";

export interface BookingConditionPhoto {
  url: string;
  publicId: string;
}

export interface IEquipmentBooking extends Document {
  equipment: Types.ObjectId;
  renter: Types.ObjectId;
  owner: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  totalRentalFee: number;
  securityDeposit: number;
  status: EquipmentBookingStatus;
  paymentStatus: EquipmentBookingPaymentStatus;
  paidAt?: Date;
  pickupConditionNotes?: string;
  pickupConditionPhotos: BookingConditionPhoto[];
  pickupConfirmedAt?: Date;
  returnConditionNotes?: string;
  returnConditionPhotos: BookingConditionPhoto[];
  returnConfirmedAt?: Date;
  depositResolution: DepositResolutionStatus;
  depositClaimNotes?: string;
  depositClaimAmount?: number;
  createdAt: Date;
  updatedAt: Date;
}

const bookingConditionPhotoSchema = new Schema<BookingConditionPhoto>(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
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

export const EquipmentBooking: Model<IEquipmentBooking> =
  model<IEquipmentBooking>("EquipmentBooking", equipmentBookingSchema);

export default EquipmentBooking;

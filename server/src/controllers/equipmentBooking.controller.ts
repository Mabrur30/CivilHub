import { type NextFunction, type Response } from "express";
import { factsForUpload } from "../utils/evidence";
import { type AppealView, type PendingDecisionView, finalizeDueDecisions, toAppealView } from "../utils/disputeDecisions";
import { Types } from "mongoose";
import {
  STRIP_IMAGE_METADATA,
  deleteCloudinaryAsset,
  uploadAllOrNone,
  uploadBuffer,
} from "../utils/cloudinaryUpload";
import {
  CONFIRMATION_WAIT_HOURS,
  STAGE_CONFIRMER,
  STAGE_STATUSES,
  autoConfirmAt,
  completeStageFields,
  type BookingStage,
} from "../utils/bookingConfirmations";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { CustomerReview } from "../models/CustomerReview.model";
import {
  toCustomerReviewViews,
  type CustomerReviewView,
} from "./customerReview.controller";
import { Engineer } from "../models/Engineer.model";
import { Equipment, type IEquipment } from "../models/Equipment.model";
import {
  EquipmentBooking,
  type BookingConditionPhoto,
  type DepositResolutionStatus,
  type EquipmentBookingStatus,
  type EquipmentFulfilment,
  type IEquipmentBooking,
} from "../models/EquipmentBooking.model";
import { Notification } from "../models/Notification.model";
import { Payment, type IPayment } from "../models/Payment.model";
import { describePaymentMethod, payeeShareNote } from "../services/payments";
import { canRentEquipment } from "../utils/roles";
import { getAccountStanding, isRestricted } from "../utils/accountStatus";
import { isBlockedEitherWay } from "../utils/blocks";
import { Review } from "../models/Review.model";
import { formatTaka } from "../utils/money";
import {
  listingPricingOf,
  quoteBooking,
  type RentalQuote,
} from "../utils/equipmentPricing";
import { getProfilePhotoMap } from "../utils/profilePhotos";
import {
  DEPOSIT_DISPUTE_DAYS,
  autoReleaseAt,
  disputeDeadline,
} from "../utils/deposits";

interface BookingError extends Error {
  statusCode: number;
}

interface AvailabilityParams {
  equipmentId?: string;
}

interface AvailabilityQuery {
  month?: string;
  year?: string;
}

export interface CreateBookingBody {
  equipmentId?: string;
  startDate?: string;
  endDate?: string;
  units?: number | string;
  withOperator?: boolean | string;
  fulfilment?: string;
  deliveryAddress?: string;
}

interface QuoteQuery {
  startDate?: string;
  endDate?: string;
  units?: string;
  withOperator?: string;
  fulfilment?: string;
}

export interface RespondBookingBody {
  action?: "approve" | "decline";
}

export interface ResolveDepositBody {
  resolution?: "released" | "claimed";
  claimNotes?: string;
  claimAmount?: number;
}

export interface DisputeDepositBody {
  reason?: string;
}

export interface ConfirmConditionBody {
  conditionNotes?: string;
}

interface BookingParams {
  bookingId?: string;
}

interface AvailabilityResponse {
  quantity: number;
  /** Only days with at least one unit out; any other day is fully free. */
  days: Array<{ date: string; unitsBooked: number }>;
}

type BookingPaymentStatus = "unpaid" | "paid";
type BookingBucket = "pending" | "upcoming" | "active" | "history";

interface BookingPhotoResponse {
  url: string;
  publicId: string;
}

/** One side's own photos and notes of a pickup or return the other side confirmed. */
interface ConditionReportResponse {
  stage: "pickup" | "return";
  role: "renter" | "owner";
  notes: string | null;
  photos: BookingPhotoResponse[];
  at: string;
}

interface BookingParticipant {
  userId: string;
  name: string;
  profilePhotoUrl: string | null;
  rating: number | null;
  reviewCount: number;
}

interface BookingEquipmentSummary {
  id: string;
  title: string;
  photoUrl: string | null;
}

interface BookingViewResponse {
  id: string;
  equipment: BookingEquipmentSummary;
  renter: BookingParticipant;
  owner: BookingParticipant;
  startDate: string;
  endDate: string;
  units: number;
  rentalDays: number;
  rentalFee: number;
  operatorFee: number;
  deliveryFee: number;
  withOperator: boolean;
  fulfilment: EquipmentFulfilment;
  deliveryAddress: string | null;
  totalRentalFee: number;
  securityDeposit: number;
  status: EquipmentBookingStatus;
  paymentStatus: BookingPaymentStatus;
  paidAt: string | null;
  pickupConditionNotes: string | null;
  pickupConditionPhotos: BookingPhotoResponse[];
  pickupConfirmedAt: string | null;
  /** Who confirmed the pickup; the other side can add their own record for a day. */
  pickupConfirmedBy: "renter" | "owner" | null;
  returnConditionNotes: string | null;
  returnConditionPhotos: BookingPhotoResponse[];
  returnConfirmedAt: string | null;
  returnConfirmedBy: "renter" | "owner" | null;
  /**
   * Set while a step marked done by the other side waits for the renter
   * (pickup) or owner (return): when CivilHub will confirm it for them.
   */
  pickupAutoConfirmAt: string | null;
  returnAutoConfirmAt: string | null;
  counterReports: ConditionReportResponse[];
  depositResolution: DepositResolutionStatus;
  depositClaimNotes: string | null;
  depositClaimAmount: number | null;
  depositClaimedAt: string | null;
  /** Until when the renter can dispute the owner's claim. */
  disputeDeadline: string | null;
  /** When an unsettled deposit will be released to the renter by itself. */
  autoReleaseAt: string | null;
  depositDispute: DepositDisputeView | null;
  bucket: BookingBucket;
  createdAt: string;
  /** The settled payment; only on the single-booking view. */
  payment?: BookingPaymentResponse | null;
  /** The owner's review of the renter, once written. */
  ownerReview?: CustomerReviewView | null;
}

interface DepositDisputeView {
  status: "open" | "decided";
  /** While open: under review, a decision waiting to take effect, or appealed. */
  stage: "review" | "awaiting_final" | "appealed";
  /** The decision waiting out its appeal window, with what the owner would keep. */
  pendingDecision: (PendingDecisionView & { decision: "upheld" | "reduced" | "rejected"; amount: number }) | null;
  appeal: AppealView | null;
  reason: string;
  openedAt: string;
  decision: "upheld" | "reduced" | "rejected" | null;
  originalClaimAmount: number;
  decisionNote: string | null;
  decidedAt: string | null;
}

const toDepositDisputeView = (booking: IEquipmentBooking): DepositDisputeView | null => {
  const dispute = booking.depositDispute;
  if (!dispute?.status) return null;
  const pending = dispute.pendingDecision;
  const renterId = ((booking.renter as unknown as { _id?: unknown })?._id ?? booking.renter)?.toString();
  return {
    status: dispute.status,
    stage: dispute.stage ?? "review",
    pendingDecision: pending
      ? {
          decision: pending.decision,
          amount: pending.amount,
          note: pending.note,
          appealDeadline: pending.appealDeadline.toISOString(),
          acceptedBy: pending.acceptedBy.map((id) => (id.toString() === renterId ? "renter" : "owner")),
        }
      : null,
    appeal: toAppealView(dispute.appeal),
    reason: dispute.reason,
    openedAt: dispute.openedAt.toISOString(),
    decision: dispute.decision ?? null,
    originalClaimAmount: dispute.originalClaimAmount,
    decisionNote: dispute.decisionNote ?? null,
    decidedAt: dispute.decidedAt ? dispute.decidedAt.toISOString() : null,
  };
};

const toIso = (value: Date | null | undefined): string | null =>
  value ? value.toISOString() : null;

interface BookingPaymentResponse {
  tranId: string | null;
  amount: number;
  platformFee: number;
  payeeAmount: number;
  depositAmount: number;
  /** e.g. "bKash"; null for payments made before the gateway. */
  method: string | null;
  paidAt: string | null;
}

interface PopulatedBookingUser {
  _id: Types.ObjectId;
  name: string;
}

interface BookingUserRefObject {
  _id: Types.ObjectId;
}

interface PopulatedBookingEquipment {
  _id: Types.ObjectId;
  title: string;
  photos?: Array<{ url: string }>;
}

interface RatingAggregateRow {
  _id: Types.ObjectId;
  averageRating: number;
  reviewCount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const createBookingError = (
  message: string,
  statusCode: number,
): BookingError => {
  const error = new Error(message) as BookingError;
  error.statusCode = statusCode;
  return error;
};

const requireRenterUserId = (req: AuthenticatedRequest): string => {
  if (!req.user?.userId || !canRentEquipment(req.user.role)) {
    throw createBookingError("Sign in to rent equipment", 403);
  }

  return req.user.userId;
};

const getAvailabilityParams = (req: AuthenticatedRequest): AvailabilityParams =>
  req.params as unknown as AvailabilityParams;

const getAvailabilityQuery = (req: AuthenticatedRequest): AvailabilityQuery =>
  req.query as unknown as AvailabilityQuery;

const getBookingParams = (req: AuthenticatedRequest): BookingParams =>
  req.params as unknown as BookingParams;

const toUtcDayStart = (value: Date): Date =>
  new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );

const parseDateField = (value: string | undefined, fieldName: string): Date => {
  if (!value) {
    throw createBookingError(`${fieldName} is required`, 400);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw createBookingError(`${fieldName} must be a valid date`, 400);
  }

  return toUtcDayStart(parsed);
};

const parseMonthRange = (
  query: AvailabilityQuery,
): { rangeStart: Date; rangeEnd: Date } => {
  const now = new Date();
  const month = Number.parseInt(
    query.month ?? String(now.getUTCMonth() + 1),
    10,
  );
  const year = Number.parseInt(query.year ?? String(now.getUTCFullYear()), 10);

  const safeMonth =
    Number.isFinite(month) && month >= 1 && month <= 12
      ? month
      : now.getUTCMonth() + 1;
  const safeYear =
    Number.isFinite(year) && year >= 1970 && year <= 9999
      ? year
      : now.getUTCFullYear();

  const rangeStart = new Date(Date.UTC(safeYear, safeMonth - 1, 1));
  const rangeEnd = new Date(Date.UTC(safeYear, safeMonth, 0));

  return { rangeStart, rangeEnd };
};

const toPopulatedBookingUser = (
  value: unknown,
): PopulatedBookingUser | null => {
  if (!value || value instanceof Types.ObjectId || typeof value !== "object") {
    return null;
  }

  const record = value as { _id?: unknown; name?: unknown };
  if (
    !(record._id instanceof Types.ObjectId) ||
    typeof record.name !== "string"
  ) {
    return null;
  }

  return { _id: record._id, name: record.name };
};

const toBookingUserObject = (value: unknown): BookingUserRefObject | null => {
  if (!value || value instanceof Types.ObjectId || typeof value !== "object") {
    return null;
  }

  const record = value as { _id?: unknown };
  if (!(record._id instanceof Types.ObjectId)) {
    return null;
  }

  return { _id: record._id };
};

const toBookingUserId = (value: unknown): Types.ObjectId | null => {
  if (value instanceof Types.ObjectId) {
    return value;
  }

  const populated = toBookingUserObject(value);
  return populated ? populated._id : null;
};

const toPopulatedBookingEquipment = (
  value: unknown,
): PopulatedBookingEquipment | null => {
  if (!value || value instanceof Types.ObjectId || typeof value !== "object") {
    return null;
  }

  const record = value as { _id?: unknown; title?: unknown; photos?: unknown };
  if (
    !(record._id instanceof Types.ObjectId) ||
    typeof record.title !== "string"
  ) {
    return null;
  }

  const photos = Array.isArray(record.photos)
    ? record.photos.filter(
        (photo): photo is { url: string } =>
          typeof photo === "object" &&
          photo !== null &&
          "url" in photo &&
          typeof (photo as { url?: unknown }).url === "string",
      )
    : undefined;

  return {
    _id: record._id,
    title: record.title,
    photos,
  };
};

const toBookingEquipmentId = (value: unknown): Types.ObjectId | null => {
  if (value instanceof Types.ObjectId) {
    return value;
  }

  const populated = toPopulatedBookingEquipment(value);
  return populated ? populated._id : null;
};

const assertBookingDatesValid = (startDate: Date, endDate: Date): void => {
  if (endDate < startDate) {
    throw createBookingError("End date can't be before the start date", 400);
  }

  const today = toUtcDayStart(new Date());
  if (startDate < today) {
    throw createBookingError("Start date cannot be in the past", 400);
  }
};

// Bookings that hold units: approved ones and machines already out on rent.
const CAPACITY_STATUSES: EquipmentBookingStatus[] = ["approved", "in_progress"];

const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

/** Units held on each day of [startDate, endDate], both ends inclusive. */
const unitsBookedByDay = async (
  equipmentId: Types.ObjectId,
  startDate: Date,
  endDate: Date,
  excludeBookingId?: Types.ObjectId,
): Promise<Map<string, number>> => {
  const rows = await EquipmentBooking.find({
    equipment: equipmentId,
    status: { $in: CAPACITY_STATUSES },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
    ...(excludeBookingId ? { _id: { $ne: excludeBookingId } } : {}),
  })
    .select("startDate endDate units")
    .exec();

  const byDay = new Map<string, number>();
  for (const row of rows) {
    const from = Math.max(row.startDate.getTime(), startDate.getTime());
    const to = Math.min(row.endDate.getTime(), endDate.getTime());
    for (let time = from; time <= to; time += DAY_MS) {
      const key = dayKey(new Date(time));
      byDay.set(key, (byDay.get(key) ?? 0) + (row.units ?? 1));
    }
  }
  return byDay;
};

/** True when `units` more fit on every day of the range. */
const fitsCapacity = async (
  equipmentId: Types.ObjectId,
  quantity: number,
  startDate: Date,
  endDate: Date,
  units: number,
  excludeBookingId?: Types.ObjectId,
): Promise<boolean> => {
  const byDay = await unitsBookedByDay(
    equipmentId,
    startDate,
    endDate,
    excludeBookingId,
  );
  for (let time = startDate.getTime(); time <= endDate.getTime(); time += DAY_MS) {
    if ((byDay.get(dayKey(new Date(time))) ?? 0) + units > quantity) {
      return false;
    }
  }
  return true;
};

const parseUnits = (value: number | string | undefined): number => {
  if (value === undefined || value === "") return 1;
  const units = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isInteger(units) || units < 1) {
    throw createBookingError("Choose at least one unit", 400);
  }
  return units;
};

const parseFulfilment = (value: string | undefined): EquipmentFulfilment => {
  if (value === undefined || value === "" || value === "pickup") return "pickup";
  if (value === "delivery") return "delivery";
  throw createBookingError("Choose pickup or delivery", 400);
};

const parseFlag = (value: boolean | string | undefined): boolean =>
  value === true || value === "true" || value === "1";

const getEquipmentById = async (equipmentId: string): Promise<IEquipment> => {
  if (!Types.ObjectId.isValid(equipmentId)) {
    throw createBookingError("Invalid equipment ID", 400);
  }

  const equipment = await Equipment.findById(equipmentId).exec();
  if (!equipment) {
    throw createBookingError("Equipment listing not found", 404);
  }

  return equipment;
};

const getEngineerRatingMap = async (
  userIds: Types.ObjectId[],
): Promise<Map<string, { rating: number; reviewCount: number }>> => {
  if (userIds.length === 0) {
    return new Map<string, { rating: number; reviewCount: number }>();
  }

  const rows = await Review.aggregate<RatingAggregateRow>([
    {
      $match: {
        engineer: { $in: userIds },
        project: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: "$engineer",
        averageRating: { $avg: "$rating" },
        reviewCount: { $sum: 1 },
      },
    },
  ]).exec();

  return new Map(
    rows.map((row) => [
      row._id.toString(),
      {
        rating: Math.round(row.averageRating * 10) / 10,
        reviewCount: row.reviewCount,
      },
    ]),
  );
};

const getBookingBucket = (
  booking: IEquipmentBooking,
  today: Date,
): BookingBucket => {
  if (booking.status === "pending") {
    return "pending";
  }

  if (booking.status === "in_progress") {
    return "active";
  }

  if (booking.status === "approved") {
    if (booking.endDate < today) {
      return "history";
    }
    return "upcoming";
  }

  return "history";
};

/** Uploads condition photos, keeping who took them and the camera's date and place. */
const uploadConditionPhotos = async (
  files: Express.Multer.File[],
  uploadedBy: string,
): Promise<BookingConditionPhoto[]> => {
  if (files.length === 0) {
    return [];
  }

  const uploadedAt = new Date();
  return uploadAllOrNone(
    files,
    async (file) => {
      const [upload, facts] = await Promise.all([
        uploadBuffer(file.buffer, {
          folder: "civilhub/equipment-booking",
          resource_type: "image",
          ...STRIP_IMAGE_METADATA,
        }),
        factsForUpload(file, uploadedBy, uploadedAt),
      ]);
      return { url: upload.secure_url, publicId: upload.public_id, ...facts };
    },
    (photo) => deleteCloudinaryAsset(photo.publicId, "image"),
  );
};

/** How long the side that didn't confirm a pickup or return has to add their own record. */
export const CONDITION_REPORT_HOURS = 24;

const roleOf = (booking: IEquipmentBooking, userId: Types.ObjectId | string | null | undefined): "renter" | "owner" | null => {
  if (!userId) return null;
  return toBookingUserId(booking.renter)?.toString() === userId.toString() ? "renter" : "owner";
};

const toPhotoResponse = (photo: BookingConditionPhoto): BookingPhotoResponse => ({
  url: photo.url,
  publicId: photo.publicId,
});

const normalizeBookingEquipmentTitle = (booking: IEquipmentBooking): string => {
  const equipment = toPopulatedBookingEquipment(booking.equipment);
  return equipment?.title ?? "equipment listing";
};

const mapBookingRowsToResponse = async (
  rows: IEquipmentBooking[],
): Promise<BookingViewResponse[]> => {
  const renterIds = rows
    .map((row) => toPopulatedBookingUser(row.renter))
    .filter((renter): renter is PopulatedBookingUser => renter !== null)
    .map((renter) => renter._id);

  const ownerIds = rows
    .map((row) => toPopulatedBookingUser(row.owner))
    .filter((owner): owner is PopulatedBookingUser => owner !== null)
    .map((owner) => owner._id);

  const allIdsByKey = new Map<string, Types.ObjectId>();
  [...renterIds, ...ownerIds].forEach((id) => {
    allIdsByKey.set(id.toString(), id);
  });

  const allIds = Array.from(allIdsByKey.values());

  const [photoMap, ratingMap] = await Promise.all([
    getProfilePhotoMap(allIds),
    getEngineerRatingMap(allIds),
  ]);

  const today = toUtcDayStart(new Date());

  return rows
    .map((row) => {
      const renter = toPopulatedBookingUser(row.renter);
      const owner = toPopulatedBookingUser(row.owner);
      const equipment = toPopulatedBookingEquipment(row.equipment);

      if (!renter || !owner || !equipment) {
        return null;
      }

      const renterId = renter._id.toString();
      const ownerId = owner._id.toString();
      const renterRating = ratingMap.get(renterId);
      const ownerRating = ratingMap.get(ownerId);

      return {
        id: row._id.toString(),
        equipment: {
          id: equipment._id.toString(),
          title: equipment.title,
          photoUrl: equipment.photos?.[0]?.url ?? null,
        },
        renter: {
          userId: renterId,
          name: renter.name,
          profilePhotoUrl: photoMap.get(renterId) ?? null,
          rating: renterRating?.rating ?? null,
          reviewCount: renterRating?.reviewCount ?? 0,
        },
        owner: {
          userId: ownerId,
          name: owner.name,
          profilePhotoUrl: photoMap.get(ownerId) ?? null,
          rating: ownerRating?.rating ?? null,
          reviewCount: ownerRating?.reviewCount ?? 0,
        },
        startDate: row.startDate.toISOString(),
        endDate: row.endDate.toISOString(),
        units: row.units ?? 1,
        rentalDays: row.rentalDays ?? 1,
        // Bookings made before the breakdown existed only have the total.
        rentalFee: row.rentalFee || row.totalRentalFee,
        operatorFee: row.operatorFee ?? 0,
        deliveryFee: row.deliveryFee ?? 0,
        withOperator: row.withOperator ?? false,
        fulfilment: row.fulfilment ?? "pickup",
        deliveryAddress: row.deliveryAddress ?? null,
        totalRentalFee: row.totalRentalFee,
        securityDeposit: row.securityDeposit,
        status: row.status,
        paymentStatus: row.paymentStatus,
        paidAt: row.paidAt ? row.paidAt.toISOString() : null,
        pickupConditionNotes: row.pickupConditionNotes ?? null,
        pickupConditionPhotos: row.pickupConditionPhotos.map(toPhotoResponse),
        pickupConfirmedAt: row.pickupConfirmedAt
          ? row.pickupConfirmedAt.toISOString()
          : null,
        pickupConfirmedBy: roleOf(row, row.pickupConfirmedBy),
        returnConditionNotes: row.returnConditionNotes ?? null,
        returnConditionPhotos: row.returnConditionPhotos.map(toPhotoResponse),
        returnConfirmedAt: row.returnConfirmedAt
          ? row.returnConfirmedAt.toISOString()
          : null,
        returnConfirmedBy: roleOf(row, row.returnConfirmedBy),
        pickupAutoConfirmAt: row.pickupConfirmedAt
          ? null
          : (autoConfirmAt(row.pickupAwaitingSince)?.toISOString() ?? null),
        returnAutoConfirmAt: row.returnConfirmedAt
          ? null
          : (autoConfirmAt(row.returnAwaitingSince)?.toISOString() ?? null),
        counterReports: (row.counterReports ?? []).map((report) => ({
          stage: report.stage,
          role: report.role,
          notes: report.notes ?? null,
          photos: report.photos.map(toPhotoResponse),
          at: report.at.toISOString(),
        })),
        depositResolution: row.depositResolution,
        depositClaimNotes: row.depositClaimNotes ?? null,
        depositClaimAmount:
          typeof row.depositClaimAmount === "number"
            ? row.depositClaimAmount
            : null,
        depositClaimedAt: toIso(row.depositClaimedAt),
        disputeDeadline: toIso(disputeDeadline(row)),
        autoReleaseAt: row.paymentStatus === "paid" && row.securityDeposit > 0 ? toIso(autoReleaseAt(row)) : null,
        depositDispute: toDepositDisputeView(row),
        bucket: getBookingBucket(row, today),
        createdAt: row.createdAt.toISOString(),
      };
    })
    .filter((item): item is BookingViewResponse => item !== null);
};

const getBookingByIdOrFail = async (
  bookingId: string,
): Promise<IEquipmentBooking> => {
  if (!Types.ObjectId.isValid(bookingId)) {
    throw createBookingError("Valid booking ID is required", 400);
  }

  const booking = await EquipmentBooking.findById(bookingId)
    .populate("equipment", "title photos")
    .populate("owner", "name")
    .populate("renter", "name")
    .exec();

  if (!booking) {
    throw createBookingError("Booking request not found", 404);
  }

  return booking;
};

const assertBookingParticipant = (
  booking: IEquipmentBooking,
  userId: string,
): void => {
  const ownerId = toBookingUserId(booking.owner);
  const renterId = toBookingUserId(booking.renter);

  if (!ownerId || !renterId) {
    throw createBookingError("Unable to resolve booking participants", 500);
  }

  if (ownerId.toString() !== userId && renterId.toString() !== userId) {
    throw createBookingError("You are not authorized for this booking", 403);
  }
};

const getOtherPartyId = (
  booking: IEquipmentBooking,
  userId: string,
): Types.ObjectId => {
  const ownerId = toBookingUserId(booking.owner);
  const renterId = toBookingUserId(booking.renter);

  if (!ownerId || !renterId) {
    throw createBookingError("Unable to resolve booking participants", 500);
  }

  if (ownerId.toString() === userId) {
    return renterId;
  }
  return ownerId;
};

export const getEquipmentAvailability = async (
  req: AuthenticatedRequest,
  res: Response<AvailabilityResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    requireRenterUserId(req);
    const { equipmentId } = getAvailabilityParams(req);

    if (!equipmentId) {
      throw createBookingError("Equipment ID is required", 400);
    }

    const equipment = await getEquipmentById(equipmentId);
    const { rangeStart, rangeEnd } = parseMonthRange(getAvailabilityQuery(req));
    const byDay = await unitsBookedByDay(equipment._id, rangeStart, rangeEnd);

    res.status(200).json({
      quantity: listingPricingOf(equipment).quantity,
      days: [...byDay.entries()]
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([date, unitsBooked]) => ({ date, unitsBooked })),
    });
  } catch (error: unknown) {
    next(error);
  }
};

/**
 * The price a request would be booked at, plus whether it fits on those dates.
 * Booking creation uses the same quote, so what the renter sees is what's stored.
 */
export const getEquipmentQuote = async (
  req: AuthenticatedRequest,
  res: Response<RentalQuote & { fits: boolean }>,
  next: NextFunction,
): Promise<void> => {
  try {
    requireRenterUserId(req);
    const { equipmentId } = getAvailabilityParams(req);
    if (!equipmentId) {
      throw createBookingError("Equipment ID is required", 400);
    }
    const query = req.query as unknown as QuoteQuery;
    const equipment = await getEquipmentById(equipmentId);
    const startDate = parseDateField(query.startDate, "Start date");
    const endDate = parseDateField(query.endDate, "End date");
    const terms = listingPricingOf(equipment);
    const quote = quoteBooking(terms, {
      startDate,
      endDate,
      units: parseUnits(query.units),
      withOperator: parseFlag(query.withOperator),
      fulfilment: parseFulfilment(query.fulfilment),
    });
    const fits = await fitsCapacity(
      equipment._id,
      terms.quantity,
      startDate,
      endDate,
      quote.units,
    );

    res.status(200).json({ ...quote, fits });
  } catch (error: unknown) {
    next(error);
  }
};

export const createBookingRequest = async (
  req: AuthenticatedRequest<CreateBookingBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const renterId = requireRenterUserId(req);
    const equipmentId = req.body.equipmentId;

    if (!equipmentId) {
      throw createBookingError("Equipment ID is required", 400);
    }

    const equipment = await getEquipmentById(equipmentId);
    if (equipment.owner.toString() === renterId) {
      throw createBookingError("You cannot book your own equipment", 403);
    }

    if (equipment.status !== "active") {
      throw createBookingError("This equipment listing is not active", 409);
    }
    if (await isBlockedEitherWay(renterId, equipment.owner.toString())) {
      throw createBookingError("You can't book this listing", 403);
    }
    if (isRestricted(await getAccountStanding(equipment.owner.toString()))) {
      throw createBookingError("This listing can't be booked right now", 409);
    }

    const startDate = parseDateField(req.body.startDate, "Start date");
    const endDate = parseDateField(req.body.endDate, "End date");
    assertBookingDatesValid(startDate, endDate);

    const terms = listingPricingOf(equipment);
    const fulfilment = parseFulfilment(req.body.fulfilment);
    const deliveryAddress = req.body.deliveryAddress?.trim() ?? "";
    if (fulfilment === "delivery" && deliveryAddress.length < 5) {
      throw createBookingError("Add the site address for delivery", 400);
    }
    const quote = quoteBooking(terms, {
      startDate,
      endDate,
      units: parseUnits(req.body.units),
      withOperator: parseFlag(req.body.withOperator),
      fulfilment,
    });

    const fits = await fitsCapacity(
      equipment._id,
      terms.quantity,
      startDate,
      endDate,
      quote.units,
    );
    if (!fits) {
      throw createBookingError(
        quote.units > 1
          ? `${quote.units} units aren't free on all of these dates`
          : "These dates are no longer available",
        409,
      );
    }

    const booking = await EquipmentBooking.create({
      equipment: equipment._id,
      renter: renterId,
      owner: equipment.owner,
      startDate,
      endDate,
      units: quote.units,
      rentalDays: quote.rentalDays,
      rentalFee: quote.rentalFee,
      operatorFee: quote.operatorFee,
      deliveryFee: quote.deliveryFee,
      withOperator: quote.operatorFee > 0,
      fulfilment,
      ...(fulfilment === "delivery" ? { deliveryAddress } : {}),
      totalRentalFee: quote.totalRentalFee,
      securityDeposit: quote.securityDeposit,
      status: "pending",
      paymentStatus: "unpaid",
      depositResolution: "pending",
    });

    await Notification.create({
      recipient: equipment.owner,
      type: "equipment_booking_request",
      message: `New booking request for ${equipment.title}.`,
      equipment: equipment._id,
      equipmentBooking: booking._id,
    });

    res.status(201).json({
      id: booking._id.toString(),
      equipmentId: equipment._id.toString(),
      renterId,
      ownerId: equipment.owner.toString(),
      startDate: booking.startDate.toISOString(),
      endDate: booking.endDate.toISOString(),
      totalRentalFee: booking.totalRentalFee,
      securityDeposit: booking.securityDeposit,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      createdAt: booking.createdAt.toISOString(),
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const getIncomingBookingRequests = async (
  req: AuthenticatedRequest,
  res: Response<BookingViewResponse[]>,
  next: NextFunction,
): Promise<void> => {
  try {
    const ownerId = requireRenterUserId(req);

    const rows = await EquipmentBooking.find({
      owner: ownerId,
      status: "pending",
    })
      .populate("equipment", "title photos")
      .populate("renter", "name")
      .populate("owner", "name")
      .sort({ createdAt: -1 })
      .exec();

    res.status(200).json(await mapBookingRowsToResponse(rows));
  } catch (error: unknown) {
    next(error);
  }
};

export const getOwnerBookings = async (
  req: AuthenticatedRequest,
  res: Response<BookingViewResponse[]>,
  next: NextFunction,
): Promise<void> => {
  try {
    const ownerId = requireRenterUserId(req);

    const rows = await EquipmentBooking.find({ owner: ownerId })
      .populate("equipment", "title photos")
      .populate("renter", "name")
      .populate("owner", "name")
      .sort({ createdAt: -1 })
      .exec();

    res.status(200).json(await mapBookingRowsToResponse(rows));
  } catch (error: unknown) {
    next(error);
  }
};

export const getMyBookings = async (
  req: AuthenticatedRequest,
  res: Response<BookingViewResponse[]>,
  next: NextFunction,
): Promise<void> => {
  try {
    const renterId = requireRenterUserId(req);

    const rows = await EquipmentBooking.find({ renter: renterId })
      .populate("equipment", "title photos")
      .populate("owner", "name")
      .populate("renter", "name")
      .sort({ createdAt: -1 })
      .exec();

    res.status(200).json(await mapBookingRowsToResponse(rows));
  } catch (error: unknown) {
    next(error);
  }
};

export const getBookingByIdForUser = async (
  req: AuthenticatedRequest,
  res: Response<BookingViewResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireRenterUserId(req);
    const { bookingId } = getBookingParams(req);
    if (!bookingId) {
      throw createBookingError("Booking ID is required", 400);
    }

    // A dispute decision whose appeal window has passed takes effect first.
    await finalizeDueDecisions();
    const booking = await getBookingByIdOrFail(bookingId);
    assertBookingParticipant(booking, userId);

    const [response] = await mapBookingRowsToResponse([booking]);
    if (!response) {
      throw createBookingError("Unable to map booking details", 500);
    }

    const [payment, ownerReview] = await Promise.all([
      Payment.findOne({
        equipmentBooking: booking._id,
        status: "paid",
        refundDue: { $ne: true },
      })
        .sort({ paidAt: 1 })
        .exec(),
      CustomerReview.findOne({ equipmentBooking: booking._id, author: booking.owner }).exec(),
    ]);

    res.status(200).json({
      ...response,
      ownerReview: ownerReview ? (await toCustomerReviewViews([ownerReview]))[0] : null,
      payment: payment
        ? {
            tranId: payment.tranId ?? null,
            amount: payment.amount,
            platformFee: payment.platformFee,
            payeeAmount: payment.payeeAmount,
            depositAmount: payment.depositAmount,
            method:
              payment.method === "sslcommerz"
                ? describePaymentMethod(payment.cardType)
                : null,
            paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
          }
        : null,
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const respondToBookingRequest = async (
  req: AuthenticatedRequest<RespondBookingBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const ownerId = requireRenterUserId(req);
    const { bookingId } = getBookingParams(req);
    if (!bookingId || !Types.ObjectId.isValid(bookingId)) {
      throw createBookingError("Valid booking ID is required", 400);
    }

    const action = req.body.action;
    if (action !== "approve" && action !== "decline") {
      throw createBookingError("Action must be approve or decline", 400);
    }

    const booking = await getBookingByIdOrFail(bookingId);

    const bookingOwnerId = toBookingUserId(booking.owner);
    if (!bookingOwnerId || bookingOwnerId.toString() !== ownerId) {
      throw createBookingError(
        "You are not authorized to respond to this booking",
        403,
      );
    }

    if (booking.status !== "pending") {
      throw createBookingError(
        "Only pending requests can be responded to",
        409,
      );
    }

    const equipmentId = toBookingEquipmentId(booking.equipment);
    if (!equipmentId) {
      throw createBookingError("Unable to resolve booking equipment", 500);
    }

    const equipmentTitle = normalizeBookingEquipmentTitle(booking);

    if (action === "decline") {
      booking.status = "declined";
      await booking.save();

      await Notification.create({
        recipient: booking.renter,
        type: "equipment_booking_declined",
        message: `Your booking request for ${equipmentTitle} was declined.`,
        equipment: equipmentId,
        equipmentBooking: booking._id,
      });

      res
        .status(200)
        .json({ id: booking._id.toString(), status: booking.status });
      return;
    }

    const equipmentDoc = await Equipment.findById(equipmentId)
      .select("quantity")
      .exec();
    const quantity = equipmentDoc?.quantity ?? 1;

    const fitsNow = await fitsCapacity(
      equipmentId,
      quantity,
      booking.startDate,
      booking.endDate,
      booking.units ?? 1,
      booking._id,
    );
    if (!fitsNow) {
      throw createBookingError("These dates are no longer available", 409);
    }

    const approved = await EquipmentBooking.findOneAndUpdate(
      { _id: booking._id, status: "pending" },
      { $set: { status: "approved" } },
      { returnDocument: "after" },
    ).exec();
    if (!approved) {
      throw createBookingError("Only pending requests can be responded to", 409);
    }
    // Checked again now this booking holds its units: of two overlapping
    // approvals racing, at least one sees the other here and backs out.
    const stillFitsNow = await fitsCapacity(
      equipmentId,
      quantity,
      booking.startDate,
      booking.endDate,
      booking.units ?? 1,
      booking._id,
    );
    if (!stillFitsNow) {
      await EquipmentBooking.updateOne(
        { _id: booking._id, status: "approved" },
        { $set: { status: "pending" } },
      ).exec();
      throw createBookingError("These dates are no longer available", 409);
    }
    booking.status = "approved";

    const pendingOnDates = await EquipmentBooking.find({
      equipment: equipmentId,
      status: "pending",
      _id: { $ne: booking._id },
      startDate: { $lte: booking.endDate },
      endDate: { $gte: booking.startDate },
    }).exec();

    // With several units, other requests on these dates may still fit.
    const overlappingPending: IEquipmentBooking[] = [];
    for (const item of pendingOnDates) {
      const stillFits = await fitsCapacity(
        equipmentId,
        quantity,
        item.startDate,
        item.endDate,
        item.units ?? 1,
        item._id,
      );
      if (!stillFits) overlappingPending.push(item);
    }

    if (overlappingPending.length > 0) {
      await EquipmentBooking.updateMany(
        { _id: { $in: overlappingPending.map((item) => item._id) } },
        { $set: { status: "declined" } },
      ).exec();

      await Promise.all(
        overlappingPending.map((item) =>
          Notification.create({
            recipient: item.renter,
            type: "equipment_booking_auto_declined",
            message: `Your request for ${equipmentTitle} was automatically declined because overlapping dates were approved for another booking.`,
            equipment: equipmentId,
            equipmentBooking: item._id,
          }),
        ),
      );
    }

    await Notification.create({
      recipient: booking.renter,
      type: "equipment_booking_approved",
      message: `Your booking request for ${equipmentTitle} was approved.`,
      equipment: equipmentId,
      equipmentBooking: booking._id,
    });

    res
      .status(200)
      .json({ id: booking._id.toString(), status: booking.status });
  } catch (error: unknown) {
    next(error);
  }
};

export const cancelBookingRequest = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireRenterUserId(req);
    const { bookingId } = getBookingParams(req);

    if (!bookingId || !Types.ObjectId.isValid(bookingId)) {
      throw createBookingError("Valid booking ID is required", 400);
    }

    const booking = await EquipmentBooking.findById(bookingId).exec();
    if (!booking) {
      throw createBookingError("Booking request not found", 404);
    }

    const role = roleOf(booking, userId);
    const isRenter = toBookingUserId(booking.renter)?.toString() === userId;
    const isOwner = toBookingUserId(booking.owner)?.toString() === userId;
    if (!isRenter && !isOwner) {
      throw createBookingError(
        "You can only cancel your own booking request",
        403,
      );
    }
    // A pending request is the renter's to withdraw; the owner declines it.
    // Once approved, either side can call it off until the pickup starts.
    if (booking.status === "pending" ? !isRenter : booking.status !== "approved") {
      throw createBookingError(
        booking.status === "pending"
          ? "Decline the request instead"
          : "Only bookings that haven't been picked up can be cancelled",
        409,
      );
    }
    if (booking.pickupAwaitingSince) {
      throw createBookingError(
        "The owner has marked this as handed over; confirm or wait for the pickup instead",
        409,
      );
    }

    const cancelled = await EquipmentBooking.findOneAndUpdate(
      { _id: booking._id, status: booking.status, pickupConfirmedAt: null, pickupAwaitingSince: null },
      { $set: { status: "cancelled" } },
      { returnDocument: "after" },
    ).exec();
    if (!cancelled) {
      throw createBookingError("This booking changed meanwhile. Refresh and try again.", 409);
    }
    booking.status = "cancelled";

    // Paid but never picked up: everything the renter paid goes back.
    const paid = await Payment.find({
      equipmentBooking: booking._id,
      status: "paid",
      refundDue: { $ne: true },
    }).exec();
    if (paid.length > 0) {
      await Payment.updateMany(
        { _id: { $in: paid.map((payment) => payment._id) } },
        { $set: { refundDue: true } },
      ).exec();
    }
    const refunded = paid.reduce((sum, payment) => sum + payment.amount, 0);

    const equipmentId = toBookingEquipmentId(booking.equipment);
    const title = normalizeBookingEquipmentTitle(booking);
    const refundNote = refunded > 0 ? ` CivilHub will refund the ${formatTaka(refunded)} the renter paid.` : "";
    await Notification.create({
      recipient: getOtherPartyId(booking, userId),
      type: "equipment_booking_cancelled",
      message: `The ${role === "owner" ? "owner" : "renter"} cancelled the booking for ${title}.${refundNote}`,
      ...(equipmentId ? { equipment: equipmentId } : {}),
      equipmentBooking: booking._id,
    });

    res
      .status(200)
      .json({ id: booking._id.toString(), status: booking.status });
  } catch (error: unknown) {
    next(error);
  }
};

// ============ Gateway payments ============
// Checkouts start in payment.controller; these decide what a renter owes and
// what a verified payment does to the booking.

export interface BookingCharge {
  booking: IEquipmentBooking;
  amount: number;
  depositAmount: number;
  payee: Types.ObjectId;
  productName: string;
  returnPath: string;
}

/** The rental plus the deposit for an approved, unpaid booking of the renter's. */
export const prepareBookingCharge = async (
  userId: string,
  role: string,
  bookingId: unknown,
): Promise<BookingCharge> => {
  if (!canRentEquipment(role)) {
    throw createBookingError("Sign in to rent equipment", 403);
  }
  if (typeof bookingId !== "string") {
    throw createBookingError("Booking ID is required", 400);
  }

  const booking = await getBookingByIdOrFail(bookingId);
  const renterId = toBookingUserId(booking.renter);
  const ownerId = toBookingUserId(booking.owner);
  if (!renterId || renterId.toString() !== userId) {
    throw createBookingError("Only the renter can pay for this booking", 403);
  }
  if (!ownerId) {
    throw createBookingError("Unable to resolve booking participants", 500);
  }
  if (booking.status !== "approved") {
    throw createBookingError("Only approved bookings can be paid", 409);
  }
  if (booking.paymentStatus !== "unpaid") {
    throw createBookingError("This booking has already been paid", 409);
  }

  return {
    booking,
    amount: booking.totalRentalFee + booking.securityDeposit,
    depositAmount: booking.securityDeposit,
    payee: ownerId,
    productName: `Equipment rental - ${normalizeBookingEquipmentTitle(booking)}`,
    returnPath: `/dashboard/${role}/equipment/bookings/${booking._id.toString()}`,
  };
};

/**
 * Marks the booking paid for a verified payment. Returns false when it no
 * longer needs paying (already paid, or no longer approved), so the caller
 * can flag the money for a refund.
 */
export const applyBookingPayment = async (payment: IPayment): Promise<boolean> => {
  const paidAt = payment.paidAt ?? new Date();
  const booking = await EquipmentBooking.findOneAndUpdate(
    { _id: payment.equipmentBooking, status: "approved", paymentStatus: "unpaid" },
    { $set: { paymentStatus: "paid", paidAt } },
    { returnDocument: "after" },
  )
    .populate("equipment", "title")
    .exec();
  if (!booking) return false;

  const equipmentId = toBookingEquipmentId(booking.equipment);
  const deposit =
    payment.depositAmount > 0
      ? ` That includes a ${formatTaka(payment.depositAmount)} deposit CivilHub holds until the return.`
      : "";
  await Notification.create({
    recipient: booking.owner,
    type: "equipment_booking_payment_received",
    message: `Payment of ${formatTaka(payment.amount)} received via ${describePaymentMethod(payment.cardType)} for ${normalizeBookingEquipmentTitle(booking)}.${deposit}${payeeShareNote(payment)}`,
    ...(equipmentId ? { equipment: equipmentId } : {}),
    equipmentBooking: booking._id,
  });
  return true;
};

/** Deletes photos uploaded for a confirmation that didn't go through. */
const discardPhotos = async (photos: BookingConditionPhoto[]): Promise<void> => {
  await Promise.all(
    photos.map((photo) => deleteCloudinaryAsset(photo.publicId, "image").catch(() => undefined)),
  );
};

/**
 * Records one side's confirmation of a pickup or return. The renter confirms
 * the pickup and the owner the return; when the other side marks it first,
 * the step waits for the right side, or for CONFIRMATION_WAIT_HOURS.
 */
const confirmStage = async (
  req: AuthenticatedRequest<ConfirmConditionBody>,
  stage: BookingStage,
): Promise<IEquipmentBooking> => {
  const userId = requireRenterUserId(req);
  const { bookingId } = getBookingParams(req);
  if (!bookingId) {
    throw createBookingError("Booking ID is required", 400);
  }

  const booking = await getBookingByIdOrFail(bookingId);
  assertBookingParticipant(booking, userId);

  const { from } = STAGE_STATUSES[stage];
  if (booking.status !== from) {
    throw createBookingError(
      stage === "pickup"
        ? "Pickup can only be confirmed for approved bookings"
        : "Return can only be confirmed for active bookings",
      409,
    );
  }
  if (stage === "pickup" && booking.paymentStatus !== "paid") {
    throw createBookingError("Payment must be completed before pickup", 409);
  }
  const confirmedAt = stage === "pickup" ? booking.pickupConfirmedAt : booking.returnConfirmedAt;
  if (confirmedAt) {
    throw createBookingError(
      stage === "pickup" ? "Pickup has already been confirmed" : "Return has already been confirmed",
      409,
    );
  }

  const role = roleOf(booking, userId);
  const confirmer = STAGE_CONFIRMER[stage];
  const isConfirmer = role === confirmer;
  const awaitingSince = (stage === "pickup" ? booking.pickupAwaitingSince : booking.returnAwaitingSince) ?? null;
  if (!isConfirmer && awaitingSince) {
    throw createBookingError(
      `You've already marked the ${stage}; it's waiting for the ${confirmer} to confirm it.`,
      409,
    );
  }

  const files = Array.isArray(req.files) ? req.files : [];
  const photos = await uploadConditionPhotos(files, userId);
  const notes = req.body.conditionNotes?.trim() || undefined;
  const now = new Date();
  const ownRecord = {
    [`${stage}ConditionNotes`]: notes ?? null,
    [`${stage}ConditionPhotos`]: photos,
    [`${stage}ConfirmedBy`]: new Types.ObjectId(userId),
  };

  let update: Record<string, unknown>;
  if (!isConfirmer) {
    // Marked done by the side that isn't the one to confirm it: wait for them.
    update = { $set: { ...ownRecord, [`${stage}AwaitingSince`]: now } };
  } else if (awaitingSince) {
    // The other side's record is the main one; this side's goes alongside it.
    update = {
      $set: completeStageFields(stage, booking, now),
      ...(notes || photos.length > 0
        ? { $push: { counterReports: { stage, by: new Types.ObjectId(userId), role: confirmer, notes, photos, at: now } } }
        : {}),
    };
  } else {
    update = { $set: { ...ownRecord, ...completeStageFields(stage, booking, now) } };
  }

  const updated = await EquipmentBooking.findOneAndUpdate(
    {
      _id: booking._id,
      status: from,
      [`${stage}ConfirmedAt`]: null,
      [`${stage}AwaitingSince`]: awaitingSince,
    },
    update,
    { returnDocument: "after" },
  ).exec();
  if (!updated) {
    await discardPhotos(photos);
    throw createBookingError("This booking changed meanwhile. Refresh and try again.", 409);
  }

  const equipmentId = toBookingEquipmentId(booking.equipment);
  const title = normalizeBookingEquipmentTitle(booking);
  await Notification.create({
    recipient: getOtherPartyId(booking, userId),
    type: stage === "pickup" ? "equipment_pickup_confirmed" : "equipment_return_confirmed",
    message: isConfirmer
      ? `${stage === "pickup" ? "Pickup" : "Return"} confirmed for ${title}.`
      : stage === "pickup"
        ? `The owner marked ${title} as handed over to you. Confirm the pickup in the booking. If you don't within ${CONFIRMATION_WAIT_HOURS} hours, CivilHub will confirm it for you.`
        : `The renter marked ${title} as returned. Confirm you have it back in the booking. If you don't within ${CONFIRMATION_WAIT_HOURS} hours, CivilHub will confirm it for you.`,
    ...(equipmentId ? { equipment: equipmentId } : {}),
    equipmentBooking: booking._id,
  });
  return updated;
};

const sendConfirmation = (booking: IEquipmentBooking, stage: BookingStage, res: Response): void => {
  const confirmedAt = stage === "pickup" ? booking.pickupConfirmedAt : booking.returnConfirmedAt;
  const awaitingSince = stage === "pickup" ? booking.pickupAwaitingSince : booking.returnAwaitingSince;
  res.status(200).json({
    success: true,
    status: booking.status,
    [`${stage}ConfirmedAt`]: confirmedAt ? confirmedAt.toISOString() : null,
    autoConfirmAt: autoConfirmAt(awaitingSince)?.toISOString() ?? null,
  });
};

export const confirmPickup = async (
  req: AuthenticatedRequest<ConfirmConditionBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    sendConfirmation(await confirmStage(req, "pickup"), "pickup", res);
  } catch (error: unknown) {
    next(error);
  }
};

export const confirmReturn = async (
  req: AuthenticatedRequest<ConfirmConditionBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    sendConfirmation(await confirmStage(req, "return"), "return", res);
  } catch (error: unknown) {
    next(error);
  }
};

/**
 * The side that didn't confirm a pickup or return adds their own photos and
 * notes of it, once, within CONDITION_REPORT_HOURS. Both records then stand
 * side by side if the deposit is ever disputed.
 */
export const addConditionReport = async (
  req: AuthenticatedRequest<{ stage?: unknown; notes?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireRenterUserId(req);
    const { bookingId } = getBookingParams(req);
    if (!bookingId) {
      throw createBookingError("Booking ID is required", 400);
    }
    const booking = await getBookingByIdOrFail(bookingId);
    assertBookingParticipant(booking, userId);

    const stage = req.body.stage === "pickup" || req.body.stage === "return" ? req.body.stage : null;
    if (!stage) throw createBookingError("Say whether this is about the pickup or the return.", 400);
    const confirmedAt = stage === "pickup" ? booking.pickupConfirmedAt : booking.returnConfirmedAt;
    const confirmedBy = stage === "pickup" ? booking.pickupConfirmedBy : booking.returnConfirmedBy;
    if (!confirmedAt) throw createBookingError(`The ${stage} hasn't been confirmed yet.`, 409);
    if (confirmedBy && confirmedBy.toString() === userId) {
      throw createBookingError(`You confirmed the ${stage}; your photos are already on it.`, 409);
    }
    if (Date.now() - confirmedAt.getTime() > CONDITION_REPORT_HOURS * 60 * 60 * 1000) {
      throw createBookingError(`Your own ${stage} photos had to be added within ${CONDITION_REPORT_HOURS} hours of it.`, 409);
    }
    if ((booking.counterReports ?? []).some((report) => report.stage === stage && report.by.toString() === userId)) {
      throw createBookingError(`You've already added your ${stage} record.`, 409);
    }
    const files = Array.isArray(req.files) ? req.files : [];
    const notes = typeof req.body.notes === "string" ? req.body.notes.trim().slice(0, 2000) : "";
    if (files.length === 0 && !notes) {
      throw createBookingError("Add photos, notes, or both.", 400);
    }

    const role = roleOf(booking, userId) ?? "owner";
    const report = {
      stage,
      by: new Types.ObjectId(userId),
      role,
      ...(notes ? { notes } : {}),
      photos: await uploadConditionPhotos(files, userId),
      at: new Date(),
    };
    const updated = await EquipmentBooking.findOneAndUpdate(
      { _id: booking._id, counterReports: { $not: { $elemMatch: { stage, by: report.by } } } },
      { $push: { counterReports: report } },
      { returnDocument: "after" },
    ).exec();
    if (!updated) throw createBookingError(`You've already added your ${stage} record.`, 409);

    const equipmentId = toBookingEquipmentId(booking.equipment);
    await Notification.create({
      recipient: getOtherPartyId(booking, userId),
      type: "equipment_condition_report",
      message: `The ${role} added their own ${stage} photos and notes for ${normalizeBookingEquipmentTitle(booking)}.`,
      ...(equipmentId ? { equipment: equipmentId } : {}),
      equipmentBooking: booking._id,
    });
    res.status(201).json({ success: true, stage, role, at: report.at.toISOString() });
  } catch (error: unknown) {
    next(error);
  }
};

export const resolveDeposit = async (
  req: AuthenticatedRequest<ResolveDepositBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const ownerId = requireRenterUserId(req);
    const { bookingId } = getBookingParams(req);
    if (!bookingId) {
      throw createBookingError("Booking ID is required", 400);
    }

    const booking = await getBookingByIdOrFail(bookingId);
    const bookingOwnerId = toBookingUserId(booking.owner);
    if (!bookingOwnerId || bookingOwnerId.toString() !== ownerId) {
      throw createBookingError("Only the owner can resolve the deposit", 403);
    }

    if (booking.status !== "completed") {
      throw createBookingError(
        "Deposit can only be resolved after completion",
        409,
      );
    }

    if (booking.depositResolution !== "pending") {
      throw createBookingError("Deposit has already been resolved", 409);
    }

    const resolution = req.body.resolution;
    if (resolution !== "released" && resolution !== "claimed") {
      throw createBookingError("Resolution must be released or claimed", 400);
    }

    let update: Record<string, unknown>;
    if (resolution === "claimed") {
      const claimNotes = req.body.claimNotes?.trim();
      const claimAmount = Math.round(Number(req.body.claimAmount) * 100) / 100;
      if (!claimNotes) {
        throw createBookingError(
          "Claim notes are required when claiming the deposit",
          400,
        );
      }
      if (!Number.isFinite(claimAmount) || claimAmount <= 0) {
        throw createBookingError("Claim amount must be a positive number", 400);
      }
      if (claimAmount > booking.securityDeposit) {
        throw createBookingError(
          `You can claim at most the deposit held (${formatTaka(booking.securityDeposit)})`,
          400,
        );
      }
      // Past the deadline the deposit belongs to the renter, even if the
      // hourly sweep hasn't released it yet.
      const releaseAt = autoReleaseAt(booking);
      if (releaseAt && releaseAt <= new Date()) {
        throw createBookingError(
          "The time to claim this deposit has passed; it's released to the renter.",
          409,
        );
      }
      update = {
        $set: {
          depositResolution: "claimed",
          depositClaimNotes: claimNotes,
          depositClaimAmount: claimAmount,
          depositClaimedAt: new Date(),
        },
      };
    } else {
      update = {
        $set: { depositResolution: "released" },
        $unset: { depositClaimNotes: 1, depositClaimAmount: 1 },
      };
    }

    // Only while still pending: the auto-release sweep may have got there first.
    const resolved = await EquipmentBooking.findOneAndUpdate(
      { _id: booking._id, status: "completed", depositResolution: "pending" },
      update,
      { returnDocument: "after" },
    ).exec();
    if (!resolved) {
      throw createBookingError("Deposit has already been resolved", 409);
    }
    booking.depositResolution = resolved.depositResolution;
    booking.depositClaimNotes = resolved.depositClaimNotes;
    booking.depositClaimAmount = resolved.depositClaimAmount;

    const equipmentId = toBookingEquipmentId(booking.equipment);
    await Notification.create({
      recipient: booking.renter,
      type:
        booking.depositResolution === "claimed"
          ? "equipment_deposit_claimed"
          : "equipment_deposit_released",
      message:
        booking.depositResolution === "claimed"
          ? `The owner claimed ${formatTaka(booking.depositClaimAmount ?? 0)} of your deposit for ${normalizeBookingEquipmentTitle(booking)}. If you disagree, you can dispute it within ${DEPOSIT_DISPUTE_DAYS} days.`
          : `Deposit released for ${normalizeBookingEquipmentTitle(booking)}.`,
      ...(equipmentId ? { equipment: equipmentId } : {}),
      equipmentBooking: booking._id,
    });

    res.status(200).json({
      success: true,
      depositResolution: booking.depositResolution,
      depositClaimNotes: booking.depositClaimNotes ?? null,
      depositClaimAmount:
        typeof booking.depositClaimAmount === "number"
          ? booking.depositClaimAmount
          : null,
    });
  } catch (error: unknown) {
    next(error);
  }
};

const DISPUTE_REASON_MIN = 10;
const DISPUTE_REASON_MAX = 2000;

/** The renter objects to the owner's claim; a CivilHub admin then decides it. */
export const disputeDeposit = async (
  req: AuthenticatedRequest<DisputeDepositBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireRenterUserId(req);
    const { bookingId } = getBookingParams(req);
    if (!bookingId) {
      throw createBookingError("Booking ID is required", 400);
    }

    const booking = await getBookingByIdOrFail(bookingId);
    const renterId = toBookingUserId(booking.renter);
    if (!renterId || renterId.toString() !== userId) {
      throw createBookingError("Only the renter can dispute a deposit claim", 403);
    }
    if (booking.depositResolution !== "claimed") {
      throw createBookingError("There's no deposit claim to dispute", 409);
    }
    if (booking.depositDispute) {
      throw createBookingError("You've already disputed this claim", 409);
    }
    const deadline = disputeDeadline(booking);
    if (!deadline || deadline <= new Date()) {
      throw createBookingError(
        `Claims can be disputed for ${DEPOSIT_DISPUTE_DAYS} days after they're made, and that time has passed`,
        409,
      );
    }

    const reason = req.body.reason?.trim() ?? "";
    if (reason.length < DISPUTE_REASON_MIN) {
      throw createBookingError("Tell CivilHub why you disagree with the claim, in a sentence or two", 400);
    }
    if (reason.length > DISPUTE_REASON_MAX) {
      throw createBookingError(`Keep it under ${DISPUTE_REASON_MAX} characters`, 400);
    }

    booking.depositDispute = {
      status: "open",
      reason,
      openedAt: new Date(),
      originalClaimAmount: booking.depositClaimAmount ?? 0,
    };
    await booking.save();

    const equipmentId = toBookingEquipmentId(booking.equipment);
    await Notification.create({
      recipient: toBookingUserId(booking.owner) ?? undefined,
      type: "equipment_deposit_disputed",
      message: `The renter disputed your ${formatTaka(booking.depositClaimAmount ?? 0)} deposit claim for ${normalizeBookingEquipmentTitle(booking)}. CivilHub will review it and let you both know.`,
      ...(equipmentId ? { equipment: equipmentId } : {}),
      equipmentBooking: booking._id,
    });

    res.status(200).json({ success: true, depositDispute: toDepositDisputeView(booking) });
  } catch (error: unknown) {
    next(error);
  }
};

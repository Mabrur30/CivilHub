import { type NextFunction, type Response } from "express";
import { type UploadApiOptions, type UploadApiResponse } from "cloudinary";
import { Types } from "mongoose";
import cloudinary from "../config/cloudinary";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Engineer } from "../models/Engineer.model";
import { Equipment, type IEquipment } from "../models/Equipment.model";
import {
  EquipmentBooking,
  type DepositResolutionStatus,
  type EquipmentBookingStatus,
  type IEquipmentBooking,
} from "../models/EquipmentBooking.model";
import { Notification } from "../models/Notification.model";
import { Payment } from "../models/Payment.model";
import { Review } from "../models/Review.model";

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
}

export interface RespondBookingBody {
  action?: "approve" | "decline";
}

export interface ResolveDepositBody {
  resolution?: "released" | "claimed";
  claimNotes?: string;
  claimAmount?: number;
}

export interface ConfirmConditionBody {
  conditionNotes?: string;
}

interface BookingParams {
  bookingId?: string;
}

interface AvailabilityItem {
  startDate: string;
  endDate: string;
}

type BookingPaymentStatus = "unpaid" | "paid";
type BookingBucket = "pending" | "upcoming" | "active" | "history";

interface BookingPhotoResponse {
  url: string;
  publicId: string;
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
  totalRentalFee: number;
  securityDeposit: number;
  status: EquipmentBookingStatus;
  paymentStatus: BookingPaymentStatus;
  paidAt: string | null;
  pickupConditionNotes: string | null;
  pickupConditionPhotos: BookingPhotoResponse[];
  pickupConfirmedAt: string | null;
  returnConditionNotes: string | null;
  returnConditionPhotos: BookingPhotoResponse[];
  returnConfirmedAt: string | null;
  depositResolution: DepositResolutionStatus;
  depositClaimNotes: string | null;
  depositClaimAmount: number | null;
  bucket: BookingBucket;
  createdAt: string;
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

const requireEngineerUserId = (req: AuthenticatedRequest): string => {
  if (!req.user?.userId || req.user.role !== "engineer") {
    throw createBookingError("Engineer access required", 403);
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

const getDurationDays = (startDate: Date, endDate: Date): number =>
  Math.floor((endDate.getTime() - startDate.getTime()) / DAY_MS);

const assertBookingDatesValid = (startDate: Date, endDate: Date): void => {
  if (endDate <= startDate) {
    throw createBookingError("End date must be after start date", 400);
  }

  const today = toUtcDayStart(new Date());
  if (startDate < today) {
    throw createBookingError("Start date cannot be in the past", 400);
  }
};

const buildApprovedOverlapQuery = (
  equipmentId: Types.ObjectId,
  startDate: Date,
  endDate: Date,
): Record<string, unknown> => ({
  equipment: equipmentId,
  status: "approved",
  startDate: { $lte: endDate },
  endDate: { $gte: startDate },
});

const hasApprovedOverlap = async (
  equipmentId: Types.ObjectId,
  startDate: Date,
  endDate: Date,
  excludeBookingId?: Types.ObjectId,
): Promise<boolean> => {
  const query: Record<string, unknown> = buildApprovedOverlapQuery(
    equipmentId,
    startDate,
    endDate,
  );

  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }

  const conflicting = await EquipmentBooking.findOne(query)
    .select("_id")
    .exec();
  return Boolean(conflicting);
};

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

const getEngineerPhotoMap = async (
  userIds: Types.ObjectId[],
): Promise<Map<string, string>> => {
  if (userIds.length === 0) {
    return new Map<string, string>();
  }

  const engineers = await Engineer.find({ user: { $in: userIds } })
    .select("user profilePhoto")
    .exec();

  return new Map(
    engineers.map((engineer) => [
      engineer.user.toString(),
      engineer.profilePhoto?.url ?? "",
    ]),
  );
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

const uploadBuffer = (
  buffer: Buffer,
  options: UploadApiOptions,
): Promise<UploadApiResponse> =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        if (!result) {
          reject(new Error("Cloudinary did not return an upload result"));
          return;
        }
        resolve(result);
      },
    );

    stream.end(buffer);
  });

const uploadConditionPhotos = async (
  files: Express.Multer.File[],
): Promise<BookingPhotoResponse[]> => {
  if (files.length === 0) {
    return [];
  }

  const uploads = await Promise.all(
    files.map((file) =>
      uploadBuffer(file.buffer, {
        folder: "civilhub/equipment-booking",
        resource_type: "image",
      }),
    ),
  );

  return uploads.map((upload) => ({
    url: upload.secure_url,
    publicId: upload.public_id,
  }));
};

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
    getEngineerPhotoMap(allIds),
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
        totalRentalFee: row.totalRentalFee,
        securityDeposit: row.securityDeposit,
        status: row.status,
        paymentStatus: row.paymentStatus,
        paidAt: row.paidAt ? row.paidAt.toISOString() : null,
        pickupConditionNotes: row.pickupConditionNotes ?? null,
        pickupConditionPhotos: row.pickupConditionPhotos.map((photo) => ({
          url: photo.url,
          publicId: photo.publicId,
        })),
        pickupConfirmedAt: row.pickupConfirmedAt
          ? row.pickupConfirmedAt.toISOString()
          : null,
        returnConditionNotes: row.returnConditionNotes ?? null,
        returnConditionPhotos: row.returnConditionPhotos.map((photo) => ({
          url: photo.url,
          publicId: photo.publicId,
        })),
        returnConfirmedAt: row.returnConfirmedAt
          ? row.returnConfirmedAt.toISOString()
          : null,
        depositResolution: row.depositResolution,
        depositClaimNotes: row.depositClaimNotes ?? null,
        depositClaimAmount:
          typeof row.depositClaimAmount === "number"
            ? row.depositClaimAmount
            : null,
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
  res: Response<AvailabilityItem[]>,
  next: NextFunction,
): Promise<void> => {
  try {
    requireEngineerUserId(req);
    const { equipmentId } = getAvailabilityParams(req);

    if (!equipmentId) {
      throw createBookingError("Equipment ID is required", 400);
    }

    const equipment = await getEquipmentById(equipmentId);
    const { rangeStart, rangeEnd } = parseMonthRange(getAvailabilityQuery(req));

    const rows = await EquipmentBooking.find({
      ...buildApprovedOverlapQuery(equipment._id, rangeStart, rangeEnd),
    })
      .select("startDate endDate")
      .sort({ startDate: 1 })
      .exec();

    res.status(200).json(
      rows.map((row) => ({
        startDate: row.startDate.toISOString(),
        endDate: row.endDate.toISOString(),
      })),
    );
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
    const renterId = requireEngineerUserId(req);
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

    const startDate = parseDateField(req.body.startDate, "Start date");
    const endDate = parseDateField(req.body.endDate, "End date");
    assertBookingDatesValid(startDate, endDate);

    const conflicting = await hasApprovedOverlap(
      equipment._id,
      startDate,
      endDate,
    );
    if (conflicting) {
      throw createBookingError("These dates are no longer available", 409);
    }

    const durationDays = getDurationDays(startDate, endDate);
    const totalRentalFee = durationDays * equipment.dailyRate;

    const booking = await EquipmentBooking.create({
      equipment: equipment._id,
      renter: renterId,
      owner: equipment.owner,
      startDate,
      endDate,
      totalRentalFee,
      securityDeposit: equipment.securityDeposit,
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
    const ownerId = requireEngineerUserId(req);

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
    const ownerId = requireEngineerUserId(req);

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
    const renterId = requireEngineerUserId(req);

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
    const userId = requireEngineerUserId(req);
    const { bookingId } = getBookingParams(req);
    if (!bookingId) {
      throw createBookingError("Booking ID is required", 400);
    }

    const booking = await getBookingByIdOrFail(bookingId);
    assertBookingParticipant(booking, userId);

    const [response] = await mapBookingRowsToResponse([booking]);
    if (!response) {
      throw createBookingError("Unable to map booking details", 500);
    }

    res.status(200).json(response);
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
    const ownerId = requireEngineerUserId(req);
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

    const conflictsNow = await hasApprovedOverlap(
      equipmentId,
      booking.startDate,
      booking.endDate,
      booking._id,
    );

    if (conflictsNow) {
      throw createBookingError("These dates are no longer available", 409);
    }

    booking.status = "approved";
    await booking.save();

    const overlappingPending = await EquipmentBooking.find({
      equipment: equipmentId,
      status: "pending",
      _id: { $ne: booking._id },
      startDate: { $lte: booking.endDate },
      endDate: { $gte: booking.startDate },
    }).exec();

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
    const renterId = requireEngineerUserId(req);
    const { bookingId } = getBookingParams(req);

    if (!bookingId || !Types.ObjectId.isValid(bookingId)) {
      throw createBookingError("Valid booking ID is required", 400);
    }

    const booking = await EquipmentBooking.findById(bookingId).exec();
    if (!booking) {
      throw createBookingError("Booking request not found", 404);
    }

    const bookingRenterId = toBookingUserId(booking.renter);
    if (!bookingRenterId || bookingRenterId.toString() !== renterId) {
      throw createBookingError(
        "You can only cancel your own booking request",
        403,
      );
    }

    if (booking.status !== "pending") {
      throw createBookingError(
        "Only pending booking requests can be cancelled",
        409,
      );
    }

    booking.status = "cancelled";
    await booking.save();

    res
      .status(200)
      .json({ id: booking._id.toString(), status: booking.status });
  } catch (error: unknown) {
    next(error);
  }
};

export const payForBooking = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const renterId = requireEngineerUserId(req);
    const { bookingId } = getBookingParams(req);
    if (!bookingId) {
      throw createBookingError("Booking ID is required", 400);
    }

    const booking = await getBookingByIdOrFail(bookingId);
    const bookingRenterId = toBookingUserId(booking.renter);
    if (!bookingRenterId || bookingRenterId.toString() !== renterId) {
      throw createBookingError("Only the renter can pay for this booking", 403);
    }

    if (booking.status !== "approved") {
      throw createBookingError("Only approved bookings can be paid", 409);
    }

    if (booking.paymentStatus !== "unpaid") {
      throw createBookingError("This booking has already been paid", 409);
    }

    const paymentDate = new Date();
    const totalDue = booking.totalRentalFee + booking.securityDeposit;

    await Payment.create({
      equipmentBooking: booking._id,
      type: "equipment_booking",
      amount: totalDue,
      paidBy: renterId,
      method: "mock",
      paidAt: paymentDate,
    });

    booking.paymentStatus = "paid";
    booking.paidAt = paymentDate;
    await booking.save();

    const equipmentId = toBookingEquipmentId(booking.equipment);
    await Notification.create({
      recipient: booking.owner,
      type: "equipment_booking_payment_received",
      message: `Mock payment of $${totalDue.toFixed(2)} received for ${normalizeBookingEquipmentTitle(booking)}.`,
      ...(equipmentId ? { equipment: equipmentId } : {}),
      equipmentBooking: booking._id,
    });

    res.status(200).json({
      success: true,
      message: "Booking payment processed (mock)",
      amount: totalDue,
      paidAt: paymentDate.toISOString(),
      paymentStatus: booking.paymentStatus,
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const confirmPickup = async (
  req: AuthenticatedRequest<ConfirmConditionBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireEngineerUserId(req);
    const { bookingId } = getBookingParams(req);
    if (!bookingId) {
      throw createBookingError("Booking ID is required", 400);
    }

    const booking = await getBookingByIdOrFail(bookingId);
    assertBookingParticipant(booking, userId);

    if (booking.status !== "approved") {
      throw createBookingError(
        "Pickup can only be confirmed for approved bookings",
        409,
      );
    }

    if (booking.paymentStatus !== "paid") {
      throw createBookingError("Payment must be completed before pickup", 409);
    }

    if (booking.pickupConfirmedAt) {
      throw createBookingError("Pickup has already been confirmed", 409);
    }

    const files = Array.isArray(req.files) ? req.files : [];
    const photos = await uploadConditionPhotos(files);

    booking.pickupConditionNotes = req.body.conditionNotes?.trim() || undefined;
    booking.pickupConditionPhotos = photos;
    booking.pickupConfirmedAt = new Date();
    booking.status = "in_progress";
    await booking.save();

    const equipmentId = toBookingEquipmentId(booking.equipment);
    await Notification.create({
      recipient: getOtherPartyId(booking, userId),
      type: "equipment_pickup_confirmed",
      message: `Pickup confirmed for ${normalizeBookingEquipmentTitle(booking)}.`,
      ...(equipmentId ? { equipment: equipmentId } : {}),
      equipmentBooking: booking._id,
    });

    res.status(200).json({
      success: true,
      status: booking.status,
      pickupConfirmedAt: booking.pickupConfirmedAt.toISOString(),
    });
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
    const userId = requireEngineerUserId(req);
    const { bookingId } = getBookingParams(req);
    if (!bookingId) {
      throw createBookingError("Booking ID is required", 400);
    }

    const booking = await getBookingByIdOrFail(bookingId);
    assertBookingParticipant(booking, userId);

    if (booking.status !== "in_progress") {
      throw createBookingError(
        "Return can only be confirmed for active bookings",
        409,
      );
    }

    if (booking.returnConfirmedAt) {
      throw createBookingError("Return has already been confirmed", 409);
    }

    const files = Array.isArray(req.files) ? req.files : [];
    const photos = await uploadConditionPhotos(files);

    booking.returnConditionNotes = req.body.conditionNotes?.trim() || undefined;
    booking.returnConditionPhotos = photos;
    booking.returnConfirmedAt = new Date();
    booking.status = "completed";
    await booking.save();

    const equipmentId = toBookingEquipmentId(booking.equipment);
    await Notification.create({
      recipient: getOtherPartyId(booking, userId),
      type: "equipment_return_confirmed",
      message: `Return confirmed for ${normalizeBookingEquipmentTitle(booking)}.`,
      ...(equipmentId ? { equipment: equipmentId } : {}),
      equipmentBooking: booking._id,
    });

    res.status(200).json({
      success: true,
      status: booking.status,
      returnConfirmedAt: booking.returnConfirmedAt.toISOString(),
    });
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
    const ownerId = requireEngineerUserId(req);
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

    if (resolution === "claimed") {
      const claimNotes = req.body.claimNotes?.trim();
      const claimAmount = Number(req.body.claimAmount);
      if (!claimNotes) {
        throw createBookingError(
          "Claim notes are required when claiming the deposit",
          400,
        );
      }
      if (!Number.isFinite(claimAmount) || claimAmount <= 0) {
        throw createBookingError("Claim amount must be a positive number", 400);
      }

      booking.depositResolution = "claimed";
      booking.depositClaimNotes = claimNotes;
      booking.depositClaimAmount = claimAmount;
    } else {
      booking.depositResolution = "released";
      booking.depositClaimNotes = undefined;
      booking.depositClaimAmount = undefined;
    }

    await booking.save();

    const equipmentId = toBookingEquipmentId(booking.equipment);
    await Notification.create({
      recipient: booking.renter,
      type:
        booking.depositResolution === "claimed"
          ? "equipment_deposit_claimed"
          : "equipment_deposit_released",
      message:
        booking.depositResolution === "claimed"
          ? `Deposit claimed for ${normalizeBookingEquipmentTitle(booking)}: $${(booking.depositClaimAmount ?? 0).toFixed(2)}.`
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

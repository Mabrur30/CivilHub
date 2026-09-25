import { type NextFunction, type Response } from "express";
import { type UploadApiOptions, type UploadApiResponse } from "cloudinary";
import { Types } from "mongoose";
import cloudinary from "../config/cloudinary";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import {
  Equipment,
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_MAX_UNITS,
  type EquipmentCategory,
  type EquipmentOperatorOption,
  type EquipmentStatus,
  type EquipmentTransportOption,
  type IEquipment,
} from "../models/Equipment.model";
import { EquipmentBooking } from "../models/EquipmentBooking.model";
import { Engineer } from "../models/Engineer.model";
import { Review } from "../models/Review.model";
import {
  listingPricingOf,
  type ListingPricing,
  validateListingPricing,
} from "../utils/equipmentPricing";

interface EquipmentError extends Error {
  statusCode: number;
}

interface EquipmentPhotoResponse {
  url: string;
  publicId: string;
}

interface ListingTermsBody {
  weeklyRate?: number | string | null;
  monthlyRate?: number | string | null;
  minRentalDays?: number | string;
  quantity?: number | string;
  operator?: string;
  operatorDailyRate?: number | string | null;
  transport?: string;
  deliveryFee?: number | string | null;
}

export interface CreateEquipmentBody extends ListingTermsBody {
  title?: string;
  description?: string;
  category?: string;
  dailyRate?: number | string;
  securityDeposit?: number | string;
  location?: string;
}

export interface UpdateEquipmentBody extends ListingTermsBody {
  title?: string;
  description?: string;
  category?: string;
  dailyRate?: number | string;
  securityDeposit?: number | string;
  location?: string;
  status?: EquipmentStatus;
}

interface EquipmentParams {
  equipmentId?: string;
}

interface BrowseEquipmentQuery {
  category?: string;
  location?: string;
  minPrice?: string;
  maxPrice?: string;
  search?: string;
  page?: string;
  limit?: string;
}

interface OwnerSummary {
  userId: string;
  name: string;
  profilePhotoUrl: string | null;
  rating: number | null;
  reviewCount: number;
}

interface EquipmentListItemResponse {
  id: string;
  owner: OwnerSummary;
  equipmentRating: number | null;
  equipmentReviewCount: number;
  title: string;
  description: string;
  category: EquipmentCategory;
  dailyRate: number;
  weeklyRate: number | null;
  monthlyRate: number | null;
  minRentalDays: number;
  securityDeposit: number;
  quantity: number;
  operator: EquipmentOperatorOption;
  operatorDailyRate: number | null;
  transport: EquipmentTransportOption;
  deliveryFee: number | null;
  location: string;
  photos: EquipmentPhotoResponse[];
  status: EquipmentStatus;
  createdAt: string;
  updatedAt: string;
}

interface EquipmentBrowseResponse {
  items: EquipmentListItemResponse[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

interface PopulatedOwner {
  _id: Types.ObjectId;
  name: string;
}

interface RatingAggregateRow {
  _id: Types.ObjectId;
  averageRating: number;
  reviewCount: number;
}

interface EquipmentRatingAggregateRow {
  _id: Types.ObjectId;
  averageRating: number;
  reviewCount: number;
}

const createEquipmentError = (
  message: string,
  statusCode: number,
): EquipmentError => {
  const error = new Error(message) as EquipmentError;
  error.statusCode = statusCode;
  return error;
};

const requireEngineerUser = (req: AuthenticatedRequest): string => {
  if (!req.user?.userId || req.user.role !== "engineer") {
    throw createEquipmentError("Engineer access required", 403);
  }

  return req.user.userId;
};

// Browsing and viewing are open to anyone who can rent: clients and engineers.
const requireRenterUser = (req: AuthenticatedRequest): string => {
  if (
    !req.user?.userId ||
    (req.user.role !== "engineer" && req.user.role !== "client")
  ) {
    throw createEquipmentError("Sign in to browse equipment", 403);
  }
  return req.user.userId;
};

const getParams = (req: AuthenticatedRequest): EquipmentParams =>
  req.params as unknown as EquipmentParams;

const getQuery = (req: AuthenticatedRequest): BrowseEquipmentQuery =>
  req.query as unknown as BrowseEquipmentQuery;

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

const deleteCloudinaryImage = async (publicId: string): Promise<void> => {
  await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
};

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parsePositiveNumber = (value: number | string | undefined): number => {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(value ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Number.NaN;
  }

  return parsed;
};

const isBlank = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && (value.trim() === "" || value === "null"));

/** An optional money field: blank clears it, otherwise it must be a number >= 0. */
const parseOptionalAmount = (
  value: number | string | null | undefined,
  label: string,
): number | null => {
  if (isBlank(value)) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createEquipmentError(`${label} must be a number of 0 or more`, 400);
  }
  return parsed;
};

const parseWholeNumber = (
  value: number | string | undefined,
  label: string,
  min: number,
  max: number,
): number => {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw createEquipmentError(`${label} must be a whole number from ${min} to ${max}`, 400);
  }
  return parsed;
};

const OPERATOR_OPTIONS: EquipmentOperatorOption[] = ["none", "included", "optional"];
const TRANSPORT_OPTIONS: EquipmentTransportOption[] = ["pickup", "delivery", "both"];

/** Applies whichever rental terms the body sends onto `target`. */
const applyListingTerms = (body: ListingTermsBody, target: ListingPricing): void => {
  if (body.weeklyRate !== undefined) {
    target.weeklyRate = parseOptionalAmount(body.weeklyRate, "Weekly rate");
  }
  if (body.monthlyRate !== undefined) {
    target.monthlyRate = parseOptionalAmount(body.monthlyRate, "Monthly rate");
  }
  if (body.minRentalDays !== undefined) {
    target.minRentalDays = parseWholeNumber(body.minRentalDays, "Minimum rental", 1, 365);
  }
  if (body.quantity !== undefined) {
    target.quantity = parseWholeNumber(body.quantity, "Number of units", 1, EQUIPMENT_MAX_UNITS);
  }
  if (body.operator !== undefined) {
    if (!OPERATOR_OPTIONS.includes(body.operator as EquipmentOperatorOption)) {
      throw createEquipmentError("Operator must be none, included or optional", 400);
    }
    target.operator = body.operator as EquipmentOperatorOption;
  }
  if (body.operatorDailyRate !== undefined) {
    target.operatorDailyRate = parseOptionalAmount(body.operatorDailyRate, "Operator rate");
  }
  if (body.transport !== undefined) {
    if (!TRANSPORT_OPTIONS.includes(body.transport as EquipmentTransportOption)) {
      throw createEquipmentError("Transport must be pickup, delivery or both", 400);
    }
    target.transport = body.transport as EquipmentTransportOption;
  }
  if (body.deliveryFee !== undefined) {
    target.deliveryFee = parseOptionalAmount(body.deliveryFee, "Delivery fee");
  }
  // Rates that no longer apply are cleared so old values can't leak into quotes.
  if (target.operator !== "optional") target.operatorDailyRate = null;
  if (target.transport === "pickup") target.deliveryFee = null;
};

const assertValidTerms = (terms: ListingPricing): void => {
  const problem = validateListingPricing(terms);
  if (problem) throw createEquipmentError(problem, 400);
};

const isEquipmentCategory = (value: string): value is EquipmentCategory =>
  (EQUIPMENT_CATEGORIES as readonly string[]).includes(value);

const toEquipmentResponse = (
  equipment: IEquipment,
  owner: OwnerSummary,
  equipmentRating: number | null = null,
  equipmentReviewCount = 0,
): EquipmentListItemResponse => ({
  id: equipment._id.toString(),
  owner,
  equipmentRating,
  equipmentReviewCount,
  title: equipment.title,
  description: equipment.description,
  category: equipment.category,
  ...listingPricingOf(equipment),
  location: equipment.location,
  photos: equipment.photos.map((photo) => ({
    url: photo.url,
    publicId: photo.publicId,
  })),
  status: equipment.status,
  createdAt: equipment.createdAt.toISOString(),
  updatedAt: equipment.updatedAt.toISOString(),
});

const getOwnerPhotoMap = async (
  ownerIds: Types.ObjectId[],
): Promise<Map<string, string>> => {
  if (ownerIds.length === 0) {
    return new Map<string, string>();
  }

  const engineers = await Engineer.find({ user: { $in: ownerIds } })
    .select("user profilePhoto")
    .exec();

  return new Map(
    engineers.map((engineer) => [
      engineer.user.toString(),
      engineer.profilePhoto?.url ?? "",
    ]),
  );
};

const getOwnerRatingMap = async (
  ownerIds: Types.ObjectId[],
): Promise<Map<string, { rating: number; reviewCount: number }>> => {
  if (ownerIds.length === 0) {
    return new Map<string, { rating: number; reviewCount: number }>();
  }

  const rows = await Review.aggregate<RatingAggregateRow>([
    {
      $match: {
        engineer: { $in: ownerIds },
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

const getEquipmentRatingMap = async (
  equipmentIds: Types.ObjectId[],
): Promise<Map<string, { rating: number; reviewCount: number }>> => {
  if (equipmentIds.length === 0) {
    return new Map<string, { rating: number; reviewCount: number }>();
  }

  const rows = await Review.aggregate<EquipmentRatingAggregateRow>([
    {
      $match: {
        equipmentBooking: { $exists: true, $ne: null },
      },
    },
    {
      $lookup: {
        from: "equipmentbookings",
        localField: "equipmentBooking",
        foreignField: "_id",
        as: "booking",
      },
    },
    { $unwind: "$booking" },
    {
      $match: {
        "booking.equipment": { $in: equipmentIds },
      },
    },
    {
      $group: {
        _id: "$booking.equipment",
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

const toOwnerSummary = (
  owner: PopulatedOwner,
  ownerPhotos: Map<string, string>,
  ownerRatings: Map<string, { rating: number; reviewCount: number }>,
): OwnerSummary => {
  const userId = owner._id.toString();
  const ratingInfo = ownerRatings.get(userId);

  return {
    userId,
    name: owner.name,
    profilePhotoUrl: ownerPhotos.get(userId) ?? null,
    rating: ratingInfo?.rating ?? null,
    reviewCount: ratingInfo?.reviewCount ?? 0,
  };
};

const toPopulatedOwner = (value: unknown): PopulatedOwner | null => {
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

  return {
    _id: record._id,
    name: record.name,
  };
};

const requireOwnedEquipment = async (
  equipmentId: string,
  ownerId: string,
): Promise<IEquipment> => {
  if (!Types.ObjectId.isValid(equipmentId)) {
    throw createEquipmentError("Invalid equipment ID", 400);
  }

  const equipment = await Equipment.findById(equipmentId).exec();
  if (!equipment) {
    throw createEquipmentError("Equipment listing not found", 404);
  }

  if (equipment.owner.toString() !== ownerId) {
    throw createEquipmentError("You do not own this equipment listing", 403);
  }

  return equipment;
};

export const createEquipment = async (
  req: AuthenticatedRequest<CreateEquipmentBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const ownerId = requireEngineerUser(req);
    const files = Array.isArray(req.files) ? req.files : [];

    const title = req.body.title?.trim();
    const description = req.body.description?.trim();
    const category = req.body.category?.trim();
    const location = req.body.location?.trim();
    const dailyRate = parsePositiveNumber(req.body.dailyRate);
    const securityDeposit = parsePositiveNumber(req.body.securityDeposit);

    if (
      !title ||
      !description ||
      !category ||
      !location ||
      Number.isNaN(dailyRate) ||
      Number.isNaN(securityDeposit)
    ) {
      throw createEquipmentError(
        "Title, description, category, location, and positive price values are required",
        400,
      );
    }

    if (!isEquipmentCategory(category)) {
      throw createEquipmentError("Invalid equipment category", 400);
    }

    if (description.length > 1000) {
      throw createEquipmentError(
        "Description must be 1000 characters or fewer",
        400,
      );
    }

    if (files.length === 0) {
      throw createEquipmentError(
        "At least one equipment photo is required",
        400,
      );
    }

    const terms: ListingPricing = {
      dailyRate,
      weeklyRate: null,
      monthlyRate: null,
      minRentalDays: 1,
      securityDeposit,
      quantity: 1,
      operator: "none",
      operatorDailyRate: null,
      transport: "pickup",
      deliveryFee: null,
    };
    applyListingTerms(req.body, terms);
    assertValidTerms(terms);

    const uploads = await Promise.all(
      files.map((file) =>
        uploadBuffer(file.buffer, {
          folder: "civilhub/equipment",
          resource_type: "image",
        }),
      ),
    );

    const equipment = await Equipment.create({
      owner: ownerId,
      title,
      description,
      category,
      ...terms,
      location,
      photos: uploads.map((item) => ({
        url: item.secure_url,
        publicId: item.public_id,
      })),
    });

    const ownerSummary: OwnerSummary = {
      userId: ownerId,
      name: "You",
      profilePhotoUrl: null,
      rating: null,
      reviewCount: 0,
    };

    res.status(201).json(toEquipmentResponse(equipment, ownerSummary));
  } catch (error: unknown) {
    next(error);
  }
};

export const getMyEquipment = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const ownerId = requireEngineerUser(req);

    const equipment = await Equipment.find({ owner: ownerId })
      .sort({ createdAt: -1 })
      .exec();

    const ownerSummary: OwnerSummary = {
      userId: ownerId,
      name: "You",
      profilePhotoUrl: null,
      rating: null,
      reviewCount: 0,
    };

    res
      .status(200)
      .json(equipment.map((item) => toEquipmentResponse(item, ownerSummary)));
  } catch (error: unknown) {
    next(error);
  }
};

export const updateEquipment = async (
  req: AuthenticatedRequest<UpdateEquipmentBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const ownerId = requireEngineerUser(req);
    const { equipmentId } = getParams(req);
    if (!equipmentId) {
      throw createEquipmentError("Equipment ID is required", 400);
    }

    const equipment = await requireOwnedEquipment(equipmentId, ownerId);

    if (req.body.title !== undefined) {
      const title = req.body.title.trim();
      if (!title) {
        throw createEquipmentError("Title cannot be empty", 400);
      }
      equipment.title = title;
    }

    if (req.body.description !== undefined) {
      const description = req.body.description.trim();
      if (!description) {
        throw createEquipmentError("Description cannot be empty", 400);
      }
      if (description.length > 1000) {
        throw createEquipmentError(
          "Description must be 1000 characters or fewer",
          400,
        );
      }
      equipment.description = description;
    }

    if (req.body.category !== undefined) {
      if (!isEquipmentCategory(req.body.category)) {
        throw createEquipmentError("Invalid equipment category", 400);
      }
      equipment.category = req.body.category;
    }

    if (req.body.dailyRate !== undefined) {
      const dailyRate = parsePositiveNumber(req.body.dailyRate);
      if (Number.isNaN(dailyRate)) {
        throw createEquipmentError("Daily rate must be a positive number", 400);
      }
      equipment.dailyRate = dailyRate;
    }

    if (req.body.securityDeposit !== undefined) {
      const securityDeposit = parsePositiveNumber(req.body.securityDeposit);
      if (Number.isNaN(securityDeposit)) {
        throw createEquipmentError(
          "Security deposit must be a positive number",
          400,
        );
      }
      equipment.securityDeposit = securityDeposit;
    }

    if (req.body.location !== undefined) {
      const location = req.body.location.trim();
      if (!location) {
        throw createEquipmentError("Location cannot be empty", 400);
      }
      equipment.location = location;
    }

    if (req.body.status !== undefined) {
      if (req.body.status !== "active" && req.body.status !== "paused") {
        throw createEquipmentError("Status must be active or paused", 400);
      }
      equipment.status = req.body.status;
    }

    const terms = listingPricingOf(equipment);
    applyListingTerms(req.body, terms);
    assertValidTerms(terms);
    Object.assign(equipment, terms);

    await equipment.save();

    const ownerSummary: OwnerSummary = {
      userId: ownerId,
      name: "You",
      profilePhotoUrl: null,
      rating: null,
      reviewCount: 0,
    };

    res.status(200).json(toEquipmentResponse(equipment, ownerSummary));
  } catch (error: unknown) {
    next(error);
  }
};

export const deleteEquipment = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const ownerId = requireEngineerUser(req);
    const { equipmentId } = getParams(req);
    if (!equipmentId) {
      throw createEquipmentError("Equipment ID is required", 400);
    }

    const equipment = await requireOwnedEquipment(equipmentId, ownerId);

    const liveBooking = await EquipmentBooking.exists({
      equipment: equipment._id,
      status: { $in: ["pending", "approved", "in_progress"] },
    });
    if (liveBooking) {
      throw createEquipmentError(
        "This listing has open or active bookings. Pause it instead, and delete it once they're finished.",
        409,
      );
    }

    await Promise.all(
      equipment.photos.map((photo) => deleteCloudinaryImage(photo.publicId)),
    );

    await equipment.deleteOne();

    res.status(200).json({ message: "Equipment listing deleted" });
  } catch (error: unknown) {
    next(error);
  }
};

export const browseEquipment = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireRenterUser(req);
    const query = getQuery(req);

    const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
    const limit = Math.min(
      24,
      Math.max(1, Number.parseInt(query.limit ?? "12", 10) || 12),
    );

    const filter: Record<string, unknown> = {
      status: "active",
      owner: { $ne: new Types.ObjectId(userId) },
    };

    if (query.category?.trim()) {
      const category = query.category.trim();
      if (!isEquipmentCategory(category)) {
        throw createEquipmentError("Invalid equipment category", 400);
      }
      filter.category = category;
    }

    if (query.location?.trim()) {
      filter.location = {
        $regex: escapeRegex(query.location.trim()),
        $options: "i",
      };
    }

    const minPrice = Number.parseFloat(query.minPrice ?? "");
    const maxPrice = Number.parseFloat(query.maxPrice ?? "");

    if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) {
      filter.dailyRate = {
        ...(Number.isFinite(minPrice) ? { $gte: minPrice } : {}),
        ...(Number.isFinite(maxPrice) ? { $lte: maxPrice } : {}),
      };
    }

    if (query.search?.trim()) {
      const searchRegex = {
        $regex: escapeRegex(query.search.trim()),
        $options: "i",
      };
      filter.$or = [{ title: searchRegex }, { description: searchRegex }];
    }

    const [items, total] = await Promise.all([
      Equipment.find(filter)
        .populate("owner", "name")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      Equipment.countDocuments(filter).exec(),
    ]);

    const owners = items
      .map((item) => toPopulatedOwner(item.owner))
      .filter((owner): owner is PopulatedOwner => owner !== null);

    const ownerIds = owners.map((owner) => owner._id);
    const equipmentIds = items.map((item) => item._id);
    const [ownerPhotos, ownerRatings, equipmentRatings] = await Promise.all([
      getOwnerPhotoMap(ownerIds),
      getOwnerRatingMap(ownerIds),
      getEquipmentRatingMap(equipmentIds),
    ]);

    const ownerById = new Map<string, PopulatedOwner>(
      owners.map((owner) => [owner._id.toString(), owner]),
    );

    const responseItems = items
      .map((item) => {
        const owner = toPopulatedOwner(item.owner);
        if (!owner) {
          return null;
        }

        const mappedOwner = ownerById.get(owner._id.toString());
        if (!mappedOwner) {
          return null;
        }

        const equipmentRatingInfo = equipmentRatings.get(item._id.toString());

        return toEquipmentResponse(
          item,
          toOwnerSummary(mappedOwner, ownerPhotos, ownerRatings),
          equipmentRatingInfo?.rating ?? null,
          equipmentRatingInfo?.reviewCount ?? 0,
        );
      })
      .filter((item): item is EquipmentListItemResponse => item !== null);

    const response: EquipmentBrowseResponse = {
      items: responseItems,
      page,
      limit,
      total,
      hasMore: page * limit < total,
    };

    res.status(200).json(response);
  } catch (error: unknown) {
    next(error);
  }
};

export const getEquipmentById = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    requireRenterUser(req);
    const { equipmentId } = getParams(req);

    if (!equipmentId || !Types.ObjectId.isValid(equipmentId)) {
      throw createEquipmentError("Valid equipment ID is required", 400);
    }

    const equipment = await Equipment.findById(equipmentId)
      .populate("owner", "name")
      .exec();

    if (!equipment) {
      throw createEquipmentError("Equipment listing not found", 404);
    }

    const owner = toPopulatedOwner(equipment.owner);
    if (!owner) {
      throw createEquipmentError("Unable to resolve equipment owner", 500);
    }

    const ownerId = owner._id;
    const [ownerPhotos, ownerRatings] = await Promise.all([
      getOwnerPhotoMap([ownerId]),
      getOwnerRatingMap([ownerId]),
    ]);

    res
      .status(200)
      .json(
        toEquipmentResponse(
          equipment,
          toOwnerSummary(owner, ownerPhotos, ownerRatings),
        ),
      );
  } catch (error: unknown) {
    next(error);
  }
};

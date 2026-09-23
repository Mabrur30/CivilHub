import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type UploadApiOptions, type UploadApiResponse } from "cloudinary";
import cloudinary from "../config/cloudinary";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import {
  Engineer,
  type EngineerCertificate,
  type EngineerPortfolioItem,
  type IEngineer,
} from "../models/Engineer.model";
import { Project } from "../models/Project.model";
import { Review } from "../models/Review.model";
import { Bid } from "../models/Bid.model";

interface EngineerError extends Error {
  statusCode: number;
}

interface PortfolioRequestBody {
  title: string;
  description: string;
}

interface CertificateRequestBody {
  title: string;
}

interface EducationEntryBody {
  institution?: string;
  degree?: string;
  fieldOfStudy?: string;
  graduationYear?: number | null;
}

interface ExperienceEntryBody {
  title?: string;
  organization?: string;
  startYear?: number | null;
  endYear?: number | null;
  description?: string;
}

export interface UpdateEngineerProfileBody {
  bio?: string;
  startingRateMin?: number | null;
  startingRateMax?: number | null;
  location?: string | null;
  education?: EducationEntryBody[];
  experience?: ExperienceEntryBody[];
}

interface SearchEngineersQuery {
  q?: string;
  category?: string;
  location?: string;
  page?: string;
  limit?: string;
  minRating?: string;
  minRate?: string;
  maxRate?: string;
}

interface SearchEngineersAggregationRow {
  userId: string;
  name: string;
  profilePhotoUrl?: string;
  bio: string;
  certificatesCount: number;
}

interface SearchResultView {
  id: string;
  name: string;
  profilePhotoUrl: string | null;
  bio: string;
  location: string | null;
  specialty: string;
  rating: number | null;
  reviewCount: number;
  typicalRate: number | null;
  rateMin: number | null;
  rateMax: number | null;
  isVerified: boolean;
}

interface EngineerParams {
  certificateId?: string;
  portfolioItemId?: string;
}

const createEngineerError = (
  message: string,
  statusCode: number,
): EngineerError => {
  const error = new Error(message) as EngineerError;
  error.statusCode = statusCode;
  return error;
};

const requireEngineer = async (
  req: AuthenticatedRequest,
): Promise<IEngineer> => {
  if (!req.user?.userId || req.user.role !== "engineer") {
    throw createEngineerError("Engineer access required", 403);
  }

  const engineer = await Engineer.findOneAndUpdate(
    { user: req.user.userId },
    {
      $setOnInsert: { user: req.user.userId, certificates: [], portfolio: [] },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).exec();
  if (!engineer) {
    throw createEngineerError("Engineer profile not found", 404);
  }
  return engineer;
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

const deleteCloudinaryAsset = async (
  publicId: string,
  resourceType: "image" | "raw",
): Promise<void> => {
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};

const getFile = (req: AuthenticatedRequest): Express.Multer.File => {
  if (!req.file) {
    throw createEngineerError("A file is required", 400);
  }
  return req.file;
};

const getParams = (req: AuthenticatedRequest): EngineerParams =>
  req.params as unknown as EngineerParams;

const normalizeOptionalText = (
  value: unknown,
  label: string,
  maxLength: number,
): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw createEngineerError(`${label} must be a string`, 400);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.length > maxLength) {
    throw createEngineerError(
      `${label} must be ${maxLength} characters or fewer`,
      400,
    );
  }

  return trimmed;
};

const normalizeYear = (
  value: unknown,
  label: string,
): number | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value)
  ) {
    throw createEngineerError(`${label} must be an integer year`, 400);
  }
  if (value < 1900 || value > 2100) {
    throw createEngineerError(`${label} must be between 1900 and 2100`, 400);
  }

  return value;
};

const normalizeRateValue = (
  value: unknown,
  label: string,
): number | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw createEngineerError(`${label} must be a number`, 400);
  }
  if (value < 0) {
    throw createEngineerError(`${label} cannot be negative`, 400);
  }
  return Math.round(value);
};

const normalizeEducationEntries = (
  value: unknown,
): EducationEntryBody[] | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw createEngineerError("Education must be an array", 400);
  }
  if (value.length > 30) {
    throw createEngineerError("Education can include up to 30 entries", 400);
  }

  return value.flatMap((raw, index) => {
    if (typeof raw !== "object" || raw === null) {
      throw createEngineerError(`Education entry ${index + 1} is invalid`, 400);
    }

    const entry = raw as Record<string, unknown>;
    const institution = normalizeOptionalText(
      entry.institution,
      `Education entry ${index + 1} institution`,
      160,
    );
    const degree = normalizeOptionalText(
      entry.degree,
      `Education entry ${index + 1} degree`,
      120,
    );
    const fieldOfStudy = normalizeOptionalText(
      entry.fieldOfStudy,
      `Education entry ${index + 1} field of study`,
      120,
    );
    const graduationYear = normalizeYear(
      entry.graduationYear,
      `Education entry ${index + 1} graduation year`,
    );

    const hasAnyValue =
      Boolean(institution) ||
      Boolean(degree) ||
      Boolean(fieldOfStudy) ||
      typeof graduationYear === "number";

    if (!hasAnyValue) {
      return [];
    }

    return [
      {
        institution,
        degree,
        fieldOfStudy,
        graduationYear: graduationYear ?? undefined,
      },
    ];
  });
};

const normalizeExperienceEntries = (
  value: unknown,
): ExperienceEntryBody[] | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw createEngineerError("Experience must be an array", 400);
  }
  if (value.length > 30) {
    throw createEngineerError("Experience can include up to 30 entries", 400);
  }

  return value.flatMap((raw, index) => {
    if (typeof raw !== "object" || raw === null) {
      throw createEngineerError(
        `Experience entry ${index + 1} is invalid`,
        400,
      );
    }

    const entry = raw as Record<string, unknown>;
    const title = normalizeOptionalText(
      entry.title,
      `Experience entry ${index + 1} title`,
      160,
    );
    const organization = normalizeOptionalText(
      entry.organization,
      `Experience entry ${index + 1} organization`,
      160,
    );
    const startYear = normalizeYear(
      entry.startYear,
      `Experience entry ${index + 1} start year`,
    );
    const endYear = normalizeYear(
      entry.endYear,
      `Experience entry ${index + 1} end year`,
    );
    const description = normalizeOptionalText(
      entry.description,
      `Experience entry ${index + 1} description`,
      1000,
    );

    if (
      typeof startYear === "number" &&
      typeof endYear === "number" &&
      endYear < startYear
    ) {
      throw createEngineerError(
        `Experience entry ${index + 1} end year must be greater than or equal to start year`,
        400,
      );
    }

    const hasAnyValue =
      Boolean(title) ||
      Boolean(organization) ||
      typeof startYear === "number" ||
      typeof endYear === "number" ||
      Boolean(description);

    if (!hasAnyValue) {
      return [];
    }

    return [
      {
        title,
        organization,
        startYear: typeof startYear === "number" ? startYear : undefined,
        endYear,
        description,
      },
    ];
  });
};

const toEngineerProfile = (engineer: IEngineer) => ({
  bio: engineer.bio ?? "",
  startingRateMin:
    typeof engineer.startingRateMin === "number"
      ? engineer.startingRateMin
      : null,
  startingRateMax:
    typeof engineer.startingRateMax === "number"
      ? engineer.startingRateMax
      : null,
  location: engineer.location?.trim() ? engineer.location.trim() : null,
  education: (engineer.education ?? []).map((entry) => ({
    _id: entry._id.toString(),
    institution: entry.institution?.trim() || null,
    degree: entry.degree?.trim() || null,
    fieldOfStudy: entry.fieldOfStudy?.trim() || null,
    graduationYear:
      typeof entry.graduationYear === "number" ? entry.graduationYear : null,
  })),
  experience: (engineer.experience ?? []).map((entry) => ({
    _id: entry._id.toString(),
    title: entry.title?.trim() || null,
    organization: entry.organization?.trim() || null,
    startYear: typeof entry.startYear === "number" ? entry.startYear : null,
    endYear: typeof entry.endYear === "number" ? entry.endYear : null,
    description: entry.description?.trim() || null,
  })),
  profilePhoto: engineer.profilePhoto,
  certificates: engineer.certificates,
  portfolio: engineer.portfolio,
});

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const truncateBio = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
};

export const getMyEngineerProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const engineer = await requireEngineer(req);
    res.status(200).json(toEngineerProfile(engineer));
  } catch (error: unknown) {
    next(error);
  }
};

export const updateMyEngineerProfile = async (
  req: AuthenticatedRequest<UpdateEngineerProfileBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const engineer = await requireEngineer(req);
    const {
      bio,
      startingRateMin,
      startingRateMax,
      location,
      education,
      experience,
    } = req.body;

    if (bio !== undefined && bio.trim().length > 500) {
      throw createEngineerError("Bio must be 500 characters or fewer", 400);
    }

    const normalizedStartingRateMin = normalizeRateValue(
      startingRateMin,
      "Starting minimum rate",
    );
    const normalizedStartingRateMax = normalizeRateValue(
      startingRateMax,
      "Starting maximum rate",
    );

    const effectiveStartingRateMin =
      normalizedStartingRateMin === undefined
        ? (engineer.startingRateMin ?? null)
        : normalizedStartingRateMin;
    const effectiveStartingRateMax =
      normalizedStartingRateMax === undefined
        ? (engineer.startingRateMax ?? null)
        : normalizedStartingRateMax;

    if (
      typeof effectiveStartingRateMin === "number" &&
      typeof effectiveStartingRateMax === "number" &&
      effectiveStartingRateMin > effectiveStartingRateMax
    ) {
      throw createEngineerError(
        "Starting minimum rate cannot be greater than starting maximum rate",
        400,
      );
    }

    const normalizedLocation =
      location === undefined
        ? undefined
        : (normalizeOptionalText(location, "Location", 160) ?? null);
    const normalizedEducation = normalizeEducationEntries(education);
    const normalizedExperience = normalizeExperienceEntries(experience);

    if (bio !== undefined) {
      engineer.bio = bio.trim();
    }

    if (normalizedStartingRateMin !== undefined) {
      engineer.startingRateMin = normalizedStartingRateMin ?? undefined;
    }

    if (normalizedStartingRateMax !== undefined) {
      engineer.startingRateMax = normalizedStartingRateMax ?? undefined;
    }

    if (normalizedLocation !== undefined) {
      engineer.location = normalizedLocation ?? undefined;
    }

    if (normalizedEducation !== undefined) {
      engineer.set("education", normalizedEducation);
    }

    if (normalizedExperience !== undefined) {
      engineer.set("experience", normalizedExperience);
    }

    await engineer.save();
    res.status(200).json(toEngineerProfile(engineer));
  } catch (error: unknown) {
    next(error);
  }
};

export const searchEngineers = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.user?.userId) {
      throw createEngineerError("Authentication required", 401);
    }

    const query = req.query as unknown as SearchEngineersQuery;
    const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(query.limit ?? "20", 10) || 20),
    );
    const searchText = query.q?.trim() ?? "";
    const categoryFilter = query.category?.trim().toLowerCase() ?? "";
    const locationFilter = query.location?.trim().toLowerCase() ?? "";
    const minRating =
      query.minRating !== undefined
        ? Number.parseFloat(query.minRating)
        : Number.NaN;
    const minRate =
      query.minRate !== undefined
        ? Number.parseFloat(query.minRate)
        : Number.NaN;
    const maxRate =
      query.maxRate !== undefined
        ? Number.parseFloat(query.maxRate)
        : Number.NaN;

    const escaped = searchText ? escapeRegex(searchText) : "";
    const regexFilter = escaped
      ? {
          $or: [
            { "userData.name": { $regex: escaped, $options: "i" } },
            { bio: { $regex: escaped, $options: "i" } },
          ],
        }
      : {};

    const rows = await Engineer.aggregate<SearchEngineersAggregationRow>([
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userData",
        },
      },
      { $unwind: "$userData" },
      {
        $match: {
          "userData.role": "engineer",
          ...regexFilter,
        },
      },
      { $sort: { "userData.name": 1 } },
      {
        $project: {
          _id: 0,
          userId: { $toString: "$userData._id" },
          name: "$userData.name",
          profilePhotoUrl: "$profilePhoto.url",
          bio: { $ifNull: ["$bio", ""] },
          certificatesCount: {
            $size: {
              $ifNull: ["$certificates", []],
            },
          },
        },
      },
    ]).exec();

    const engineerIds = rows.map((row) => row.userId);
    if (engineerIds.length === 0) {
      res.status(200).json({ engineers: [], page, limit, total: 0 });
      return;
    }

    const engineerObjectIds = engineerIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (engineerObjectIds.length === 0) {
      res.status(200).json({ engineers: [], page, limit, total: 0 });
      return;
    }

    const [reviewStats, acceptedBidStats, projectRows] = await Promise.all([
      Review.aggregate<{
        _id: string;
        averageRating: number;
        reviewCount: number;
      }>([
        {
          $match: {
            engineer: { $in: engineerObjectIds },
            project: { $exists: true },
          },
        },
        {
          $group: {
            _id: "$engineer",
            averageRating: { $avg: "$rating" },
            reviewCount: { $sum: 1 },
          },
        },
      ]).exec(),
      Bid.aggregate<{
        _id: string;
        minRate: number;
        maxRate: number;
        averageRate: number;
      }>([
        {
          $match: {
            engineer: { $in: engineerObjectIds },
            status: "accepted",
          },
        },
        {
          $group: {
            _id: "$engineer",
            minRate: { $min: "$amount" },
            maxRate: { $max: "$amount" },
            averageRate: { $avg: "$amount" },
          },
        },
      ]).exec(),
      Project.find({
        assignedEngineer: { $in: engineerObjectIds },
      })
        .select("assignedEngineer category location")
        .lean()
        .exec(),
    ]);

    const reviewByEngineer = new Map(
      reviewStats.map((row) => [
        row._id.toString(),
        {
          rating: Math.round(row.averageRating * 10) / 10,
          reviewCount: row.reviewCount,
        },
      ]),
    );

    const rateByEngineer = new Map(
      acceptedBidStats.map((row) => [
        row._id.toString(),
        {
          minRate: row.minRate,
          maxRate: row.maxRate,
          averageRate: Math.round(row.averageRate),
        },
      ]),
    );

    const projectFacetsByEngineer = new Map<
      string,
      {
        categories: string[];
        locations: string[];
      }
    >();

    projectRows.forEach((project) => {
      const engineerId =
        typeof project.assignedEngineer === "string"
          ? project.assignedEngineer
          : project.assignedEngineer?.toString();
      if (!engineerId) {
        return;
      }

      const current = projectFacetsByEngineer.get(engineerId) ?? {
        categories: [],
        locations: [],
      };

      if (typeof project.category === "string" && project.category.trim()) {
        current.categories.push(project.category.trim());
      }
      if (typeof project.location === "string" && project.location.trim()) {
        current.locations.push(project.location.trim());
      }

      projectFacetsByEngineer.set(engineerId, current);
    });

    const mostFrequent = (values: string[], fallback: string): string => {
      if (values.length === 0) {
        return fallback;
      }

      const counts = new Map<string, number>();
      values.forEach((value) => {
        counts.set(value, (counts.get(value) ?? 0) + 1);
      });

      const [winner] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      return winner;
    };

    const engineers: SearchResultView[] = rows
      .map((row) => {
        const reviewStatsForEngineer = reviewByEngineer.get(row.userId) ?? {
          rating: null,
          reviewCount: 0,
        };
        const rateStatsForEngineer = rateByEngineer.get(row.userId) ?? {
          minRate: null,
          maxRate: null,
          averageRate: null,
        };
        const projectFacets = projectFacetsByEngineer.get(row.userId) ?? {
          categories: [],
          locations: [],
        };

        const specialty = mostFrequent(projectFacets.categories, "General");
        const location =
          projectFacets.locations.length > 0
            ? mostFrequent(projectFacets.locations, "")
            : null;

        return {
          id: row.userId,
          name: row.name,
          profilePhotoUrl: row.profilePhotoUrl ?? null,
          bio: truncateBio(row.bio, 180),
          location,
          specialty,
          rating: reviewStatsForEngineer.rating,
          reviewCount: reviewStatsForEngineer.reviewCount,
          typicalRate: rateStatsForEngineer.averageRate,
          rateMin: rateStatsForEngineer.minRate,
          rateMax: rateStatsForEngineer.maxRate,
          isVerified: row.certificatesCount > 0,
        };
      })
      .filter((engineer) => {
        if (
          categoryFilter &&
          !engineer.specialty.toLowerCase().includes(categoryFilter)
        ) {
          return false;
        }

        if (
          locationFilter &&
          !(engineer.location ?? "").toLowerCase().includes(locationFilter)
        ) {
          return false;
        }

        if (!Number.isNaN(minRating)) {
          if (engineer.rating === null || engineer.rating < minRating) {
            return false;
          }
        }

        if (!Number.isNaN(minRate)) {
          if (engineer.typicalRate === null || engineer.typicalRate < minRate) {
            return false;
          }
        }

        if (!Number.isNaN(maxRate)) {
          if (engineer.typicalRate === null || engineer.typicalRate > maxRate) {
            return false;
          }
        }

        return true;
      });

    const total = engineers.length;
    const pagedEngineers = engineers.slice((page - 1) * limit, page * limit);

    res.status(200).json({
      engineers: pagedEngineers,
      page,
      limit,
      total,
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const uploadProfilePhoto = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const engineer = await requireEngineer(req);
    const file = getFile(req);
    const result = await uploadBuffer(file.buffer, {
      folder: "civilhub/profile-photos",
      resource_type: "image",
    });

    const oldPhotoPublicId = engineer.profilePhoto?.publicId;
    const oldPhotoResourceType = engineer.profilePhoto?.resourceType;
    engineer.profilePhoto = {
      url: result.secure_url,
      fileUrl: result.secure_url,
      publicId: result.public_id,
      resourceType: "image",
    };
    await engineer.save();
    if (oldPhotoPublicId && oldPhotoResourceType) {
      await deleteCloudinaryAsset(oldPhotoPublicId, oldPhotoResourceType);
    }

    res.status(200).json({ profilePhotoUrl: result.secure_url });
  } catch (error: unknown) {
    next(error);
  }
};

export const uploadCertificate = async (
  req: AuthenticatedRequest<CertificateRequestBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const engineer = await requireEngineer(req);
    const file = getFile(req);
    const title = req.body.title?.trim();
    if (!title) {
      throw createEngineerError("Certificate title is required", 400);
    }

    const result = await uploadBuffer(file.buffer, {
      folder: "civilhub/certificates",
      resource_type: "auto",
    });
    engineer.certificates.push({
      title,
      fileUrl: result.secure_url,
      publicId: result.public_id,
      resourceType: result.resource_type === "raw" ? "raw" : "image",
      uploadedAt: new Date(),
    } as EngineerCertificate);
    await engineer.save();

    res.status(201).json({ certificates: engineer.certificates });
  } catch (error: unknown) {
    next(error);
  }
};

export const deleteCertificate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const engineer = await requireEngineer(req);
    const { certificateId } = getParams(req);
    if (!certificateId) {
      throw createEngineerError("Certificate ID is required", 400);
    }
    const certificate = engineer.certificates.id(certificateId);
    if (!certificate) {
      throw createEngineerError("Certificate not found", 404);
    }

    await deleteCloudinaryAsset(certificate.publicId, certificate.resourceType);
    certificate.deleteOne();
    await engineer.save();
    res.status(200).json({ certificates: engineer.certificates });
  } catch (error: unknown) {
    next(error);
  }
};

export const uploadPortfolioItem = async (
  req: AuthenticatedRequest<PortfolioRequestBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const engineer = await requireEngineer(req);
    const file = getFile(req);
    const title = req.body.title?.trim();
    const description = req.body.description?.trim();
    if (!title || !description) {
      throw createEngineerError(
        "Portfolio title and description are required",
        400,
      );
    }

    const result = await uploadBuffer(file.buffer, {
      folder: "civilhub/portfolio",
      resource_type: "image",
    });
    engineer.portfolio.push({
      title,
      description,
      imageUrl: result.secure_url,
      fileUrl: result.secure_url,
      publicId: result.public_id,
      resourceType: "image",
      uploadedAt: new Date(),
    } as EngineerPortfolioItem);
    await engineer.save();

    res.status(201).json({ portfolio: engineer.portfolio });
  } catch (error: unknown) {
    next(error);
  }
};

export const deletePortfolioItem = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const engineer = await requireEngineer(req);
    const { portfolioItemId } = getParams(req);
    if (!portfolioItemId) {
      throw createEngineerError("Portfolio item ID is required", 400);
    }
    const item = engineer.portfolio.id(portfolioItemId);
    if (!item) {
      throw createEngineerError("Portfolio item not found", 404);
    }

    await deleteCloudinaryAsset(item.publicId, item.resourceType);
    item.deleteOne();
    await engineer.save();
    res.status(200).json({ portfolio: engineer.portfolio });
  } catch (error: unknown) {
    next(error);
  }
};

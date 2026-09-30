import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { deleteCloudinaryAsset, uploadBuffer } from "../utils/cloudinaryUpload";
import { restrictedUserIds } from "../utils/accountStatus";
import { blockedUserIds } from "../utils/blocks";
import { onlyDisciplines } from "../utils/disciplines";
import {
  DISCIPLINE_LIMIT,
  Engineer,
  isEngineerDiscipline,
  type EngineerDiscipline,
  type EngineerCertificate,
  type EngineerPortfolioItem,
  type IEngineer,
} from "../models/Engineer.model";
import { Organisation } from "../models/Organisation.model";
import { Project } from "../models/Project.model";
import { Review } from "../models/Review.model";

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
  disciplines?: unknown;
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
  /** "engineer" or "company"; both when absent. */
  type?: string;
}

interface SearchEngineersAggregationRow {
  userId: string;
  name: string;
  profilePhotoUrl?: string;
  bio: string;
  certificatesCount: number;
  role: "engineer" | "organisation";
  /** What their own profile says: disciplines for engineers, specialties for companies. */
  profileLocation?: string;
  specialties?: string[];
  teamSize?: string;
  yearFounded?: number;
  startingRateMin?: number | null;
  startingRateMax?: number | null;
}

interface SearchResultView {
  id: string;
  name: string;
  role: "engineer" | "organisation";
  profilePhotoUrl: string | null;
  bio: string;
  location: string | null;
  /** Their main discipline, or null when they haven't chosen one. */
  specialty: string | null;
  rating: number | null;
  reviewCount: number;
  /** The starting rate the engineer states, never amounts from won bids. */
  rateMin: number | null;
  rateMax: number | null;
  /** Certificates the engineer uploaded. Nobody has checked them yet. */
  certificateCount: number;
  /** Disciplines or specialties from their profile. */
  tags: string[];
  teamSize: string | null;
  yearFounded: number | null;
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
  disciplines: engineer.disciplines ?? [],
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

const normalizeDisciplines = (
  value: unknown,
): EngineerDiscipline[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every(isEngineerDiscipline)) {
    throw createEngineerError("Choose disciplines from the list", 400);
  }
  const unique = [...new Set(value)];
  if (unique.length > DISCIPLINE_LIMIT) {
    throw createEngineerError(
      `Choose at most ${DISCIPLINE_LIMIT} disciplines`,
      400,
    );
  }
  return unique;
};

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
      disciplines,
    } = req.body;
    const normalizedDisciplines = normalizeDisciplines(disciplines);

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

    if (normalizedDisciplines !== undefined) {
      engineer.set("disciplines", normalizedDisciplines);
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
            { disciplines: { $regex: escaped, $options: "i" } },
          ],
        }
      : {};

    const type = query.type?.trim().toLowerCase();
    const userLookup = [
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userData",
        },
      },
      { $unwind: "$userData" },
    ];

    const engineerRows =
      type === "company"
        ? []
        : await Engineer.aggregate<SearchEngineersAggregationRow>([
            ...userLookup,
            {
              $match: {
                "userData.role": "engineer",
                ...regexFilter,
              },
            },
            {
              $project: {
                _id: 0,
                userId: { $toString: "$userData._id" },
                name: "$userData.name",
                role: "engineer",
                profilePhotoUrl: "$profilePhoto.url",
                bio: { $ifNull: ["$bio", ""] },
                certificatesCount: {
                  $size: {
                    $ifNull: ["$certificates", []],
                  },
                },
                profileLocation: "$location",
                specialties: { $ifNull: ["$disciplines", []] },
                startingRateMin: { $ifNull: ["$startingRateMin", null] },
                startingRateMax: { $ifNull: ["$startingRateMax", null] },
              },
            },
          ]).exec();

    // Companies that take on project work sit alongside engineers; rental-only
    // firms are found through their equipment listings instead.
    const companyRows =
      type === "engineer"
        ? []
        : await Organisation.aggregate<SearchEngineersAggregationRow>([
            ...userLookup,
            {
              $match: {
                "userData.role": "organisation",
                services: "projects",
                ...(escaped
                  ? {
                      $or: [
                        { "userData.name": { $regex: escaped, $options: "i" } },
                        { about: { $regex: escaped, $options: "i" } },
                        { specialties: { $regex: escaped, $options: "i" } },
                      ],
                    }
                  : {}),
              },
            },
            {
              $project: {
                _id: 0,
                userId: { $toString: "$userData._id" },
                name: "$userData.name",
                role: "organisation",
                profilePhotoUrl: "$logo.url",
                bio: { $ifNull: ["$about", ""] },
                certificatesCount: { $literal: 0 },
                profileLocation: "$location",
                specialties: "$specialties",
                teamSize: "$teamSize",
                yearFounded: "$yearFounded",
              },
            },
          ]).exec();

    // Blocks work both ways, so neither side finds the other in search.
    // Suspended and banned accounts are left out for everyone.
    const [hidden, restricted] = await Promise.all([
      blockedUserIds(req.user.userId),
      restrictedUserIds(),
    ]);
    restricted.forEach((id) => hidden.add(id));
    hidden.add(req.user.userId);
    const rows = [...engineerRows, ...companyRows]
      .filter((row) => !hidden.has(row.userId))
      .sort((a, b) => a.name.localeCompare(b.name));

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

    const [reviewStats, projectRows] = await Promise.all([
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

    const engineers = rows
      .map((row) => {
        const reviewStatsForEngineer = reviewByEngineer.get(row.userId) ?? {
          rating: null,
          reviewCount: 0,
        };
        const projectFacets = projectFacetsByEngineer.get(row.userId) ?? {
          categories: [],
          locations: [],
        };

        // Only what they chose themselves; never guessed from past projects.
        const tags = onlyDisciplines(row.specialties);
        const specialty = tags[0] ?? null;
        const location =
          row.profileLocation?.trim() ||
          (projectFacets.locations.length > 0
            ? mostFrequent(projectFacets.locations, "")
            : null);

        return {
          id: row.userId,
          name: row.name,
          role: row.role,
          teamSize: row.teamSize ?? null,
          yearFounded: row.yearFounded ?? null,
          profilePhotoUrl: row.profilePhotoUrl ?? null,
          bio: truncateBio(row.bio, 180),
          location,
          specialty,
          rating: reviewStatsForEngineer.rating,
          reviewCount: reviewStatsForEngineer.reviewCount,
          rateMin: row.startingRateMin ?? null,
          rateMax: row.startingRateMax ?? null,
          certificateCount: row.certificatesCount,
          tags,
          categories: projectFacets.categories,
        };
      })
      .filter((engineer) => {
        if (
          categoryFilter &&
          !engineer.tags.some((value) => value.toLowerCase().includes(categoryFilter))
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

        // Rate filters match the stated range: keep anyone whose range
        // overlaps the one asked for, and leave out anyone with no rate.
        if (!Number.isNaN(minRate) || !Number.isNaN(maxRate)) {
          const low = engineer.rateMin ?? engineer.rateMax;
          const high = engineer.rateMax ?? engineer.rateMin;
          if (low === null || high === null) return false;
          if (!Number.isNaN(minRate) && high < minRate) return false;
          if (!Number.isNaN(maxRate) && low > maxRate) return false;
        }

        return true;
      });

    const total = engineers.length;
    const pagedEngineers: SearchResultView[] = engineers
      .slice((page - 1) * limit, page * limit)
      .map(({ categories: _categories, ...engineer }) => engineer);

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

// Editing keeps the uploaded file; to change the file, delete and add again.
const requireEditText = (value: unknown, label: string, maxLength: number): string => {
  const text = normalizeOptionalText(value, label, maxLength);
  if (!text) throw createEngineerError(`${label} is required`, 400);
  return text;
};

export const updateCertificate = async (
  req: AuthenticatedRequest<{ title?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const engineer = await requireEngineer(req);
    const certificate = engineer.certificates.id(getParams(req).certificateId ?? "");
    if (!certificate) {
      throw createEngineerError("Certificate not found", 404);
    }
    certificate.title = requireEditText(req.body.title, "Certificate title", 160);
    await engineer.save();
    res.status(200).json({ certificates: engineer.certificates });
  } catch (error: unknown) {
    next(error);
  }
};

export const updatePortfolioItem = async (
  req: AuthenticatedRequest<{ title?: unknown; description?: unknown }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const engineer = await requireEngineer(req);
    const item = engineer.portfolio.id(getParams(req).portfolioItemId ?? "");
    if (!item) {
      throw createEngineerError("Portfolio item not found", 404);
    }
    item.title = requireEditText(req.body.title, "Portfolio title", 160);
    item.description = requireEditText(req.body.description, "Portfolio description", 1000);
    await engineer.save();
    res.status(200).json({ portfolio: engineer.portfolio });
  } catch (error: unknown) {
    next(error);
  }
};

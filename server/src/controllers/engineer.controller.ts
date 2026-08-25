import { type NextFunction, type Response } from "express";
import { type UploadApiOptions, type UploadApiResponse } from "cloudinary";
import cloudinary from "../config/cloudinary";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import {
  Engineer,
  type EngineerCertificate,
  type EngineerPortfolioItem,
  type IEngineer,
} from "../models/Engineer.model";

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

export interface UpdateEngineerProfileBody {
  bio?: string;
}

interface SearchEngineersQuery {
  q?: string;
  category?: string;
  location?: string;
  page?: string;
  limit?: string;
}

interface SearchEngineersAggregationRow {
  id: string;
  name: string;
  profilePhotoUrl?: string;
  bio: string;
}

interface SearchEngineersAggregationResult {
  items: SearchEngineersAggregationRow[];
  total: Array<{ count: number }>;
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

const toEngineerProfile = (engineer: IEngineer) => ({
  bio: engineer.bio ?? "",
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
    const { bio } = req.body;

    if (bio !== undefined && bio.trim().length > 500) {
      throw createEngineerError("Bio must be 500 characters or fewer", 400);
    }

    if (bio !== undefined) {
      engineer.bio = bio.trim();
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

    const escaped = searchText ? escapeRegex(searchText) : "";
    const regexFilter = escaped
      ? {
          $or: [
            { "userData.name": { $regex: escaped, $options: "i" } },
            { bio: { $regex: escaped, $options: "i" } },
          ],
        }
      : {};

    const [aggregation] =
      await Engineer.aggregate<SearchEngineersAggregationResult>([
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
          $facet: {
            items: [
              { $skip: (page - 1) * limit },
              { $limit: limit },
              {
                $project: {
                  _id: 0,
                  id: { $toString: "$userData._id" },
                  name: "$userData.name",
                  profilePhotoUrl: "$profilePhoto.url",
                  bio: { $ifNull: ["$bio", ""] },
                },
              },
            ],
            total: [{ $count: "count" }],
          },
        },
      ]).exec();

    const rows = aggregation?.items ?? [];
    const total = aggregation?.total[0]?.count ?? 0;

    res.status(200).json({
      engineers: rows.map((row) => ({
        id: row.id,
        name: row.name,
        profilePhotoUrl: row.profilePhotoUrl ?? null,
        bio: truncateBio(row.bio, 180),
        location: null,
      })),
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

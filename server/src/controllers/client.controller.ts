import { type NextFunction, type Response } from "express";
import cloudinary, { uploadBuffer } from "../config/cloudinary";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import {
  CLIENT_TYPES,
  Client,
  type ClientType,
  type IClient,
} from "../models/Client.model";
import { User } from "../models/User.model";

export interface UpdateClientProfileBody {
  phone?: string;
  companyName?: string;
  bio?: string;
  clientType?: ClientType | null;
  location?: string;
}

interface ClientError extends Error {
  statusCode: number;
}

const createClientError = (
  message: string,
  statusCode: number,
): ClientError => {
  const error = new Error(message) as ClientError;
  error.statusCode = statusCode;
  return error;
};

const requireClient = async (req: AuthenticatedRequest): Promise<IClient> => {
  if (!req.user?.userId || req.user.role !== "client") {
    throw createClientError("Client access required", 403);
  }

  const client = await Client.findOneAndUpdate(
    { user: req.user.userId },
    { $setOnInsert: { user: req.user.userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).exec();
  if (!client) {
    throw createClientError("Client profile not found", 404);
  }
  return client;
};

const toClientProfile = async (client: IClient) => {
  const user = await User.findById(client.user).select("name email").exec();
  if (!user) {
    throw createClientError("User not found", 404);
  }
  return {
    id: client._id.toString(),
    userId: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: client.phone ?? "",
    companyName: client.companyName ?? "",
    bio: client.bio ?? "",
    clientType: client.clientType ?? null,
    location: client.location ?? "",
    profilePhotoUrl: client.profilePhoto?.url ?? null,
  };
};

const isClientType = (value: unknown): value is ClientType =>
  typeof value === "string" &&
  (CLIENT_TYPES as readonly string[]).includes(value);

export const getMyClientProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const client = await requireClient(req);
    res.status(200).json(await toClientProfile(client));
  } catch (error: unknown) {
    next(error);
  }
};

export const updateMyClientProfile = async (
  req: AuthenticatedRequest<UpdateClientProfileBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const client = await requireClient(req);
    const { phone, companyName, bio, clientType, location } = req.body;
    if (
      phone !== undefined &&
      phone.trim() !== "" &&
      (phone.trim().length < 7 || phone.trim().length > 30)
    ) {
      throw createClientError("Phone must be between 7 and 30 characters", 400);
    }
    if (companyName !== undefined && companyName.trim().length > 120) {
      throw createClientError(
        "Company name must be 120 characters or fewer",
        400,
      );
    }
    if (bio !== undefined && bio.trim().length > 500) {
      throw createClientError("Bio must be 500 characters or fewer", 400);
    }
    if (
      clientType !== undefined &&
      clientType !== null &&
      !isClientType(clientType)
    ) {
      throw createClientError("Choose a valid client type", 400);
    }
    if (location !== undefined && location.trim().length > 120) {
      throw createClientError("Location must be 120 characters or fewer", 400);
    }

    if (phone !== undefined) client.phone = phone.trim();
    if (companyName !== undefined) client.companyName = companyName.trim();
    if (bio !== undefined) client.bio = bio.trim();
    if (clientType !== undefined) client.clientType = clientType ?? undefined;
    if (location !== undefined) client.location = location.trim();
    await client.save();
    res.status(200).json(await toClientProfile(client));
  } catch (error: unknown) {
    next(error);
  }
};

export const uploadClientProfilePhoto = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const client = await requireClient(req);
    if (!req.file) {
      throw createClientError("A file is required", 400);
    }
    const result = await uploadBuffer(req.file.buffer, {
      folder: "civilhub/profile-photos",
      resource_type: "image",
    });

    const oldPhoto = client.profilePhoto;
    client.profilePhoto = {
      url: result.secure_url,
      fileUrl: result.secure_url,
      publicId: result.public_id,
      resourceType: "image",
    };
    await client.save();
    if (oldPhoto?.publicId) {
      await cloudinary.uploader.destroy(oldPhoto.publicId, {
        resource_type: oldPhoto.resourceType,
      });
    }

    res.status(200).json({ profilePhotoUrl: result.secure_url });
  } catch (error: unknown) {
    next(error);
  }
};

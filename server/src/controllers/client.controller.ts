import { type NextFunction, type Response } from "express";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Client, type IClient } from "../models/Client.model";
import { User } from "../models/User.model";

export interface UpdateClientProfileBody {
  phone?: string;
  companyName?: string;
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
  };
};

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
    const { phone, companyName } = req.body;
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

    if (phone !== undefined) client.phone = phone.trim();
    if (companyName !== undefined) client.companyName = companyName.trim();
    await client.save();
    res.status(200).json(await toClientProfile(client));
  } catch (error: unknown) {
    next(error);
  }
};

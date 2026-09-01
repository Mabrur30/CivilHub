import { type NextFunction, type Response } from "express";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Connection } from "../models/Connection.model";
import { Client } from "../models/Client.model";
import { Engineer } from "../models/Engineer.model";
import { Project } from "../models/Project.model";
import { User, type UserRole } from "../models/User.model";
import { Review } from "../models/Review.model";
import type { ConnectionViewStatus } from "./network.controller";

interface UserParams {
  userId?: string;
}
interface UserError extends Error {
  statusCode: number;
}

const createUserError = (message: string, statusCode: number): UserError => {
  const error = new Error(message) as UserError;
  error.statusCode = statusCode;
  return error;
};

const getUserId = (req: AuthenticatedRequest): string => {
  if (!req.user?.userId) throw createUserError("Authentication required", 401);
  return req.user.userId;
};

const getParams = (req: AuthenticatedRequest): UserParams =>
  req.params as unknown as UserParams;

const getEngineerRating = async (
  userId: string,
): Promise<{ rating: number | null; reviewCount: number }> => {
  const rows = await Review.aggregate<{
    averageRating: number;
    reviewCount: number;
  }>([
    { $match: { engineer: userId } },
    {
      $group: {
        _id: "$engineer",
        averageRating: { $avg: "$rating" },
        reviewCount: { $sum: 1 },
      },
    },
  ]).exec();
  return rows[0]
    ? {
        rating: Math.round(rows[0].averageRating * 10) / 10,
        reviewCount: rows[0].reviewCount,
      }
    : { rating: null, reviewCount: 0 };
};

const getConnectionDetails = async (
  requester: string,
  target: string,
): Promise<{ status: ConnectionViewStatus; connectionId: string | null }> => {
  if (requester === target) return { status: "connected", connectionId: null };
  const connection = await Connection.findOne({
    $or: [
      { requester, recipient: target },
      { requester: target, recipient: requester },
    ],
  }).exec();
  if (!connection) return { status: "not_connected", connectionId: null };
  if (connection.status === "accepted") {
    return { status: "connected", connectionId: connection._id.toString() };
  }
  if (connection.status === "pending")
    return {
      status:
        connection.requester.toString() === requester
          ? "pending_sent"
          : "pending_received",
      connectionId: connection._id.toString(),
    };
  return { status: "not_connected", connectionId: null };
};

export const getPublicProfile = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const requesterId = getUserId(req);
    const { userId } = getParams(req);
    if (!userId) throw createUserError("User ID is required", 400);
    const user = await User.findById(userId).select("name role").exec();
    if (!user) throw createUserError("User not found", 404);
    const connection = await getConnectionDetails(requesterId, userId);

    if (user.role === "engineer") {
      const engineer = await Engineer.findOne({ user: user._id }).exec();
      const engineerRating = await getEngineerRating(user._id.toString());
      res.status(200).json({
        userId: user._id.toString(),
        name: user.name,
        role: user.role,
        profilePhotoUrl: engineer?.profilePhoto?.url ?? null,
        bio: engineer?.bio ?? "",
        portfolio:
          engineer?.portfolio.map((item) => ({
            title: item.title,
            description: item.description,
            imageUrl: item.imageUrl,
            uploadedAt: item.uploadedAt.toISOString(),
          })) ?? [],
        certificates:
          engineer?.certificates.map((certificate) => ({
            title: certificate.title,
            uploadedAt: certificate.uploadedAt.toISOString(),
          })) ?? [],
        connectionStatus: connection.status,
        connectionId: connection.connectionId,
        rating: engineerRating.rating,
        reviewCount: engineerRating.reviewCount,
      });
      return;
    }

    const client = await Client.findOne({ user: user._id }).exec();
    const completedProjects = await Project.countDocuments({
      client: user._id,
      status: "completed",
    });
    res.status(200).json({
      userId: user._id.toString(),
      name: user.name,
      role: user.role,
      profilePhotoUrl: null,
      bio: client?.bio ?? "",
      companyName: client?.companyName ?? "",
      completedProjects,
      connectionStatus: connection.status,
      connectionId: connection.connectionId,
      rating: null,
      reviewCount: 0,
    });
  } catch (error: unknown) {
    next(error);
  }
};

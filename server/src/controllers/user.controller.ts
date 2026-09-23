import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Connection } from "../models/Connection.model";
import { Client } from "../models/Client.model";
import { Engineer } from "../models/Engineer.model";
import { Project } from "../models/Project.model";
import { User, type UserRole } from "../models/User.model";
import { Review } from "../models/Review.model";
import { Bid } from "../models/Bid.model";
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
  if (!Types.ObjectId.isValid(userId)) {
    return { rating: null, reviewCount: 0 };
  }

  const engineerId = new Types.ObjectId(userId);
  const rows = await Review.aggregate<{
    averageRating: number;
    reviewCount: number;
  }>([
    {
      $match: {
        engineer: engineerId,
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
  return rows[0]
    ? {
        rating: Math.round(rows[0].averageRating * 10) / 10,
        reviewCount: rows[0].reviewCount,
      }
    : { rating: null, reviewCount: 0 };
};

const getEngineerRateStats = async (
  userId: string,
): Promise<{
  typicalRate: number | null;
  rateMin: number | null;
  rateMax: number | null;
  acceptedBidCount: number;
}> => {
  if (!Types.ObjectId.isValid(userId)) {
    return {
      typicalRate: null,
      rateMin: null,
      rateMax: null,
      acceptedBidCount: 0,
    };
  }

  const engineerId = new Types.ObjectId(userId);
  const rows = await Bid.aggregate<{
    averageRate: number;
    minRate: number;
    maxRate: number;
    acceptedBidCount: number;
  }>([
    {
      $match: {
        engineer: engineerId,
        status: "accepted",
      },
    },
    {
      $group: {
        _id: "$engineer",
        averageRate: { $avg: "$amount" },
        minRate: { $min: "$amount" },
        maxRate: { $max: "$amount" },
        acceptedBidCount: { $sum: 1 },
      },
    },
  ]).exec();

  if (!rows[0]) {
    return {
      typicalRate: null,
      rateMin: null,
      rateMax: null,
      acceptedBidCount: 0,
    };
  }

  return {
    typicalRate: Math.round(rows[0].averageRate),
    rateMin: rows[0].minRate,
    rateMax: rows[0].maxRate,
    acceptedBidCount: rows[0].acceptedBidCount,
  };
};

const getEngineerDerivedLocation = async (
  userId: string,
): Promise<{
  derivedLocation: string | null;
  completedProjectCount: number;
}> => {
  if (!Types.ObjectId.isValid(userId)) {
    return { derivedLocation: null, completedProjectCount: 0 };
  }

  const engineerId = new Types.ObjectId(userId);
  const rows = await Project.aggregate<{
    _id: string;
    projectCount: number;
  }>([
    {
      $match: {
        assignedEngineer: engineerId,
        status: "completed",
        location: { $exists: true, $nin: [null, ""] },
      },
    },
    {
      $group: {
        _id: "$location",
        projectCount: { $sum: 1 },
      },
    },
    { $sort: { projectCount: -1, _id: 1 } },
  ]).exec();

  const completedProjectCount = rows.reduce(
    (total, row) => total + row.projectCount,
    0,
  );

  return {
    derivedLocation: rows[0]?._id ?? null,
    completedProjectCount,
  };
};

const getConnectionsCount = async (userId: string): Promise<number> =>
  Connection.countDocuments({
    $or: [{ requester: userId }, { recipient: userId }],
    status: "accepted",
  }).exec();

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
    const connectionsCount = await getConnectionsCount(userId);

    if (user.role === "engineer") {
      const engineer = await Engineer.findOne({ user: user._id }).exec();
      const [engineerRating, rateStats, derivedLocationStats] =
        await Promise.all([
          getEngineerRating(user._id.toString()),
          getEngineerRateStats(user._id.toString()),
          getEngineerDerivedLocation(user._id.toString()),
        ]);
      const completedWork = await Project.find({
        assignedEngineer: user._id,
        status: "completed",
      })
        .select("_id title name category location completedAt totalAgreedValue")
        .sort({ completedAt: -1, updatedAt: -1 })
        .limit(12)
        .exec();

      res.status(200).json({
        userId: user._id.toString(),
        name: user.name,
        role: user.role,
        profilePhotoUrl: engineer?.profilePhoto?.url ?? null,
        bio: engineer?.bio ?? "",
        connectionsCount,
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
        startingRateMin:
          typeof engineer?.startingRateMin === "number"
            ? engineer.startingRateMin
            : null,
        startingRateMax:
          typeof engineer?.startingRateMax === "number"
            ? engineer.startingRateMax
            : null,
        location: engineer?.location?.trim() ? engineer.location.trim() : null,
        education: (engineer?.education ?? []).map((entry) => ({
          id: entry._id.toString(),
          institution: entry.institution?.trim() || null,
          degree: entry.degree?.trim() || null,
          fieldOfStudy: entry.fieldOfStudy?.trim() || null,
          graduationYear:
            typeof entry.graduationYear === "number"
              ? entry.graduationYear
              : null,
        })),
        experience: (engineer?.experience ?? []).map((entry) => ({
          id: entry._id.toString(),
          title: entry.title?.trim() || null,
          organization: entry.organization?.trim() || null,
          startYear:
            typeof entry.startYear === "number" ? entry.startYear : null,
          endYear: typeof entry.endYear === "number" ? entry.endYear : null,
          description: entry.description?.trim() || null,
        })),
        typicalRate: rateStats.typicalRate,
        rateMin: rateStats.rateMin,
        rateMax: rateStats.rateMax,
        acceptedBidCount: rateStats.acceptedBidCount,
        derivedLocation: derivedLocationStats.derivedLocation,
        completedLocationProjectCount:
          derivedLocationStats.completedProjectCount,
        completedWork: completedWork.map((project) => ({
          id: project._id.toString(),
          title: project.title ?? project.name ?? "Untitled project",
          category: project.category ?? "General",
          location: project.location ?? null,
          completedAt: (
            project.completedAt ??
            project.updatedAt ??
            project.createdAt
          ).toISOString(),
          contractValue: project.totalAgreedValue ?? null,
        })),
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
      connectionsCount,
      rating: null,
      reviewCount: 0,
    });
  } catch (error: unknown) {
    next(error);
  }
};

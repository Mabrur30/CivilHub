import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Connection } from "../models/Connection.model";
import { Engineer } from "../models/Engineer.model";
import { Notification } from "../models/Notification.model";
import { User, type UserRole } from "../models/User.model";

export type ConnectionViewStatus =
  | "not_connected"
  | "pending_sent"
  | "pending_received"
  | "connected";

interface NetworkError extends Error {
  statusCode: number;
}
interface ConnectionParams {
  connectionId?: string;
  targetUserId?: string;
}
interface UserView {
  userId: string;
  name: string;
  role: UserRole;
  profilePhotoUrl: string | null;
}
interface PopulatedUser {
  _id: Types.ObjectId;
  name: string;
  role: UserRole;
}

const getEngineerPhotoMap = async (
  users: PopulatedUser[],
): Promise<Map<string, string>> => {
  const engineerUserIds = users
    .filter((user) => user.role === "engineer")
    .map((user) => user._id);
  if (engineerUserIds.length === 0) {
    return new Map<string, string>();
  }

  const engineers = await Engineer.find({
    user: { $in: engineerUserIds },
  })
    .select("user profilePhoto")
    .exec();

  return new Map(
    engineers.map((engineer) => [
      engineer.user.toString(),
      engineer.profilePhoto?.url ?? "",
    ]),
  );
};

const createNetworkError = (
  message: string,
  statusCode: number,
): NetworkError => {
  const error = new Error(message) as NetworkError;
  error.statusCode = statusCode;
  return error;
};

const requireUser = (req: AuthenticatedRequest): string => {
  if (!req.user?.userId)
    throw createNetworkError("Authentication required", 401);
  return req.user.userId;
};

const getParams = (req: AuthenticatedRequest): ConnectionParams =>
  req.params as unknown as ConnectionParams;

const connectionFilter = (userId: string, targetUserId: string) => ({
  $or: [
    { requester: userId, recipient: targetUserId },
    { requester: targetUserId, recipient: userId },
  ],
});

export const sendConnectionRequest = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUser(req);
    const { targetUserId } = getParams(req);
    if (!targetUserId)
      throw createNetworkError("Target user ID is required", 400);
    if (targetUserId === userId)
      throw createNetworkError("You cannot connect with yourself", 400);
    const target = await User.findById(targetUserId).select("_id").exec();
    if (!target) throw createNetworkError("User not found", 404);
    const existing = await Connection.findOne(
      connectionFilter(userId, targetUserId),
    ).exec();
    if (existing?.status === "pending")
      throw createNetworkError("A connection request is already pending", 409);
    if (existing?.status === "accepted")
      throw createNetworkError("You are already connected", 409);
    const connection = existing ?? new Connection();
    connection.requester = new Types.ObjectId(userId);
    connection.recipient = new Types.ObjectId(targetUserId);
    connection.status = "pending";
    await connection.save();
    res
      .status(201)
      .json({ id: connection._id.toString(), status: connection.status });
  } catch (error: unknown) {
    next(error);
  }
};

export const getIncomingRequests = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUser(req);
    const requests = await Connection.find({
      recipient: userId,
      status: "pending",
    })
      .populate("requester", "name role")
      .sort({ createdAt: -1 })
      .exec();
    const requesters = requests.map(
      (request) => request.requester as unknown as PopulatedUser,
    );
    const photoByUser = await getEngineerPhotoMap(requesters);
    res.status(200).json(
      requests.map((request) => {
        const requester = request.requester as unknown as PopulatedUser;
        const requesterId = requester._id.toString();
        return {
          id: request._id.toString(),
          userId: requesterId,
          name: requester.name,
          role: requester.role,
          status: request.status,
          profilePhotoUrl: photoByUser.get(requesterId) ?? null,
        };
      }),
    );
  } catch (error: unknown) {
    next(error);
  }
};

export const getSentRequests = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUser(req);
    const requests = await Connection.find({
      requester: userId,
      status: "pending",
    })
      .populate("recipient", "name role")
      .sort({ createdAt: -1 })
      .exec();
    const recipients = requests.map(
      (request) => request.recipient as unknown as PopulatedUser,
    );
    const photoByUser = await getEngineerPhotoMap(recipients);
    res.status(200).json(
      requests.map((request) => {
        const recipient = request.recipient as unknown as PopulatedUser;
        const recipientId = recipient._id.toString();
        return {
          id: request._id.toString(),
          userId: recipientId,
          name: recipient.name,
          role: recipient.role,
          status: request.status,
          profilePhotoUrl: photoByUser.get(recipientId) ?? null,
        };
      }),
    );
  } catch (error: unknown) {
    next(error);
  }
};

export const acceptConnectionRequest = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUser(req);
    const { connectionId } = getParams(req);
    if (!connectionId)
      throw createNetworkError("Connection ID is required", 400);
    const connection = await Connection.findOne({
      _id: connectionId,
      recipient: userId,
      status: "pending",
    }).exec();
    if (!connection)
      throw createNetworkError("Incoming connection request not found", 404);
    connection.status = "accepted";
    await connection.save();
    await Notification.create({
      recipient: connection.requester,
      type: "connection_accepted",
      message: "Your connection request was accepted.",
      connection: connection._id,
    });
    res
      .status(200)
      .json({ id: connection._id.toString(), status: connection.status });
  } catch (error: unknown) {
    next(error);
  }
};

export const declineConnectionRequest = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUser(req);
    const { connectionId } = getParams(req);
    if (!connectionId)
      throw createNetworkError("Connection ID is required", 400);
    const connection = await Connection.findOne({
      _id: connectionId,
      recipient: userId,
      status: "pending",
    }).exec();
    if (!connection)
      throw createNetworkError("Incoming connection request not found", 404);
    connection.status = "declined";
    await connection.save();
    res
      .status(200)
      .json({ id: connection._id.toString(), status: connection.status });
  } catch (error: unknown) {
    next(error);
  }
};

const toUserView = (
  user: PopulatedUser,
  photoByUser: Map<string, string>,
): UserView => ({
  userId: user._id.toString(),
  name: user.name,
  role: user.role,
  profilePhotoUrl: photoByUser.get(user._id.toString()) ?? null,
});

export const getMyConnections = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUser(req);
    const connections = await Connection.find({
      $or: [{ requester: userId }, { recipient: userId }],
      status: "accepted",
    })
      .populate("requester", "name role")
      .populate("recipient", "name role")
      .sort({ updatedAt: -1 })
      .exec();
    const users = connections.flatMap((connection) => [
      connection.requester,
      connection.recipient,
    ]) as unknown as PopulatedUser[];
    const otherUsers = users.filter((user) => user._id.toString() !== userId);
    const photoByUser = await getEngineerPhotoMap(otherUsers);
    res
      .status(200)
      .json(otherUsers.map((user) => toUserView(user, photoByUser)));
  } catch (error: unknown) {
    next(error);
  }
};

export const getConnectionStatus = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUser(req);
    const { targetUserId } = getParams(req);
    if (!targetUserId)
      throw createNetworkError("Target user ID is required", 400);
    if (targetUserId === userId) {
      res
        .status(200)
        .json({
          status: "connected" satisfies ConnectionViewStatus,
          connectionId: null,
        });
      return;
    }
    const connection = await Connection.findOne(
      connectionFilter(userId, targetUserId),
    ).exec();
    let status: ConnectionViewStatus = "not_connected";
    if (connection?.status === "accepted") status = "connected";
    else if (connection?.status === "pending")
      status =
        connection.requester.toString() === userId
          ? "pending_sent"
          : "pending_received";
    res
      .status(200)
      .json({ status, connectionId: connection?._id?.toString() ?? null });
  } catch (error: unknown) {
    next(error);
  }
};

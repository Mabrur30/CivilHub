import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import {
  Connection,
  type IConnection,
  connectionPairKey,
} from "../models/Connection.model";
import { Engineer } from "../models/Engineer.model";
import { Notification } from "../models/Notification.model";
import { Organisation } from "../models/Organisation.model";
import { onlyDisciplines } from "../utils/disciplines";
import { blockedUserIds, isBlockedEitherWay } from "../utils/blocks";
import { Review } from "../models/Review.model";
import { User, type UserRole } from "../models/User.model";
import { getProfilePhotoMap } from "../utils/profilePhotos";
import { isProviderRole } from "../utils/roles";

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
  /** The connection record, used to remove the connection. */
  connectionId?: string;
  userId: string;
  name: string;
  role: UserRole;
  profilePhotoUrl: string | null;
  rating: number | null;
  reviewCount: number;
}
interface PopulatedUser {
  _id: Types.ObjectId;
  name: string;
  role: UserRole;
}

const getPhotoMap = (users: PopulatedUser[]): Promise<Map<string, string>> =>
  getProfilePhotoMap(users.map((user) => user._id));

const getEngineerRatingMap = async (
  users: PopulatedUser[],
): Promise<Map<string, { rating: number; reviewCount: number }>> => {
  const engineerIds = users
    .filter((user) => isProviderRole(user.role))
    .map((user) => user._id);
  const rows = await Review.aggregate<{
    _id: Types.ObjectId;
    averageRating: number;
    reviewCount: number;
  }>([
    {
      $match: {
        engineer: { $in: engineerIds },
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

/** Rejects ids that aren't ObjectIds with a 400 instead of a CastError. */
const requireObjectId = (value: string | undefined, label: string): string => {
  if (!value) throw createNetworkError(`${label} is required`, 400);
  if (!Types.ObjectId.isValid(value)) throw createNetworkError(`Invalid ${label.toLowerCase()}`, 400);
  return value;
};

const PROVIDERS_ONLY = "Connections are for engineers and companies";

/**
 * Optional ?limit=&offset= paging for the connection lists. Without `limit`
 * the whole list comes back, as older callers expect.
 */
const getPaging = (req: AuthenticatedRequest): { skip: number; limit: number } | null => {
  const query = req.query as { limit?: string; offset?: string };
  if (query.limit === undefined) return null;
  const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  const skip = Math.max(0, Number.parseInt(query.offset ?? "0", 10) || 0);
  return { skip, limit };
};

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
    const targetUserId = requireObjectId(getParams(req).targetUserId, "Target user ID");
    if (targetUserId === userId)
      throw createNetworkError("You cannot connect with yourself", 400);
    // Clients hire rather than network; they reach providers by message.
    if (!isProviderRole(req.user.role)) throw createNetworkError(PROVIDERS_ONLY, 403);
    const target = await User.findById(targetUserId).select("_id role").exec();
    if (!target) throw createNetworkError("User not found", 404);
    if (!isProviderRole(target.role)) throw createNetworkError(PROVIDERS_ONLY, 403);
    if (await isBlockedEitherWay(userId, targetUserId))
      throw createNetworkError("You can't connect with this person", 403);

    const existing = await Connection.findOne(
      connectionFilter(userId, targetUserId),
    ).exec();
    if (existing?.status === "accepted")
      throw createNetworkError("You are already connected", 409);
    if (existing?.status === "pending") {
      if (existing.requester.toString() === userId)
        throw createNetworkError("A connection request is already pending", 409);
      // They already asked you: connecting back accepts their request.
      await acceptConnection(existing);
      res.status(200).json({ id: existing._id.toString(), status: existing.status });
      return;
    }

    if (existing) {
      // A re-request after a decline starts fresh, so it sorts as new.
      await Connection.deleteOne({ _id: existing._id }).exec();
    }
    const connection = await Connection.create({
      requester: new Types.ObjectId(userId),
      recipient: new Types.ObjectId(targetUserId),
      status: "pending",
    });
    const requester = await User.findById(userId).select("name").exec();
    await Notification.create({
      recipient: connection.recipient,
      type: "connection_request",
      message: `${requester?.name ?? "Someone"} wants to connect with you.`,
      connection: connection._id,
    });
    res
      .status(201)
      .json({ id: connection._id.toString(), status: connection.status });
  } catch (error: unknown) {
    next(error);
  }
};

/** Marks a pending request accepted, once, and tells the person who sent it. */
const acceptConnection = async (connection: IConnection): Promise<void> => {
  const updated = await Connection.findOneAndUpdate(
    { _id: connection._id, status: "pending" },
    { status: "accepted" },
    { new: true },
  ).exec();
  if (!updated) return; // Already accepted by a parallel request.
  connection.status = "accepted";
  await Notification.updateMany(
    { connection: connection._id, type: "connection_request" },
    { read: true },
  ).exec();
  const accepter = await User.findById(connection.recipient).select("name").exec();
  await Notification.create({
    recipient: connection.requester,
    type: "connection_accepted",
    message: `${accepter?.name ?? "Someone"} accepted your connection request.`,
    connection: connection._id,
  });
};

export const getIncomingRequests = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUser(req);
    const paging = getPaging(req);
    const requests = await Connection.find({
      recipient: userId,
      status: "pending",
    })
      .populate("requester", "name role")
      .sort({ createdAt: -1, _id: -1 })
      .skip(paging?.skip ?? 0)
      .limit(paging?.limit ?? 0)
      .exec();
    const liveRequests = requests.filter((request) => request.requester);
    const requesters = liveRequests.map(
      (request) => request.requester as unknown as PopulatedUser,
    );
    const photoByUser = await getPhotoMap(requesters);
    res.status(200).json(
      liveRequests.map((request) => {
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
    const paging = getPaging(req);
    const requests = await Connection.find({
      requester: userId,
      status: "pending",
    })
      .populate("recipient", "name role")
      .sort({ createdAt: -1, _id: -1 })
      .skip(paging?.skip ?? 0)
      .limit(paging?.limit ?? 0)
      .exec();
    const liveRequests = requests.filter((request) => request.recipient);
    const recipients = liveRequests.map(
      (request) => request.recipient as unknown as PopulatedUser,
    );
    const photoByUser = await getPhotoMap(recipients);
    res.status(200).json(
      liveRequests.map((request) => {
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
    const connectionId = requireObjectId(getParams(req).connectionId, "Connection ID");
    if (!isProviderRole(req.user.role)) throw createNetworkError(PROVIDERS_ONLY, 403);
    const connection = await Connection.findOne({
      _id: connectionId,
      recipient: userId,
      status: "pending",
    }).exec();
    if (!connection)
      throw createNetworkError("Incoming connection request not found", 404);
    await acceptConnection(connection);
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
    const connectionId = requireObjectId(getParams(req).connectionId, "Connection ID");
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
  ratingByUser: Map<string, { rating: number; reviewCount: number }>,
): UserView => ({
  userId: user._id.toString(),
  name: user.name,
  role: user.role,
  profilePhotoUrl: photoByUser.get(user._id.toString()) ?? null,
  rating: ratingByUser.get(user._id.toString())?.rating ?? null,
  reviewCount: ratingByUser.get(user._id.toString())?.reviewCount ?? 0,
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
      .sort({ updatedAt: -1, _id: -1 })
      .skip(getPaging(req)?.skip ?? 0)
      .limit(getPaging(req)?.limit ?? 0)
      .exec();
    // A deleted account leaves a null; skip it rather than fail the list.
    const pairs = connections
      .map((connection) => {
        const requester = connection.requester as unknown as PopulatedUser | null;
        const recipient = connection.recipient as unknown as PopulatedUser | null;
        const other = requester?._id.toString() === userId ? recipient : requester;
        return other ? { connectionId: connection._id.toString(), user: other } : null;
      })
      .filter((pair): pair is { connectionId: string; user: PopulatedUser } => pair !== null);
    const otherUsers = pairs.map((pair) => pair.user);
    const photoByUser = await getPhotoMap(otherUsers);
    const ratingByUser = await getEngineerRatingMap(otherUsers);
    res.status(200).json(
      pairs.map((pair) => ({
        ...toUserView(pair.user, photoByUser, ratingByUser),
        connectionId: pair.connectionId,
      })),
    );
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
    const targetUserId = requireObjectId(getParams(req).targetUserId, "Target user ID");
    if (targetUserId === userId) {
      res.status(200).json({
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

/**
 * Startup housekeeping for connections:
 * - gives records saved before pairKey existed their key, merging any pair
 *   that ended up with two records (accepted wins, then the newest);
 * - drops pending requests involving a client, since clients don't connect.
 */
export const tidyConnections = async (): Promise<void> => {
  const legacy = await Connection.find({ pairKey: { $exists: false } })
    .sort({ updatedAt: -1 })
    .exec();
  for (const connection of legacy) {
    const pairKey = connectionPairKey(connection.requester, connection.recipient);
    const keeper = await Connection.findOne({ pairKey }).exec();
    if (keeper) {
      if (connection.status === "accepted" && keeper.status !== "accepted") {
        await Connection.deleteOne({ _id: keeper._id }).exec();
      } else {
        await Connection.deleteOne({ _id: connection._id }).exec();
        continue;
      }
    }
    await Connection.updateOne({ _id: connection._id }, { pairKey }).exec();
  }

  const clientIds = (await User.find({ role: "client" }).select("_id").exec()).map(
    (user) => user._id,
  );
  if (clientIds.length > 0) {
    await Connection.deleteMany({
      status: "pending",
      $or: [{ requester: { $in: clientIds } }, { recipient: { $in: clientIds } }],
    }).exec();
  }
};

/**
 * Withdraws a request you sent, or removes an existing connection (either
 * side may). The other person isn't notified.
 */
export const removeConnection = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUser(req);
    const connectionId = requireObjectId(getParams(req).connectionId, "Connection ID");
    const connection = await Connection.findOne({
      _id: connectionId,
      $or: [
        { status: "pending", requester: userId },
        { status: "accepted", $or: [{ requester: userId }, { recipient: userId }] },
      ],
    }).exec();
    if (!connection) throw createNetworkError("Connection not found", 404);

    const previous = connection.status;
    await Connection.deleteOne({ _id: connection._id }).exec();
    // A withdrawn request shouldn't linger in the other person's alerts.
    await Notification.deleteMany({ connection: connection._id, type: "connection_request" }).exec();
    res.status(200).json({ removed: true, previousStatus: previous });
  } catch (error: unknown) {
    next(error);
  }
};

interface SuggestionView {
  userId: string;
  name: string;
  role: UserRole;
  profilePhotoUrl: string | null;
  specialty: string | null;
  location: string | null;
  mutualCount: number;
  /** Why they're suggested, e.g. "3 mutual connections" or "Also Structural". */
  reason: string;
}

const areaOf = (location: string | null | undefined): string =>
  (location ?? "").split(",").pop()?.trim().toLowerCase() ?? "";

/**
 * People you may know: engineers and companies you're not connected to or
 * waiting on, ranked by mutual connections, then shared specialities, then
 * the same area.
 */
export const getSuggestions = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUser(req);
    if (!isProviderRole(req.user.role)) {
      res.status(200).json([]);
      return;
    }
    const limit = Math.min(30, Math.max(1, Number.parseInt(String(req.query.limit ?? "12"), 10) || 12));

    const mine = await Connection.find({
      $or: [{ requester: userId }, { recipient: userId }],
      status: { $in: ["pending", "accepted"] },
    })
      .select("requester recipient status")
      .exec();
    const excluded = new Set<string>([userId, ...(await blockedUserIds(userId))]);
    const myConnections = new Set<string>();
    for (const connection of mine) {
      const other =
        connection.requester.toString() === userId
          ? connection.recipient.toString()
          : connection.requester.toString();
      excluded.add(other);
      if (connection.status === "accepted") myConnections.add(other);
    }

    // Friends of friends, counted per person.
    const mutualRows = myConnections.size
      ? await Connection.find({
          status: "accepted",
          $or: [
            { requester: { $in: [...myConnections] } },
            { recipient: { $in: [...myConnections] } },
          ],
        })
          .select("requester recipient")
          .exec()
      : [];
    const mutualCount = new Map<string, number>();
    for (const row of mutualRows) {
      const a = row.requester.toString();
      const b = row.recipient.toString();
      const candidate = myConnections.has(a) ? b : a;
      if (!excluded.has(candidate)) {
        mutualCount.set(candidate, (mutualCount.get(candidate) ?? 0) + 1);
      }
    }

    const [meEngineer, meCompany] = await Promise.all([
      Engineer.findOne({ user: userId }).select("disciplines location").exec(),
      Organisation.findOne({ user: userId }).select("specialties location").exec(),
    ]);
    const mySpecialities = new Set<string>(
      meEngineer?.disciplines ?? onlyDisciplines(meCompany?.specialties),
    );
    const myArea = areaOf(meEngineer?.location ?? meCompany?.location);

    // Everyone with a mutual connection, plus the newest providers.
    const providerFilter = {
      _id: { $nin: [...excluded].map((id) => new Types.ObjectId(id)) },
      role: { $in: ["engineer", "organisation"] as UserRole[] },
    };
    const [withMutuals, newest] = await Promise.all([
      User.find({
        ...providerFilter,
        _id: {
          $in: [...mutualCount.keys()].map((id) => new Types.ObjectId(id)),
          $nin: [...excluded].map((id) => new Types.ObjectId(id)),
        },
      })
        .select("name role createdAt")
        .exec(),
      User.find(providerFilter)
        .select("name role createdAt")
        .sort({ createdAt: -1 })
        .limit(300)
        .exec(),
    ]);
    const candidates = [
      ...new Map([...withMutuals, ...newest].map((user) => [user._id.toString(), user])).values(),
    ];
    const candidateIds = candidates.map((user) => user._id);
    const [engineers, companies, photoByUser] = await Promise.all([
      Engineer.find({ user: { $in: candidateIds } }).select("user disciplines location").exec(),
      Organisation.find({ user: { $in: candidateIds } }).select("user specialties location").exec(),
      getProfilePhotoMap(candidateIds),
    ]);
    const profileByUser = new Map<string, { specialities: string[]; location: string | null }>();
    for (const engineer of engineers) {
      profileByUser.set(engineer.user.toString(), {
        specialities: engineer.disciplines ?? [],
        location: engineer.location ?? null,
      });
    }
    for (const company of companies) {
      profileByUser.set(company.user.toString(), {
        specialities: onlyDisciplines(company.specialties),
        location: company.location ?? null,
      });
    }

    const ranked = candidates
      .map((user) => {
        const id = user._id.toString();
        const profile = profileByUser.get(id) ?? { specialities: [], location: null };
        const mutual = mutualCount.get(id) ?? 0;
        const shared = profile.specialities.filter((item) => mySpecialities.has(item));
        const sameArea = Boolean(myArea) && areaOf(profile.location) === myArea;
        const score = mutual * 10 + shared.length * 4 + (sameArea ? 2 : 0);
        const reason =
          mutual > 0
            ? `${mutual} mutual connection${mutual === 1 ? "" : "s"}`
            : shared.length > 0
              ? `Also ${shared[0]}`
              : sameArea && profile.location
                ? `Also in ${profile.location.split(",").pop()?.trim()}`
                : "New on CivilHub";
        const view: SuggestionView = {
          userId: id,
          name: user.name,
          role: user.role,
          profilePhotoUrl: photoByUser.get(id) ?? null,
          specialty: profile.specialities[0] ?? null,
          location: profile.location,
          mutualCount: mutual,
          reason,
        };
        return { view, score, createdAt: user.createdAt.getTime() };
      })
      .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((entry) => entry.view);

    res.status(200).json(ranked);
  } catch (error: unknown) {
    next(error);
  }
};

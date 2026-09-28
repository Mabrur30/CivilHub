import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Block } from "../models/Block.model";
import { Comment } from "../models/Comment.model";
import { Connection } from "../models/Connection.model";
import { Post } from "../models/Post.model";
import {
  REPORT_REASONS,
  REPORT_TARGETS,
  Report,
  type ReportReason,
  type ReportTarget,
} from "../models/Report.model";
import { User } from "../models/User.model";
import { getProfilePhotoMap } from "../utils/profilePhotos";

interface SafetyError extends Error {
  statusCode: number;
}

const safetyError = (message: string, statusCode: number): SafetyError => {
  const error = new Error(message) as SafetyError;
  error.statusCode = statusCode;
  return error;
};

const requireUserParam = (req: AuthenticatedRequest): string => {
  const { userId } = req.params as unknown as { userId?: string };
  if (!userId || !Types.ObjectId.isValid(userId)) throw safetyError("User not found", 404);
  return userId;
};

/**
 * Blocks someone: any connection or request between you ends, and neither of
 * you can connect, message or comment on the other's posts until unblocked.
 */
export const blockUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const me = req.user.userId;
    const other = requireUserParam(req);
    if (other === me) throw safetyError("You can't block yourself", 400);
    if (!(await User.exists({ _id: other }))) throw safetyError("User not found", 404);

    await Block.updateOne(
      { blocker: me, blocked: other },
      { $setOnInsert: { blocker: me, blocked: other } },
      { upsert: true },
    ).exec();
    await Connection.deleteMany({
      $or: [
        { requester: me, recipient: other },
        { requester: other, recipient: me },
      ],
    }).exec();
    res.status(200).json({ blocked: true });
  } catch (error: unknown) {
    next(error);
  }
};

export const unblockUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const other = requireUserParam(req);
    await Block.deleteOne({ blocker: req.user.userId, blocked: other }).exec();
    res.status(200).json({ blocked: false });
  } catch (error: unknown) {
    next(error);
  }
};

/** The people you've blocked, newest first, for account settings. */
export const getMyBlocks = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const blocks = await Block.find({ blocker: req.user.userId })
      .populate("blocked", "name role")
      .sort({ createdAt: -1 })
      .exec();
    const people = blocks
      .map((block) => ({
        block,
        user: block.blocked as unknown as { _id: Types.ObjectId; name: string; role: string } | null,
      }))
      .filter((entry) => entry.user);
    const photos = await getProfilePhotoMap(people.map((entry) => entry.user!._id));
    res.status(200).json(
      people.map(({ block, user }) => ({
        userId: user!._id.toString(),
        name: user!.name,
        role: user!.role,
        profilePhotoUrl: photos.get(user!._id.toString()) ?? null,
        blockedAt: block.createdAt.toISOString(),
      })),
    );
  } catch (error: unknown) {
    next(error);
  }
};

export interface ReportBody {
  targetType?: unknown;
  targetId?: unknown;
  reason?: unknown;
  note?: unknown;
}

const targetExists = async (type: ReportTarget, id: string): Promise<boolean> => {
  if (type === "user") return Boolean(await User.exists({ _id: id }));
  if (type === "post") return Boolean(await Post.exists({ _id: id }));
  return Boolean(await Comment.exists({ _id: id }));
};

/**
 * Flags a person, post or comment for review. Reports are stored for the
 * admin dashboard; reporting the same thing again updates your open report.
 */
export const createReport = async (
  req: AuthenticatedRequest<ReportBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { targetType, targetId, reason, note } = req.body ?? {};
    if (typeof targetType !== "string" || !REPORT_TARGETS.includes(targetType as ReportTarget)) {
      throw safetyError("Choose what you're reporting", 400);
    }
    if (typeof targetId !== "string" || !Types.ObjectId.isValid(targetId)) {
      throw safetyError("Nothing to report", 404);
    }
    if (typeof reason !== "string" || !REPORT_REASONS.includes(reason as ReportReason)) {
      throw safetyError("Choose a reason", 400);
    }
    if (note !== undefined && (typeof note !== "string" || note.length > 500)) {
      throw safetyError("The note must be 500 characters or fewer", 400);
    }
    if (targetType === "user" && targetId === req.user.userId) {
      throw safetyError("You can't report yourself", 400);
    }
    if (!(await targetExists(targetType as ReportTarget, targetId))) {
      throw safetyError("Nothing to report", 404);
    }

    const key = {
      reporter: new Types.ObjectId(req.user.userId),
      targetType: targetType as ReportTarget,
      targetId: new Types.ObjectId(targetId),
      status: "open" as const,
    };
    await Report.findOneAndUpdate(
      key,
      {
        $set: {
          reason: reason as ReportReason,
          note: typeof note === "string" ? note.trim() : undefined,
        },
        $setOnInsert: key,
      },
      { upsert: true },
    ).exec();
    res.status(201).json({ reported: true });
  } catch (error: unknown) {
    next(error);
  }
};

import { type NextFunction, type Response } from "express";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import {
  Notification,
  type INotification,
  type NotificationType,
} from "../models/Notification.model";

interface NotificationError extends Error {
  statusCode: number;
}

interface NotificationQuery {
  page?: string;
  limit?: string;
}

interface NotificationParams {
  notificationId?: string;
}

interface NotificationListItem {
  id: string;
  type: NotificationType;
  message: string;
  isRead: boolean;
  createdAt: string;
  projectId: string | null;
  bidId: string | null;
  connectionId: string | null;
  conversationId: string | null;
  messageId: string | null;
}

interface GetMyNotificationsResponse {
  items: NotificationListItem[];
  page: number;
  limit: number;
  total: number;
  unreadCount: number;
}

interface MarkAllNotificationsReadResponse {
  matchedCount: number;
  modifiedCount: number;
}

const createNotificationError = (
  message: string,
  statusCode: number,
): NotificationError => {
  const error = new Error(message) as NotificationError;
  error.statusCode = statusCode;
  return error;
};

const requireUserId = (req: AuthenticatedRequest): string => {
  if (!req.user?.userId) {
    throw createNotificationError("Authentication required", 401);
  }
  return req.user.userId;
};

const getQuery = (req: AuthenticatedRequest): NotificationQuery =>
  req.query as unknown as NotificationQuery;

const getParams = (req: AuthenticatedRequest): NotificationParams =>
  req.params as unknown as NotificationParams;

const parsePage = (value: string | undefined): number => {
  const parsed = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
};

const parseLimit = (value: string | undefined): number => {
  const parsed = Number.parseInt(value ?? "20", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 20;
  }
  return Math.min(parsed, 100);
};

const toNotificationListItem = (
  notification: INotification,
): NotificationListItem => ({
  id: notification._id.toString(),
  type: notification.type,
  message: notification.message,
  isRead: notification.read,
  createdAt: notification.createdAt.toISOString(),
  projectId: notification.project ? notification.project.toString() : null,
  bidId: notification.bid ? notification.bid.toString() : null,
  connectionId: notification.connection
    ? notification.connection.toString()
    : null,
  conversationId: notification.conversation
    ? notification.conversation.toString()
    : null,
  messageId: notification.messageRef
    ? notification.messageRef.toString()
    : null,
});

export const getMyNotifications = async (
  req: AuthenticatedRequest,
  res: Response<GetMyNotificationsResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUserId(req);
    const query = getQuery(req);
    const page = parsePage(query.page);
    const limit = parseLimit(query.limit);

    const filter = { recipient: userId };
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ ...filter, read: false }),
    ]);

    res.status(200).json({
      items: notifications.map(toNotificationListItem),
      page,
      limit,
      total,
      unreadCount,
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const markNotificationRead = async (
  req: AuthenticatedRequest,
  res: Response<{ success: true; id: string; isRead: boolean }>,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUserId(req);
    const { notificationId } = getParams(req);

    if (!notificationId) {
      throw createNotificationError("Notification ID is required", 400);
    }

    const notification = await Notification.findById(notificationId).exec();
    if (!notification) {
      throw createNotificationError("Notification not found", 404);
    }

    if (notification.recipient.toString() !== userId) {
      throw createNotificationError("Forbidden", 403);
    }

    notification.read = true;
    await notification.save();

    res.status(200).json({
      success: true,
      id: notification._id.toString(),
      isRead: true,
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const markAllNotificationsRead = async (
  req: AuthenticatedRequest,
  res: Response<MarkAllNotificationsReadResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUserId(req);

    const result = await Notification.updateMany(
      { recipient: userId, read: false },
      { $set: { read: true } },
    ).exec();

    res.status(200).json({
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  } catch (error: unknown) {
    next(error);
  }
};

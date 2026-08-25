import { Router } from "express";
import {
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../controllers/notification.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const notificationsRouter = Router();

notificationsRouter.get("/", protect, (req, res, next) =>
  getMyNotifications(req as AuthenticatedRequest, res, next),
);

notificationsRouter.patch("/read-all", protect, (req, res, next) =>
  markAllNotificationsRead(req as AuthenticatedRequest, res, next),
);

notificationsRouter.patch("/:notificationId/read", protect, (req, res, next) =>
  markNotificationRead(req as AuthenticatedRequest, res, next),
);

export default notificationsRouter;

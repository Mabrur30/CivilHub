import { Router } from "express";
import {
  acceptConnectionRequest,
  declineConnectionRequest,
  getConnectionStatus,
  getIncomingRequests,
  getMyConnections,
  getSentRequests,
  sendConnectionRequest,
} from "../controllers/network.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const networkRouter = Router();
networkRouter.post("/:targetUserId/request", protect, (req, res, next) =>
  sendConnectionRequest(req as AuthenticatedRequest, res, next),
);
networkRouter.get("/incoming", protect, (req, res, next) =>
  getIncomingRequests(req as AuthenticatedRequest, res, next),
);
networkRouter.get("/sent", protect, (req, res, next) =>
  getSentRequests(req as AuthenticatedRequest, res, next),
);
networkRouter.get("/connections", protect, (req, res, next) =>
  getMyConnections(req as AuthenticatedRequest, res, next),
);
networkRouter.get("/status/:targetUserId", protect, (req, res, next) =>
  getConnectionStatus(req as AuthenticatedRequest, res, next),
);
networkRouter.patch("/:connectionId/accept", protect, (req, res, next) =>
  acceptConnectionRequest(req as AuthenticatedRequest, res, next),
);
networkRouter.patch("/:connectionId/decline", protect, (req, res, next) =>
  declineConnectionRequest(req as AuthenticatedRequest, res, next),
);

export default networkRouter;

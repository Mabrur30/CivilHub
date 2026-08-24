import { Router } from "express";
import {
  getMessages,
  getMyConversations,
  getOrCreateConversation,
  type SendMessageBody,
  sendMessage,
} from "../controllers/message.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const conversationsRouter = Router();

conversationsRouter.get("/", protect, (req, res, next) =>
  getMyConversations(req as AuthenticatedRequest, res, next),
);

conversationsRouter.get("/with/:otherUserId", protect, (req, res, next) =>
  getOrCreateConversation(req as AuthenticatedRequest, res, next),
);

conversationsRouter.get(
  "/:conversationId/messages",
  protect,
  (req, res, next) => getMessages(req as AuthenticatedRequest, res, next),
);

conversationsRouter.post(
  "/:conversationId/messages",
  protect,
  (req, res, next) =>
    sendMessage(req as AuthenticatedRequest<SendMessageBody>, res, next),
);

export default conversationsRouter;

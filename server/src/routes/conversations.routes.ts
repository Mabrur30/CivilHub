import { type NextFunction, type Request, type Response, Router } from "express";
import {
  type ConversationFlagsBody,
  getMessages,
  getMyConversations,
  getOrCreateConversation,
  markConversationRead,
  type SendMessageBody,
  sendMessage,
  updateConversationFlags,
} from "../controllers/message.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";
import {
  handleUploadError,
  messageAttachmentUpload,
} from "../middleware/upload.middleware";

const conversationsRouter = Router();

conversationsRouter.get("/", protect, (req, res, next) =>
  getMyConversations(req as AuthenticatedRequest, res, next),
);

conversationsRouter.get("/with/:otherUserId", protect, (req, res, next) =>
  getOrCreateConversation(req as AuthenticatedRequest, res, next),
);

conversationsRouter.patch("/:conversationId", protect, (req, res, next) =>
  updateConversationFlags(
    req as AuthenticatedRequest<ConversationFlagsBody>,
    res,
    next,
  ),
);

conversationsRouter.patch("/:conversationId/read", protect, (req, res, next) =>
  markConversationRead(req as AuthenticatedRequest, res, next),
);

conversationsRouter.get(
  "/:conversationId/messages",
  protect,
  (req, res, next) => getMessages(req as AuthenticatedRequest, res, next),
);

conversationsRouter.post(
  "/:conversationId/messages",
  protect,
  messageAttachmentUpload.single("attachment"),
  handleUploadError,
  (req: Request, res: Response, next: NextFunction) =>
    sendMessage(req as AuthenticatedRequest<SendMessageBody>, res, next),
);

export default conversationsRouter;

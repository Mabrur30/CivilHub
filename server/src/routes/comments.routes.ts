import { Router } from "express";
import {
  createComment,
  deleteComment,
  type CreateCommentBody,
} from "../controllers/comment.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const commentsRouter = Router();

commentsRouter.post("/", protect, (req, res, next) =>
  createComment(req as AuthenticatedRequest<CreateCommentBody>, res, next),
);
commentsRouter.delete("/:commentId", protect, (req, res, next) =>
  deleteComment(req as AuthenticatedRequest, res, next),
);

export default commentsRouter;

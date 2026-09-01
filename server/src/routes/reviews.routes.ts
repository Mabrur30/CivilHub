import { Router } from "express";
import {
  createReview,
  replyToReview,
  type CreateReviewRequestBody,
  type ReplyToReviewRequestBody,
} from "../controllers/review.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const reviewsRouter = Router();

reviewsRouter.post("/", protect, (req, res, next) =>
  createReview(req as AuthenticatedRequest<CreateReviewRequestBody>, res, next),
);
reviewsRouter.patch("/:reviewId/reply", protect, (req, res, next) =>
  replyToReview(
    req as AuthenticatedRequest<ReplyToReviewRequestBody>,
    res,
    next,
  ),
);

export default reviewsRouter;

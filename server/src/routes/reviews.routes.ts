import { Router } from "express";
import {
  createEquipmentReview,
  createReview,
  replyToReview,
  type CreateEquipmentReviewRequestBody,
  type CreateReviewRequestBody,
  type ReplyToReviewRequestBody,
} from "../controllers/review.controller";
import {
  createCustomerReview,
  type CreateCustomerReviewBody,
} from "../controllers/customerReview.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const reviewsRouter = Router();

reviewsRouter.post("/", protect, (req, res, next) =>
  createReview(req as AuthenticatedRequest<CreateReviewRequestBody>, res, next),
);
reviewsRouter.post("/equipment", protect, (req, res, next) =>
  createEquipmentReview(
    req as AuthenticatedRequest<CreateEquipmentReviewRequestBody>,
    res,
    next,
  ),
);
// A provider rating the client or renter they worked for.
reviewsRouter.post("/customer", protect, (req, res, next) =>
  createCustomerReview(
    req as AuthenticatedRequest<CreateCustomerReviewBody>,
    res,
    next,
  ),
);
reviewsRouter.patch("/:reviewId/reply", protect, (req, res, next) =>
  replyToReview(
    req as AuthenticatedRequest<ReplyToReviewRequestBody>,
    res,
    next,
  ),
);

export default reviewsRouter;

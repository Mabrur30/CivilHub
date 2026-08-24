import { Router } from "express";
import {
  acceptBid,
  declineBid,
  getBidsForMyProjects,
  getMyBids,
  submitBid,
  type SubmitBidRequestBody,
} from "../controllers/bid.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const bidsRouter = Router();

bidsRouter.get("/my-bids", protect, (req, res, next) =>
  getMyBids(req as AuthenticatedRequest, res, next),
);

bidsRouter.get("/my-projects-bids", protect, (req, res, next) =>
  getBidsForMyProjects(req as AuthenticatedRequest, res, next),
);

bidsRouter.patch("/:bidId/accept", protect, (req, res, next) =>
  acceptBid(req as AuthenticatedRequest, res, next),
);

bidsRouter.patch("/:bidId/decline", protect, (req, res, next) =>
  declineBid(req as AuthenticatedRequest, res, next),
);

bidsRouter.post("/", protect, (req, res, next) =>
  submitBid(req as AuthenticatedRequest<SubmitBidRequestBody>, res, next),
);

export default bidsRouter;

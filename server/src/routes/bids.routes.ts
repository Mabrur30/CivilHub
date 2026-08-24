import { Router } from "express";
import {
  submitBid,
  type SubmitBidRequestBody,
} from "../controllers/bid.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const bidsRouter = Router();

bidsRouter.post("/", protect, (req, res, next) =>
  submitBid(req as AuthenticatedRequest<SubmitBidRequestBody>, res, next),
);

export default bidsRouter;

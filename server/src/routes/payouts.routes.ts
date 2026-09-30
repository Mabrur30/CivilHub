import { Router } from "express";
import { getMyPayouts, saveMyPayoutAccount } from "../controllers/payout.controller";
import { type AuthenticatedRequest, protect } from "../middleware/auth.middleware";

const payoutsRouter = Router();

payoutsRouter.get("/me", protect, (req, res, next) =>
  getMyPayouts(req as AuthenticatedRequest, res, next),
);
payoutsRouter.put("/me/account", protect, (req, res, next) =>
  saveMyPayoutAccount(req as AuthenticatedRequest<Record<string, unknown>>, res, next),
);

export default payoutsRouter;

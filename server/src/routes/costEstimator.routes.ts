import { type NextFunction, type Request, type Response, Router } from "express";
import {
  getLocations,
  predictCost,
  saveEstimate,
  getUserEstimates,
  getEstimateById,
  deleteEstimate,
} from "../controllers/costEstimator.controller";
import { protect } from "../middleware/auth.middleware";
import { assertCanUseCostEstimator } from "../utils/roles";

const costEstimatorRouter = Router();

// Rental-only companies don't get the estimator; see assertCanUseCostEstimator.
const canEstimate = (req: Request, _res: Response, next: NextFunction): void => {
  assertCanUseCostEstimator(req.user).then(() => next(), next);
};

costEstimatorRouter.get("/locations", getLocations);
costEstimatorRouter.post("/predict", protect, canEstimate, predictCost);
costEstimatorRouter.post("/save", protect, canEstimate, saveEstimate);
costEstimatorRouter.get("/history", protect, canEstimate, getUserEstimates);
costEstimatorRouter.get("/:id", getEstimateById);
costEstimatorRouter.delete("/:id", protect, canEstimate, deleteEstimate);

export default costEstimatorRouter;

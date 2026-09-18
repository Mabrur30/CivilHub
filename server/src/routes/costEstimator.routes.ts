import { Router } from "express";
import {
  getLocations,
  predictCost,
  saveEstimate,
  getUserEstimates,
  getEstimateById,
  deleteEstimate,
} from "../controllers/costEstimator.controller";
import { protect } from "../middleware/auth.middleware";

const costEstimatorRouter = Router();

costEstimatorRouter.get("/locations", getLocations);
costEstimatorRouter.post("/predict", protect, predictCost);
costEstimatorRouter.post("/save", protect, saveEstimate);
costEstimatorRouter.get("/history", protect, getUserEstimates);
costEstimatorRouter.get("/:id", getEstimateById);
costEstimatorRouter.delete("/:id", protect, deleteEstimate);

export default costEstimatorRouter;

import { Router } from "express";
import {
  getLocations,
  predictCost,
  saveEstimate,
  getUserEstimates,
  getEstimateById,
  deleteEstimate,
} from "../controllers/costEstimator.controller";
import { protect, optionalProtect } from "../middleware/auth.middleware";

const costEstimatorRouter = Router();

costEstimatorRouter.get("/locations", getLocations);
costEstimatorRouter.post("/predict", predictCost);
costEstimatorRouter.post("/save", optionalProtect, saveEstimate);
costEstimatorRouter.get("/history", protect, getUserEstimates);
costEstimatorRouter.get("/:id", getEstimateById);
costEstimatorRouter.delete("/:id", protect, deleteEstimate);

export default costEstimatorRouter;

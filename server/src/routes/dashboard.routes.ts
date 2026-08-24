import { Router } from "express";
import { getEngineerOverview } from "../controllers/project.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const dashboardRouter = Router();

dashboardRouter.get("/engineer/overview", protect, (req, res, next) =>
  getEngineerOverview(req as AuthenticatedRequest, res, next),
);

export default dashboardRouter;

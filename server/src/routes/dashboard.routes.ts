import { Router } from "express";
import {
  getClientOverview,
  getEngineerOverview,
} from "../controllers/project.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const dashboardRouter = Router();

dashboardRouter.get("/engineer/overview", protect, (req, res, next) =>
  getEngineerOverview(req as AuthenticatedRequest, res, next),
);
dashboardRouter.get("/client/overview", protect, (req, res, next) =>
  getClientOverview(req as AuthenticatedRequest, res, next),
);

export default dashboardRouter;

import { Router } from "express";
import {
  getMyProjects,
  getOpenProjects,
} from "../controllers/project.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const projectsRouter = Router();

projectsRouter.get("/open", getOpenProjects);
projectsRouter.get("/my-projects", protect, (req, res, next) =>
  getMyProjects(req as AuthenticatedRequest, res, next),
);

export default projectsRouter;

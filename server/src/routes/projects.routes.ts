import { Router } from "express";
import {
  createProject,
  getMyPostedProjects,
  getMyProjects,
  getOpenProjects,
  type CreateProjectRequestBody,
} from "../controllers/project.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const projectsRouter = Router();

projectsRouter.get("/open", getOpenProjects);
projectsRouter.post("/", protect, (req, res, next) =>
  createProject(
    req as AuthenticatedRequest<CreateProjectRequestBody>,
    res,
    next,
  ),
);
projectsRouter.get("/my-projects", protect, (req, res, next) =>
  getMyProjects(req as AuthenticatedRequest, res, next),
);
projectsRouter.get("/my-posted-projects", protect, (req, res, next) =>
  getMyPostedProjects(req as AuthenticatedRequest, res, next),
);

export default projectsRouter;

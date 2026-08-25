import { Router } from "express";
import {
  createProject,
  getMyPostedProjects,
  getMyProjects,
  getOpenProjects,
  type CreateProjectRequestBody,
} from "../controllers/project.controller";
import {
  getProjectProgress,
  updateProjectPhase,
  type UpdateProjectPhaseBody,
} from "../controllers/projectProgress.controller";
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
projectsRouter.get("/:projectId/progress", protect, (req, res, next) =>
  getProjectProgress(req as AuthenticatedRequest, res, next),
);
projectsRouter.patch("/:projectId/phases/:phaseId", protect, (req, res, next) =>
  updateProjectPhase(
    req as AuthenticatedRequest<UpdateProjectPhaseBody>,
    res,
    next,
  ),
);

export default projectsRouter;

import { Router } from "express";
import {
  createProject,
  getMyPostedProjects,
  getMyProjects,
  getOpenProjects,
  type CreateProjectRequestBody,
  createPhasePlan,
  type CreatePhasePlanRequestBody,
  submitPhasePlanForApproval,
  getPhasePlan,
  approvePhasePlan,
  type ApprovePhasePlanRequestBody,
  rejectPhasePlan,
  type RejectPhasePlanRequestBody,
} from "../controllers/project.controller";
import {
  getProjectProgress,
  updateProjectPhase,
  type UpdateProjectPhaseBody,
  payAdvance,
  type PayAdvanceRequestBody,
  payForPhase,
  type PayForPhaseRequestBody,
  payFullRemaining,
  type PayFullRemainingRequestBody,
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

// ===== Phase Planning Routes =====
projectsRouter.post("/:projectId/phase-plan", protect, (req, res, next) =>
  createPhasePlan(
    req as AuthenticatedRequest<CreatePhasePlanRequestBody>,
    res,
    next,
  ),
);
projectsRouter.post(
  "/:projectId/phase-plan/submit",
  protect,
  (req, res, next) =>
    submitPhasePlanForApproval(req as AuthenticatedRequest, res, next),
);
projectsRouter.get("/:projectId/phase-plan", protect, (req, res, next) =>
  getPhasePlan(req as AuthenticatedRequest, res, next),
);
projectsRouter.post(
  "/:projectId/phase-plan/approve",
  protect,
  (req, res, next) =>
    approvePhasePlan(
      req as AuthenticatedRequest<ApprovePhasePlanRequestBody>,
      res,
      next,
    ),
);
projectsRouter.post(
  "/:projectId/phase-plan/reject",
  protect,
  (req, res, next) =>
    rejectPhasePlan(
      req as AuthenticatedRequest<RejectPhasePlanRequestBody>,
      res,
      next,
    ),
);

// ===== Payment Routes =====
projectsRouter.post("/:projectId/payments/advance", protect, (req, res, next) =>
  payAdvance(req as AuthenticatedRequest<PayAdvanceRequestBody>, res, next),
);
projectsRouter.post(
  "/:projectId/phases/:phaseId/payments",
  protect,
  (req, res, next) =>
    payForPhase(req as AuthenticatedRequest<PayForPhaseRequestBody>, res, next),
);
projectsRouter.post(
  "/:projectId/payments/full-remaining",
  protect,
  (req, res, next) =>
    payFullRemaining(
      req as AuthenticatedRequest<PayFullRemainingRequestBody>,
      res,
      next,
    ),
);

export default projectsRouter;

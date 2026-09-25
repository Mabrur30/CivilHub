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
import { canReviewProject } from "../controllers/review.controller";
import {
  getProjectProgress,
  updateProjectPhase,
  type UpdateProjectPhaseBody,
  approvePhase,
  requestPhaseChanges,
  type RequestPhaseChangesBody,
} from "../controllers/projectProgress.controller";
import { getMyProjectHistory } from "../controllers/projectHistory.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const projectsRouter = Router();

projectsRouter.get("/history", protect, (req, res, next) =>
  getMyProjectHistory(req as AuthenticatedRequest, res, next),
);

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
projectsRouter.get("/:projectId/can-review", protect, (req, res, next) =>
  canReviewProject(req as AuthenticatedRequest, res, next),
);
projectsRouter.patch("/:projectId/phases/:phaseId", protect, (req, res, next) =>
  updateProjectPhase(
    req as AuthenticatedRequest<UpdateProjectPhaseBody>,
    res,
    next,
  ),
);

// Only the client completes a phase: approving it, or sending it back with a
// note. A phase that costs something is approved by paying for it through
// /api/payments.
projectsRouter.post(
  "/:projectId/phases/:phaseId/approve",
  protect,
  (req, res, next) =>
    approvePhase(req as AuthenticatedRequest, res, next),
);
projectsRouter.post(
  "/:projectId/phases/:phaseId/request-changes",
  protect,
  (req, res, next) =>
    requestPhaseChanges(
      req as AuthenticatedRequest<RequestPhaseChangesBody>,
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

// Payments (advance, phases, remaining balance) go through /api/payments.

export default projectsRouter;

import { type NextFunction, type Request, type Response, Router } from "express";
import { getMyCaseThread, postMyCaseMessage } from "../controllers/caseMessage.controller";
import { acceptCaseDecision, appealCaseDecision } from "../controllers/disputeDecision.controller";
import { type AuthenticatedRequest, protect } from "../middleware/auth.middleware";
import { certificateUpload, handleUploadError } from "../middleware/upload.middleware";
import { CASE_FILE_LIMIT } from "../models/CaseMessage.model";

/**
 * A side's private thread with CivilHub in a dispute. `caseType` is "project"
 * (a project dispute id) or "deposit" (the booking id of a disputed deposit).
 */
const disputeCasesRouter = Router();

disputeCasesRouter.get("/:caseType/:caseId/messages", protect, (req, res, next) =>
  getMyCaseThread(req as AuthenticatedRequest, res, next),
);

// Photos or PDFs as evidence, 10 MB each.
disputeCasesRouter.post(
  "/:caseType/:caseId/messages",
  protect,
  certificateUpload.array("files", CASE_FILE_LIMIT),
  handleUploadError,
  (req: Request, res: Response, next: NextFunction) =>
    postMyCaseMessage(req as AuthenticatedRequest<{ text?: unknown }>, res, next),
);

// A decision waiting out its appeal window: accept it, or appeal it once.
disputeCasesRouter.post("/:caseType/:caseId/accept", protect, (req, res, next) =>
  acceptCaseDecision(req as AuthenticatedRequest, res, next),
);
disputeCasesRouter.post("/:caseType/:caseId/appeal", protect, (req, res, next) =>
  appealCaseDecision(req as AuthenticatedRequest<{ reason?: unknown }>, res, next),
);

export default disputeCasesRouter;

import { Router } from "express";
import {
  blockUser,
  createReport,
  getMyBlocks,
  type ReportBody,
  unblockUser,
} from "../controllers/safety.controller";
import { type AuthenticatedRequest, protect } from "../middleware/auth.middleware";

/** /api/blocks: block, unblock and list the people you've blocked. */
export const blocksRouter = Router();
blocksRouter.get("/", protect, (req, res, next) =>
  getMyBlocks(req as AuthenticatedRequest, res, next),
);
blocksRouter.post("/:userId", protect, (req, res, next) =>
  blockUser(req as AuthenticatedRequest, res, next),
);
blocksRouter.delete("/:userId", protect, (req, res, next) =>
  unblockUser(req as AuthenticatedRequest, res, next),
);

/** /api/reports: flag a person, post or comment for review. */
export const reportsRouter = Router();
reportsRouter.post("/", protect, (req, res, next) =>
  createReport(req as AuthenticatedRequest<ReportBody>, res, next),
);

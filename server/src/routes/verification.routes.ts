import { type NextFunction, type Request, type Response, Router } from "express";
import { getMyVerification, submitVerification } from "../controllers/verification.controller";
import { type AuthenticatedRequest, protect } from "../middleware/auth.middleware";
import { certificateUpload, handleUploadError } from "../middleware/upload.middleware";

const verificationRouter = Router();

verificationRouter.get("/me", protect, (req, res, next) =>
  getMyVerification(req as AuthenticatedRequest, res, next),
);

// Images or PDFs, 10 MB each: the IEB certificate or trade licence, and one
// or two sides of the NID.
verificationRouter.post(
  "/me",
  protect,
  certificateUpload.fields([
    { name: "ieb", maxCount: 1 },
    { name: "licence", maxCount: 1 },
    { name: "nid", maxCount: 2 },
  ]),
  handleUploadError,
  (req: Request, res: Response, next: NextFunction) =>
    submitVerification(req as AuthenticatedRequest<{ iebNumber?: unknown; tradeLicenceNo?: unknown }>, res, next),
);

export default verificationRouter;

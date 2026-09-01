import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  deleteCertificate,
  deletePortfolioItem,
  getMyEngineerProfile,
  searchEngineers,
  updateMyEngineerProfile,
  type UpdateEngineerProfileBody,
  uploadCertificate,
  uploadPortfolioItem,
  uploadProfilePhoto,
} from "../controllers/engineer.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";
import {
  certificateUpload,
  handleUploadError,
  portfolioUpload,
  profilePhotoUpload,
} from "../middleware/upload.middleware";
import { getEngineerReviews } from "../controllers/review.controller";

const engineerRouter = Router();

engineerRouter.get("/search", protect, (req, res, next) =>
  searchEngineers(req as AuthenticatedRequest, res, next),
);
engineerRouter.get("/:engineerUserId/reviews", protect, (req, res, next) =>
  getEngineerReviews(req as AuthenticatedRequest, res, next),
);

engineerRouter.get("/me", protect, (req, res, next) =>
  getMyEngineerProfile(req as AuthenticatedRequest, res, next),
);
engineerRouter.patch("/me", protect, (req, res, next) =>
  updateMyEngineerProfile(
    req as AuthenticatedRequest<UpdateEngineerProfileBody>,
    res,
    next,
  ),
);
engineerRouter.post(
  "/me/photo",
  protect,
  profilePhotoUpload.single("photo"),
  handleUploadError,
  (req: Request, res: Response, next: NextFunction) =>
    uploadProfilePhoto(req as AuthenticatedRequest, res, next),
);
engineerRouter.post(
  "/me/certificates",
  protect,
  certificateUpload.single("certificate"),
  handleUploadError,
  (req: Request, res: Response, next: NextFunction) =>
    uploadCertificate(
      req as AuthenticatedRequest<{ title: string }>,
      res,
      next,
    ),
);
engineerRouter.delete(
  "/me/certificates/:certificateId",
  protect,
  (req, res, next) => deleteCertificate(req as AuthenticatedRequest, res, next),
);
engineerRouter.post(
  "/me/portfolio",
  protect,
  portfolioUpload.single("image"),
  handleUploadError,
  (req: Request, res: Response, next: NextFunction) =>
    uploadPortfolioItem(
      req as AuthenticatedRequest<{ title: string; description: string }>,
      res,
      next,
    ),
);
engineerRouter.delete(
  "/me/portfolio/:portfolioItemId",
  protect,
  (req: Request, res: Response, next: NextFunction) =>
    deletePortfolioItem(req as AuthenticatedRequest, res, next),
);

export default engineerRouter;

import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  deleteOrganisationPortfolioItem,
  getMyOrganisationProfile,
  updateMyOrganisationProfile,
  uploadOrganisationLogo,
  uploadOrganisationPortfolioItem,
  type UpdateOrganisationBody,
} from "../controllers/organisation.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";
import {
  handleUploadError,
  portfolioUpload,
  profilePhotoUpload,
} from "../middleware/upload.middleware";

const organisationRouter = Router();

organisationRouter.get("/me", protect, (req, res, next) =>
  getMyOrganisationProfile(req as AuthenticatedRequest, res, next),
);
organisationRouter.patch("/me", protect, (req, res, next) =>
  updateMyOrganisationProfile(
    req as AuthenticatedRequest<UpdateOrganisationBody>,
    res,
    next,
  ),
);
organisationRouter.post(
  "/me/logo",
  protect,
  profilePhotoUpload.single("logo"),
  handleUploadError,
  (req: Request, res: Response, next: NextFunction) =>
    uploadOrganisationLogo(req as AuthenticatedRequest, res, next),
);
organisationRouter.post(
  "/me/portfolio",
  protect,
  portfolioUpload.single("image"),
  handleUploadError,
  (req: Request, res: Response, next: NextFunction) =>
    uploadOrganisationPortfolioItem(
      req as AuthenticatedRequest<{ title?: string; description?: string }>,
      res,
      next,
    ),
);
organisationRouter.delete(
  "/me/portfolio/:itemId",
  protect,
  (req: Request, res: Response, next: NextFunction) =>
    deleteOrganisationPortfolioItem(req as AuthenticatedRequest, res, next),
);

export default organisationRouter;

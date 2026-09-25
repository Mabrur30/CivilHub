import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  getMyClientProfile,
  updateMyClientProfile,
  uploadClientProfilePhoto,
  type UpdateClientProfileBody,
} from "../controllers/client.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";
import {
  handleUploadError,
  profilePhotoUpload,
} from "../middleware/upload.middleware";

const clientRouter = Router();

clientRouter.get("/me", protect, (req, res, next) =>
  getMyClientProfile(req as AuthenticatedRequest, res, next),
);
clientRouter.patch("/me", protect, (req, res, next) =>
  updateMyClientProfile(
    req as AuthenticatedRequest<UpdateClientProfileBody>,
    res,
    next,
  ),
);
clientRouter.post(
  "/me/photo",
  protect,
  profilePhotoUpload.single("photo"),
  handleUploadError,
  (req: Request, res: Response, next: NextFunction) =>
    uploadClientProfilePhoto(req as AuthenticatedRequest, res, next),
);

export default clientRouter;

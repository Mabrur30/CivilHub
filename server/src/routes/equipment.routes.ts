import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { getEquipmentReviews } from "../controllers/review.controller";
import {
  browseEquipment,
  createEquipment,
  deleteEquipment,
  getEquipmentById,
  getMyEquipment,
  updateEquipment,
  type CreateEquipmentBody,
  type UpdateEquipmentBody,
} from "../controllers/equipment.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";
import {
  equipmentPhotoUpload,
  handleUploadError,
} from "../middleware/upload.middleware";

const equipmentRouter = Router();

equipmentRouter.post(
  "/",
  protect,
  equipmentPhotoUpload.array("photos", 6),
  handleUploadError,
  (req: Request, res: Response, next: NextFunction) =>
    createEquipment(
      req as AuthenticatedRequest<CreateEquipmentBody>,
      res,
      next,
    ),
);

equipmentRouter.get("/mine", protect, (req, res, next) =>
  getMyEquipment(req as AuthenticatedRequest, res, next),
);

equipmentRouter.patch("/:equipmentId", protect, (req, res, next) =>
  updateEquipment(req as AuthenticatedRequest<UpdateEquipmentBody>, res, next),
);

equipmentRouter.delete("/:equipmentId", protect, (req, res, next) =>
  deleteEquipment(req as AuthenticatedRequest, res, next),
);

equipmentRouter.get("/browse", protect, (req, res, next) =>
  browseEquipment(req as AuthenticatedRequest, res, next),
);

equipmentRouter.get("/:equipmentId/reviews", protect, (req, res, next) =>
  getEquipmentReviews(req as AuthenticatedRequest, res, next),
);

equipmentRouter.get("/:equipmentId", protect, (req, res, next) =>
  getEquipmentById(req as AuthenticatedRequest, res, next),
);

export default equipmentRouter;

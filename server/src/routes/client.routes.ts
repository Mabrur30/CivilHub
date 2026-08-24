import { Router } from "express";
import {
  getMyClientProfile,
  updateMyClientProfile,
  type UpdateClientProfileBody,
} from "../controllers/client.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

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

export default clientRouter;

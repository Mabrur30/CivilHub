import { Router } from "express";
import {
  getCurrentUser,
  login,
  logout,
  signup,
  updateMyEmail,
  updateMyName,
  updateMyPassword,
  type UpdateEmailBody,
  type UpdateNameBody,
  type UpdatePasswordBody,
} from "../controllers/auth.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const authRouter = Router();

authRouter.post("/signup", signup);
authRouter.post("/login", login);
authRouter.post("/logout", logout);
authRouter.get("/me", protect, (req, res, next) =>
  getCurrentUser(req as AuthenticatedRequest, res, next),
);

// Account settings: the signed-in user changes their own name, email or password.
authRouter.patch("/me", protect, (req, res, next) =>
  updateMyName(req as AuthenticatedRequest<UpdateNameBody>, res, next),
);
authRouter.patch("/me/email", protect, (req, res, next) =>
  updateMyEmail(req as AuthenticatedRequest<UpdateEmailBody>, res, next),
);
authRouter.patch("/me/password", protect, (req, res, next) =>
  updateMyPassword(req as AuthenticatedRequest<UpdatePasswordBody>, res, next),
);

export default authRouter;

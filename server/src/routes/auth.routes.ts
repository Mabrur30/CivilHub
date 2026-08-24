import { Router } from "express";
import {
  getCurrentUser,
  login,
  logout,
  signup,
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

export default authRouter;

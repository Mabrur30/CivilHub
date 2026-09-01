import { Router } from "express";
import { getPublicProfile } from "../controllers/user.controller";
import { getUserPosts } from "../controllers/post.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";

const userRouter = Router();

userRouter.get("/:userId/public-profile", protect, (req, res, next) =>
  getPublicProfile(req as AuthenticatedRequest, res, next),
);
userRouter.get("/:userId/posts", protect, (req, res, next) =>
  getUserPosts(req as AuthenticatedRequest, res, next),
);

export default userRouter;

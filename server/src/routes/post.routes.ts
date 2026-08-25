import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  createPost,
  deletePost,
  getFeed,
  toggleLike,
} from "../controllers/post.controller";
import {
  protect,
  type AuthenticatedRequest,
} from "../middleware/auth.middleware";
import {
  handleUploadError,
  postImageUpload,
} from "../middleware/upload.middleware";

const postRouter = Router();

postRouter.post(
  "/",
  protect,
  postImageUpload.single("image"),
  handleUploadError,
  (req: Request, res: Response, next: NextFunction) =>
    createPost(req as AuthenticatedRequest<{ content?: string }>, res, next),
);

postRouter.get("/feed", protect, (req, res, next) =>
  getFeed(req as AuthenticatedRequest, res, next),
);

postRouter.patch("/:postId/like", protect, (req, res, next) =>
  toggleLike(req as AuthenticatedRequest, res, next),
);

postRouter.delete("/:postId", protect, (req, res, next) =>
  deletePost(req as AuthenticatedRequest, res, next),
);

export default postRouter;

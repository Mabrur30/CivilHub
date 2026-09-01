import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Engineer } from "../models/Engineer.model";
import { Notification } from "../models/Notification.model";
import { Comment, type IComment } from "../models/Comment.model";
import { Post } from "../models/Post.model";
import { Review } from "../models/Review.model";
import { User, type UserRole } from "../models/User.model";

interface CommentError extends Error {
  statusCode: number;
}
interface CommentParams {
  postId?: string;
  commentId?: string;
}
export interface CreateCommentBody {
  postId: string;
  content: string;
  parentCommentId?: string;
}
interface CommentAuthor {
  _id: Types.ObjectId;
  name: string;
  role: UserRole;
}
export interface CommentResponse {
  id: string;
  postId: string;
  author: {
    userId: string;
    name: string;
    role: UserRole;
    profilePhotoUrl: string | null;
  };
  rating: number | null;
  reviewCount: number;
  content: string;
  parentCommentId: string | null;
  createdAt: string;
  updatedAt: string;
}

const createCommentError = (
  message: string,
  statusCode: number,
): CommentError => {
  const error = new Error(message) as CommentError;
  error.statusCode = statusCode;
  return error;
};
const getUserId = (req: AuthenticatedRequest): string => {
  if (!req.user?.userId)
    throw createCommentError("Authentication required", 401);
  return req.user.userId;
};
const getParams = (req: AuthenticatedRequest): CommentParams =>
  req.params as unknown as CommentParams;

const photoForAuthor = async (authorId: string): Promise<string | null> => {
  const engineer = await Engineer.findOne({ user: authorId })
    .select("profilePhoto")
    .exec();
  return engineer?.profilePhoto?.url ?? null;
};

const ratingForAuthor = async (
  authorId: string,
): Promise<{ rating: number | null; reviewCount: number }> => {
  const result = await Review.aggregate<{
    averageRating: number;
    reviewCount: number;
  }>([
    { $match: { engineer: new Types.ObjectId(authorId) } },
    {
      $group: {
        _id: "$engineer",
        averageRating: { $avg: "$rating" },
        reviewCount: { $sum: 1 },
      },
    },
  ]).exec();
  const aggregate = result[0];
  return aggregate
    ? {
        rating: Math.round(aggregate.averageRating * 10) / 10,
        reviewCount: aggregate.reviewCount,
      }
    : { rating: null, reviewCount: 0 };
};

const toCommentResponse = async (
  comment: IComment,
): Promise<CommentResponse> => {
  const author = comment.author as unknown as CommentAuthor;
  const rating =
    author.role === "engineer"
      ? await ratingForAuthor(author._id.toString())
      : { rating: null, reviewCount: 0 };
  return {
    id: comment._id.toString(),
    postId: comment.post.toString(),
    author: {
      userId: author._id.toString(),
      name: author.name,
      role: author.role,
      profilePhotoUrl: await photoForAuthor(author._id.toString()),
    },
    rating: rating.rating,
    reviewCount: rating.reviewCount,
    content: comment.content,
    parentCommentId: comment.parentComment?.toString() ?? null,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };
};

export const createComment = async (
  req: AuthenticatedRequest<CreateCommentBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    const { postId, content, parentCommentId } = req.body;
    if (
      !postId ||
      !Types.ObjectId.isValid(postId) ||
      !content?.trim() ||
      content.length > 500
    ) {
      throw createCommentError(
        "Valid post ID and comment content of 500 characters or fewer are required",
        400,
      );
    }
    const post = await Post.findById(postId).exec();
    if (!post) throw createCommentError("Post not found", 404);
    let parent: IComment | null = null;
    if (parentCommentId) {
      if (!Types.ObjectId.isValid(parentCommentId))
        throw createCommentError("Parent comment not found", 404);
      parent = await Comment.findById(parentCommentId).exec();
      if (!parent || parent.post.toString() !== postId)
        throw createCommentError("Parent comment not found", 404);
    }
    const comment = await Comment.create({
      post: post._id,
      author: new Types.ObjectId(userId),
      content: content.trim(),
      parentComment: parent?._id ?? null,
    });
    const populated = await Comment.findById(comment._id)
      .populate("author", "name role")
      .exec();
    if (!populated)
      throw createCommentError("Unable to load created comment", 500);
    const response = await toCommentResponse(populated);
    const recipient = parent?.author ?? post.author;
    if (recipient.toString() !== userId) {
      const author = await User.findById(userId).select("name").exec();
      await Notification.create({
        recipient,
        type: "comment_received",
        message: `${author?.name ?? "Someone"} commented on your post.`,
        project: undefined,
      });
    }
    res.status(201).json(response);
  } catch (error: unknown) {
    next(error);
  }
};

export const getCommentsForPost = async (
  req: AuthenticatedRequest,
  res: Response<CommentResponse[]>,
  next: NextFunction,
): Promise<void> => {
  try {
    getUserId(req);
    const { postId } = getParams(req);
    if (
      !postId ||
      !Types.ObjectId.isValid(postId) ||
      !(await Post.exists({ _id: postId }))
    ) {
      throw createCommentError("Post not found", 404);
    }
    // Return a flat array so the frontend can build the threaded tree without recursive API calls.
    const comments = await Comment.find({ post: postId })
      .populate("author", "name role")
      .sort({ createdAt: 1 })
      .exec();
    res.json(await Promise.all(comments.map(toCommentResponse)));
  } catch (error: unknown) {
    next(error);
  }
};

export const deleteComment = async (
  req: AuthenticatedRequest,
  res: Response<CommentResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    const { commentId } = getParams(req);
    if (!commentId || !Types.ObjectId.isValid(commentId))
      throw createCommentError("Comment not found", 404);
    const comment = await Comment.findById(commentId)
      .populate("author", "name role")
      .exec();
    if (!comment) throw createCommentError("Comment not found", 404);
    if (comment.author._id.toString() !== userId)
      throw createCommentError("Only the author can delete this comment", 403);
    comment.content = "[deleted]";
    await comment.save();
    res.json(await toCommentResponse(comment));
  } catch (error: unknown) {
    next(error);
  }
};

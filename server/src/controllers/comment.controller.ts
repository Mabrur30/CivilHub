import { type NextFunction, type Response } from "express";
import { Types } from "mongoose";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Notification } from "../models/Notification.model";
import { Comment, type IComment } from "../models/Comment.model";
import { Post } from "../models/Post.model";
import { Review } from "../models/Review.model";
import { User, type UserRole } from "../models/User.model";
import { getProfilePhotoMap } from "../utils/profilePhotos";
import { isProviderRole } from "../utils/roles";
import { blockedUserIds, isBlockedEitherWay } from "../utils/blocks";

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

/**
 * Builds responses for a batch of comments with one photo lookup and one
 * rating aggregate for all their authors, instead of several queries each.
 */
const toCommentResponses = async (
  comments: IComment[],
): Promise<CommentResponse[]> => {
  const authors = comments.map((comment) => comment.author as unknown as CommentAuthor);
  const authorIds = [...new Set(authors.map((author) => author._id.toString()))];
  const providerIds = [
    ...new Set(
      authors.filter((author) => isProviderRole(author.role)).map((author) => author._id.toString()),
    ),
  ];
  const [photoByUser, ratingRows] = await Promise.all([
    getProfilePhotoMap(authorIds.map((id) => new Types.ObjectId(id))),
    providerIds.length
      ? Review.aggregate<{ _id: Types.ObjectId; averageRating: number; reviewCount: number }>([
          {
            $match: {
              engineer: { $in: providerIds.map((id) => new Types.ObjectId(id)) },
              project: { $exists: true, $ne: null },
            },
          },
          {
            $group: {
              _id: "$engineer",
              averageRating: { $avg: "$rating" },
              reviewCount: { $sum: 1 },
            },
          },
        ]).exec()
      : Promise.resolve([]),
  ]);
  const ratingByUser = new Map(
    ratingRows.map((row) => [
      row._id.toString(),
      { rating: Math.round(row.averageRating * 10) / 10, reviewCount: row.reviewCount },
    ]),
  );

  return comments.map((comment) => {
    const author = comment.author as unknown as CommentAuthor;
    const authorId = author._id.toString();
    const rating = isProviderRole(author.role) ? ratingByUser.get(authorId) : undefined;
    return {
      id: comment._id.toString(),
      postId: comment.post.toString(),
      author: {
        userId: authorId,
        name: author.name,
        role: author.role,
        profilePhotoUrl: photoByUser.get(authorId) ?? null,
      },
      rating: rating?.rating ?? null,
      reviewCount: rating?.reviewCount ?? 0,
      content: comment.content,
      parentCommentId: comment.parentComment?.toString() ?? null,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    };
  });
};

const toCommentResponse = async (comment: IComment): Promise<CommentResponse> =>
  (await toCommentResponses([comment]))[0];

export const createComment = async (
  req: AuthenticatedRequest<CreateCommentBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    const { postId, content, parentCommentId } = req.body;
    if (
      typeof postId !== "string" ||
      !Types.ObjectId.isValid(postId) ||
      typeof content !== "string" ||
      !content.trim() ||
      content.length > 500 ||
      (parentCommentId !== undefined &&
        parentCommentId !== null &&
        typeof parentCommentId !== "string")
    ) {
      throw createCommentError(
        "Valid post ID and comment content of 500 characters or fewer are required",
        400,
      );
    }
    const post = await Post.findById(postId).exec();
    if (!post) throw createCommentError("Post not found", 404);
    if (await isBlockedEitherWay(userId, post.author.toString())) {
      throw createCommentError("You can't comment on this post", 403);
    }
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
        post: post._id,
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
    const viewerId = getUserId(req);
    const { postId } = getParams(req);
    if (
      !postId ||
      !Types.ObjectId.isValid(postId) ||
      !(await Post.exists({ _id: postId }))
    ) {
      throw createCommentError("Post not found", 404);
    }
    // Return a flat array so the frontend can build the threaded tree without recursive API calls.
    const query = req.query as { limit?: string; offset?: string };
    const all = await Comment.find({ post: postId })
      .populate("author", "name role")
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    // A deleted account leaves no author; people you've blocked (or who
    // blocked you) are hidden. Either way the rest of the thread still loads.
    const hidden = await blockedUserIds(viewerId);
    const comments = all.filter(
      (comment) =>
        comment.author &&
        !hidden.has((comment.author as unknown as CommentAuthor)._id.toString()),
    );

    if (query.limit === undefined) {
      res.json(await toCommentResponses(comments));
      return;
    }
    // ?limit=&offset= pages through top-level comments, each with all of its
    // replies, so a long thread loads a screenful at a time.
    const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || 20));
    const offset = Math.max(0, Number.parseInt(query.offset ?? "0", 10) || 0);
    const parentOf = new Map(
      comments.map((comment) => [
        comment._id.toString(),
        comment.parentComment ? comment.parentComment.toString() : null,
      ]),
    );
    const rootOf = (id: string): string => {
      let current = id;
      for (let depth = 0; depth < 100; depth += 1) {
        const parent = parentOf.get(current);
        if (!parent || !parentOf.has(parent)) return current;
        current = parent;
      }
      return current;
    };
    const roots = comments.filter((comment) => rootOf(comment._id.toString()) === comment._id.toString());
    const pageRoots = new Set(roots.slice(offset, offset + limit).map((comment) => comment._id.toString()));
    const page = comments.filter((comment) => pageRoots.has(rootOf(comment._id.toString())));
    res.json(await toCommentResponses(page));
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

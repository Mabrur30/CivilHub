import { type NextFunction, type Response } from "express";
import { type UploadApiOptions, type UploadApiResponse } from "cloudinary";
import { Types } from "mongoose";
import cloudinary from "../config/cloudinary";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Connection } from "../models/Connection.model";
import { Comment } from "../models/Comment.model";
import { Notification } from "../models/Notification.model";
import { Post, type IPost } from "../models/Post.model";
import { Review } from "../models/Review.model";
import { User, type UserRole } from "../models/User.model";
import { restrictedUserIds } from "../utils/accountStatus";
import { blockedUserIds, isBlockedEitherWay } from "../utils/blocks";
import { getProfilePhotoMap } from "../utils/profilePhotos";
import { isProviderRole } from "../utils/roles";
import { STRIP_IMAGE_METADATA } from "../utils/cloudinaryUpload";

interface PostError extends Error {
  statusCode: number;
}

interface CreatePostBody {
  content?: string;
}

export interface CreateRepostBody {
  originalPostId: string;
  content?: string;
}

interface FeedQuery {
  page?: string;
  limit?: string;
  /** "<createdAt ISO>|<postId>" of the last post already shown. */
  before?: string;
}

interface PostParams {
  postId?: string;
  userId?: string;
}

/** What a post's author is loaded with; verifiedAt drives the Verified badge. */
const AUTHOR_FIELDS = "name role verifiedAt";

interface PopulatedUser {
  _id: Types.ObjectId;
  name: string;
  role: UserRole;
  verifiedAt?: Date | null;
}

interface FeedPostAuthor {
  userId: string;
  name: string;
  role: UserRole;
  profilePhotoUrl: string | null;
  rating: number | null;
  reviewCount: number;
  /** Checked by CivilHub: shows the Verified badge. */
  verified: boolean;
}

interface FeedPostOriginal {
  id: string;
  content: string;
  imageUrl: string | null;
  author: FeedPostAuthor;
  createdAt: string;
}

interface FeedPostResponse {
  id: string;
  content: string;
  imageUrl: string | null;
  author: FeedPostAuthor;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  originalPost: FeedPostOriginal | null;
  /** A repost whose original was deleted (or whose author is gone). */
  originalRemoved: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FeedResponse {
  posts: FeedPostResponse[];
  page: number;
  limit: number;
  total: number;
  /** Pass as `before` to get the next page; null when there are no more. */
  nextCursor: string | null;
}

const MAX_POST_LENGTH = 2000;

/** Optional text within the post limit; a 400 for anything else. */
const optionalContent = (value: unknown): string => {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw createPostError("Post content must be text", 400);
  const text = value.trim();
  if (text.length > MAX_POST_LENGTH) {
    throw createPostError(`Post content must be ${MAX_POST_LENGTH} characters or fewer`, 400);
  }
  return text;
};

const toCursor = (post: IPost): string => `${post.createdAt.toISOString()}|${post._id.toString()}`;

/** Filter for posts older than the cursor, or {} for a bad or missing one. */
const beforeCursor = (cursor: string | undefined): Record<string, unknown> => {
  if (!cursor) return {};
  const [iso, id] = cursor.split("|");
  const date = new Date(iso ?? "");
  if (Number.isNaN(date.getTime()) || !id || !Types.ObjectId.isValid(id)) {
    throw createPostError("Invalid feed cursor", 400);
  }
  return {
    $or: [
      { createdAt: { $lt: date } },
      { createdAt: date, _id: { $lt: new Types.ObjectId(id) } },
    ],
  };
};

/** Comment counts for many posts in one aggregate instead of a query each. */
const getCommentCounts = async (posts: IPost[]): Promise<Map<string, number>> => {
  if (posts.length === 0) return new Map();
  const rows = await Comment.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { post: { $in: posts.map((post) => post._id) } } },
    { $group: { _id: "$post", count: { $sum: 1 } } },
  ]).exec();
  return new Map(rows.map((row) => [row._id.toString(), row.count]));
};

/** Drops posts whose author (or shared post's author) account no longer exists. */
const hasLiveAuthor = (post: IPost): boolean => Boolean(post.author);

interface RatingAggregate {
  _id: Types.ObjectId;
  averageRating: number;
  reviewCount: number;
}

const createPostError = (message: string, statusCode: number): PostError => {
  const error = new Error(message) as PostError;
  error.statusCode = statusCode;
  return error;
};

const requireUser = (req: AuthenticatedRequest): string => {
  if (!req.user?.userId) {
    throw createPostError("Authentication required", 401);
  }

  return req.user.userId;
};

const requireEngineerPoster = (req: AuthenticatedRequest): string => {
  const userId = requireUser(req);
  if (!isProviderRole(req.user.role)) {
    throw createPostError("Only engineers and companies can create posts", 403);
  }

  return userId;
};

const getQuery = (req: AuthenticatedRequest): FeedQuery =>
  req.query as unknown as FeedQuery;

const getParams = (req: AuthenticatedRequest): PostParams =>
  req.params as unknown as PostParams;

const uploadBuffer = (
  buffer: Buffer,
  options: UploadApiOptions,
): Promise<UploadApiResponse> =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        if (!result) {
          reject(new Error("Cloudinary did not return an upload result"));
          return;
        }

        resolve(result);
      },
    );

    stream.end(buffer);
  });

const deleteCloudinaryImage = async (publicId: string): Promise<void> => {
  await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
};

const normalizeUserId = (value: Types.ObjectId | PopulatedUser): string =>
  value instanceof Types.ObjectId ? value.toString() : value._id.toString();

const getAcceptedConnectionUserIds = async (
  userId: string,
): Promise<string[]> => {
  const rows = await Connection.find({
    $or: [{ requester: userId }, { recipient: userId }],
    status: "accepted",
  })
    .select("requester recipient")
    .exec();

  const ids = new Set<string>([userId]);
  rows.forEach((row) => {
    ids.add(row.requester.toString());
    ids.add(row.recipient.toString());
  });

  return Array.from(ids);
};

const getPhotoMapByUserIds = (
  userIds: string[],
): Promise<Map<string, string>> => getProfilePhotoMap(userIds);

const getEngineerRatingMapByUserIds = async (
  userIds: string[],
): Promise<Map<string, { rating: number; reviewCount: number }>> => {
  const objectIds = userIds
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
  const aggregates = await Review.aggregate<RatingAggregate>([
    {
      $match: {
        engineer: { $in: objectIds },
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
  ]).exec();
  return new Map(
    aggregates.map((item) => [
      item._id.toString(),
      {
        rating: Math.round(item.averageRating * 10) / 10,
        reviewCount: item.reviewCount,
      },
    ]),
  );
};

const toFeedAuthor = (
  user: PopulatedUser,
  photoByUserId: Map<string, string>,
  ratingByUserId: Map<string, { rating: number; reviewCount: number }>,
): FeedPostAuthor => {
  const userId = user._id.toString();
  const rating =
    isProviderRole(user.role) ? ratingByUserId.get(userId) : undefined;
  return {
    userId,
    name: user.name,
    role: user.role,
    profilePhotoUrl: photoByUserId.get(userId) ?? null,
    rating: rating?.rating ?? null,
    reviewCount: rating?.reviewCount ?? 0,
    verified: Boolean(user.verifiedAt),
  };
};

const toFeedPost = (
  post: IPost,
  viewerUserId: string,
  photoByUserId: Map<string, string>,
  ratingByUserId: Map<string, { rating: number; reviewCount: number }>,
  commentCount = 0,
  /** People blocked either way: a repost of theirs shows as unavailable. */
  hiddenAuthorIds: Set<string> = new Set(),
): FeedPostResponse => {
  const author = post.author as unknown as PopulatedUser;
  const populatedOriginal = post.originalPost as unknown as IPost | null;
  // An original whose author account is gone, or who is blocked either way,
  // is shown as removed too.
  const original =
    populatedOriginal?.author &&
    !hiddenAuthorIds.has(
      normalizeUserId(populatedOriginal.author as unknown as PopulatedUser),
    )
      ? populatedOriginal
      : null;
  const originalRemoved =
    Boolean(post.originalRemoved) || Boolean(populatedOriginal && !original);

  const originalResponse: FeedPostOriginal | null = original
    ? {
        id: original._id.toString(),
        content: original.content,
        imageUrl: original.imageUrl ?? null,
        createdAt: original.createdAt.toISOString(),
        author: toFeedAuthor(
          original.author as unknown as PopulatedUser,
          photoByUserId,
          ratingByUserId,
        ),
      }
    : null;

  return {
    id: post._id.toString(),
    content: post.content,
    imageUrl: post.imageUrl ?? null,
    author: toFeedAuthor(author, photoByUserId, ratingByUserId),
    likeCount: post.likes.length,
    likedByMe: post.likes.some((like) => like.toString() === viewerUserId),
    commentCount,
    originalPost: originalResponse,
    originalRemoved,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
};

export const createPost = async (
  req: AuthenticatedRequest<CreatePostBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireEngineerPoster(req);
    const content = optionalContent(req.body.content);

    if (!content) {
      throw createPostError("Post content is required", 400);
    }

    let imageUrl: string | undefined;
    let imagePublicId: string | undefined;

    if (req.file) {
      const upload = await uploadBuffer(req.file.buffer, {
        folder: "civilhub/posts",
        resource_type: "image",
        ...STRIP_IMAGE_METADATA,
      });
      imageUrl = upload.secure_url;
      imagePublicId = upload.public_id;
    }

    const post = await Post.create({
      author: new Types.ObjectId(userId),
      content,
      imageUrl,
      imagePublicId,
      likes: [],
    }).catch(async (error: unknown) => {
      // The post wasn't saved, so its image is deleted again.
      if (imagePublicId) await deleteCloudinaryImage(imagePublicId).catch(() => undefined);
      throw error;
    });

    const populated = await Post.findById(post._id)
      .populate("author", AUTHOR_FIELDS)
      .exec();

    if (!populated) {
      throw createPostError("Unable to load the created post", 500);
    }

    const photoByUserId = await getPhotoMapByUserIds([userId]);
    const ratingByUserId = await getEngineerRatingMapByUserIds([userId]);

    const connectionUserIds = await getAcceptedConnectionUserIds(userId);
    const recipientIds = connectionUserIds.filter((id) => id !== userId);
    if (recipientIds.length > 0) {
      await Notification.insertMany(
        recipientIds.map((recipientId) => ({
          recipient: new Types.ObjectId(recipientId),
          type: "connection_post" as const,
          post: post._id,
          message: "A connection shared a new post.",
        })),
      );
    }

    res
      .status(201)
      .json(toFeedPost(populated, userId, photoByUserId, ratingByUserId, 0));
  } catch (error: unknown) {
    next(error);
  }
};

export const getFeed = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUser(req);
    const query = getQuery(req);
    const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
    const limit = Math.min(
      30,
      Math.max(1, Number.parseInt(query.limit ?? "10", 10) || 10),
    );

    const [connectedIds, restricted] = await Promise.all([
      getAcceptedConnectionUserIds(userId),
      restrictedUserIds(),
    ]);
    // Suspended and banned accounts drop out of everyone's feed.
    const allowedAuthorIds = connectedIds.filter((id) => !restricted.has(id));
    const objectIds = allowedAuthorIds.map((id) => new Types.ObjectId(id));
    const cursorFilter = beforeCursor(query.before);

    const [fetched, total] = await Promise.all([
      Post.find({ author: { $in: objectIds }, ...cursorFilter })
        .sort({ createdAt: -1, _id: -1 })
        // With a cursor, page numbers no longer apply.
        .skip(query.before ? 0 : (page - 1) * limit)
        .limit(limit)
        .populate("author", AUTHOR_FIELDS)
        .populate({
          path: "originalPost",
          populate: { path: "author", select: AUTHOR_FIELDS },
        })
        .exec(),
      Post.countDocuments({ author: { $in: objectIds } }),
    ]);
    const posts = fetched.filter(hasLiveAuthor);
    const lastFetched = fetched[fetched.length - 1];

    const photoOwnerIds = new Set<string>();
    posts.forEach((post) => {
      photoOwnerIds.add(
        normalizeUserId(
          post.author as unknown as Types.ObjectId | PopulatedUser,
        ),
      );
      const shared = post.originalPost as unknown as IPost | null;
      if (shared?.author) {
        const original = shared;
        photoOwnerIds.add(
          normalizeUserId(
            original.author as unknown as Types.ObjectId | PopulatedUser,
          ),
        );
      }
    });

    const photoByUserId = await getPhotoMapByUserIds(
      Array.from(photoOwnerIds),
    );
    const ratingByUserId = await getEngineerRatingMapByUserIds(
      Array.from(photoOwnerIds),
    );

    const [commentCounts, hidden] = await Promise.all([
      getCommentCounts(posts),
      blockedUserIds(userId),
    ]);
    // Reposts of a restricted account's post show as unavailable too.
    restricted.forEach((id) => hidden.add(id));
    const response: FeedResponse = {
      posts: posts.map((post) =>
        toFeedPost(
          post,
          userId,
          photoByUserId,
          ratingByUserId,
          commentCounts.get(post._id.toString()) ?? 0,
          hidden,
        ),
      ),
      page,
      limit,
      total,
      nextCursor: fetched.length === limit && lastFetched ? toCursor(lastFetched) : null,
    };

    res.status(200).json(response);
  } catch (error: unknown) {
    next(error);
  }
};

export const createRepost = async (
  req: AuthenticatedRequest<CreateRepostBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Reposting is posting, so it follows the same rule: providers only.
    const userId = requireEngineerPoster(req);
    const { originalPostId } = req.body;
    const content = optionalContent(req.body.content);
    if (
      typeof originalPostId !== "string" ||
      !Types.ObjectId.isValid(originalPostId)
    ) {
      throw createPostError("Original post not found", 404);
    }

    const shared = await Post.findById(originalPostId).exec();
    if (!shared) throw createPostError("Original post not found", 404);
    // Reposting a repost shares the post it points to, not a chain.
    const originalPost =
      shared.originalPost && !shared.originalRemoved
        ? ((await Post.findById(shared.originalPost).exec()) ?? shared)
        : shared;

    if (await isBlockedEitherWay(userId, originalPost.author.toString())) {
      throw createPostError("You can't repost this post", 403);
    }

    // One repost per person per post: a repeat returns the one they made.
    const existingRepost = await Post.findOne({
      author: userId,
      originalPost: originalPost._id,
    }).exec();
    const repost =
      existingRepost ??
      (await Post.create({
        author: new Types.ObjectId(userId),
        content: content || "Reposted",
        originalPost: originalPost._id,
        likes: [],
      }));
    const populated = await Post.findById(repost._id)
      .populate("author", AUTHOR_FIELDS)
      .populate({
        path: "originalPost",
        populate: { path: "author", select: AUTHOR_FIELDS },
      })
      .exec();
    if (!populated) throw createPostError("Unable to load the repost", 500);

    const photoByUserId = await getPhotoMapByUserIds([
      userId,
      originalPost.author.toString(),
    ]);
    const ratingByUserId = await getEngineerRatingMapByUserIds([
      userId,
      originalPost.author.toString(),
    ]);
    if (!existingRepost && originalPost.author.toString() !== userId) {
      const reposter = await User.findById(userId).select("name").exec();
      await Notification.create({
        recipient: originalPost.author,
        type: "post_reposted",
        post: repost._id,
        message: `${reposter?.name ?? "Someone"} reposted your post.`,
      });
    }

    res
      .status(existingRepost ? 200 : 201)
      .json(toFeedPost(populated, userId, photoByUserId, ratingByUserId, 0));
  } catch (error: unknown) {
    next(error);
  }
};

export const getUserPosts = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const viewerUserId = requireUser(req);
    const query = getQuery(req);
    const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
    const limit = Math.min(
      30,
      Math.max(1, Number.parseInt(query.limit ?? "10", 10) || 10),
    );
    const { userId } = getParams(req);
    if (!userId || !Types.ObjectId.isValid(userId)) {
      throw createPostError("User not found", 404);
    }
    // Blocks work both ways: neither side sees the other's posts.
    if (viewerUserId !== userId && (await isBlockedEitherWay(viewerUserId, userId))) {
      res.json({ posts: [], page, limit, total: 0 });
      return;
    }

    const [posts, total] = await Promise.all([
      Post.find({ author: userId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("author", AUTHOR_FIELDS)
        .populate({
          path: "originalPost",
          populate: { path: "author", select: AUTHOR_FIELDS },
        })
        .exec(),
      Post.countDocuments({ author: userId }),
    ]);
    const photoOwnerIds = new Set<string>([userId]);
    posts.forEach((post) => {
      const shared = post.originalPost as unknown as IPost | null;
      if (shared?.author) {
        const original = shared;
        photoOwnerIds.add(
          normalizeUserId(
            original.author as unknown as Types.ObjectId | PopulatedUser,
          ),
        );
      }
    });
    const photoByUserId = await getPhotoMapByUserIds(
      Array.from(photoOwnerIds),
    );
    const ratingByUserId = await getEngineerRatingMapByUserIds(
      Array.from(photoOwnerIds),
    );
    const [commentCounts, hidden] = await Promise.all([
      getCommentCounts(posts),
      blockedUserIds(viewerUserId),
    ]);
    res.json({
      posts: posts.map((post) =>
        toFeedPost(
          post,
          viewerUserId,
          photoByUserId,
          ratingByUserId,
          commentCounts.get(post._id.toString()) ?? 0,
          hidden,
        ),
      ),
      page,
      limit,
      total,
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const toggleLike = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUser(req);
    const { postId } = getParams(req);

    if (!postId || !Types.ObjectId.isValid(postId)) {
      throw createPostError("Post not found", 404);
    }

    const target = await Post.findById(postId).select("author").exec();
    if (!target) {
      throw createPostError("Post not found", 404);
    }
    if (await isBlockedEitherWay(userId, target.author.toString())) {
      throw createPostError("You can't like this post", 403);
    }

    const liker = new Types.ObjectId(userId);
    // Atomic, so two quick taps can't double-count or drop someone's like.
    const liked = await Post.findOneAndUpdate(
      { _id: postId, likes: { $ne: liker } },
      { $addToSet: { likes: liker } },
      { new: true },
    ).exec();
    const post =
      liked ??
      (await Post.findOneAndUpdate(
        { _id: postId, likes: liker },
        { $pull: { likes: liker } },
        { new: true },
      ).exec());
    if (!post) {
      throw createPostError("Post not found", 404);
    }
    const likedByMe = Boolean(liked);

    if (likedByMe && post.author.toString() !== userId) {
      const liker = await User.findById(userId).select("name").exec();
      await Notification.create({
        recipient: post.author,
        type: "post_liked",
        post: post._id,
        message: `${liker?.name ?? "Someone"} liked your post.`,
      });
    }

    res.status(200).json({
      likedByMe,
      likeCount: post.likes.length,
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const deletePost = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = requireUser(req);
    const { postId } = getParams(req);

    if (!postId || !Types.ObjectId.isValid(postId)) {
      throw createPostError("Post not found", 404);
    }

    const post = await Post.findById(postId).exec();
    if (!post) {
      throw createPostError("Post not found", 404);
    }

    if (post.author.toString() !== userId) {
      throw createPostError("Only the author can delete this post", 403);
    }

    await removePost(post);
    res.status(200).json({ success: true });
  } catch (error: unknown) {
    next(error);
  }
};

/** Deletes a post with its comments and image. Used by authors and admins. */
export const removePost = async (post: IPost): Promise<void> => {
  await post.deleteOne();
  await Promise.all([
    Comment.deleteMany({ post: post._id }).exec(),
    // Reposts stay, marked so the feed can say the original was removed.
    Post.updateMany(
      { originalPost: post._id },
      { $set: { originalRemoved: true }, $unset: { originalPost: 1 } },
    ).exec(),
  ]);
  // Last, so a failed delete never leaves a live post with a missing image.
  if (post.imagePublicId) {
    await deleteCloudinaryImage(post.imagePublicId).catch(() => undefined);
  }
};

/** One post, for a notification's link. Any signed-in user may read it. */
export const getPost = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const viewerUserId = requireUser(req);
    const { postId } = getParams(req);
    if (!postId || !Types.ObjectId.isValid(postId)) {
      throw createPostError("Post not found", 404);
    }
    const post = await Post.findById(postId)
      .populate("author", AUTHOR_FIELDS)
      .populate({
        path: "originalPost",
        populate: { path: "author", select: AUTHOR_FIELDS },
      })
      .exec();
    if (!post || !hasLiveAuthor(post)) throw createPostError("Post not found", 404);
    const hidden = await blockedUserIds(viewerUserId);
    // Across a block the post simply isn't there.
    if (hidden.has(normalizeUserId(post.author as unknown as PopulatedUser))) {
      throw createPostError("Post not found", 404);
    }

    const ownerIds = [normalizeUserId(post.author as unknown as PopulatedUser)];
    const shared = post.originalPost as unknown as IPost | null;
    if (shared?.author) {
      ownerIds.push(normalizeUserId(shared.author as unknown as PopulatedUser));
    }
    const [photoByUserId, ratingByUserId, commentCount] = await Promise.all([
      getPhotoMapByUserIds(ownerIds),
      getEngineerRatingMapByUserIds(ownerIds),
      Comment.countDocuments({ post: post._id }),
    ]);
    res
      .status(200)
      .json(toFeedPost(post, viewerUserId, photoByUserId, ratingByUserId, commentCount, hidden));
  } catch (error: unknown) {
    next(error);
  }
};

import { type NextFunction, type Response } from "express";
import { type UploadApiOptions, type UploadApiResponse } from "cloudinary";
import { Types } from "mongoose";
import cloudinary from "../config/cloudinary";
import { type AuthenticatedRequest } from "../middleware/auth.middleware";
import { Connection } from "../models/Connection.model";
import { Engineer } from "../models/Engineer.model";
import { Notification } from "../models/Notification.model";
import { Post, type IPost } from "../models/Post.model";
import { User, type UserRole } from "../models/User.model";

interface PostError extends Error {
  statusCode: number;
}

interface CreatePostBody {
  content?: string;
}

interface FeedQuery {
  page?: string;
  limit?: string;
}

interface PostParams {
  postId?: string;
}

interface PopulatedUser {
  _id: Types.ObjectId;
  name: string;
  role: UserRole;
}

interface FeedPostAuthor {
  userId: string;
  name: string;
  role: UserRole;
  profilePhotoUrl: string | null;
}

interface FeedPostOriginal {
  id: string;
  content: string;
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
  originalPost: FeedPostOriginal | null;
  createdAt: string;
  updatedAt: string;
}

interface FeedResponse {
  posts: FeedPostResponse[];
  page: number;
  limit: number;
  total: number;
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
  if (req.user.role !== "engineer") {
    throw createPostError("Only engineers can create posts", 403);
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

const getEngineerPhotoMapByUserIds = async (
  userIds: string[],
): Promise<Map<string, string>> => {
  if (userIds.length === 0) {
    return new Map<string, string>();
  }

  const objectIds = userIds
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

  if (objectIds.length === 0) {
    return new Map<string, string>();
  }

  const engineers = await Engineer.find({ user: { $in: objectIds } })
    .select("user profilePhoto")
    .exec();

  return new Map(
    engineers.map((engineer) => [
      engineer.user.toString(),
      engineer.profilePhoto?.url ?? "",
    ]),
  );
};

const toFeedAuthor = (
  user: PopulatedUser,
  photoByUserId: Map<string, string>,
): FeedPostAuthor => {
  const userId = user._id.toString();
  return {
    userId,
    name: user.name,
    role: user.role,
    profilePhotoUrl: photoByUserId.get(userId) ?? null,
  };
};

const toFeedPost = (
  post: IPost,
  viewerUserId: string,
  photoByUserId: Map<string, string>,
): FeedPostResponse => {
  const author = post.author as unknown as PopulatedUser;
  const original = post.originalPost as unknown as IPost | null;

  const originalResponse: FeedPostOriginal | null = original
    ? {
        id: original._id.toString(),
        content: original.content,
        createdAt: original.createdAt.toISOString(),
        author: toFeedAuthor(
          original.author as unknown as PopulatedUser,
          photoByUserId,
        ),
      }
    : null;

  return {
    id: post._id.toString(),
    content: post.content,
    imageUrl: post.imageUrl ?? null,
    author: toFeedAuthor(author, photoByUserId),
    likeCount: post.likes.length,
    likedByMe: post.likes.some((like) => like.toString() === viewerUserId),
    originalPost: originalResponse,
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
    const content = req.body.content?.trim() ?? "";

    if (!content) {
      throw createPostError("Post content is required", 400);
    }
    if (content.length > 2000) {
      throw createPostError(
        "Post content must be 2000 characters or fewer",
        400,
      );
    }

    let imageUrl: string | undefined;
    let imagePublicId: string | undefined;

    if (req.file) {
      const upload = await uploadBuffer(req.file.buffer, {
        folder: "civilhub/posts",
        resource_type: "image",
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
    });

    const populated = await Post.findById(post._id)
      .populate("author", "name role")
      .exec();

    if (!populated) {
      throw createPostError("Unable to load the created post", 500);
    }

    const photoByUserId = await getEngineerPhotoMapByUserIds([userId]);

    const connectionUserIds = await getAcceptedConnectionUserIds(userId);
    const recipientIds = connectionUserIds.filter((id) => id !== userId);
    if (recipientIds.length > 0) {
      await Notification.insertMany(
        recipientIds.map((recipientId) => ({
          recipient: new Types.ObjectId(recipientId),
          type: "connection_post" as const,
          message: "A connection shared a new post.",
        })),
      );
    }

    res.status(201).json(toFeedPost(populated, userId, photoByUserId));
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

    const allowedAuthorIds = await getAcceptedConnectionUserIds(userId);
    const objectIds = allowedAuthorIds.map((id) => new Types.ObjectId(id));

    const [posts, total] = await Promise.all([
      Post.find({ author: { $in: objectIds } })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("author", "name role")
        .populate({
          path: "originalPost",
          populate: { path: "author", select: "name role" },
        })
        .exec(),
      Post.countDocuments({ author: { $in: objectIds } }),
    ]);

    const photoOwnerIds = new Set<string>();
    posts.forEach((post) => {
      photoOwnerIds.add(
        normalizeUserId(
          post.author as unknown as Types.ObjectId | PopulatedUser,
        ),
      );
      if (post.originalPost) {
        const original = post.originalPost as unknown as IPost;
        photoOwnerIds.add(
          normalizeUserId(
            original.author as unknown as Types.ObjectId | PopulatedUser,
          ),
        );
      }
    });

    const photoByUserId = await getEngineerPhotoMapByUserIds(
      Array.from(photoOwnerIds),
    );

    const response: FeedResponse = {
      posts: posts.map((post) => toFeedPost(post, userId, photoByUserId)),
      page,
      limit,
      total,
    };

    res.status(200).json(response);
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

    const post = await Post.findById(postId).exec();
    if (!post) {
      throw createPostError("Post not found", 404);
    }

    const alreadyLiked = post.likes.some((like) => like.toString() === userId);
    let likedByMe = false;

    if (alreadyLiked) {
      post.likes = post.likes.filter((like) => like.toString() !== userId);
      likedByMe = false;
    } else {
      post.likes.push(new Types.ObjectId(userId));
      likedByMe = true;
    }

    await post.save();

    if (likedByMe && post.author.toString() !== userId) {
      const liker = await User.findById(userId).select("name").exec();
      await Notification.create({
        recipient: post.author,
        type: "post_liked",
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

    if (post.imagePublicId) {
      await deleteCloudinaryImage(post.imagePublicId);
    }

    await post.deleteOne();
    res.status(200).json({ success: true });
  } catch (error: unknown) {
    next(error);
  }
};

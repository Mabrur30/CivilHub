import { type ReactElement } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../Avatar";
import { RatingBadge } from "../RatingBadge";
import {
  CommentPanel,
  CommentToggleButton,
  usePostComments,
  type CommentAuthor,
} from "./PostComments";
import { RepostButton } from "./RepostButton";

export interface FeedAuthor {
  userId: string;
  name: string;
  role: "client" | "engineer";
  profilePhotoUrl: string | null;
  rating: number | null;
  reviewCount: number;
}

export interface FeedOriginalPost {
  id: string;
  content: string;
  author: FeedAuthor;
  imageUrl: string | null;
  createdAt: string;
}

export interface FeedPost {
  id: string;
  content: string;
  imageUrl: string | null;
  author: FeedAuthor;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  originalPost: FeedOriginalPost | null;
  createdAt: string;
  updatedAt: string;
}

interface FeedPostCardProps {
  post: FeedPost;
  currentUser: CommentAuthor | null;
  isOwner: boolean;
  isLiked: boolean;
  isLikeLoading: boolean;
  isPulsing: boolean;
  onToggleLike: () => void;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onDeletePost: () => void;
  isDeleting: boolean;
  onOpenImage: (url: string) => void;
  formatRelativeTime: (value: string) => string;
}

export function FeedPostCard({
  post,
  currentUser,
  isOwner,
  isLiked,
  isLikeLoading,
  isPulsing,
  onToggleLike,
  isMenuOpen,
  onToggleMenu,
  onDeletePost,
  isDeleting,
  onOpenImage,
  formatRelativeTime,
}: FeedPostCardProps): ReactElement {
  const commentsState = usePostComments({
    postId: post.id,
    initialCount: post.commentCount,
    currentUser,
  });

  return (
    <article className="w-full rounded-2xl border border-white/10 bg-surface p-5 shadow-[0_14px_38px_rgba(0,0,0,0.24)] transition-all duration-200 hover:border-primary/25 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to={`/profile/${post.author.userId}`}>
            <Avatar
              name={post.author.name}
              photoUrl={post.author.profilePhotoUrl}
              size="sm"
            />
          </Link>
          <div>
            <Link
              to={`/profile/${post.author.userId}`}
              className="text-sm font-semibold text-white transition-colors duration-200 hover:text-primary"
            >
              {post.author.name}
            </Link>
            {post.author.role === "engineer" && (
              <RatingBadge
                rating={post.author.rating ?? null}
                reviewCount={post.author.reviewCount ?? 0}
                size="sm"
              />
            )}
            <div className="mt-1 flex items-center gap-2 text-xs text-white/45">
              <span className="rounded-full border border-white/15 px-2 py-0.5 capitalize text-white/60">
                {post.author.role}
              </span>
              <span>•</span>
              <span>{formatRelativeTime(post.createdAt)}</span>
            </div>
          </div>
        </div>

        {isOwner ? (
          <div className="relative">
            <button
              type="button"
              onClick={onToggleMenu}
              className="rounded-full border border-white/15 px-2.5 py-1 text-sm text-white/65 transition-all duration-200 hover:border-primary hover:text-white"
            >
              ...
            </button>
            {isMenuOpen ? (
              <button
                type="button"
                onClick={onDeletePost}
                disabled={isDeleting}
                className="absolute right-0 top-10 whitespace-nowrap rounded-lg border border-red-400/30 bg-void px-3 py-2 text-xs font-semibold text-red-200 transition-colors duration-200 hover:bg-red-400/10 disabled:opacity-60"
              >
                {isDeleting ? "Deleting..." : "Delete post"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Post content (text + image) */}
      <div>
        <p className="mt-4 whitespace-pre-line text-sm leading-7 text-white/80">
          {post.originalPost ? (
            <span className="text-sm text-white/75">
              {post.content === "Reposted" ? "" : post.content}
            </span>
          ) : (
            post.content
          )}
        </p>

        {post.originalPost ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-void/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
              <span className="inline-flex items-center gap-1.5">
                ↻ Reposted post
              </span>
            </p>
            <p className="mt-2 text-xs text-white/60">
              {post.originalPost.author.name} •{" "}
              {formatRelativeTime(post.originalPost.createdAt)}
            </p>
            <p className="mt-2 text-sm text-white/70">
              {post.originalPost.content}
            </p>
            {post.originalPost.imageUrl ? (
              <img
                src={post.originalPost.imageUrl}
                alt="Original post attachment"
                className="mt-3 max-h-56 w-full rounded-lg object-cover"
              />
            ) : null}
          </div>
        ) : null}

        {post.imageUrl ? (
          <button
            type="button"
            onClick={() => onOpenImage(post.imageUrl as string)}
            className="mt-4 block overflow-hidden rounded-xl border border-white/10 transition-transform duration-200 hover:scale-[1.01]"
          >
            <img
              src={post.imageUrl}
              alt="Post attachment"
              className="max-h-105 w-full object-cover"
            />
          </button>
        ) : null}
      </div>

      {/* Action bar: Like, Comment, Repost — always one row, never mixed with the thread below */}
      <div className="mt-4 border-t border-white/10 pt-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleLike}
            disabled={isLikeLoading}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 ${
              isLiked
                ? "bg-primary/12 text-primary"
                : "text-white/65 hover:bg-primary/10 hover:text-white"
            } ${isPulsing ? "scale-110" : "scale-100"}`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill={isLiked ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M12 21s-6.5-4.35-9.19-7.04C.14 11.28.28 6.88 3.2 4.6c2.1-1.66 5.16-1.4 7 .53 1.84-1.93 4.9-2.19 7-.53 2.92 2.28 3.06 6.68.39 9.36C18.5 16.65 12 21 12 21Z" />
            </svg>
            <span>{post.likeCount > 0 ? `${post.likeCount}` : "Like"}</span>
          </button>
          <CommentToggleButton
            isOpen={commentsState.isOpen}
            commentCount={commentsState.commentCount}
            onToggle={commentsState.toggleComments}
            variant="inline"
          />
          <RepostButton
            originalPostId={post.originalPost?.id ?? post.id}
            originalAuthor={post.originalPost?.author ?? post.author}
            originalContent={post.originalPost?.content ?? post.content}
            originalImageUrl={post.originalPost?.imageUrl ?? post.imageUrl}
            variant="inline"
          />
        </div>
      </div>

      {/* Divider + comment composer + comment thread — a separate block, never inline with the action bar */}
      {commentsState.isOpen ? (
        <div className="mt-3 border-t border-white/10">
          <CommentPanel {...commentsState} currentUser={currentUser} />
        </div>
      ) : null}
    </article>
  );
}

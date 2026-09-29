import { type ReactElement, useEffect, useRef, useState } from "react";
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
import { ReportDialog } from "../safety/ReportDialog";
import { isProviderRole } from "../../lib/dashboardPaths";

export interface FeedAuthor {
  userId: string;
  name: string;
  role: "client" | "engineer" | "developer" | "organisation";
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
  /** A repost whose original was deleted. */
  originalRemoved?: boolean;
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
  /** Called with the server's repost so the feed can show it straight away. */
  onReposted?: (repost: unknown) => void;
  /** Open with comments showing, as on the post's own page. */
  defaultCommentsOpen?: boolean;
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
  onReposted,
  defaultCommentsOpen = false,
}: FeedPostCardProps): ReactElement {
  const commentsState = usePostComments({
    postId: post.id,
    initialCount: post.commentCount,
    currentUser,
    defaultOpen: defaultCommentsOpen,
  });
  const [isReporting, setIsReporting] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // The options menu closes on Escape or a click anywhere else.
  useEffect(() => {
    if (!isMenuOpen) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onToggleMenu();
    };
    const onPointer = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onToggleMenu();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [isMenuOpen, onToggleMenu]);

  return (
    <article className="w-full rounded-2xl border border-white/10 bg-surface p-5 shadow-sm transition-all duration-200 hover:border-primary/25 sm:p-6">
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
            {isProviderRole(post.author.role) && (
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

        {currentUser ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={onToggleMenu}
              aria-label="Post options"
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              className="rounded-full border border-white/15 px-2.5 py-1 text-sm text-white/65 transition-all duration-200 hover:border-primary hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow"
            >
              <span aria-hidden="true">...</span>
            </button>
            {isMenuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-10 z-10 min-w-36 overflow-hidden rounded-lg border border-white/15 bg-void shadow-md"
              >
                {isOwner ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={onDeletePost}
                    disabled={isDeleting}
                    className="block w-full whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-rose-300 transition-colors duration-200 hover:bg-rose-400/10 disabled:opacity-60"
                  >
                    {isDeleting ? "Deleting..." : "Delete post"}
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onToggleMenu();
                      setIsReporting(true);
                    }}
                    className="block w-full whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-white/75 transition-colors duration-200 hover:bg-white/5 hover:text-white"
                  >
                    Report post
                  </button>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        {isReporting ? (
          <ReportDialog targetType="post" targetId={post.id} onClose={() => setIsReporting(false)} />
        ) : null}
      </div>

      {/* Post content (text + image) */}
      <div>
        <p className="mt-4 whitespace-pre-line text-sm leading-7 text-white/80">
          {post.originalPost || post.originalRemoved ? (
            <span className="text-sm text-white/75">
              {post.content === "Reposted" ? "" : post.content}
            </span>
          ) : (
            post.content
          )}
        </p>

        {post.originalRemoved ? (
          <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-void/40 p-4 text-sm text-white/50">
            The original post was removed.
          </div>
        ) : null}

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
            aria-pressed={isLiked}
            aria-label={`${isLiked ? "Unlike" : "Like"} this post${
              post.likeCount > 0 ? `, ${post.likeCount} like${post.likeCount === 1 ? "" : "s"}` : ""
            }`}
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
          {post.originalRemoved ? null : (
            <RepostButton
              originalPostId={post.originalPost?.id ?? post.id}
              originalAuthor={post.originalPost?.author ?? post.author}
              originalContent={post.originalPost?.content ?? post.content}
              originalImageUrl={post.originalPost?.imageUrl ?? post.imageUrl}
              variant="inline"
              onReposted={onReposted}
            />
          )}
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

import { type ReactElement, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../Avatar";
import { RatingBadge } from "../RatingBadge";

export interface CommentAuthor {
  userId: string;
  name: string;
  role: "client" | "engineer";
  profilePhotoUrl: string | null;
  rating?: number | null;
  reviewCount?: number;
}

export interface PostComment {
  id: string;
  postId: string;
  author: CommentAuthor;
  content: string;
  parentCommentId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PostCommentsProps {
  postId: string;
  initialCount: number;
  currentUser: CommentAuthor | null;
  variant?: "default" | "inline";
}

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const getErrorMessage = (value: unknown): string => {
  if (typeof value === "object" && value !== null) {
    const error = value as ErrorResponse;
    if (typeof error.message === "string") return error.message;
  }
  return "Unable to update comments.";
};

const formatRelativeTime = (value: string): string => {
  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
  if (elapsedMinutes < 1) return "now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h`;
  return `${Math.floor(elapsedHours / 24)}d`;
};

export function PostComments({
  postId,
  initialCount,
  currentUser,
  variant = "default",
}: PostCommentsProps): ReactElement {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentCount, setCommentCount] = useState<number>(initialCount);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [content, setContent] = useState<string>("");
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  const loadComments = async (): Promise<void> => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/posts/${postId}/comments`,
        { credentials: "include" },
      );
      const body: unknown = await response.json();
      if (!response.ok || !Array.isArray(body)) {
        setError(getErrorMessage(body));
        return;
      }
      setComments(body as PostComment[]);
      setCommentCount(body.length);
    } catch {
      setError("Unable to load comments.");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleComments = (): void => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen && comments.length === 0 && commentCount > 0) {
      void loadComments();
    } else if (nextOpen && comments.length === 0) {
      void loadComments();
    }
  };

  const submitComment = async (parentCommentId?: string): Promise<void> => {
    const nextContent = (parentCommentId ? replyContent : content).trim();
    if (!nextContent || !currentUser) return;
    const temporaryId = `optimistic-${Date.now()}`;
    const optimisticComment: PostComment = {
      id: temporaryId,
      postId,
      author: currentUser,
      content: nextContent,
      parentCommentId: parentCommentId ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setComments((current) => [...current, optimisticComment]);
    setCommentCount((count) => count + 1);
    setContent("");
    setReplyContent("");
    setReplyTarget(null);
    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, content: nextContent, parentCommentId }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(body));
      }
      setComments((current) =>
        current.map((comment) =>
          comment.id === temporaryId ? (body as PostComment) : comment,
        ),
      );
    } catch (submissionError: unknown) {
      setComments((current) =>
        current.filter((comment) => comment.id !== temporaryId),
      );
      setCommentCount((count) => Math.max(0, count - 1));
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to post comment.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteComment = async (commentId: string): Promise<void> => {
    setDeletingId(commentId);
    setError("");
    setComments((current) =>
      current.map((comment) =>
        comment.id === commentId
          ? { ...comment, content: "[deleted]" }
          : comment,
      ),
    );
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/comments/${commentId}`,
        { method: "DELETE", credentials: "include" },
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getErrorMessage(body));
      }
    } catch (deletionError: unknown) {
      await loadComments();
      setError(
        deletionError instanceof Error
          ? deletionError.message
          : "Unable to delete comment.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const renderComments = (
    parentCommentId: string | null,
    depth: number,
  ): ReactElement[] =>
    comments
      .filter((comment) => comment.parentCommentId === parentCommentId)
      .map((comment) => (
        <div
          key={comment.id}
          className={
            depth > 0 ? "mt-3 border-l border-white/10 pl-3 sm:pl-5" : "mt-4"
          }
        >
          <div className="flex items-start gap-2.5">
            <Link to={`/profile/${comment.author.userId}`} className="shrink-0">
              <Avatar
                name={comment.author.name}
                photoUrl={comment.author.profilePhotoUrl}
                size="sm"
              />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <Link
                  to={`/profile/${comment.author.userId}`}
                  className="text-xs font-semibold text-white hover:text-primary"
                >
                  {comment.author.name}
                </Link>
                {comment.author.role === "engineer" && (
                  <RatingBadge
                    rating={comment.author.rating ?? null}
                    reviewCount={comment.author.reviewCount ?? 0}
                    size="sm"
                  />
                )}
                <span className="text-[11px] text-white/35">
                  {formatRelativeTime(comment.createdAt)}
                </span>
              </div>
              <p className="mt-1 wrap-break-word text-xs leading-5 text-white/70">
                {comment.content}
              </p>
              <div className="mt-1.5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setReplyTarget(
                      replyTarget === comment.id ? null : comment.id,
                    )
                  }
                  className="text-[11px] font-semibold text-primary hover:text-white"
                >
                  Reply
                </button>
                {currentUser?.userId === comment.author.userId &&
                comment.content !== "[deleted]" ? (
                  <button
                    type="button"
                    onClick={() => void deleteComment(comment.id)}
                    disabled={deletingId === comment.id}
                    className="text-[11px] text-white/35 hover:text-red-200 disabled:opacity-50"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
              {replyTarget === comment.id && (
                <div className="mt-2 flex gap-2">
                  <input
                    value={replyContent}
                    onChange={(event) =>
                      setReplyContent(event.target.value.slice(0, 500))
                    }
                    maxLength={500}
                    placeholder="Write a reply..."
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-void/60 px-3 py-2 text-xs text-white outline-none focus:border-primary/50"
                  />
                  <button
                    type="button"
                    onClick={() => void submitComment(comment.id)}
                    disabled={isSubmitting || !replyContent.trim()}
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                  >
                    Post
                  </button>
                </div>
              )}
              {renderComments(comment.id, Math.min(depth + 1, 3))}
            </div>
          </div>
        </div>
      ));

  const isInline = variant === "inline";

  return (
    <div
      className={isInline ? "min-w-0" : "mt-4 border-t border-white/10 pt-3"}
    >
      <button
        type="button"
        onClick={toggleComments}
        className={
          isInline
            ? "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white/65 transition-colors duration-200 hover:bg-primary/10 hover:text-white"
            : "inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/60 transition-colors hover:border-primary hover:text-white"
        }
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M8 9h8M8 13h5m5 8-4.6-2.2a2 2 0 0 0-.86-.2H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4h-.54a2 2 0 0 0-.86.2Z" />
        </svg>
        Comment <span className="text-white/40">{commentCount}</span>
      </button>
      {isOpen && (
        <div className={isInline ? "mt-3 w-full" : "mt-3"}>
          {currentUser && (
            <div className="flex gap-2">
              <input
                value={content}
                onChange={(event) =>
                  setContent(event.target.value.slice(0, 500))
                }
                maxLength={500}
                placeholder="Add a comment..."
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-void/60 px-3 py-2 text-xs text-white outline-none focus:border-primary/50"
              />
              <button
                type="button"
                onClick={() => void submitComment()}
                disabled={isSubmitting || !content.trim()}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
              >
                Post
              </button>
            </div>
          )}
          {error && (
            <p className="mt-2 text-xs text-red-200" role="alert">
              {error}
            </p>
          )}
          {isLoading ? (
            <p className="mt-3 text-xs text-white/45">Loading comments...</p>
          ) : comments.length === 0 ? (
            <p className="mt-3 text-xs text-white/40">No comments yet.</p>
          ) : (
            <div>{renderComments(null, 0)}</div>
          )}
        </div>
      )}
    </div>
  );
}

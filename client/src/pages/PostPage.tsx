import { type ReactElement, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BackButton } from "../components/BackButton";
import { FeedPostCard, type FeedPost } from "../components/dashboard/FeedPostCard";
import { formatRelativeTime } from "../components/dashboard/notificationUtils";
import { panelClassName } from "../components/dashboard/ui/buttonStyles";
import { EmptyPanel, ErrorPanel } from "../components/dashboard/ui/StatePanels";
import { useAuth } from "../context/AuthContext";
import { dashboardBase, isProviderRole } from "../lib/dashboardPaths";
import { API_BASE_URL } from "../lib/apiBase";

const isPost = (value: unknown): value is FeedPost =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as FeedPost).id === "string" &&
  typeof (value as FeedPost).content === "string" &&
  typeof (value as FeedPost).author?.userId === "string";

const errorOf = (value: unknown, fallback: string): string =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { message?: unknown }).message === "string"
    ? (value as { message: string }).message
    : fallback;

/** One post with its comments open: where like, comment and repost alerts lead. */
export function PostPage(): ReactElement {
  const { postId } = useParams<{ postId: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [notFound, setNotFound] = useState<boolean>(false);
  const [retryKey, setRetryKey] = useState<number>(0);
  const [isLiking, setIsLiking] = useState<boolean>(false);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Providers came from their network feed; clients from their dashboard.
  const backTo = isProviderRole(currentUser?.role)
    ? `${dashboardBase(currentUser?.role)}/network`
    : dashboardBase(currentUser?.role);
  const backLabel = isProviderRole(currentUser?.role) ? "Back to My Network" : "Back to dashboard";

  useEffect(() => {
    if (!postId) return;
    let active = true;
    const load = async (): Promise<void> => {
      setIsLoading(true);
      setError("");
      setNotFound(false);
      try {
        const response = await fetch(`${API_BASE_URL}/api/posts/${postId}`, {
          credentials: "include",
        });
        const body: unknown = await response.json();
        if (!active) return;
        if (response.status === 404) {
          setNotFound(true);
          return;
        }
        if (!response.ok || !isPost(body)) {
          setError(errorOf(body, "Unable to load this post."));
          return;
        }
        setPost(body);
      } catch {
        if (active) setError("Unable to connect to CivilHub. Please try again.");
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [postId, retryKey]);

  const toggleLike = async (): Promise<void> => {
    if (!post) return;
    setIsLiking(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/posts/${post.id}/like`, {
        method: "PATCH",
        credentials: "include",
      });
      const body = (await response.json()) as { likedByMe?: boolean; likeCount?: number };
      if (response.ok && typeof body.likeCount === "number") {
        setPost({ ...post, likedByMe: Boolean(body.likedByMe), likeCount: body.likeCount });
      }
    } finally {
      setIsLiking(false);
    }
  };

  const deletePost = async (): Promise<void> => {
    if (!post || !window.confirm("Delete this post?")) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/posts/${post.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (response.ok) {
        navigate(backTo, { replace: true });
        return;
      }
      setError(errorOf(await response.json(), "Unable to delete this post."));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackButton to={backTo} label={backLabel} />
      {isLoading ? (
        <div aria-busy="true" aria-label="Loading post" className={`${panelClassName} h-64 animate-pulse`} />
      ) : notFound ? (
        <EmptyPanel
          title="This post is no longer available"
          body="Its author may have deleted it."
        />
      ) : error || !post ? (
        <ErrorPanel message={error || "Unable to load this post."} onRetry={() => setRetryKey((key) => key + 1)} />
      ) : (
        <FeedPostCard
          post={post}
          currentUser={
            currentUser
              ? {
                  userId: currentUser.id,
                  name: currentUser.name,
                  role: currentUser.role,
                  profilePhotoUrl: currentUser.profilePhotoUrl,
                }
              : null
          }
          isOwner={currentUser?.id === post.author.userId}
          isLiked={post.likedByMe}
          isLikeLoading={isLiking}
          isPulsing={false}
          onToggleLike={() => void toggleLike()}
          isMenuOpen={isMenuOpen}
          onToggleMenu={() => setIsMenuOpen((open) => !open)}
          onDeletePost={() => void deletePost()}
          isDeleting={isDeleting}
          onOpenImage={(url) => window.open(url, "_blank", "noopener")}
          formatRelativeTime={formatRelativeTime}
          defaultCommentsOpen
        />
      )}
    </div>
  );
}

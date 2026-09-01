import { type ReactElement, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import {
  PostComments,
  type CommentAuthor,
} from "../components/dashboard/PostComments";
import { RepostButton } from "../components/dashboard/RepostButton";
import { RatingBadge } from "../components/RatingBadge";
import { useAuth } from "../context/AuthContext";

interface EngineerPortfolioItem {
  title: string;
  description: string;
  imageUrl: string;
  uploadedAt: string;
}

interface EngineerCertificateItem {
  title: string;
  uploadedAt: string;
}

interface EngineerReview {
  id: string;
  projectId: string;
  client: {
    id: string;
    name: string;
    profilePhotoUrl: string | null;
  };
  rating: number;
  reviewText: string;
  engineerReply: string | null;
  engineerRepliedAt: string | null;
  createdAt: string;
}

interface EngineerReviewsResponse {
  reviews: EngineerReview[];
  averageRating: number;
  totalReviews: number;
}

interface ProfilePost {
  id: string;
  content: string;
  imageUrl: string | null;
  author: CommentAuthor;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  originalPost: ProfileOriginalPost | null;
  createdAt: string;
  updatedAt: string;
}

interface ProfileOriginalPost {
  id: string;
  content: string;
  imageUrl: string | null;
  author: CommentAuthor;
  createdAt: string;
}

type ConnectionStatus =
  | "not_connected"
  | "pending_sent"
  | "pending_received"
  | "connected";

interface BasePublicProfile {
  userId: string;
  name: string;
  role: "client" | "engineer";
  profilePhotoUrl: string | null;
  bio: string;
  rating: number | null;
  reviewCount: number;
  connectionStatus: ConnectionStatus;
  connectionId: string | null;
}

interface EngineerPublicProfile extends BasePublicProfile {
  role: "engineer";
  portfolio: EngineerPortfolioItem[];
  certificates: EngineerCertificateItem[];
}

interface ClientPublicProfile extends BasePublicProfile {
  role: "client";
  companyName: string;
  completedProjects: number;
}

type PublicProfile = EngineerPublicProfile | ClientPublicProfile;

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const isConnectionStatus = (value: unknown): value is ConnectionStatus =>
  value === "not_connected" ||
  value === "pending_sent" ||
  value === "pending_received" ||
  value === "connected";

const isBaseProfile = (value: unknown): value is BasePublicProfile => {
  if (typeof value !== "object" || value === null) return false;
  const profile = value as Record<string, unknown>;
  return (
    typeof profile.userId === "string" &&
    typeof profile.name === "string" &&
    (profile.role === "client" || profile.role === "engineer") &&
    (typeof profile.profilePhotoUrl === "string" ||
      profile.profilePhotoUrl === null) &&
    typeof profile.bio === "string" &&
    (typeof profile.rating === "number" || profile.rating === null) &&
    typeof profile.reviewCount === "number" &&
    isConnectionStatus(profile.connectionStatus) &&
    (typeof profile.connectionId === "string" || profile.connectionId === null)
  );
};

const isEngineerPortfolioItem = (
  value: unknown,
): value is EngineerPortfolioItem => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.title === "string" &&
    typeof item.description === "string" &&
    typeof item.imageUrl === "string" &&
    typeof item.uploadedAt === "string"
  );
};

const isEngineerCertificateItem = (
  value: unknown,
): value is EngineerCertificateItem => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.title === "string" && typeof item.uploadedAt === "string";
};

const isEngineerReview = (value: unknown): value is EngineerReview => {
  if (typeof value !== "object" || value === null) return false;
  const review = value as Record<string, unknown>;
  const client = review.client as Record<string, unknown> | undefined;
  return (
    typeof review.id === "string" &&
    typeof review.projectId === "string" &&
    typeof client?.id === "string" &&
    typeof client.name === "string" &&
    (typeof client.profilePhotoUrl === "string" ||
      client.profilePhotoUrl === null) &&
    typeof review.rating === "number" &&
    typeof review.reviewText === "string" &&
    (typeof review.engineerReply === "string" ||
      review.engineerReply === null) &&
    (typeof review.engineerRepliedAt === "string" ||
      review.engineerRepliedAt === null) &&
    typeof review.createdAt === "string"
  );
};

const isEngineerReviewsResponse = (
  value: unknown,
): value is EngineerReviewsResponse => {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Record<string, unknown>;
  return (
    Array.isArray(response.reviews) &&
    response.reviews.every(isEngineerReview) &&
    typeof response.averageRating === "number" &&
    typeof response.totalReviews === "number"
  );
};

const isPublicProfile = (value: unknown): value is PublicProfile => {
  if (!isBaseProfile(value)) return false;
  const profile = value as Record<string, unknown>;

  if (profile.role === "engineer") {
    return (
      Array.isArray(profile.portfolio) &&
      profile.portfolio.every(isEngineerPortfolioItem) &&
      Array.isArray(profile.certificates) &&
      profile.certificates.every(isEngineerCertificateItem)
    );
  }

  return (
    typeof profile.companyName === "string" &&
    typeof profile.completedProjects === "number"
  );
};

const getErrorMessage = (value: unknown): string => {
  if (typeof value === "object" && value !== null) {
    const body = value as ErrorResponse;
    if (typeof body.message === "string") return body.message;
  }
  return "Unable to load this profile.";
};

const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};

const statusLabel = (status: ConnectionStatus): string => {
  if (status === "connected") return "Connected";
  if (status === "pending_sent") return "Request sent";
  if (status === "pending_received") return "Request received";
  return "Not connected";
};

export function PublicProfilePage(): ReactElement {
  const { userId } = useParams<{ userId: string }>();
  const { currentUser } = useAuth();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [actionError, setActionError] = useState<string>("");
  const [isActioning, setIsActioning] = useState<boolean>(false);
  const [reloadKey, setReloadKey] = useState<number>(0);
  const [reviews, setReviews] = useState<EngineerReviewsResponse | null>(null);
  const [reviewsError, setReviewsError] = useState<string>("");
  const [replyingReviewId, setReplyingReviewId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>("");
  const [isSubmittingReply, setIsSubmittingReply] = useState<boolean>(false);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [postsError, setPostsError] = useState<string>("");

  useEffect(() => {
    const loadProfile = async (): Promise<void> => {
      if (!userId) {
        setError("User ID is required.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError("");
      setActionError("");

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/users/${userId}/public-profile`,
          {
            credentials: "include",
          },
        );
        const body: unknown = await response.json();

        if (!response.ok || !isPublicProfile(body)) {
          setError(getErrorMessage(body));
          return;
        }

        setProfile(body);
      } catch {
        setError("Unable to connect to CivilHub. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadProfile();
  }, [reloadKey, userId]);

  useEffect(() => {
    if (!profile || profile.role !== "engineer") {
      setReviews(null);
      return;
    }

    const loadReviews = async (): Promise<void> => {
      setReviewsError("");
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/engineers/${profile.userId}/reviews`,
          { credentials: "include" },
        );
        const body: unknown = await response.json();
        if (!response.ok || !isEngineerReviewsResponse(body)) {
          setReviewsError(getErrorMessage(body));
          return;
        }
        setReviews(body);
      } catch {
        setReviewsError("Unable to load reviews.");
      }
    };

    void loadReviews();
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    const loadPosts = async (): Promise<void> => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/users/${profile.userId}/posts`,
          { credentials: "include" },
        );
        const body: unknown = await response.json();
        const payload = body as { posts?: unknown };
        if (!response.ok || !Array.isArray(payload.posts)) {
          setPostsError("Unable to load posts.");
          return;
        }
        setPosts(payload.posts as ProfilePost[]);
      } catch {
        setPostsError("Unable to load posts.");
      }
    };
    void loadPosts();
  }, [profile]);

  const refreshProfile = (): void => {
    setReloadKey((key) => key + 1);
  };

  const sendRequest = async (): Promise<void> => {
    if (!profile) return;

    setIsActioning(true);
    setActionError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/network/${profile.userId}/request`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      const body: unknown = await response.json();

      if (!response.ok) {
        setActionError(getErrorMessage(body));
        return;
      }

      refreshProfile();
    } catch {
      setActionError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsActioning(false);
    }
  };

  const respondRequest = async (
    decision: "accept" | "decline",
  ): Promise<void> => {
    if (!profile?.connectionId) {
      setActionError("This request could not be found. Please refresh.");
      return;
    }

    setIsActioning(true);
    setActionError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/network/${profile.connectionId}/${decision}`,
        {
          method: "PATCH",
          credentials: "include",
        },
      );
      const body: unknown = await response.json();

      if (!response.ok) {
        setActionError(getErrorMessage(body));
        return;
      }

      refreshProfile();
    } catch {
      setActionError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsActioning(false);
    }
  };

  const submitReply = async (reviewId: string): Promise<void> => {
    if (!replyText.trim()) return;
    setIsSubmittingReply(true);
    setReviewsError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/reviews/${reviewId}/reply`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reply: replyText.trim() }),
        },
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        setReviewsError(getErrorMessage(body));
        return;
      }
      setReviews((current) =>
        current
          ? {
              ...current,
              reviews: current.reviews.map((review) =>
                review.id === reviewId
                  ? {
                      ...review,
                      engineerReply: replyText.trim(),
                      engineerRepliedAt: new Date().toISOString(),
                    }
                  : review,
              ),
            }
          : current,
      );
      setReplyText("");
      setReplyingReviewId(null);
    } catch {
      setReviewsError("Unable to submit reply.");
    } finally {
      setIsSubmittingReply(false);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-void px-4 py-12 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl animate-pulse rounded-2xl border border-white/10 bg-surface p-8">
          <div className="h-6 w-1/3 rounded bg-white/10" />
          <div className="mt-4 h-4 w-1/4 rounded bg-white/10" />
          <div className="mt-8 h-40 rounded bg-white/10" />
        </div>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="min-h-screen bg-void px-4 py-12 text-white sm:px-6 lg:px-8">
        <section className="mx-auto max-w-3xl rounded-2xl border border-red-400/20 bg-red-400/5 p-8 text-center">
          <p className="text-sm text-red-200">
            {error || "Profile not found."}
          </p>
          <button
            type="button"
            onClick={() => refreshProfile()}
            className="mt-5 rounded-full border border-primary px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary hover:text-white"
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  const isSelf = currentUser?.id === profile.userId;

  const scrollToReviews = (): void => {
    document.getElementById("engineer-reviews")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <main className="min-h-screen bg-void px-4 py-12 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="rounded-2xl border border-white/10 bg-surface p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar
                name={profile.name}
                photoUrl={profile.profilePhotoUrl}
                size="md"
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  {profile.role}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h1 className="font-heading text-3xl font-bold text-white">
                    {profile.name}
                  </h1>
                  {profile.role === "engineer" && reviews && (
                    <button
                      type="button"
                      onClick={scrollToReviews}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold transition-all duration-200 hover:opacity-80 hover:underline hover:underline-offset-4"
                      aria-label="Jump to reviews"
                    >
                      {reviews.totalReviews > 0 ? (
                        <>
                          <RatingBadge
                            rating={reviews.averageRating}
                            reviewCount={reviews.totalReviews}
                            size="sm"
                          />
                        </>
                      ) : (
                        <span className="font-normal text-white/45">
                          No reviews yet
                        </span>
                      )}
                    </button>
                  )}
                </div>
                <p className="mt-2 text-sm font-semibold text-white/60">
                  {statusLabel(profile.connectionStatus)}
                </p>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
                  {profile.bio.trim() || "This user has not added a bio yet."}
                </p>
              </div>
            </div>

            {isSelf ? (
              <Link
                to={
                  currentUser?.role === "engineer"
                    ? "/dashboard/engineer/profile"
                    : "/dashboard/client/profile"
                }
                className="inline-flex w-fit items-center rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/70 hover:border-primary hover:text-white"
              >
                Edit my profile
              </Link>
            ) : (
              <div className="flex flex-wrap gap-3">
                {profile.connectionStatus === "not_connected" ? (
                  <button
                    type="button"
                    onClick={() => void sendRequest()}
                    disabled={isActioning}
                    className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-glow disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isActioning ? "Sending..." : "Connect"}
                  </button>
                ) : null}

                {profile.connectionStatus === "pending_received" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void respondRequest("accept")}
                      disabled={isActioning}
                      className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-glow disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isActioning ? "Updating..." : "Accept"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void respondRequest("decline")}
                      disabled={isActioning}
                      className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 hover:border-red-300 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isActioning ? "Updating..." : "Decline"}
                    </button>
                  </>
                ) : null}

                {profile.connectionStatus === "pending_sent" ? (
                  <span className="inline-flex items-center rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-xs font-semibold text-amber-200">
                    Request sent
                  </span>
                ) : null}

                {profile.connectionStatus === "connected" ? (
                  <Link
                    to={`/messages/${profile.userId}`}
                    className="inline-flex items-center rounded-full border border-emerald-300/40 bg-emerald-300/10 px-4 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-300/20"
                  >
                    Message
                  </Link>
                ) : null}
              </div>
            )}
          </div>

          {actionError ? (
            <p className="mt-4 text-xs text-red-300" role="alert">
              {actionError}
            </p>
          ) : null}
        </section>

        {profile.role === "engineer" ? (
          <section className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-2xl border border-white/10 bg-surface p-6">
              <h2 className="font-heading text-2xl font-bold text-white">
                Portfolio
              </h2>
              {profile.portfolio.length === 0 ? (
                <p className="mt-4 text-sm text-white/55">
                  No portfolio items yet.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {profile.portfolio.map((item, index) => (
                    <div
                      key={`${item.title}-${index}`}
                      className="rounded-xl border border-white/10 bg-void/40 p-4"
                    >
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="h-36 w-full rounded-lg object-cover"
                      />
                      <h3 className="mt-3 text-sm font-semibold text-white">
                        {item.title}
                      </h3>
                      <p className="mt-2 text-xs leading-5 text-white/60">
                        {item.description}
                      </p>
                      <p className="mt-2 text-[11px] text-white/40">
                        Added {formatDate(item.uploadedAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="rounded-2xl border border-white/10 bg-surface p-6">
              <h2 className="font-heading text-2xl font-bold text-white">
                Certificates
              </h2>
              {profile.certificates.length === 0 ? (
                <p className="mt-4 text-sm text-white/55">
                  No certificates uploaded yet.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {profile.certificates.map((certificate, index) => (
                    <li
                      key={`${certificate.title}-${index}`}
                      className="rounded-xl border border-white/10 bg-void/40 p-4"
                    >
                      <p className="text-sm font-semibold text-white">
                        {certificate.title}
                      </p>
                      <p className="mt-1 text-xs text-white/50">
                        Uploaded {formatDate(certificate.uploadedAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article
              id="engineer-reviews"
              className="scroll-mt-8 rounded-2xl border border-white/10 bg-surface p-6 lg:col-span-2"
            >
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                    Client perspectives
                  </p>
                  <h2 className="mt-1 font-heading text-2xl font-bold text-white">
                    Reviews
                  </h2>
                </div>
                {reviews && reviews.totalReviews > 0 && (
                  <span className="text-sm font-semibold text-amber-300">
                    {reviews.averageRating.toFixed(1)} ★
                  </span>
                )}
              </div>
              {reviewsError ? (
                <p className="mt-4 text-sm text-red-200">{reviewsError}</p>
              ) : !reviews ? (
                <p className="mt-4 text-sm text-white/50">Loading reviews...</p>
              ) : reviews.reviews.length === 0 ? (
                <p className="mt-4 text-sm text-white/55">
                  No reviews yet. Completed projects will appear here.
                </p>
              ) : (
                <div className="mt-5 space-y-4">
                  {reviews.reviews.map((review) => (
                    <div
                      key={review.id}
                      className="rounded-xl border border-white/10 bg-void/40 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Avatar
                            name={review.client.name}
                            photoUrl={review.client.profilePhotoUrl}
                            size="sm"
                          />
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {review.client.name}
                            </p>
                            <p className="text-xs text-white/40">
                              {formatDate(review.createdAt)}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm tracking-wide text-amber-300">
                          {Array.from({ length: 5 }, (_, index) =>
                            index < review.rating ? "★" : "☆",
                          ).join("")}
                        </span>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-white/75">
                        {review.reviewText}
                      </p>
                      {review.engineerReply ? (
                        <div className="mt-4 border-l-2 border-primary/50 pl-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                            Engineer reply
                          </p>
                          <p className="mt-1 text-sm leading-6 text-white/65">
                            {review.engineerReply}
                          </p>
                          {review.engineerRepliedAt && (
                            <p className="mt-1 text-xs text-white/35">
                              {formatDate(review.engineerRepliedAt)}
                            </p>
                          )}
                        </div>
                      ) : isSelf && currentUser?.role === "engineer" ? (
                        <div className="mt-4">
                          {replyingReviewId === review.id ? (
                            <>
                              <textarea
                                value={replyText}
                                onChange={(event) =>
                                  setReplyText(event.target.value.slice(0, 500))
                                }
                                maxLength={500}
                                rows={3}
                                placeholder="Write a thoughtful reply..."
                                className="w-full rounded-lg border border-white/15 bg-void/60 px-3 py-2 text-sm text-white placeholder-white/35 outline-none focus:border-primary/60"
                              />
                              <div className="mt-2 flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setReplyingReviewId(null)}
                                  className="rounded-lg px-3 py-2 text-xs font-semibold text-white/60 transition-colors hover:text-white"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void submitReply(review.id)}
                                  disabled={isSubmittingReply}
                                  className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                                >
                                  {isSubmittingReply
                                    ? "Sending..."
                                    : "Send reply"}
                                </button>
                              </div>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setReplyingReviewId(review.id)}
                              className="text-xs font-semibold text-primary transition-colors hover:text-white"
                            >
                              Reply
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="rounded-2xl border border-white/10 bg-surface p-6 lg:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                From the field
              </p>
              <h2 className="mt-1 font-heading text-2xl font-bold text-white">
                Posts
              </h2>
              {postsError ? (
                <p className="mt-4 text-sm text-red-200">{postsError}</p>
              ) : posts.length === 0 ? (
                <p className="mt-4 text-sm text-white/55">No posts yet.</p>
              ) : (
                <div className="mt-5 space-y-4">
                  {posts.map((post) => (
                    <article
                      key={post.id}
                      className="rounded-xl border border-white/10 bg-void/40 p-5"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar
                          name={post.author.name}
                          photoUrl={post.author.profilePhotoUrl}
                          size="sm"
                        />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-white">
                              {post.author.name}
                            </p>
                            {post.author.role === "engineer" && (
                              <RatingBadge
                                rating={post.author.rating ?? null}
                                reviewCount={post.author.reviewCount ?? 0}
                                size="sm"
                              />
                            )}
                          </div>
                          <p className="text-xs text-white/40">
                            {formatDate(post.createdAt)}
                          </p>
                        </div>
                      </div>
                      <p className="mt-4 whitespace-pre-line text-sm leading-7 text-white/80">
                        {post.originalPost && post.content === "Reposted"
                          ? ""
                          : post.content}
                      </p>
                      {post.originalPost ? (
                        <div className="mt-4 rounded-xl border border-white/10 bg-void/50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
                            ↻ Reposted post
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <Avatar
                              name={post.originalPost.author.name}
                              photoUrl={
                                post.originalPost.author.profilePhotoUrl
                              }
                              size="sm"
                            />
                            <p className="text-xs font-semibold text-white">
                              {post.originalPost.author.name}
                            </p>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-white/70">
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
                        <img
                          src={post.imageUrl}
                          alt="Post attachment"
                          className="mt-4 max-h-105 w-full rounded-xl object-cover"
                        />
                      ) : null}
                      <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-4 text-xs text-white/50">
                        <span>♥ {post.likeCount}</span>
                      </div>
                      <PostComments
                        postId={post.id}
                        initialCount={post.commentCount}
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
                      />
                      <div className="mt-3">
                        <RepostButton
                          originalPostId={post.originalPost?.id ?? post.id}
                          originalAuthor={
                            post.originalPost?.author ?? post.author
                          }
                          originalContent={
                            post.originalPost?.content ?? post.content
                          }
                          originalImageUrl={
                            post.originalPost?.imageUrl ?? post.imageUrl
                          }
                        />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </article>
          </section>
        ) : (
          <section className="rounded-2xl border border-white/10 bg-surface p-6">
            <h2 className="font-heading text-2xl font-bold text-white">
              Client Summary
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-void/40 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-white/40">
                  Company
                </p>
                <p className="mt-2 text-sm font-semibold text-white/85">
                  {profile.companyName || "Not specified"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-void/40 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-white/40">
                  Completed projects
                </p>
                <p className="mt-2 text-sm font-semibold text-white/85">
                  {profile.completedProjects}
                </p>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from "react";
import { Avatar } from "../components/Avatar";
import { BackButton } from "../components/BackButton";
import {
  FeedPostCard,
  type FeedAuthor,
  type FeedOriginalPost,
  type FeedPost,
} from "../components/dashboard/FeedPostCard";
import { PostComposerModal } from "../components/dashboard/PostComposerModal";
import { ClientProfileView } from "../components/profile/client/ClientProfileView";
import { EngineerProfileView } from "../components/profile/engineer/EngineerProfileView";
import {
  type ConnectionStatus,
  type EngineerPublicProfile,
  hasEngineerProfileFields,
} from "../components/profile/engineer/engineerProfile";
import { OrganisationProfileView } from "../components/profile/organisation/OrganisationProfileView";
import {
  type CompanyPublicProfile,
  isCompanyPublicProfile,
} from "../components/profile/organisation/organisationProfile";
import {
  type ClientPublicProfile,
  hasClientProfileFields,
} from "../components/profile/client/clientProfile";
import { ProfileReviews } from "../components/profile/shared/ProfileReviews";
import {
  type CustomerReviewsResponse,
  type ProviderReviewsResponse,
  isCustomerReviewsResponse,
  isProviderReviewsResponse,
} from "../components/profile/shared/profileTypes";
import { useAuth } from "../context/AuthContext";
import { Link, useLocation, useParams } from "react-router-dom";
import { dashboardBase } from "../lib/dashboardPaths";
import { ProfileSafetyActions } from "../components/safety/ProfileSafetyActions";
import { ImageLightbox } from "../components/dashboard/ImageLightbox";
import { ConfirmDialog } from "../components/dashboard/ui/ConfirmDialog";
import { MessageButton } from "../components/messages/MessageButton";

interface BasePublicProfile {
  userId: string;
  name: string;
  role: "client" | "engineer" | "organisation";
  profilePhotoUrl: string | null;
  bio: string;
  rating: number | null;
  reviewCount: number;
  connectionStatus: ConnectionStatus;
  connectionId: string | null;
  /** The viewer has blocked this person. */
  blockedByMe?: boolean;
  /** Either side blocked the other: nothing to connect, message or invite. */
  blockedEitherWay?: boolean;
  connectionsCount: number;
}

type PublicProfile = EngineerPublicProfile | ClientPublicProfile;

interface PaginatedPostsResponse {
  posts: FeedPost[];
  page: number;
  limit: number;
  total: number;
}

interface InvitationStatusView {
  id: string;
  status: "pending" | "accepted" | "declined";
  createdAt: string;
  respondedAt: string | null;
  resultingBidId: string | null;
}

interface InviteProjectView {
  id: string;
  title: string;
  status: string;
  canInvite: boolean;
  invitation: InvitationStatusView | null;
}

interface InviteProjectsResponse {
  engineerId: string;
  projects: InviteProjectView[];
}

interface ErrorResponse {
  message?: string;
}

interface ProfileBackState {
  backTo?: string;
  backLabel?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const PROFILE_POSTS_PAGE_LIMIT = 10;
const MAX_CONTENT_LENGTH = 2000;

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
    (profile.role === "client" || profile.role === "engineer" || profile.role === "organisation") &&
    (typeof profile.profilePhotoUrl === "string" ||
      profile.profilePhotoUrl === null) &&
    typeof profile.bio === "string" &&
    (typeof profile.rating === "number" || profile.rating === null) &&
    typeof profile.reviewCount === "number" &&
    isConnectionStatus(profile.connectionStatus) &&
    (typeof profile.connectionId === "string" ||
      profile.connectionId === null) &&
    typeof profile.connectionsCount === "number"
  );
};

const isInvitationStatusView = (
  value: unknown,
): value is InvitationStatusView => {
  if (typeof value !== "object" || value === null) return false;
  const invitation = value as Record<string, unknown>;
  return (
    typeof invitation.id === "string" &&
    (invitation.status === "pending" ||
      invitation.status === "accepted" ||
      invitation.status === "declined") &&
    typeof invitation.createdAt === "string" &&
    (typeof invitation.respondedAt === "string" ||
      invitation.respondedAt === null) &&
    (typeof invitation.resultingBidId === "string" ||
      invitation.resultingBidId === null)
  );
};

const isInviteProjectView = (value: unknown): value is InviteProjectView => {
  if (typeof value !== "object" || value === null) return false;
  const project = value as Record<string, unknown>;
  return (
    typeof project.id === "string" &&
    typeof project.title === "string" &&
    typeof project.status === "string" &&
    typeof project.canInvite === "boolean" &&
    (project.invitation === null || isInvitationStatusView(project.invitation))
  );
};

const isInviteProjectsResponse = (
  value: unknown,
): value is InviteProjectsResponse => {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.engineerId === "string" &&
    Array.isArray(body.projects) &&
    body.projects.every(isInviteProjectView)
  );
};

const isPublicProfile = (value: unknown): value is PublicProfile => {
  if (!isBaseProfile(value)) return false;
  const profile = value as unknown as Record<string, unknown>;

  if (profile.role === "engineer") return hasEngineerProfileFields(profile);

  return hasClientProfileFields(profile);
};

const isFeedAuthor = (value: unknown): value is FeedAuthor => {
  if (typeof value !== "object" || value === null) return false;
  const author = value as Record<string, unknown>;
  return (
    typeof author.userId === "string" &&
    typeof author.name === "string" &&
    (author.role === "client" || author.role === "engineer" || author.role === "organisation") &&
    (typeof author.profilePhotoUrl === "string" ||
      author.profilePhotoUrl === null) &&
    (typeof author.rating === "number" || author.rating === null) &&
    typeof author.reviewCount === "number"
  );
};

const isFeedOriginalPost = (value: unknown): value is FeedOriginalPost => {
  if (typeof value !== "object" || value === null) return false;
  const original = value as Record<string, unknown>;
  return (
    typeof original.id === "string" &&
    typeof original.content === "string" &&
    (typeof original.imageUrl === "string" || original.imageUrl === null) &&
    typeof original.createdAt === "string" &&
    isFeedAuthor(original.author)
  );
};

const isFeedPost = (value: unknown): value is FeedPost => {
  if (typeof value !== "object" || value === null) return false;
  const post = value as Record<string, unknown>;
  return (
    typeof post.id === "string" &&
    typeof post.content === "string" &&
    (typeof post.imageUrl === "string" || post.imageUrl === null) &&
    isFeedAuthor(post.author) &&
    typeof post.likeCount === "number" &&
    typeof post.likedByMe === "boolean" &&
    typeof post.commentCount === "number" &&
    (post.originalPost === null || isFeedOriginalPost(post.originalPost)) &&
    typeof post.createdAt === "string" &&
    typeof post.updatedAt === "string"
  );
};

const isPaginatedPostsResponse = (
  value: unknown,
): value is PaginatedPostsResponse => {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    Array.isArray(body.posts) &&
    body.posts.every(isFeedPost) &&
    typeof body.page === "number" &&
    typeof body.limit === "number" &&
    typeof body.total === "number"
  );
};

const getErrorMessage = (value: unknown): string => {
  if (typeof value === "object" && value !== null) {
    const body = value as ErrorResponse;
    if (typeof body.message === "string") return body.message;
  }
  return "Unable to load this profile.";
};

const getErrorMessageWithFallback = (
  value: unknown,
  fallback: string,
): string => {
  if (typeof value === "object" && value !== null) {
    const body = value as ErrorResponse;
    if (typeof body.message === "string") return body.message;
  }
  return fallback;
};

const formatRelativeTime = (value: string): string => {
  const date = new Date(value);
  const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (Number.isNaN(diffSeconds)) return "just now";
  if (diffSeconds < 60) return "just now";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)}d ago`;
  return date.toLocaleDateString();
};

const statusLabel = (status: ConnectionStatus): string => {
  if (status === "connected") return "Connected";
  if (status === "pending_sent") return "Request sent";
  if (status === "pending_received") return "Request received";
  return "Not connected";
};

export function PublicProfilePage(): ReactElement {
  const { userId } = useParams<{ userId: string }>();
  const location = useLocation();
  const { currentUser, refetchUser } = useAuth();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  // Company profiles have their own shape and view.
  const [companyProfile, setCompanyProfile] =
    useState<CompanyPublicProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [actionError, setActionError] = useState<string>("");
  const [isActioning, setIsActioning] = useState<boolean>(false);
  const [reloadKey, setReloadKey] = useState<number>(0);
  // Reloads of the profile already on screen (after Connect, Accept, edits)
  // happen quietly instead of flashing the whole-page skeleton.
  const shownUserIdRef = useRef<string | null>(null);
  const [reviews, setReviews] = useState<ProviderReviewsResponse | null>(null);
  const [customerReviews, setCustomerReviews] =
    useState<CustomerReviewsResponse | null>(null);
  const [reviewsError, setReviewsError] = useState<string>("");
  const [inviteProjects, setInviteProjects] = useState<InviteProjectView[]>([]);
  const [isInviteProjectsLoading, setIsInviteProjectsLoading] =
    useState<boolean>(false);
  const [inviteError, setInviteError] = useState<string>("");
  const [inviteSuccess, setInviteSuccess] = useState<string>("");
  const [inviteActionProjectId, setInviteActionProjectId] = useState<
    string | null
  >(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [postsPage, setPostsPage] = useState<number>(1);
  const [postsTotal, setPostsTotal] = useState<number>(0);
  const [isLoadingMorePosts, setIsLoadingMorePosts] = useState<boolean>(false);
  const [postsError, setPostsError] = useState<string>("");

  const [isEntranceVisible, setIsEntranceVisible] = useState<boolean>(false);
  const hasPlayedEntrance = useRef<boolean>(false);

  // A post waiting on the owner's confirmation before it's deleted.
  const [postToDelete, setPostToDelete] = useState<string | null>(null);

  const [content, setContent] = useState<string>("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string>("");
  const [isPosting, setIsPosting] = useState<boolean>(false);
  const [composerError, setComposerError] = useState<string>("");
  const [isComposerOpen, setIsComposerOpen] = useState<boolean>(false);

  const [likeLoadingIds, setLikeLoadingIds] = useState<string[]>([]);
  const [likedPulseId, setLikedPulseId] = useState<string | null>(null);
  const [activeMenuPostId, setActiveMenuPostId] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  useEffect(() => {
    // Moving to another profile mid-load must not show the previous person.
    let isActive = true;
    const loadProfile = async (): Promise<void> => {
      if (!userId) {
        setError("User ID is required.");
        setIsLoading(false);
        return;
      }

      if (shownUserIdRef.current !== userId) setIsLoading(true);
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
        if (!isActive) return;

        if (response.ok && isCompanyPublicProfile(body)) {
          setCompanyProfile(body);
          setProfile(null);
          shownUserIdRef.current = userId;
          return;
        }
        setCompanyProfile(null);

        if (!response.ok || !isPublicProfile(body)) {
          setError(getErrorMessage(body));
          return;
        }

        setProfile(body);
        shownUserIdRef.current = userId;
      } catch {
        if (isActive) setError("Unable to connect to CivilHub. Please try again.");
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    void loadProfile();
    return () => {
      isActive = false;
    };
  }, [reloadKey, userId]);

  useEffect(() => {
    hasPlayedEntrance.current = false;
    setIsEntranceVisible(false);
    setPostsPage(1);
    setPosts([]);
    setPostsTotal(0);
    setPostsError("");
  }, [userId]);

  useEffect(() => {
    if (!profile || hasPlayedEntrance.current) return;
    hasPlayedEntrance.current = true;
    const frame = requestAnimationFrame(() => setIsEntranceVisible(true));
    return () => {
      cancelAnimationFrame(frame);
      // If the profile updates again before the frame runs, let the next
      // run schedule it; otherwise the page would stay invisible.
      hasPlayedEntrance.current = false;
    };
  }, [profile]);

  // Whose page this is: an engineer or client (profile) or a company.
  const subjectId = profile?.userId ?? companyProfile?.userId ?? null;
  const subjectRole = profile?.role ?? companyProfile?.role ?? null;
  const companyTakesProjects =
    companyProfile?.company?.services.includes("projects") ?? false;
  const subjectBlocked = Boolean(
    profile?.blockedEitherWay ?? companyProfile?.blockedEitherWay,
  );

  useEffect(() => {
    if (!subjectId || (subjectRole !== "engineer" && subjectRole !== "organisation")) {
      setReviews(null);
      return;
    }

    const loadReviews = async (): Promise<void> => {
      setReviewsError("");
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/engineers/${subjectId}/reviews`,
          { credentials: "include" },
        );
        const body: unknown = await response.json();
        if (!response.ok || !isProviderReviewsResponse(body)) {
          setReviewsError(getErrorMessage(body));
          return;
        }
        setReviews(body);
      } catch {
        setReviewsError("Unable to load reviews.");
      }
    };

    void loadReviews();
  }, [subjectId, subjectRole, reloadKey]);

  // What engineers and equipment owners said about this person as a customer.
  useEffect(() => {
    if (!subjectId) {
      setCustomerReviews(null);
      return;
    }
    let isActive = true;
    const loadCustomerReviews = async (): Promise<void> => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/users/${subjectId}/customer-reviews`,
          { credentials: "include" },
        );
        const body: unknown = await response.json();
        if (isActive && response.ok && isCustomerReviewsResponse(body)) {
          setCustomerReviews(body);
        }
      } catch {
        // The rest of the profile still shows; this section just stays empty.
      }
    };
    void loadCustomerReviews();
    return () => {
      isActive = false;
    };
  }, [subjectId, reloadKey]);

  useEffect(() => {
    if (!subjectId) return;

    let isActive = true;

    const loadPosts = async (): Promise<void> => {
      if (postsPage > 1) {
        setIsLoadingMorePosts(true);
      }
      if (postsPage === 1) {
        setPostsError("");
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/users/${subjectId}/posts?page=${postsPage}&limit=${PROFILE_POSTS_PAGE_LIMIT}`,
          { credentials: "include" },
        );
        const body: unknown = await response.json();
        if (!response.ok || !isPaginatedPostsResponse(body)) {
          if (!isActive) return;
          setPostsError("Unable to load posts.");
          return;
        }

        if (!isActive) return;

        setPostsTotal(body.total);
        setPosts((current) => {
          if (postsPage === 1) {
            return body.posts;
          }

          const existing = new Set(current.map((post) => post.id));
          const additions = body.posts.filter((post) => !existing.has(post.id));
          return [...current, ...additions];
        });
      } catch {
        if (!isActive) return;
        setPostsError("Unable to load posts.");
      } finally {
        if (isActive) {
          setIsLoadingMorePosts(false);
        }
      }
    };

    void loadPosts();

    return () => {
      isActive = false;
    };
  }, [currentUser?.id, currentUser?.role, postsPage, subjectId]);

  useEffect(() => {
    const canBeInvited =
      subjectRole === "engineer" ||
      (subjectRole === "organisation" && companyTakesProjects);
    if (
      !subjectId ||
      !canBeInvited ||
      subjectBlocked ||
      currentUser?.role !== "client" ||
      currentUser.id === subjectId
    ) {
      setInviteProjects([]);
      setInviteError("");
      setInviteSuccess("");
      return;
    }

    let isActive = true;
    const loadInviteProjects = async (): Promise<void> => {
      setIsInviteProjectsLoading(true);
      setInviteError("");
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/bid-invitations/client/engineers/${subjectId}/projects`,
          { credentials: "include" },
        );
        const body: unknown = await response.json();
        if (!isActive) return;
        if (!response.ok || !isInviteProjectsResponse(body)) {
          setInviteError(
            getErrorMessageWithFallback(
              body,
              "Unable to load your project invitations.",
            ),
          );
          return;
        }
        setInviteProjects(body.projects);
      } catch {
        if (isActive) setInviteError("Unable to connect to CivilHub. Please try again.");
      } finally {
        if (isActive) setIsInviteProjectsLoading(false);
      }
    };

    void loadInviteProjects();
    return () => {
      isActive = false;
    };
  }, [companyTakesProjects, currentUser?.id, currentUser?.role, reloadKey, subjectBlocked, subjectId, subjectRole]);

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

  const sendBidInvitation = async (projectId: string): Promise<void> => {
    if (!subjectId) {
      return;
    }

    setInviteActionProjectId(projectId);
    setInviteError("");
    setInviteSuccess("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/bid-invitations`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          engineerId: subjectId,
        }),
      });
      const body: unknown = await response.json();

      if (!response.ok) {
        setInviteError(
          getErrorMessageWithFallback(body, "Unable to send invitation."),
        );
        return;
      }

      setInviteSuccess(
        subjectRole === "organisation"
          ? "Invitation sent. Waiting for the company to respond."
          : "Invitation sent. Waiting for the engineer to respond.",
      );
      refreshProfile();
    } catch {
      setInviteError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setInviteActionProjectId(null);
    }
  };

  // ProfileReviews sends the reply; this keeps the loaded list in step.
  const handleReplied = (reviewId: string, reply: string): void => {
    setReviews((current) =>
      current
        ? {
            ...current,
            reviews: current.reviews.map((review) =>
              review.id === reviewId
                ? { ...review, engineerReply: reply, engineerRepliedAt: new Date().toISOString() }
                : review,
            ),
          }
        : current,
    );
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0] ?? null;
    setComposerError("");

    if (!file) {
      setSelectedImage(null);
      setSelectedImagePreview("");
      return;
    }

    setSelectedImage(file);
    setSelectedImagePreview(URL.createObjectURL(file));
  };

  const clearImage = (): void => {
    if (selectedImagePreview) {
      URL.revokeObjectURL(selectedImagePreview);
    }
    setSelectedImage(null);
    setSelectedImagePreview("");
  };

  const handleCreatePost = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setComposerError("");

    const trimmed = content.trim();
    if (!trimmed) {
      setComposerError("Post content cannot be empty.");
      return;
    }

    setIsPosting(true);
    try {
      const formData = new FormData();
      formData.append("content", trimmed);
      if (selectedImage) {
        formData.append("image", selectedImage);
      }

      const response = await fetch(`${API_BASE_URL}/api/posts`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const body: unknown = await response.json();

      if (!response.ok || !isFeedPost(body)) {
        setComposerError(
          getErrorMessageWithFallback(body, "Unable to publish this post."),
        );
        return;
      }

      setPosts((current) => [body, ...current]);
      setPostsTotal((current) => current + 1);
      setContent("");
      clearImage();
      setIsComposerOpen(false);
    } catch {
      setComposerError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsPosting(false);
    }
  };

  const toggleLike = async (postId: string): Promise<void> => {
    const current = posts.find((post) => post.id === postId);
    if (!current) return;

    const optimisticLiked = !current.likedByMe;
    const optimisticCount = current.likeCount + (optimisticLiked ? 1 : -1);

    setLikedPulseId(postId);
    window.setTimeout(() => {
      setLikedPulseId((active) => (active === postId ? null : active));
    }, 220);

    setPosts((list) =>
      list.map((post) =>
        post.id === postId
          ? { ...post, likedByMe: optimisticLiked, likeCount: optimisticCount }
          : post,
      ),
    );
    setLikeLoadingIds((ids) => [...ids, postId]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/posts/${postId}/like`, {
        method: "PATCH",
        credentials: "include",
      });
      const body: unknown = await response.json();
      const isLikeResponse =
        typeof body === "object" &&
        body !== null &&
        typeof (body as { likedByMe?: unknown }).likedByMe === "boolean" &&
        typeof (body as { likeCount?: unknown }).likeCount === "number";

      if (!response.ok || !isLikeResponse) {
        throw new Error("failed");
      }

      const { likedByMe, likeCount } = body as {
        likedByMe: boolean;
        likeCount: number;
      };
      setPosts((list) =>
        list.map((post) =>
          post.id === postId ? { ...post, likedByMe, likeCount } : post,
        ),
      );
    } catch {
      setPosts((list) =>
        list.map((post) =>
          post.id === postId
            ? {
                ...post,
                likedByMe: current.likedByMe,
                likeCount: current.likeCount,
              }
            : post,
        ),
      );
    } finally {
      setLikeLoadingIds((ids) => ids.filter((id) => id !== postId));
    }
  };

  const removePost = async (postId: string): Promise<void> => {
    setDeleteLoadingId(postId);
    try {
      const response = await fetch(`${API_BASE_URL}/api/posts/${postId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const body: unknown = await response.json();
        setPostsError(
          getErrorMessageWithFallback(body, "Unable to delete this post."),
        );
        return;
      }

      setPosts((current) => current.filter((post) => post.id !== postId));
      setPostsTotal((current) => Math.max(0, current - 1));
    } catch {
      setPostsError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setDeleteLoadingId(null);
      setActiveMenuPostId(null);
      setPostToDelete(null);
    }
  };

  if (isLoading) {
    return (
      <div>
        <div className="animate-pulse rounded-2xl border border-white/10 bg-surface p-8">
          <div className="h-6 w-1/3 rounded bg-white/10" />
          <div className="mt-4 h-4 w-1/4 rounded bg-white/10" />
          <div className="mt-8 h-40 rounded bg-white/10" />
        </div>
      </div>
    );
  }

  const hasMorePosts = posts.length < postsTotal;

  const loadMorePosts = (): void => {
    if (isLoadingMorePosts || !hasMorePosts) {
      return;
    }

    setPostsPage((current) => current + 1);
  };

  // The posts list, shared by engineer, client and company pages.
  const renderPostsSection = (
    showComposer: boolean,
    author: { name: string; photoUrl: string | null; role: "client" | "engineer" | "organisation" },
  ): ReactElement => (
    <article className="space-y-4 rounded-2xl border border-white/10 bg-surface p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-2xl font-bold text-white">Posts</h2>
        <p className="text-xs text-white/45">
          {postsTotal} post{postsTotal === 1 ? "" : "s"}
        </p>
      </div>

      {showComposer ? (
        <>
          <div className="w-full rounded-2xl border border-white/10 bg-void/40 p-4 transition-colors duration-200 hover:border-primary/30">
            <div className="flex items-center gap-3">
              <Avatar
                name={author.name}
                photoUrl={author.photoUrl}
                size="sm"
              />
              <button
                type="button"
                onClick={() => setIsComposerOpen(true)}
                className="w-full rounded-full border border-white/20 bg-void/60 px-4 py-2.5 text-left text-sm font-semibold text-white/50 transition-colors duration-200 hover:border-primary hover:text-white/70"
              >
                What's on your mind, {author.name.trim().split(/\s+/)[0] || author.name}?
              </button>
            </div>
          </div>
          <PostComposerModal
            isOpen={isComposerOpen}
            onClose={() => setIsComposerOpen(false)}
            authorName={author.name}
            authorPhotoUrl={author.photoUrl}
            authorRole={author.role}
            content={content}
            onContentChange={(value) => {
              setContent(value);
              setComposerError("");
            }}
            maxContentLength={MAX_CONTENT_LENGTH}
            remainingChars={MAX_CONTENT_LENGTH - content.length}
            showRemainingCount={MAX_CONTENT_LENGTH - content.length <= 100}
            selectedImagePreview={selectedImagePreview}
            onImageChange={handleImageChange}
            onClearImage={clearImage}
            composerError={composerError}
            isPosting={isPosting}
            onSubmit={(event) => void handleCreatePost(event)}
          />
        </>
      ) : null}

      {postsError ? (
        <p className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200">
          {postsError}
        </p>
      ) : posts.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-void/40 p-4 text-sm text-white/55">
          No posts yet.
        </p>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <FeedPostCard
              key={post.id}
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
              isLikeLoading={likeLoadingIds.includes(post.id)}
              isPulsing={likedPulseId === post.id}
              onToggleLike={() => void toggleLike(post.id)}
              isMenuOpen={activeMenuPostId === post.id}
              onToggleMenu={() =>
                setActiveMenuPostId((current) =>
                  current === post.id ? null : post.id,
                )
              }
              onDeletePost={() => setPostToDelete(post.id)}
              isDeleting={deleteLoadingId === post.id}
              onOpenImage={setLightboxImageUrl}
              formatRelativeTime={formatRelativeTime}
            />
          ))}

          {hasMorePosts ? (
            <div className="pt-1">
              <button
                type="button"
                onClick={loadMorePosts}
                disabled={isLoadingMorePosts}
                className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 transition-colors duration-200 hover:border-primary hover:text-white disabled:cursor-wait disabled:opacity-60"
              >
                {isLoadingMorePosts ? "Loading more..." : "Load more posts"}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </article>
  );


  // "Invite to bid" for a client looking at an engineer or a company.
  const renderInvitePanel = (): ReactElement => (
    <div className="space-y-3">
                        <div className="rounded-xl border border-white/10 bg-void/40 p-3">
                          <h3 className="text-sm font-semibold text-white">
                            Message or invite to bid
                          </h3>

                          {isInviteProjectsLoading ? (
                            <p className="mt-3 text-xs text-white/55">
                              Loading your projects...
                            </p>
                          ) : inviteProjects.length === 0 ? (
                            <div className="mt-3">
                              <p className="text-xs text-white/55">
                                Post a project to message or invite{" "}
                                {subjectRole === "organisation" ? "this company" : "this engineer"}.
                              </p>
                              <Link
                                to="/dashboard/client/post-project"
                                className="mt-3 inline-flex rounded-full border border-primary px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-on-primary"
                              >
                                Post a project
                              </Link>
                            </div>
                          ) : (
                            <div className="mt-3 space-y-2">
                              {inviteProjects.map((project) => {
                                const invitation = project.invitation;
                                const statusLabel = invitation
                                  ? invitation.status === "pending"
                                    ? "Pending"
                                    : invitation.status === "accepted"
                                      ? "Accepted"
                                      : "Declined"
                                  : null;

                                const statusClass = invitation
                                  ? invitation.status === "pending"
                                    ? "border-primary/30 bg-primary/10 text-primary"
                                    : invitation.status === "accepted"
                                      ? "border-white/20 bg-white/5 text-white"
                                      : "border-white/20 bg-white/5 text-white/70"
                                  : "";

                                return (
                                  <div
                                    key={project.id}
                                    className="rounded-lg border border-white/10 bg-surface p-3"
                                  >
                                    <p className="text-xs font-semibold text-white">
                                      {project.title}
                                    </p>
                                    <p className="mt-1 text-[11px] capitalize text-white/45">
                                      {project.status.replaceAll("_", " ")}
                                    </p>

                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                      {/* Chats are about a project: open briefs, or ones they were invited to. */}
                                      {subjectId &&
                                      (project.status === "open_for_bids" || invitation) ? (
                                        <MessageButton
                                          userId={subjectId}
                                          projectId={project.id}
                                          label="Message"
                                        />
                                      ) : null}
                                      {invitation ? (
                                        <span
                                          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass}`}
                                        >
                                          {statusLabel}
                                        </span>
                                      ) : project.canInvite ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void sendBidInvitation(project.id)
                                          }
                                          disabled={
                                            inviteActionProjectId === project.id
                                          }
                                          className="rounded-full border border-primary px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary hover:text-on-primary disabled:opacity-50"
                                        >
                                          {inviteActionProjectId === project.id
                                            ? "Sending..."
                                            : "Invite to Bid"}
                                        </button>
                                      ) : (
                                        <span className="text-[11px] text-white/45">
                                          Not eligible for bidding invitations
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {inviteSuccess ? (
                          <p className="text-xs text-primary">{inviteSuccess}</p>
                        ) : null}
                        {inviteError ? (
                          <p className="text-xs text-rose-300" role="alert">
                            {inviteError}
                          </p>
                        ) : null}
    </div>
  );

  const renderReviewsSection = (
    customerLabel: string,
    emptyText: string,
  ): ReactElement => (
    <ProfileReviews
      providerReviews={reviews}
      customerReviews={customerReviews}
      customerLabel={customerLabel}
      isLoading={
        subjectRole !== "client" && reviews === null && !reviewsError
      }
      error={reviewsError}
      canReply={currentUser?.id === subjectId}
      onReplied={handleReplied}
      emptyText={emptyText}
    />
  );

  const confirmRemovalDialog = postToDelete ? (
    <ConfirmDialog
      title="Delete this post?"
      description="It's removed for good, along with its likes and comments."
      confirmLabel="Delete post"
      busyLabel="Deleting..."
      tone="danger"
      isBusy={deleteLoadingId === postToDelete}
      onConfirm={() => void removePost(postToDelete)}
      onClose={() => setPostToDelete(null)}
    />
  ) : null;

  if (companyProfile && !error) {
    const companyBackState =
      location.state && typeof location.state === "object"
        ? (location.state as ProfileBackState)
        : null;
    return (
      <div>
        <div>
          <BackButton
            to={
              typeof companyBackState?.backTo === "string" &&
              companyBackState.backTo
                ? companyBackState.backTo
                : dashboardBase(currentUser?.role)
            }
            label={
              typeof companyBackState?.backLabel === "string" &&
              companyBackState.backLabel
                ? companyBackState.backLabel
                : "Back to dashboard"
            }
            className="mb-5"
          />
          <OrganisationProfileView
            key={companyProfile.userId}
            profile={companyProfile}
            isSelf={currentUser?.id === companyProfile.userId}
            onChanged={refreshProfile}
            reviewsSection={renderReviewsSection(
              "As a renter",
              "No reviews yet. They appear here after projects and rentals are finished.",
            )}
            postsSection={
              postsTotal > 0 || currentUser?.id === companyProfile.userId
                ? renderPostsSection(currentUser?.id === companyProfile.userId, {
                    name: companyProfile.name,
                    photoUrl: companyProfile.profilePhotoUrl,
                    role: "organisation",
                  })
                : null
            }
            inviteSection={
              currentUser?.role === "client" && companyTakesProjects && !subjectBlocked ? (
                <div className="rounded-2xl border border-white/10 bg-surface p-5">
                  {renderInvitePanel()}
                </div>
              ) : null
            }
          />
        </div>

        {lightboxImageUrl ? (
          <ImageLightbox
            imageUrl={lightboxImageUrl}
            onClose={() => setLightboxImageUrl(null)}
          />
        ) : null}

        {confirmRemovalDialog}
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div>
        <section className="mx-auto max-w-3xl rounded-2xl border border-rose-400/20 bg-rose-400/5 p-8 text-center">
          <p className="text-sm text-rose-200">
            {error || "Profile not found."}
          </p>
          <button
            type="button"
            onClick={() => refreshProfile()}
            className="mt-5 rounded-full border border-primary px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary hover:text-on-primary"
          >
            Try again
          </button>
        </section>
      </div>
    );
  }

  const isSelf = currentUser?.id === profile.userId;
  const isEngineerProfile = profile.role === "engineer";
  const isClientViewingEngineerProfile =
    currentUser?.role === "client" && isEngineerProfile && !isSelf;
  const rawBackState =
    location.state && typeof location.state === "object"
      ? (location.state as ProfileBackState)
      : null;

  const backDestination =
    typeof rawBackState?.backTo === "string" && rawBackState.backTo.length > 0
      ? rawBackState.backTo
      : isSelf && currentUser?.role
        ? dashboardBase(currentUser.role)
        : currentUser?.role
          ? `${dashboardBase(currentUser.role)}/network`
          : "/search/engineers";

  const backLabel =
    typeof rawBackState?.backLabel === "string" &&
    rawBackState.backLabel.length > 0
      ? rawBackState.backLabel
      : isSelf
        ? "Back to dashboard"
        : currentUser?.role === "client"
          ? "Back to Engineer Directory"
          : currentUser?.role === "engineer"
            ? "Back to My Network"
            : "Back to Engineer Directory";

  return (
    <div>
      <div>
        <BackButton to={backDestination} label={backLabel} className="mb-5" />

        {profile.role === "client" ? (
          <ClientProfileView
            key={profile.userId}
            profile={profile}
            isSelf={isSelf}
            viewerRole={currentUser?.role ?? null}
            actionError={actionError}
            onProfileChange={(update) =>
              setProfile((current) =>
                current?.role === "client" ? update(current) : current,
              )
            }
            onPhotoChanged={refetchUser}
            posts={
              postsTotal > 0
                ? renderPostsSection(false, {
                    name: profile.name,
                    photoUrl: profile.profilePhotoUrl,
                    role: profile.role,
                  })
                : null
            }
            reviews={
              (customerReviews?.totalReviews ?? 0) > 0
                ? renderReviewsSection("From engineers and owners", "")
                : null
            }
          />
        ) : (
          <EngineerProfileView
            key={profile.userId}
            profile={profile}
            isSelf={isSelf}
            isEntranceVisible={isEntranceVisible}
            onProfileChange={(update) =>
              setProfile((current) =>
                current?.role === "engineer" ? update(current) : current,
              )
            }
            onDisciplinesSaved={refreshProfile}
            onPhotoChanged={() => void refetchUser()}
            onOpenImage={setLightboxImageUrl}
            viewerActions={
              <>
                {/* Nothing to connect, message or invite across a block,
                    whichever side made it. */}
                {!isSelf && !profile.blockedEitherWay ? (
                  isClientViewingEngineerProfile ? (
                    <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                      {renderInvitePanel()}
                    </div>
                  ) : (
                    <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
                      <p className="text-xs font-semibold text-white/50">
                        {statusLabel(profile.connectionStatus)}
                      </p>
                      {profile.connectionStatus === "not_connected" ? (
                        <button
                          type="button"
                          onClick={() => void sendRequest()}
                          disabled={isActioning}
                          className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary shadow-glow transition-all duration-200 hover:-translate-y-0.5 hover:bg-glow disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isActioning ? "Sending..." : "Connect"}
                        </button>
                      ) : null}

                      {profile.connectionStatus === "pending_received" ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void respondRequest("accept")}
                            disabled={isActioning}
                            className="flex-1 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary shadow-glow transition-all duration-200 hover:-translate-y-0.5 hover:bg-glow disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isActioning ? "Updating..." : "Accept"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void respondRequest("decline")}
                            disabled={isActioning}
                            className="flex-1 rounded-full border border-white/20 px-4 py-2.5 text-sm font-semibold text-white/70 transition-all duration-200 hover:-translate-y-0.5 hover:border-rose-300 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isActioning ? "Updating..." : "Decline"}
                          </button>
                        </div>
                      ) : null}

                      {profile.connectionStatus === "pending_sent" ? (
                        <span className="block w-full rounded-full border border-violet-300/30 bg-violet-300/10 px-4 py-2.5 text-center text-sm font-semibold text-violet-200">
                          Request sent
                        </span>
                      ) : null}

                      {profile.connectionStatus === "connected" ? (
                        <Link
                          to={`/messages/${profile.userId}`}
                          className="block w-full rounded-full border border-primary px-4 py-2.5 text-center text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary hover:text-on-primary"
                        >
                          Message
                        </Link>
                      ) : null}
                    </div>
                  )
                ) : null}

                {!isSelf ? (
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <ProfileSafetyActions
                      userId={profile.userId}
                      name={profile.name}
                      blockedByMe={Boolean(profile.blockedByMe)}
                      onChanged={refreshProfile}
                    />
                  </div>
                ) : null}

                {actionError ? (
                  <p className="mt-4 text-xs text-rose-300" role="alert">
                    {actionError}
                  </p>
                ) : null}
              </>
            }
            reviewsSection={renderReviewsSection(
              "As a renter",
              isSelf
                ? "Reviews from clients and renters appear here once work is finished."
                : "No reviews yet.",
            )}
            postsSection={renderPostsSection(isSelf && currentUser?.role === "engineer", {
              name: profile.name,
              photoUrl: profile.profilePhotoUrl,
              role: profile.role,
            })}
          />
        )}
      </div>

      {lightboxImageUrl ? (
        <ImageLightbox
          imageUrl={lightboxImageUrl}
          onClose={() => setLightboxImageUrl(null)}
        />
      ) : null}

      {confirmRemovalDialog}
    </div>
  );
}

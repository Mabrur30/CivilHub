import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useParams } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import {
  FeedPostCard,
  type FeedAuthor,
  type FeedOriginalPost,
  type FeedPost,
} from "../components/dashboard/FeedPostCard";
import { PostComposerModal } from "../components/dashboard/PostComposerModal";
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

interface OwnEngineerCertificate {
  _id: string;
  title: string;
  fileUrl: string;
  uploadedAt: string;
}

interface OwnEngineerPortfolioItem {
  _id: string;
  title: string;
  description: string;
  imageUrl: string;
  uploadedAt: string;
}

interface OwnEngineerData {
  certificates: OwnEngineerCertificate[];
  portfolio: OwnEngineerPortfolioItem[];
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
  connectionsCount: number;
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

type ProfileTab = "posts" | "portfolio" | "certificates" | "reviews";

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const CERTIFICATE_TYPES = [...IMAGE_TYPES, "application/pdf"];
const IMAGE_LIMIT = 5 * 1024 * 1024;
const CERTIFICATE_LIMIT = 10 * 1024 * 1024;
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
    (profile.role === "client" || profile.role === "engineer") &&
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

const isOwnEngineerCertificate = (
  value: unknown,
): value is OwnEngineerCertificate => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item._id === "string" &&
    typeof item.title === "string" &&
    typeof item.fileUrl === "string" &&
    typeof item.uploadedAt === "string"
  );
};

const isOwnEngineerPortfolioItem = (
  value: unknown,
): value is OwnEngineerPortfolioItem => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item._id === "string" &&
    typeof item.title === "string" &&
    typeof item.description === "string" &&
    typeof item.imageUrl === "string" &&
    typeof item.uploadedAt === "string"
  );
};

const isOwnEngineerData = (value: unknown): value is OwnEngineerData => {
  if (typeof value !== "object" || value === null) return false;
  const data = value as Record<string, unknown>;
  return (
    Array.isArray(data.certificates) &&
    data.certificates.every(isOwnEngineerCertificate) &&
    Array.isArray(data.portfolio) &&
    data.portfolio.every(isOwnEngineerPortfolioItem)
  );
};

const isCertificatesResponse = (
  value: unknown,
): value is { certificates: OwnEngineerCertificate[] } => {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    Array.isArray(body.certificates) &&
    body.certificates.every(isOwnEngineerCertificate)
  );
};

const isPortfolioResponse = (
  value: unknown,
): value is { portfolio: OwnEngineerPortfolioItem[] } => {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    Array.isArray(body.portfolio) &&
    body.portfolio.every(isOwnEngineerPortfolioItem)
  );
};

const isOwnClientProfile = (
  value: unknown,
): value is { phone: string; companyName: string; bio: string } => {
  if (typeof value !== "object" || value === null) return false;
  const profile = value as Record<string, unknown>;
  return (
    typeof profile.phone === "string" &&
    typeof profile.companyName === "string" &&
    typeof profile.bio === "string"
  );
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
  const profile = value as unknown as Record<string, unknown>;

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

const isFeedAuthor = (value: unknown): value is FeedAuthor => {
  if (typeof value !== "object" || value === null) return false;
  const author = value as Record<string, unknown>;
  return (
    typeof author.userId === "string" &&
    typeof author.name === "string" &&
    (author.role === "client" || author.role === "engineer") &&
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

const validateFile = (
  file: File | undefined,
  allowedTypes: string[],
  limit: number,
  label: string,
): string => {
  if (!file) return `${label} file is required.`;
  if (!allowedTypes.includes(file.type))
    return `${label} must be a JPG, PNG, WEBP${label === "Certificate" ? ", or PDF" : ""}.`;
  if (file.size > limit)
    return `${label} must be ${limit / (1024 * 1024)}MB or smaller.`;
  return "";
};

const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
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

const usersIcon = (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const briefcaseIcon = (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);

const certificateIcon = (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <circle cx="12" cy="8" r="6" />
    <path d="m9 13.5-1.5 7 4.5-2.5 4.5 2.5-1.5-7" />
  </svg>
);

const buildingIcon = (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <rect x="4" y="2" width="16" height="20" rx="1" />
    <path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" />
  </svg>
);

const checkCircleIcon = (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: ReactElement;
  label: string;
  value: ReactNode;
}): ReactElement {
  return (
    <div className="flex items-center gap-2.5 text-white/65">
      <span className="shrink-0 text-white/40">{icon}</span>
      <span className="flex-1">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

export function PublicProfilePage(): ReactElement {
  const { userId } = useParams<{ userId: string }>();
  const { currentUser, refetchUser } = useAuth();

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
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [postsError, setPostsError] = useState<string>("");

  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [isEntranceVisible, setIsEntranceVisible] = useState<boolean>(false);
  const hasPlayedEntrance = useRef<boolean>(false);

  const [isUploadingAvatar, setIsUploadingAvatar] = useState<boolean>(false);
  const [avatarError, setAvatarError] = useState<string>("");
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [isEditingBio, setIsEditingBio] = useState<boolean>(false);
  const [bioDraft, setBioDraft] = useState<string>("");
  const [isSavingBio, setIsSavingBio] = useState<boolean>(false);
  const [bioSaveError, setBioSaveError] = useState<string>("");

  const [ownPhone, setOwnPhone] = useState<string | null>(null);
  const [isEditingClientDetails, setIsEditingClientDetails] =
    useState<boolean>(false);
  const [phoneDraft, setPhoneDraft] = useState<string>("");
  const [companyDraft, setCompanyDraft] = useState<string>("");
  const [isSavingClientDetails, setIsSavingClientDetails] =
    useState<boolean>(false);
  const [clientDetailsError, setClientDetailsError] = useState<string>("");

  const [ownEngineerData, setOwnEngineerData] =
    useState<OwnEngineerData | null>(null);
  const [isLoadingOwnEngineerData, setIsLoadingOwnEngineerData] =
    useState<boolean>(false);
  const [ownEngineerLoadError, setOwnEngineerLoadError] =
    useState<string>("");

  const certificateFileInputRef = useRef<HTMLInputElement | null>(null);
  const [certificateTitle, setCertificateTitle] = useState<string>("");
  const [isUploadingCertificate, setIsUploadingCertificate] =
    useState<boolean>(false);
  const [certificateError, setCertificateError] = useState<string>("");

  const portfolioFileInputRef = useRef<HTMLInputElement | null>(null);
  const [portfolioTitle, setPortfolioTitle] = useState<string>("");
  const [portfolioDescription, setPortfolioDescription] = useState<string>("");
  const [isUploadingPortfolio, setIsUploadingPortfolio] =
    useState<boolean>(false);
  const [portfolioError, setPortfolioError] = useState<string>("");

  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  const [content, setContent] = useState<string>("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string>("");
  const [isPosting, setIsPosting] = useState<boolean>(false);
  const [composerError, setComposerError] = useState<string>("");
  const [isComposerOpen, setIsComposerOpen] = useState<boolean>(false);

  const [likeLoadingIds, setLikeLoadingIds] = useState<string[]>([]);
  const [likedPulseId, setLikedPulseId] = useState<string | null>(null);
  const [activeMenuPostId, setActiveMenuPostId] = useState<string | null>(
    null,
  );
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(
    null,
  );

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
    hasPlayedEntrance.current = false;
    setIsEntranceVisible(false);
    setActiveTab("posts");
  }, [userId]);

  useEffect(() => {
    if (!profile || hasPlayedEntrance.current) return;
    hasPlayedEntrance.current = true;
    const frame = requestAnimationFrame(() => setIsEntranceVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [profile]);

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
        if (
          !response.ok ||
          !Array.isArray(payload.posts) ||
          !payload.posts.every(isFeedPost)
        ) {
          setPostsError("Unable to load posts.");
          return;
        }
        setPosts(payload.posts);
      } catch {
        setPostsError("Unable to load posts.");
      }
    };
    void loadPosts();
  }, [profile]);

  useEffect(() => {
    if (!profile || !currentUser || currentUser.id !== profile.userId) {
      setOwnEngineerData(null);
      setOwnPhone(null);
      return;
    }

    if (profile.role === "engineer") {
      setIsLoadingOwnEngineerData(true);
      setOwnEngineerLoadError("");
      const loadOwnEngineerData = async (): Promise<void> => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/engineers/me`, {
            credentials: "include",
          });
          const body: unknown = await response.json();
          if (!response.ok || !isOwnEngineerData(body)) {
            setOwnEngineerLoadError(
              getErrorMessage(body) ||
                "Unable to load your editable portfolio and certificates.",
            );
            return;
          }
          setOwnEngineerData(body);
        } catch {
          setOwnEngineerLoadError("Unable to connect to CivilHub.");
        } finally {
          setIsLoadingOwnEngineerData(false);
        }
      };
      void loadOwnEngineerData();
      return;
    }

    const loadOwnClientData = async (): Promise<void> => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/clients/me`, {
          credentials: "include",
        });
        const body: unknown = await response.json();
        if (response.ok && isOwnClientProfile(body)) {
          setOwnPhone(body.phone);
        }
      } catch {
        // The contact-details card stays gated until this loads successfully.
      }
    };
    void loadOwnClientData();
  }, [profile, currentUser]);

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

  const handleAvatarChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    const validationError = validateFile(
      file,
      IMAGE_TYPES,
      IMAGE_LIMIT,
      "Profile photo",
    );
    if (validationError) {
      setAvatarError(validationError);
      return;
    }

    setIsUploadingAvatar(true);
    setAvatarError("");
    try {
      const formData = new FormData();
      formData.append("photo", file as File);
      const response = await fetch(`${API_BASE_URL}/api/engineers/me/photo`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        setAvatarError(
          getErrorMessageWithFallback(
            body,
            "Unable to upload your profile photo.",
          ),
        );
        return;
      }
      const photoUrl = (body as { profilePhotoUrl?: unknown })
        .profilePhotoUrl;
      if (typeof photoUrl === "string") {
        setProfile((current) =>
          current ? { ...current, profilePhotoUrl: photoUrl } : current,
        );
      }
      await refetchUser();
    } catch {
      setAvatarError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const startEditingBio = (): void => {
    setBioDraft(profile?.bio ?? "");
    setBioSaveError("");
    setIsEditingBio(true);
  };

  const cancelEditingBio = (): void => {
    setIsEditingBio(false);
    setBioSaveError("");
  };

  const saveBio = async (): Promise<void> => {
    if (!profile) return;
    setIsSavingBio(true);
    setBioSaveError("");
    try {
      const endpoint = profile.role === "engineer" ? "engineers" : "clients";
      const response = await fetch(`${API_BASE_URL}/api/${endpoint}/me`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio: bioDraft }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        setBioSaveError(
          getErrorMessageWithFallback(body, "Unable to save your bio."),
        );
        return;
      }
      const trimmed = bioDraft.trim();
      setProfile((current) =>
        current ? { ...current, bio: trimmed } : current,
      );
      setIsEditingBio(false);
    } catch {
      setBioSaveError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsSavingBio(false);
    }
  };

  const startEditingClientDetails = (): void => {
    if (ownPhone === null || !profile || profile.role !== "client") return;
    setPhoneDraft(ownPhone);
    setCompanyDraft(profile.companyName);
    setClientDetailsError("");
    setIsEditingClientDetails(true);
  };

  const cancelEditingClientDetails = (): void => {
    setIsEditingClientDetails(false);
    setClientDetailsError("");
  };

  const saveClientDetails = async (): Promise<void> => {
    setIsSavingClientDetails(true);
    setClientDetailsError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/clients/me`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneDraft, companyName: companyDraft }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        setClientDetailsError(
          getErrorMessageWithFallback(body, "Unable to save your details."),
        );
        return;
      }
      setOwnPhone(phoneDraft.trim());
      setProfile((current) =>
        current && current.role === "client"
          ? { ...current, companyName: companyDraft.trim() }
          : current,
      );
      setIsEditingClientDetails(false);
    } catch {
      setClientDetailsError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsSavingClientDetails(false);
    }
  };

  const uploadCertificate = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const file = certificateFileInputRef.current?.files?.[0];
    setCertificateError("");
    const validationError = validateFile(
      file,
      CERTIFICATE_TYPES,
      CERTIFICATE_LIMIT,
      "Certificate",
    );
    if (validationError || !certificateTitle.trim()) {
      setCertificateError(validationError || "Certificate title is required.");
      return;
    }
    setIsUploadingCertificate(true);
    const formData = new FormData();
    formData.append("title", certificateTitle.trim());
    formData.append("certificate", file as File);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/engineers/me/certificates`,
        { method: "POST", credentials: "include", body: formData },
      );
      const body: unknown = await response.json();
      if (!response.ok || !isCertificatesResponse(body)) {
        setCertificateError(
          getErrorMessageWithFallback(
            body,
            "Unable to upload the certificate.",
          ),
        );
        return;
      }
      setOwnEngineerData((current) => ({
        certificates: body.certificates,
        portfolio: current?.portfolio ?? [],
      }));
      setCertificateTitle("");
      if (certificateFileInputRef.current) {
        certificateFileInputRef.current.value = "";
      }
    } catch {
      setCertificateError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsUploadingCertificate(false);
    }
  };

  const uploadPortfolio = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const file = portfolioFileInputRef.current?.files?.[0];
    setPortfolioError("");
    const validationError = validateFile(
      file,
      IMAGE_TYPES,
      IMAGE_LIMIT,
      "Portfolio image",
    );
    if (
      validationError ||
      !portfolioTitle.trim() ||
      !portfolioDescription.trim()
    ) {
      setPortfolioError(
        validationError || "Portfolio title and description are required.",
      );
      return;
    }
    setIsUploadingPortfolio(true);
    const formData = new FormData();
    formData.append("title", portfolioTitle.trim());
    formData.append("description", portfolioDescription.trim());
    formData.append("image", file as File);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/engineers/me/portfolio`,
        { method: "POST", credentials: "include", body: formData },
      );
      const body: unknown = await response.json();
      if (!response.ok || !isPortfolioResponse(body)) {
        setPortfolioError(
          getErrorMessageWithFallback(
            body,
            "Unable to upload the portfolio image.",
          ),
        );
        return;
      }
      setOwnEngineerData((current) => ({
        certificates: current?.certificates ?? [],
        portfolio: body.portfolio,
      }));
      setPortfolioTitle("");
      setPortfolioDescription("");
      if (portfolioFileInputRef.current) {
        portfolioFileInputRef.current.value = "";
      }
    } catch {
      setPortfolioError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsUploadingPortfolio(false);
    }
  };

  const deleteOwnItem = async (
    kind: "certificates" | "portfolio",
    id: string,
  ): Promise<void> => {
    setDeletingItemId(id);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/engineers/me/${kind}/${id}`,
        { method: "DELETE", credentials: "include" },
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = getErrorMessageWithFallback(
          body,
          "Unable to remove this item.",
        );
        if (kind === "certificates") setCertificateError(message);
        else setPortfolioError(message);
        return;
      }
      if (kind === "certificates" && isCertificatesResponse(body)) {
        setOwnEngineerData((current) => ({
          certificates: body.certificates,
          portfolio: current?.portfolio ?? [],
        }));
      } else if (kind === "portfolio" && isPortfolioResponse(body)) {
        setOwnEngineerData((current) => ({
          certificates: current?.certificates ?? [],
          portfolio: body.portfolio,
        }));
      }
    } catch {
      const message = "Unable to connect to CivilHub. Please try again.";
      if (kind === "certificates") setCertificateError(message);
      else setPortfolioError(message);
    } finally {
      setDeletingItemId(null);
    }
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
    const confirmed = window.confirm("Delete this post permanently?");
    if (!confirmed) return;

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
    } catch {
      setPostsError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setDeleteLoadingId(null);
      setActiveMenuPostId(null);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-void px-4 py-12 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl animate-pulse rounded-2xl border border-white/10 bg-surface p-8">
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
  const isEngineerProfile = profile.role === "engineer";
  const composerFirstName = profile.name.trim().split(/\s+/)[0] || profile.name;

  const entrance = (
    order: number,
  ): { className: string; style: CSSProperties } => ({
    className: `transition-all duration-[350ms] ease-out ${
      isEntranceVisible
        ? "translate-y-0 opacity-100"
        : "translate-y-2 opacity-0"
    }`,
    style: { transitionDelay: `${order * 80}ms` },
  });

  const tabs: Array<{ key: ProfileTab; label: string }> = isEngineerProfile
    ? [
        { key: "posts", label: "Posts" },
        { key: "portfolio", label: "Portfolio" },
        { key: "certificates", label: "Certificates" },
        { key: "reviews", label: "Reviews" },
      ]
    : [{ key: "posts", label: "Posts" }];

  const portfolioCount = isSelf
    ? (ownEngineerData?.portfolio.length ?? 0)
    : isEngineerProfile
      ? profile.portfolio.length
      : 0;
  const certificateCount = isSelf
    ? (ownEngineerData?.certificates.length ?? 0)
    : isEngineerProfile
      ? profile.certificates.length
      : 0;

  return (
    <main className="min-h-screen bg-void px-4 py-12 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <aside className="w-full shrink-0 lg:sticky lg:top-8 lg:w-[30%]">
            <div
              className={`overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-[0_12px_30px_rgba(0,0,0,0.22)] ${entrance(0).className}`}
              style={entrance(0).style}
            >
              <div className="h-16 w-full bg-gradient-to-r from-primary/70 via-sky-400/40 to-emerald-300/35" />
              <div className="p-5 pt-0">
                <div className="-mt-10">
                  <div className="group/avatar relative inline-flex rounded-full bg-surface p-1 shadow-lg">
                    <Avatar
                      name={profile.name}
                      photoUrl={profile.profilePhotoUrl}
                      size="lg"
                    />
                    {isSelf && isEngineerProfile ? (
                      <>
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={isUploadingAvatar}
                          aria-label="Change profile photo"
                          className={`absolute inset-1 flex items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-opacity duration-200 hover:bg-black/70 disabled:cursor-wait ${
                            isUploadingAvatar
                              ? "opacity-100"
                              : "opacity-0 group-hover/avatar:opacity-100 focus-visible:opacity-100"
                          }`}
                        >
                          {isUploadingAvatar ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                          ) : (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              aria-hidden="true"
                            >
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                          )}
                        </button>
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(event) => void handleAvatarChange(event)}
                          className="sr-only"
                        />
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-heading text-2xl font-bold text-white">
                      {profile.name}
                    </h1>
                    {isEngineerProfile && reviews && reviews.totalReviews > 0 ? (
                      <button
                        type="button"
                        onClick={() => setActiveTab("reviews")}
                        className="inline-flex items-center transition-opacity duration-200 hover:opacity-80"
                        aria-label="View reviews"
                      >
                        <RatingBadge
                          rating={reviews.averageRating}
                          reviewCount={reviews.totalReviews}
                          size="sm"
                        />
                      </button>
                    ) : null}
                  </div>
                  <span className="mt-1 inline-flex rounded-full border border-primary/35 bg-primary/10 px-3 py-1 text-xs font-semibold capitalize text-primary">
                    {profile.role}
                  </span>
                </div>

                <div className="mt-4">
                  {isEditingBio ? (
                    <div className="space-y-2">
                      <textarea
                        value={bioDraft}
                        onChange={(event) => {
                          setBioDraft(event.target.value.slice(0, 500));
                          setBioSaveError("");
                        }}
                        maxLength={500}
                        rows={4}
                        className="form-input"
                        placeholder="Add a short introduction for your public profile"
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs text-white/45">
                          {bioDraft.length}/500
                        </span>
                        <button
                          type="button"
                          onClick={() => void saveBio()}
                          disabled={isSavingBio}
                          className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
                        >
                          {isSavingBio ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditingBio}
                          className="text-xs font-semibold text-white/60 transition-colors duration-200 hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                      {bioSaveError ? (
                        <p className="text-xs text-red-300" role="alert">
                          {bioSaveError}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex-1 text-sm leading-6 text-white/65">
                        {profile.bio.trim() ||
                          "This user has not added a bio yet."}
                      </p>
                      {isSelf ? (
                        <button
                          type="button"
                          onClick={startEditingBio}
                          aria-label="Edit bio"
                          className="shrink-0 text-xs font-semibold text-primary transition-colors duration-200 hover:text-white"
                        >
                          Edit
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-sm">
                  <DetailRow
                    icon={usersIcon}
                    label="Connections"
                    value={profile.connectionsCount}
                  />
                  {isEngineerProfile ? (
                    <>
                      <DetailRow
                        icon={briefcaseIcon}
                        label="Portfolio items"
                        value={portfolioCount}
                      />
                      <DetailRow
                        icon={certificateIcon}
                        label="Certificates"
                        value={certificateCount}
                      />
                    </>
                  ) : (
                    <>
                      <DetailRow
                        icon={buildingIcon}
                        label="Company"
                        value={profile.companyName || "Not specified"}
                      />
                      <DetailRow
                        icon={checkCircleIcon}
                        label="Completed projects"
                        value={profile.completedProjects}
                      />
                    </>
                  )}
                </div>

                {isSelf && !isEngineerProfile ? (
                  <div className="mt-4 rounded-xl border border-white/10 bg-void/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                        Contact details
                      </h3>
                      {!isEditingClientDetails && ownPhone !== null ? (
                        <button
                          type="button"
                          onClick={startEditingClientDetails}
                          className="text-xs font-semibold text-primary transition-colors duration-200 hover:text-white"
                        >
                          Edit
                        </button>
                      ) : null}
                    </div>
                    {isEditingClientDetails ? (
                      <div className="mt-3 space-y-3">
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-white/60">
                            Phone
                          </label>
                          <input
                            value={phoneDraft}
                            onChange={(event) =>
                              setPhoneDraft(event.target.value)
                            }
                            className="form-input"
                            placeholder="+1 555 000 0000"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-white/60">
                            Company name
                          </label>
                          <input
                            value={companyDraft}
                            onChange={(event) =>
                              setCompanyDraft(event.target.value)
                            }
                            className="form-input"
                            placeholder="Your company"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => void saveClientDetails()}
                            disabled={isSavingClientDetails}
                            className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition-colors duration-200 hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
                          >
                            {isSavingClientDetails ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditingClientDetails}
                            className="text-xs font-semibold text-white/60 transition-colors duration-200 hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                        {clientDetailsError ? (
                          <p className="text-xs text-red-300" role="alert">
                            {clientDetailsError}
                          </p>
                        ) : null}
                      </div>
                    ) : ownPhone === null ? (
                      <p className="mt-2 text-xs text-white/40">
                        Loading contact details...
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-white/70">
                        {ownPhone || "No phone number added"}
                      </p>
                    )}
                  </div>
                ) : null}

                {!isSelf ? (
                  <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
                    <p className="text-xs font-semibold text-white/50">
                      {statusLabel(profile.connectionStatus)}
                    </p>
                    {profile.connectionStatus === "not_connected" ? (
                      <button
                        type="button"
                        onClick={() => void sendRequest()}
                        disabled={isActioning}
                        className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-all duration-200 hover:-translate-y-0.5 hover:bg-glow disabled:cursor-not-allowed disabled:opacity-60"
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
                          className="flex-1 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-all duration-200 hover:-translate-y-0.5 hover:bg-glow disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isActioning ? "Updating..." : "Accept"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void respondRequest("decline")}
                          disabled={isActioning}
                          className="flex-1 rounded-full border border-white/20 px-4 py-2.5 text-sm font-semibold text-white/70 transition-all duration-200 hover:-translate-y-0.5 hover:border-red-300 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isActioning ? "Updating..." : "Decline"}
                        </button>
                      </div>
                    ) : null}

                    {profile.connectionStatus === "pending_sent" ? (
                      <span className="block w-full rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-center text-sm font-semibold text-amber-200">
                        Request sent
                      </span>
                    ) : null}

                    {profile.connectionStatus === "connected" ? (
                      <Link
                        to={`/messages/${profile.userId}`}
                        className="block w-full rounded-full border border-emerald-300/40 bg-emerald-300/10 px-4 py-2.5 text-center text-sm font-semibold text-emerald-200 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-300/20"
                      >
                        Message
                      </Link>
                    ) : null}
                  </div>
                ) : null}

                {avatarError ? (
                  <p className="mt-4 text-xs text-red-300" role="alert">
                    {avatarError}
                  </p>
                ) : null}
                {actionError ? (
                  <p className="mt-4 text-xs text-red-300" role="alert">
                    {actionError}
                  </p>
                ) : null}
              </div>
            </div>
          </aside>

          <div className="min-w-0 flex-1 space-y-4">
            {tabs.length > 1 ? (
              <nav
                className={`flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-surface/60 p-1.5 ${entrance(1).className}`}
                style={entrance(1).style}
                aria-label="Profile sections"
              >
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`whitespace-nowrap rounded-xl border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors duration-200 ${
                      activeTab === tab.key
                        ? "border-primary bg-primary/10 text-white"
                        : "border-transparent text-white/50 hover:text-white"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            ) : null}

            {activeTab === "posts" ? (
              <div
                className={`space-y-4 ${entrance(2).className}`}
                style={entrance(2).style}
              >
                {isSelf && isEngineerProfile ? (
                  <>
                    <div className="w-full rounded-2xl border border-white/10 bg-surface p-4 shadow-[0_14px_36px_rgba(0,0,0,0.2)] transition-all duration-200 hover:border-primary/30">
                      <div className="flex items-center gap-3">
                        <Avatar
                          name={profile.name}
                          photoUrl={profile.profilePhotoUrl}
                          size="sm"
                        />
                        <button
                          type="button"
                          onClick={() => setIsComposerOpen(true)}
                          className="w-full rounded-full border border-white/20 bg-void/40 px-4 py-2.5 text-left text-sm font-semibold text-white/50 transition-colors duration-200 hover:border-primary hover:text-white/70"
                        >
                          What's on your mind, {composerFirstName}?
                        </button>
                      </div>
                    </div>
                    <PostComposerModal
                      isOpen={isComposerOpen}
                      onClose={() => setIsComposerOpen(false)}
                      authorName={profile.name}
                      authorPhotoUrl={profile.profilePhotoUrl}
                      authorRole={profile.role}
                      content={content}
                      onContentChange={(value) => {
                        setContent(value);
                        setComposerError("");
                      }}
                      maxContentLength={MAX_CONTENT_LENGTH}
                      remainingChars={MAX_CONTENT_LENGTH - content.length}
                      showRemainingCount={
                        MAX_CONTENT_LENGTH - content.length <= 100
                      }
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
                  <p className="rounded-2xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">
                    {postsError}
                  </p>
                ) : posts.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-surface p-6 text-sm text-white/55">
                    No posts yet.
                  </p>
                ) : (
                  posts.map((post) => (
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
                      onDeletePost={() => void removePost(post.id)}
                      isDeleting={deleteLoadingId === post.id}
                      onOpenImage={setLightboxImageUrl}
                      formatRelativeTime={formatRelativeTime}
                    />
                  ))
                )}
              </div>
            ) : null}

            {activeTab === "portfolio" && profile.role === "engineer" ? (
              <article
                className={`rounded-2xl border border-white/10 bg-surface p-6 ${entrance(2).className}`}
                style={entrance(2).style}
              >
                <h2 className="font-heading text-2xl font-bold text-white">
                  Portfolio
                </h2>

                {isSelf ? (
                  <>
                    {isLoadingOwnEngineerData && !ownEngineerData ? (
                      <p className="mt-4 text-sm text-white/50">Loading...</p>
                    ) : ownEngineerLoadError && !ownEngineerData ? (
                      <p className="mt-4 text-sm text-red-200">
                        {ownEngineerLoadError}
                      </p>
                    ) : (ownEngineerData?.portfolio.length ?? 0) === 0 ? (
                      <p className="mt-4 text-sm text-white/55">
                        No portfolio items uploaded yet.
                      </p>
                    ) : (
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        {ownEngineerData?.portfolio.map((item) => (
                          <div
                            key={item._id}
                            className="rounded-xl border border-white/10 bg-void/40 p-4"
                          >
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="h-36 w-full rounded-lg object-cover"
                            />
                            <div className="mt-3 flex items-start justify-between gap-2">
                              <h3 className="text-sm font-semibold text-white">
                                {item.title}
                              </h3>
                              <button
                                type="button"
                                disabled={deletingItemId === item._id}
                                onClick={() =>
                                  void deleteOwnItem("portfolio", item._id)
                                }
                                className="shrink-0 text-xs font-semibold text-white/50 transition-colors duration-200 hover:text-red-300"
                              >
                                {deletingItemId === item._id
                                  ? "Removing..."
                                  : "Delete"}
                              </button>
                            </div>
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
                    <form
                      onSubmit={(event) => void uploadPortfolio(event)}
                      className="mt-6 space-y-3 border-t border-white/10 pt-6"
                    >
                      <input
                        value={portfolioTitle}
                        onChange={(event) =>
                          setPortfolioTitle(event.target.value)
                        }
                        placeholder="Project title"
                        className="form-input"
                      />
                      <textarea
                        value={portfolioDescription}
                        onChange={(event) =>
                          setPortfolioDescription(event.target.value)
                        }
                        placeholder="Describe your contribution"
                        rows={3}
                        className="form-input"
                      />
                      <input
                        ref={portfolioFileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="block w-full text-sm text-white/60 file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:font-semibold file:text-white"
                      />
                      <button
                        type="submit"
                        disabled={isUploadingPortfolio}
                        className="rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
                      >
                        {isUploadingPortfolio
                          ? "Uploading..."
                          : "Add Portfolio Item"}
                      </button>
                      {portfolioError ? (
                        <p className="text-sm text-red-300" role="alert">
                          {portfolioError}
                        </p>
                      ) : null}
                    </form>
                  </>
                ) : profile.portfolio.length === 0 ? (
                  <p className="mt-4 text-sm text-white/55">
                    No portfolio items yet.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
            ) : null}

            {activeTab === "certificates" && profile.role === "engineer" ? (
              <article
                className={`rounded-2xl border border-white/10 bg-surface p-6 ${entrance(2).className}`}
                style={entrance(2).style}
              >
                <h2 className="font-heading text-2xl font-bold text-white">
                  Certificates
                </h2>

                {isSelf ? (
                  <>
                    {isLoadingOwnEngineerData && !ownEngineerData ? (
                      <p className="mt-4 text-sm text-white/50">Loading...</p>
                    ) : ownEngineerLoadError && !ownEngineerData ? (
                      <p className="mt-4 text-sm text-red-200">
                        {ownEngineerLoadError}
                      </p>
                    ) : (ownEngineerData?.certificates.length ?? 0) === 0 ? (
                      <p className="mt-4 text-sm text-white/55">
                        No certificates uploaded yet.
                      </p>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {ownEngineerData?.certificates.map((certificate) => (
                          <article
                            key={certificate._id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-void/40 p-4"
                          >
                            <a
                              href={certificate.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm font-semibold text-primary transition-colors duration-200 hover:text-glow"
                            >
                              {certificate.title}
                            </a>
                            <button
                              type="button"
                              disabled={deletingItemId === certificate._id}
                              onClick={() =>
                                void deleteOwnItem(
                                  "certificates",
                                  certificate._id,
                                )
                              }
                              className="shrink-0 text-xs font-semibold text-white/50 transition-colors duration-200 hover:text-red-300"
                            >
                              {deletingItemId === certificate._id
                                ? "Removing..."
                                : "Delete"}
                            </button>
                          </article>
                        ))}
                      </div>
                    )}
                    <form
                      onSubmit={(event) => void uploadCertificate(event)}
                      className="mt-6 space-y-3 border-t border-white/10 pt-6"
                    >
                      <input
                        value={certificateTitle}
                        onChange={(event) =>
                          setCertificateTitle(event.target.value)
                        }
                        placeholder="Certificate title"
                        className="form-input"
                      />
                      <input
                        ref={certificateFileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="block w-full text-sm text-white/60 file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:font-semibold file:text-white"
                      />
                      <button
                        type="submit"
                        disabled={isUploadingCertificate}
                        className="rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
                      >
                        {isUploadingCertificate
                          ? "Uploading..."
                          : "Add Certificate"}
                      </button>
                      {certificateError ? (
                        <p className="text-sm text-red-300" role="alert">
                          {certificateError}
                        </p>
                      ) : null}
                    </form>
                  </>
                ) : profile.certificates.length === 0 ? (
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
            ) : null}

            {activeTab === "reviews" && profile.role === "engineer" ? (
              <article
                id="engineer-reviews"
                className={`rounded-2xl border border-white/10 bg-surface p-6 ${entrance(2).className}`}
                style={entrance(2).style}
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
                  <p className="mt-4 text-sm text-white/50">
                    Loading reviews...
                  </p>
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
                                    setReplyText(
                                      event.target.value.slice(0, 500),
                                    )
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
            ) : null}
          </div>
        </div>
      </div>

      {lightboxImageUrl ? (
        <div className="fixed inset-0 z-90 flex items-center justify-center bg-black/80 p-4">
          <button
            type="button"
            onClick={() => setLightboxImageUrl(null)}
            className="absolute right-5 top-5 rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 transition-colors duration-200 hover:border-primary hover:text-white"
          >
            Close
          </button>
          <img
            src={lightboxImageUrl}
            alt="Expanded post attachment"
            className="max-h-[90vh] w-auto max-w-[95vw] rounded-xl border border-white/10"
          />
        </div>
      ) : null}
    </main>
  );
}

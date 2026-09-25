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
import {
  type ClientPublicProfile,
  hasClientProfileFields,
} from "../components/profile/client/clientProfile";
import { RatingBadge } from "../components/RatingBadge";
import { useAuth } from "../context/AuthContext";
import { Link, useLocation, useParams } from "react-router-dom";
import { MoneyInput } from "../components/dashboard/ui/MoneyInput";
import { formatCurrency } from "../lib/format";
import { moneyValue } from "../lib/money";

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

interface CompletedWorkItem {
  id: string;
  title: string;
  category: string;
  location: string | null;
  completedAt: string;
  contractValue: number | null;
}

interface EngineerEducationItem {
  id: string;
  institution: string | null;
  degree: string | null;
  fieldOfStudy: string | null;
  graduationYear: number | null;
}

interface EngineerExperienceItem {
  id: string;
  title: string | null;
  organization: string | null;
  startYear: number | null;
  endYear: number | null;
  description: string | null;
}

interface OwnEngineerEducationItem {
  _id: string;
  institution: string | null;
  degree: string | null;
  fieldOfStudy: string | null;
  graduationYear: number | null;
}

interface OwnEngineerExperienceItem {
  _id: string;
  title: string | null;
  organization: string | null;
  startYear: number | null;
  endYear: number | null;
  description: string | null;
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
  startingRateMin: number | null;
  startingRateMax: number | null;
  location: string | null;
  education: OwnEngineerEducationItem[];
  experience: OwnEngineerExperienceItem[];
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
  startingRateMin: number | null;
  startingRateMax: number | null;
  location: string | null;
  education: EngineerEducationItem[];
  experience: EngineerExperienceItem[];
  typicalRate: number | null;
  rateMin: number | null;
  rateMax: number | null;
  acceptedBidCount: number;
  derivedLocation: string | null;
  completedLocationProjectCount: number;
  portfolio: EngineerPortfolioItem[];
  certificates: EngineerCertificateItem[];
  completedWork: CompletedWorkItem[];
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

const isCompletedWorkItem = (value: unknown): value is CompletedWorkItem => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    typeof item.category === "string" &&
    (typeof item.location === "string" || item.location === null) &&
    typeof item.completedAt === "string" &&
    (typeof item.contractValue === "number" || item.contractValue === null)
  );
};

const isEngineerEducationItem = (
  value: unknown,
): value is EngineerEducationItem => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    (typeof item.institution === "string" || item.institution === null) &&
    (typeof item.degree === "string" || item.degree === null) &&
    (typeof item.fieldOfStudy === "string" || item.fieldOfStudy === null) &&
    (typeof item.graduationYear === "number" || item.graduationYear === null)
  );
};

const isEngineerExperienceItem = (
  value: unknown,
): value is EngineerExperienceItem => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    (typeof item.title === "string" || item.title === null) &&
    (typeof item.organization === "string" || item.organization === null) &&
    (typeof item.startYear === "number" || item.startYear === null) &&
    (typeof item.endYear === "number" || item.endYear === null) &&
    (typeof item.description === "string" || item.description === null)
  );
};

const isOwnEngineerEducationItem = (
  value: unknown,
): value is OwnEngineerEducationItem => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item._id === "string" &&
    (typeof item.institution === "string" || item.institution === null) &&
    (typeof item.degree === "string" || item.degree === null) &&
    (typeof item.fieldOfStudy === "string" || item.fieldOfStudy === null) &&
    (typeof item.graduationYear === "number" || item.graduationYear === null)
  );
};

const isOwnEngineerExperienceItem = (
  value: unknown,
): value is OwnEngineerExperienceItem => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item._id === "string" &&
    (typeof item.title === "string" || item.title === null) &&
    (typeof item.organization === "string" || item.organization === null) &&
    (typeof item.startYear === "number" || item.startYear === null) &&
    (typeof item.endYear === "number" || item.endYear === null) &&
    (typeof item.description === "string" || item.description === null)
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
    (typeof data.startingRateMin === "number" ||
      data.startingRateMin === null) &&
    (typeof data.startingRateMax === "number" ||
      data.startingRateMax === null) &&
    (typeof data.location === "string" || data.location === null) &&
    Array.isArray(data.education) &&
    data.education.every(isOwnEngineerEducationItem) &&
    Array.isArray(data.experience) &&
    data.experience.every(isOwnEngineerExperienceItem) &&
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
      (typeof profile.startingRateMin === "number" ||
        profile.startingRateMin === null) &&
      (typeof profile.startingRateMax === "number" ||
        profile.startingRateMax === null) &&
      (typeof profile.location === "string" || profile.location === null) &&
      Array.isArray(profile.education) &&
      profile.education.every(isEngineerEducationItem) &&
      Array.isArray(profile.experience) &&
      profile.experience.every(isEngineerExperienceItem) &&
      (typeof profile.typicalRate === "number" ||
        profile.typicalRate === null) &&
      (typeof profile.rateMin === "number" || profile.rateMin === null) &&
      (typeof profile.rateMax === "number" || profile.rateMax === null) &&
      typeof profile.acceptedBidCount === "number" &&
      (typeof profile.derivedLocation === "string" ||
        profile.derivedLocation === null) &&
      typeof profile.completedLocationProjectCount === "number" &&
      Array.isArray(profile.portfolio) &&
      profile.portfolio.every(isEngineerPortfolioItem) &&
      Array.isArray(profile.certificates) &&
      profile.certificates.every(isEngineerCertificateItem) &&
      Array.isArray(profile.completedWork) &&
      profile.completedWork.every(isCompletedWorkItem)
    );
  }

  return hasClientProfileFields(profile);
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
  const location = useLocation();
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

  const [isUploadingAvatar, setIsUploadingAvatar] = useState<boolean>(false);
  const [avatarError, setAvatarError] = useState<string>("");
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [isEditingBio, setIsEditingBio] = useState<boolean>(false);
  const [bioDraft, setBioDraft] = useState<string>("");
  const [isSavingBio, setIsSavingBio] = useState<boolean>(false);
  const [bioSaveError, setBioSaveError] = useState<string>("");

  const [ownEngineerData, setOwnEngineerData] =
    useState<OwnEngineerData | null>(null);

  const certificateFileInputRef = useRef<HTMLInputElement | null>(null);
  const [certificateTitle, setCertificateTitle] = useState<string>("");
  const [isAddingCertificate, setIsAddingCertificate] =
    useState<boolean>(false);
  const [isUploadingCertificate, setIsUploadingCertificate] =
    useState<boolean>(false);
  const [certificateError, setCertificateError] = useState<string>("");

  const portfolioFileInputRef = useRef<HTMLInputElement | null>(null);
  const [portfolioTitle, setPortfolioTitle] = useState<string>("");
  const [portfolioDescription, setPortfolioDescription] = useState<string>("");
  const [isAddingPortfolio, setIsAddingPortfolio] = useState<boolean>(false);
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
  const [activeMenuPostId, setActiveMenuPostId] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  const [isEditingEngineerDetails, setIsEditingEngineerDetails] =
    useState<boolean>(false);
  const [startingRateMinDraft, setStartingRateMinDraft] = useState<string>("");
  const [startingRateMaxDraft, setStartingRateMaxDraft] = useState<string>("");
  const [engineerLocationDraft, setEngineerLocationDraft] =
    useState<string>("");
  const [engineerDetailsError, setEngineerDetailsError] = useState<string>("");
  const [isSavingEngineerDetails, setIsSavingEngineerDetails] =
    useState<boolean>(false);

  const [isAddingEducation, setIsAddingEducation] = useState<boolean>(false);
  const [educationInstitutionDraft, setEducationInstitutionDraft] =
    useState<string>("");
  const [educationDegreeDraft, setEducationDegreeDraft] = useState<string>("");
  const [educationFieldDraft, setEducationFieldDraft] = useState<string>("");
  const [educationYearDraft, setEducationYearDraft] = useState<string>("");
  const [educationError, setEducationError] = useState<string>("");
  const [isSavingEducation, setIsSavingEducation] = useState<boolean>(false);

  const [isAddingExperience, setIsAddingExperience] = useState<boolean>(false);
  const [experienceTitleDraft, setExperienceTitleDraft] = useState<string>("");
  const [experienceOrganizationDraft, setExperienceOrganizationDraft] =
    useState<string>("");
  const [experienceStartYearDraft, setExperienceStartYearDraft] =
    useState<string>("");
  const [experienceEndYearDraft, setExperienceEndYearDraft] =
    useState<string>("");
  const [experienceDescriptionDraft, setExperienceDescriptionDraft] =
    useState<string>("");
  const [experienceError, setExperienceError] = useState<string>("");
  const [isSavingExperience, setIsSavingExperience] = useState<boolean>(false);

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
    setPostsPage(1);
    setPosts([]);
    setPostsTotal(0);
    setPostsError("");
  }, [userId]);

  useEffect(() => {
    if (!profile || profile.role !== "engineer") {
      setIsEditingEngineerDetails(false);
      setStartingRateMinDraft("");
      setStartingRateMaxDraft("");
      setEngineerLocationDraft("");
      return;
    }

    setStartingRateMinDraft(
      typeof profile.startingRateMin === "number"
        ? String(profile.startingRateMin)
        : "",
    );
    setStartingRateMaxDraft(
      typeof profile.startingRateMax === "number"
        ? String(profile.startingRateMax)
        : "",
    );
    setEngineerLocationDraft(profile.location ?? "");
  }, [profile]);

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
          `${API_BASE_URL}/api/users/${profile.userId}/posts?page=${postsPage}&limit=${PROFILE_POSTS_PAGE_LIMIT}`,
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
  }, [currentUser?.id, currentUser?.role, postsPage, profile]);

  useEffect(() => {
    if (
      !profile ||
      profile.role !== "engineer" ||
      currentUser?.role !== "client" ||
      currentUser.id === profile.userId
    ) {
      setInviteProjects([]);
      setInviteError("");
      setInviteSuccess("");
      return;
    }

    const loadInviteProjects = async (): Promise<void> => {
      setIsInviteProjectsLoading(true);
      setInviteError("");
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/bid-invitations/client/engineers/${profile.userId}/projects`,
          { credentials: "include" },
        );
        const body: unknown = await response.json();
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
        setInviteError("Unable to connect to CivilHub. Please try again.");
      } finally {
        setIsInviteProjectsLoading(false);
      }
    };

    void loadInviteProjects();
  }, [currentUser?.id, currentUser?.role, profile, reloadKey]);

  useEffect(() => {
    if (
      !profile ||
      profile.role !== "engineer" ||
      !currentUser ||
      currentUser.id !== profile.userId
    ) {
      setOwnEngineerData(null);
      return;
    }

    const loadOwnEngineerData = async (): Promise<void> => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/engineers/me`, {
          credentials: "include",
        });
        const body: unknown = await response.json();
        if (!response.ok || !isOwnEngineerData(body)) {
          return;
        }
        setOwnEngineerData(body);
      } catch {
        // Owner-specific edits fall back to public-profile state.
      }
    };
    void loadOwnEngineerData();
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

  const sendBidInvitation = async (projectId: string): Promise<void> => {
    if (!profile || profile.role !== "engineer") {
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
          engineerId: profile.userId,
        }),
      });
      const body: unknown = await response.json();

      if (!response.ok) {
        setInviteError(
          getErrorMessageWithFallback(body, "Unable to send invitation."),
        );
        return;
      }

      setInviteSuccess("Invitation sent. Waiting for engineer response.");
      refreshProfile();
    } catch {
      setInviteError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setInviteActionProjectId(null);
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
      const photoUrl = (body as { profilePhotoUrl?: unknown }).profilePhotoUrl;
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

  const toPublicEducation = (
    entries: OwnEngineerEducationItem[],
  ): EngineerEducationItem[] =>
    entries.map((entry) => ({
      id: entry._id,
      institution: entry.institution,
      degree: entry.degree,
      fieldOfStudy: entry.fieldOfStudy,
      graduationYear: entry.graduationYear,
    }));

  const toPublicExperience = (
    entries: OwnEngineerExperienceItem[],
  ): EngineerExperienceItem[] =>
    entries.map((entry) => ({
      id: entry._id,
      title: entry.title,
      organization: entry.organization,
      startYear: entry.startYear,
      endYear: entry.endYear,
      description: entry.description,
    }));

  const updateEngineerProfileDetails = async (payload: {
    startingRateMin?: number | null;
    startingRateMax?: number | null;
    location?: string | null;
    education?: Array<{
      institution?: string;
      degree?: string;
      fieldOfStudy?: string;
      graduationYear?: number | null;
    }>;
    experience?: Array<{
      title?: string;
      organization?: string;
      startYear?: number | null;
      endYear?: number | null;
      description?: string;
    }>;
  }): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/engineers/me`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body: unknown = await response.json();
      if (!response.ok || !isOwnEngineerData(body)) {
        setEngineerDetailsError(
          getErrorMessageWithFallback(body, "Unable to save engineer details."),
        );
        return false;
      }

      setOwnEngineerData(body);
      setProfile((current) => {
        if (!current || current.role !== "engineer") {
          return current;
        }

        return {
          ...current,
          startingRateMin: body.startingRateMin,
          startingRateMax: body.startingRateMax,
          location: body.location,
          education: toPublicEducation(body.education),
          experience: toPublicExperience(body.experience),
        };
      });

      return true;
    } catch {
      setEngineerDetailsError(
        "Unable to connect to CivilHub. Please try again.",
      );
      return false;
    }
  };

  const saveEngineerRateLocation = async (): Promise<void> => {
    if (!profile || profile.role !== "engineer") return;

    setEngineerDetailsError("");
    setIsSavingEngineerDetails(true);
    try {
      const minRate = startingRateMinDraft.trim()
        ? (moneyValue(startingRateMinDraft) ?? Number.NaN)
        : null;
      const maxRate = startingRateMaxDraft.trim()
        ? (moneyValue(startingRateMaxDraft) ?? Number.NaN)
        : null;
      const locationValue = engineerLocationDraft.trim() || null;

      if (minRate !== null && (!Number.isFinite(minRate) || minRate < 0)) {
        setEngineerDetailsError(
          "Starting minimum rate must be a positive number.",
        );
        return;
      }
      if (maxRate !== null && (!Number.isFinite(maxRate) || maxRate < 0)) {
        setEngineerDetailsError(
          "Starting maximum rate must be a positive number.",
        );
        return;
      }
      if (minRate !== null && maxRate !== null && minRate > maxRate) {
        setEngineerDetailsError(
          "Starting minimum rate cannot be greater than starting maximum rate.",
        );
        return;
      }

      const didSave = await updateEngineerProfileDetails({
        startingRateMin: minRate,
        startingRateMax: maxRate,
        location: locationValue,
      });

      if (didSave) {
        setIsEditingEngineerDetails(false);
      }
    } finally {
      setIsSavingEngineerDetails(false);
    }
  };

  const addEducationEntry = async (): Promise<void> => {
    if (!profile || profile.role !== "engineer") return;

    setEducationError("");
    const institution = educationInstitutionDraft.trim();
    const degree = educationDegreeDraft.trim();
    const fieldOfStudy = educationFieldDraft.trim();
    const graduationYearValue = educationYearDraft.trim()
      ? Number.parseInt(educationYearDraft.trim(), 10)
      : null;

    if (
      !institution &&
      !degree &&
      !fieldOfStudy &&
      graduationYearValue === null
    ) {
      setEducationError("Add at least one field before saving education.");
      return;
    }

    if (
      graduationYearValue !== null &&
      (!Number.isInteger(graduationYearValue) ||
        graduationYearValue < 1900 ||
        graduationYearValue > 2100)
    ) {
      setEducationError("Graduation year must be between 1900 and 2100.");
      return;
    }

    setIsSavingEducation(true);
    const didSave = await updateEngineerProfileDetails({
      education: [
        ...profile.education.map((entry) => ({
          institution: entry.institution ?? undefined,
          degree: entry.degree ?? undefined,
          fieldOfStudy: entry.fieldOfStudy ?? undefined,
          graduationYear: entry.graduationYear ?? null,
        })),
        {
          institution: institution || undefined,
          degree: degree || undefined,
          fieldOfStudy: fieldOfStudy || undefined,
          graduationYear: graduationYearValue,
        },
      ],
    });
    setIsSavingEducation(false);

    if (didSave) {
      setIsAddingEducation(false);
      setEducationInstitutionDraft("");
      setEducationDegreeDraft("");
      setEducationFieldDraft("");
      setEducationYearDraft("");
    }
  };

  const removeEducationEntry = async (entryId: string): Promise<void> => {
    if (!profile || profile.role !== "engineer") return;
    setEducationError("");
    setIsSavingEducation(true);
    const didSave = await updateEngineerProfileDetails({
      education: profile.education
        .filter((entry) => entry.id !== entryId)
        .map((entry) => ({
          institution: entry.institution ?? undefined,
          degree: entry.degree ?? undefined,
          fieldOfStudy: entry.fieldOfStudy ?? undefined,
          graduationYear: entry.graduationYear ?? null,
        })),
    });
    setIsSavingEducation(false);
    if (!didSave) {
      setEducationError("Unable to remove education entry.");
    }
  };

  const addExperienceEntry = async (): Promise<void> => {
    if (!profile || profile.role !== "engineer") return;

    setExperienceError("");
    const title = experienceTitleDraft.trim();
    const organization = experienceOrganizationDraft.trim();
    const description = experienceDescriptionDraft.trim();
    const startYear = experienceStartYearDraft.trim()
      ? Number.parseInt(experienceStartYearDraft.trim(), 10)
      : null;
    const endYear = experienceEndYearDraft.trim()
      ? Number.parseInt(experienceEndYearDraft.trim(), 10)
      : null;

    if (
      !title &&
      !organization &&
      !description &&
      startYear === null &&
      endYear === null
    ) {
      setExperienceError("Add at least one field before saving experience.");
      return;
    }

    const isYearValid = (year: number | null): boolean =>
      year === null || (Number.isInteger(year) && year >= 1900 && year <= 2100);

    if (!isYearValid(startYear) || !isYearValid(endYear)) {
      setExperienceError("Years must be between 1900 and 2100.");
      return;
    }

    if (startYear !== null && endYear !== null && endYear < startYear) {
      setExperienceError("End year cannot be earlier than start year.");
      return;
    }

    setIsSavingExperience(true);
    const didSave = await updateEngineerProfileDetails({
      experience: [
        ...profile.experience.map((entry) => ({
          title: entry.title ?? undefined,
          organization: entry.organization ?? undefined,
          startYear: entry.startYear ?? null,
          endYear: entry.endYear ?? null,
          description: entry.description ?? undefined,
        })),
        {
          title: title || undefined,
          organization: organization || undefined,
          startYear,
          endYear,
          description: description || undefined,
        },
      ],
    });
    setIsSavingExperience(false);

    if (didSave) {
      setIsAddingExperience(false);
      setExperienceTitleDraft("");
      setExperienceOrganizationDraft("");
      setExperienceStartYearDraft("");
      setExperienceEndYearDraft("");
      setExperienceDescriptionDraft("");
    }
  };

  const removeExperienceEntry = async (entryId: string): Promise<void> => {
    if (!profile || profile.role !== "engineer") return;
    setExperienceError("");
    setIsSavingExperience(true);
    const didSave = await updateEngineerProfileDetails({
      experience: profile.experience
        .filter((entry) => entry.id !== entryId)
        .map((entry) => ({
          title: entry.title ?? undefined,
          organization: entry.organization ?? undefined,
          startYear: entry.startYear ?? null,
          endYear: entry.endYear ?? null,
          description: entry.description ?? undefined,
        })),
    });
    setIsSavingExperience(false);
    if (!didSave) {
      setExperienceError("Unable to remove experience entry.");
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
        startingRateMin: current?.startingRateMin ?? null,
        startingRateMax: current?.startingRateMax ?? null,
        location: current?.location ?? null,
        education: current?.education ?? [],
        experience: current?.experience ?? [],
        certificates: body.certificates,
        portfolio: current?.portfolio ?? [],
      }));
      setCertificateTitle("");
      setIsAddingCertificate(false);
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
        startingRateMin: current?.startingRateMin ?? null,
        startingRateMax: current?.startingRateMax ?? null,
        location: current?.location ?? null,
        education: current?.education ?? [],
        experience: current?.experience ?? [],
        certificates: current?.certificates ?? [],
        portfolio: body.portfolio,
      }));
      setPortfolioTitle("");
      setPortfolioDescription("");
      setIsAddingPortfolio(false);
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
          startingRateMin: current?.startingRateMin ?? null,
          startingRateMax: current?.startingRateMax ?? null,
          location: current?.location ?? null,
          education: current?.education ?? [],
          experience: current?.experience ?? [],
          certificates: body.certificates,
          portfolio: current?.portfolio ?? [],
        }));
      } else if (kind === "portfolio" && isPortfolioResponse(body)) {
        setOwnEngineerData((current) => ({
          startingRateMin: current?.startingRateMin ?? null,
          startingRateMax: current?.startingRateMax ?? null,
          location: current?.location ?? null,
          education: current?.education ?? [],
          experience: current?.experience ?? [],
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
      setPostsTotal((current) => Math.max(0, current - 1));
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
      </main>
    );
  }

  const isSelf = currentUser?.id === profile.userId;
  const isEngineerProfile = profile.role === "engineer";
  const engineerProfile = profile.role === "engineer" ? profile : null;
  const isClientViewingEngineerProfile =
    currentUser?.role === "client" && isEngineerProfile && !isSelf;
  const composerFirstName = profile.name.trim().split(/\s+/)[0] || profile.name;
  const rawBackState =
    location.state && typeof location.state === "object"
      ? (location.state as ProfileBackState)
      : null;

  const backDestination =
    typeof rawBackState?.backTo === "string" && rawBackState.backTo.length > 0
      ? rawBackState.backTo
      : isSelf && currentUser?.role
        ? `/dashboard/${currentUser.role}/overview`
        : currentUser?.role === "client"
          ? "/dashboard/client/network"
          : currentUser?.role === "engineer"
            ? "/dashboard/engineer/network"
            : "/search/engineers";

  const backLabel =
    typeof rawBackState?.backLabel === "string" &&
    rawBackState.backLabel.length > 0
      ? rawBackState.backLabel
      : isSelf
        ? "Back to Overview"
        : currentUser?.role === "client"
          ? "Back to Engineer Directory"
          : currentUser?.role === "engineer"
            ? "Back to My Network"
            : "Back to Engineer Directory";

  const reviewBreakdown = [5, 4, 3, 2, 1].map((stars) => {
    const count =
      reviews?.reviews.filter((review) => review.rating === stars).length ?? 0;
    const total = reviews?.totalReviews ?? 0;
    const percent = total > 0 ? Math.round((count / total) * 100) : 0;
    return { stars, count, percent };
  });

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

  const hasMorePosts = posts.length < postsTotal;

  const loadMorePosts = (): void => {
    if (isLoadingMorePosts || !hasMorePosts) {
      return;
    }

    setPostsPage((current) => current + 1);
  };

  const hasSelfDeclaredRateOrLocation =
    engineerProfile !== null &&
    (typeof engineerProfile.startingRateMin === "number" ||
      typeof engineerProfile.startingRateMax === "number" ||
      Boolean(engineerProfile.location));
  const hasDerivedRateOrLocation =
    engineerProfile !== null &&
    (typeof engineerProfile.typicalRate === "number" ||
      Boolean(engineerProfile.derivedLocation));

  const hasAboutSection =
    isEngineerProfile && (Boolean(profile.bio.trim()) || isSelf);
  const hasRateLocationSection =
    isEngineerProfile &&
    (hasSelfDeclaredRateOrLocation || hasDerivedRateOrLocation || isSelf);
  const hasExperienceSection =
    isEngineerProfile &&
    ((engineerProfile?.experience.length ?? 0) > 0 || isSelf);
  const hasEducationSection =
    isEngineerProfile &&
    ((engineerProfile?.education.length ?? 0) > 0 || isSelf);

  const renderPostsSection = (showComposer: boolean): ReactElement => (
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
                name={profile.name}
                photoUrl={profile.profilePhotoUrl}
                size="sm"
              />
              <button
                type="button"
                onClick={() => setIsComposerOpen(true)}
                className="w-full rounded-full border border-white/20 bg-void/60 px-4 py-2.5 text-left text-sm font-semibold text-white/50 transition-colors duration-200 hover:border-primary hover:text-white/70"
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
              onDeletePost={() => void removePost(post.id)}
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

  const engineerPortfolioItems: Array<
    OwnEngineerPortfolioItem | EngineerPortfolioItem
  > = engineerProfile
    ? isSelf
      ? (ownEngineerData?.portfolio ?? [])
      : engineerProfile.portfolio
    : [];
  const engineerCertificateItems: Array<
    OwnEngineerCertificate | EngineerCertificateItem
  > = engineerProfile
    ? isSelf
      ? (ownEngineerData?.certificates ?? [])
      : engineerProfile.certificates
    : [];

  return (
    <main className="min-h-screen bg-void px-4 py-12 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <BackButton to={backDestination} label={backLabel} className="mb-5" />

        {profile.role === "client" ? (
          <ClientProfileView
            key={profile.userId}
            profile={profile}
            isSelf={isSelf}
            viewerRole={currentUser?.role ?? null}
            connection={{
              isActioning,
              onConnect: () => void sendRequest(),
              onRespond: (decision) => void respondRequest(decision),
            }}
            actionError={actionError}
            onProfileChange={(update) =>
              setProfile((current) =>
                current?.role === "client" ? update(current) : current,
              )
            }
            onPhotoChanged={refetchUser}
            posts={postsTotal > 0 ? renderPostsSection(false) : null}
          />
        ) : (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <aside className="w-full shrink-0 lg:sticky lg:top-8 lg:w-[30%]">
              <div
                className={`overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-[0_12px_30px_rgba(0,0,0,0.22)] ${entrance(0).className}`}
                style={entrance(0).style}
              >
                <div className="h-16 w-full bg-linear-to-r from-primary/70 via-sky-400/40 to-emerald-300/35" />
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
                            className={`absolute inset-1 flex items-center justify-center rounded-full bg-black/55 text-snow backdrop-blur-sm transition-opacity duration-200 hover:bg-black/70 disabled:cursor-wait ${
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
                      {isEngineerProfile &&
                      reviews &&
                      reviews.totalReviews > 0 ? (
                        <span className="inline-flex items-center">
                          <RatingBadge
                            rating={reviews.averageRating}
                            reviewCount={reviews.totalReviews}
                            size="sm"
                          />
                        </span>
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
                            className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors duration-200 hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
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
                          <p className="text-xs text-rose-300" role="alert">
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
                  </div>

                  {!isSelf ? (
                    isClientViewingEngineerProfile ? (
                      <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                        <Link
                          to={`/messages/${profile.userId}`}
                          className="block w-full rounded-full border border-primary px-4 py-2.5 text-center text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-on-primary"
                        >
                          Message
                        </Link>

                        <div className="rounded-xl border border-white/10 bg-void/40 p-3">
                          <h3 className="text-sm font-semibold text-white">
                            Invite to Bid
                          </h3>

                          {isInviteProjectsLoading ? (
                            <p className="mt-3 text-xs text-white/55">
                              Loading your projects...
                            </p>
                          ) : inviteProjects.length === 0 ? (
                            <div className="mt-3">
                              <p className="text-xs text-white/55">
                                Post a project to invite this engineer.
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

                                    <div className="mt-2">
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
                            className="block w-full rounded-full border border-emerald-300/40 bg-emerald-300/10 px-4 py-2.5 text-center text-sm font-semibold text-emerald-200 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-300/20"
                          >
                            Message
                          </Link>
                        ) : null}
                      </div>
                    )
                  ) : null}

                  {avatarError ? (
                    <p className="mt-4 text-xs text-rose-300" role="alert">
                      {avatarError}
                    </p>
                  ) : null}
                  {actionError ? (
                    <p className="mt-4 text-xs text-rose-300" role="alert">
                      {actionError}
                    </p>
                  ) : null}
                </div>
              </div>
            </aside>

            <div className="min-w-0 flex-1 space-y-4">
              {engineerProfile ? (
                <>
                  {hasAboutSection ? (
                    <article
                      className={`rounded-2xl border border-white/10 bg-surface p-6 ${entrance(1).className}`}
                      style={entrance(1).style}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="font-heading text-2xl font-bold text-white">
                          About
                        </h2>
                        {isSelf && !isEditingBio ? (
                          <button
                            type="button"
                            onClick={startEditingBio}
                            className="text-xs font-semibold text-primary transition-colors hover:text-white"
                          >
                            Edit
                          </button>
                        ) : null}
                      </div>

                      {isEditingBio ? (
                        <div className="mt-4 space-y-2">
                          <textarea
                            value={bioDraft}
                            onChange={(event) => {
                              setBioDraft(event.target.value.slice(0, 500));
                              setBioSaveError("");
                            }}
                            maxLength={500}
                            rows={4}
                            className="form-input"
                            placeholder="Add a short introduction"
                          />
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              onClick={() => void saveBio()}
                              disabled={isSavingBio}
                              className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-60"
                            >
                              {isSavingBio ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditingBio}
                              className="text-xs font-semibold text-white/60 transition-colors hover:text-white"
                            >
                              Cancel
                            </button>
                            <span className="text-xs text-white/45">
                              {bioDraft.length}/500
                            </span>
                          </div>
                          {bioSaveError ? (
                            <p className="text-xs text-rose-300" role="alert">
                              {bioSaveError}
                            </p>
                          ) : null}
                        </div>
                      ) : profile.bio.trim() ? (
                        <p className="mt-4 text-sm leading-6 text-white/70">
                          {profile.bio}
                        </p>
                      ) : isSelf ? (
                        <button
                          type="button"
                          onClick={startEditingBio}
                          className="mt-4 rounded-xl border border-dashed border-white/20 px-4 py-3 text-sm font-semibold text-white/70 transition-colors hover:border-primary hover:text-white"
                        >
                          + Add about
                        </button>
                      ) : null}
                    </article>
                  ) : null}

                  {hasRateLocationSection ? (
                    <article
                      className={`rounded-2xl border border-white/10 bg-surface p-6 ${entrance(2).className}`}
                      style={entrance(2).style}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="font-heading text-2xl font-bold text-white">
                          Rate & Location
                        </h2>
                        {isSelf && !isEditingEngineerDetails ? (
                          <button
                            type="button"
                            onClick={() => setIsEditingEngineerDetails(true)}
                            className="text-xs font-semibold text-primary transition-colors hover:text-white"
                          >
                            Edit
                          </button>
                        ) : null}
                      </div>

                      {isEditingEngineerDetails ? (
                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          <div className="grid content-start gap-1.5">
                            <label htmlFor="starting-rate-min" className="text-xs font-semibold text-white/60">
                              Starting rate from
                            </label>
                            <MoneyInput
                              id="starting-rate-min"
                              value={startingRateMinDraft}
                              onChange={setStartingRateMinDraft}
                            />
                          </div>
                          <div className="grid content-start gap-1.5">
                            <label htmlFor="starting-rate-max" className="text-xs font-semibold text-white/60">
                              Starting rate up to
                            </label>
                            <MoneyInput
                              id="starting-rate-max"
                              value={startingRateMaxDraft}
                              onChange={setStartingRateMaxDraft}
                            />
                          </div>
                          <input
                            aria-label="Your location"
                            value={engineerLocationDraft}
                            onChange={(event) =>
                              setEngineerLocationDraft(event.target.value)
                            }
                            placeholder="Your location"
                            className="form-input"
                          />
                          <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              onClick={() => void saveEngineerRateLocation()}
                              disabled={isSavingEngineerDetails}
                              className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-60"
                            >
                              {isSavingEngineerDetails ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsEditingEngineerDetails(false);
                                setEngineerDetailsError("");
                                setStartingRateMinDraft(
                                  typeof engineerProfile.startingRateMin ===
                                    "number"
                                    ? String(engineerProfile.startingRateMin)
                                    : "",
                                );
                                setStartingRateMaxDraft(
                                  typeof engineerProfile.startingRateMax ===
                                    "number"
                                    ? String(engineerProfile.startingRateMax)
                                    : "",
                                );
                                setEngineerLocationDraft(
                                  engineerProfile.location ?? "",
                                );
                              }}
                              className="text-xs font-semibold text-white/60 transition-colors hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                          {engineerDetailsError ? (
                            <p
                              className="sm:col-span-3 text-xs text-rose-300"
                              role="alert"
                            >
                              {engineerDetailsError}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border border-white/10 bg-void/40 p-4">
                            <dt className="text-xs text-white/50">
                              Starting rate
                            </dt>
                            <dd className="mt-1 text-sm font-semibold text-white">
                              {typeof engineerProfile.startingRateMin ===
                                "number" ||
                              typeof engineerProfile.startingRateMax === "number"
                                ? `${
                                    typeof engineerProfile.startingRateMin ===
                                    "number"
                                      ? formatCurrency(engineerProfile.startingRateMin)
                                      : "-"
                                  } to ${
                                    typeof engineerProfile.startingRateMax ===
                                    "number"
                                      ? formatCurrency(engineerProfile.startingRateMax)
                                      : "-"
                                  }`
                                : isSelf
                                  ? "Not added yet"
                                  : ""}
                            </dd>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-void/40 p-4">
                            <dt className="text-xs text-white/50">
                              Typical rate (accepted bids)
                            </dt>
                            <dd className="mt-1 text-sm font-semibold text-white">
                              {typeof engineerProfile.typicalRate === "number"
                                ? `${formatCurrency(engineerProfile.typicalRate)} (${engineerProfile.acceptedBidCount})`
                                : "No accepted bid history yet"}
                            </dd>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-void/40 p-4">
                            <dt className="text-xs text-white/50">
                              Self-declared location
                            </dt>
                            <dd className="mt-1 text-sm font-semibold text-white">
                              {engineerProfile.location ||
                                (isSelf ? "Not added yet" : "")}
                            </dd>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-void/40 p-4">
                            <dt className="text-xs text-white/50">
                              Derived location (completed work)
                            </dt>
                            <dd className="mt-1 text-sm font-semibold text-white">
                              {engineerProfile.derivedLocation
                                ? `${engineerProfile.derivedLocation} (${engineerProfile.completedLocationProjectCount})`
                                : "No completed-work location history yet"}
                            </dd>
                          </div>
                        </dl>
                      )}

                      {!hasSelfDeclaredRateOrLocation &&
                      !hasDerivedRateOrLocation &&
                      isSelf &&
                      !isEditingEngineerDetails ? (
                        <button
                          type="button"
                          onClick={() => setIsEditingEngineerDetails(true)}
                          className="mt-4 rounded-xl border border-dashed border-white/20 px-4 py-3 text-sm font-semibold text-white/70 transition-colors hover:border-primary hover:text-white"
                        >
                          + Add rate & location
                        </button>
                      ) : null}
                    </article>
                  ) : null}

                  {hasExperienceSection ? (
                    <article className="rounded-2xl border border-white/10 bg-surface p-6">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="font-heading text-2xl font-bold text-white">
                          Experience
                        </h2>
                        {isSelf && !isAddingExperience ? (
                          <button
                            type="button"
                            onClick={() => setIsAddingExperience(true)}
                            className="text-xs font-semibold text-primary transition-colors hover:text-white"
                          >
                            + Add
                          </button>
                        ) : null}
                      </div>

                      {engineerProfile.experience.length === 0 &&
                      isSelf &&
                      !isAddingExperience ? (
                        <button
                          type="button"
                          onClick={() => setIsAddingExperience(true)}
                          className="mt-4 rounded-xl border border-dashed border-white/20 px-4 py-3 text-sm font-semibold text-white/70 transition-colors hover:border-primary hover:text-white"
                        >
                          + Add experience
                        </button>
                      ) : null}

                      {engineerProfile.experience.length > 0 ? (
                        <div className="mt-4 space-y-3">
                          {engineerProfile.experience.map((entry) => (
                            <div
                              key={entry.id}
                              className="rounded-xl border border-white/10 bg-void/40 p-4"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-white">
                                    {entry.title || "Untitled role"}
                                  </p>
                                  <p className="text-xs text-white/60">
                                    {entry.organization || "Organization"}
                                  </p>
                                  <p className="mt-1 text-xs text-white/45">
                                    {entry.startYear ?? "-"} -{" "}
                                    {entry.endYear ?? "Present"}
                                  </p>
                                </div>
                                {isSelf ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void removeExperienceEntry(entry.id)
                                    }
                                    className="text-xs font-semibold text-white/50 transition-colors hover:text-rose-300"
                                  >
                                    Remove
                                  </button>
                                ) : null}
                              </div>
                              {entry.description ? (
                                <p className="mt-3 text-xs leading-5 text-white/65">
                                  {entry.description}
                                </p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {isSelf && isAddingExperience ? (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <input
                            value={experienceTitleDraft}
                            onChange={(event) =>
                              setExperienceTitleDraft(event.target.value)
                            }
                            placeholder="Title"
                            className="form-input"
                          />
                          <input
                            value={experienceOrganizationDraft}
                            onChange={(event) =>
                              setExperienceOrganizationDraft(event.target.value)
                            }
                            placeholder="Organization"
                            className="form-input"
                          />
                          <input
                            value={experienceStartYearDraft}
                            onChange={(event) =>
                              setExperienceStartYearDraft(event.target.value)
                            }
                            type="number"
                            placeholder="Start year"
                            className="form-input"
                          />
                          <input
                            value={experienceEndYearDraft}
                            onChange={(event) =>
                              setExperienceEndYearDraft(event.target.value)
                            }
                            type="number"
                            placeholder="End year (blank for present)"
                            className="form-input"
                          />
                          <textarea
                            value={experienceDescriptionDraft}
                            onChange={(event) =>
                              setExperienceDescriptionDraft(event.target.value)
                            }
                            placeholder="Description"
                            rows={3}
                            className="form-input sm:col-span-2"
                          />
                          <div className="sm:col-span-2 flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => void addExperienceEntry()}
                              disabled={isSavingExperience}
                              className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-60"
                            >
                              {isSavingExperience
                                ? "Saving..."
                                : "Save experience"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsAddingExperience(false);
                                setExperienceError("");
                              }}
                              className="text-xs font-semibold text-white/60 transition-colors hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                          {experienceError ? (
                            <p
                              className="sm:col-span-2 text-xs text-rose-300"
                              role="alert"
                            >
                              {experienceError}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  ) : null}

                  {hasEducationSection ? (
                    <article className="rounded-2xl border border-white/10 bg-surface p-6">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="font-heading text-2xl font-bold text-white">
                          Education
                        </h2>
                        {isSelf && !isAddingEducation ? (
                          <button
                            type="button"
                            onClick={() => setIsAddingEducation(true)}
                            className="text-xs font-semibold text-primary transition-colors hover:text-white"
                          >
                            + Add
                          </button>
                        ) : null}
                      </div>

                      {engineerProfile.education.length === 0 &&
                      isSelf &&
                      !isAddingEducation ? (
                        <button
                          type="button"
                          onClick={() => setIsAddingEducation(true)}
                          className="mt-4 rounded-xl border border-dashed border-white/20 px-4 py-3 text-sm font-semibold text-white/70 transition-colors hover:border-primary hover:text-white"
                        >
                          + Add education
                        </button>
                      ) : null}

                      {engineerProfile.education.length > 0 ? (
                        <div className="mt-4 space-y-3">
                          {engineerProfile.education.map((entry) => (
                            <div
                              key={entry.id}
                              className="rounded-xl border border-white/10 bg-void/40 p-4"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-white">
                                    {entry.institution || "Institution"}
                                  </p>
                                  <p className="text-xs text-white/60">
                                    {entry.degree || "Degree"}
                                    {entry.fieldOfStudy
                                      ? `, ${entry.fieldOfStudy}`
                                      : ""}
                                  </p>
                                  <p className="mt-1 text-xs text-white/45">
                                    {entry.graduationYear ?? "Year not set"}
                                  </p>
                                </div>
                                {isSelf ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void removeEducationEntry(entry.id)
                                    }
                                    className="text-xs font-semibold text-white/50 transition-colors hover:text-rose-300"
                                  >
                                    Remove
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {isSelf && isAddingEducation ? (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <input
                            value={educationInstitutionDraft}
                            onChange={(event) =>
                              setEducationInstitutionDraft(event.target.value)
                            }
                            placeholder="Institution"
                            className="form-input"
                          />
                          <input
                            value={educationDegreeDraft}
                            onChange={(event) =>
                              setEducationDegreeDraft(event.target.value)
                            }
                            placeholder="Degree"
                            className="form-input"
                          />
                          <input
                            value={educationFieldDraft}
                            onChange={(event) =>
                              setEducationFieldDraft(event.target.value)
                            }
                            placeholder="Field of study"
                            className="form-input"
                          />
                          <input
                            value={educationYearDraft}
                            onChange={(event) =>
                              setEducationYearDraft(event.target.value)
                            }
                            type="number"
                            placeholder="Graduation year"
                            className="form-input"
                          />
                          <div className="sm:col-span-2 flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => void addEducationEntry()}
                              disabled={isSavingEducation}
                              className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-60"
                            >
                              {isSavingEducation ? "Saving..." : "Save education"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsAddingEducation(false);
                                setEducationError("");
                              }}
                              className="text-xs font-semibold text-white/60 transition-colors hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                          {educationError ? (
                            <p
                              className="sm:col-span-2 text-xs text-rose-300"
                              role="alert"
                            >
                              {educationError}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  ) : null}

                  {engineerPortfolioItems.length > 0 || isSelf ? (
                    <article className="rounded-2xl border border-white/10 bg-surface p-6">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="font-heading text-2xl font-bold text-white">
                          Portfolio
                        </h2>
                        {isSelf && !isAddingPortfolio ? (
                          <button
                            type="button"
                            onClick={() => setIsAddingPortfolio(true)}
                            className="text-xs font-semibold text-primary transition-colors hover:text-white"
                          >
                            + Add
                          </button>
                        ) : null}
                      </div>

                      {engineerPortfolioItems.length === 0 &&
                      isSelf &&
                      !isAddingPortfolio ? (
                        <button
                          type="button"
                          onClick={() => setIsAddingPortfolio(true)}
                          className="mt-4 rounded-xl border border-dashed border-white/20 px-4 py-3 text-sm font-semibold text-white/70 transition-colors hover:border-primary hover:text-white"
                        >
                          + Add portfolio
                        </button>
                      ) : null}

                      {engineerPortfolioItems.length > 0 ? (
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          {engineerPortfolioItems.map((item, index) => {
                            const key =
                              "_id" in item ? item._id : `${item.title}-${index}`;
                            return (
                              <div
                                key={key}
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
                                  {isSelf && "_id" in item ? (
                                    <button
                                      type="button"
                                      disabled={deletingItemId === item._id}
                                      onClick={() =>
                                        void deleteOwnItem("portfolio", item._id)
                                      }
                                      className="shrink-0 text-xs font-semibold text-white/50 transition-colors hover:text-rose-300"
                                    >
                                      {deletingItemId === item._id
                                        ? "Removing..."
                                        : "Delete"}
                                    </button>
                                  ) : null}
                                </div>
                                <p className="mt-2 text-xs leading-5 text-white/60">
                                  {item.description}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      {isSelf && isAddingPortfolio ? (
                        <form
                          onSubmit={(event) => void uploadPortfolio(event)}
                          className="mt-4 space-y-3 rounded-xl border border-white/10 bg-void/40 p-4"
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
                            className="block w-full text-sm text-white/60 file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:font-semibold file:text-on-primary"
                          />
                          <div className="flex items-center gap-3">
                            <button
                              type="submit"
                              disabled={isUploadingPortfolio}
                              className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-60"
                            >
                              {isUploadingPortfolio
                                ? "Uploading..."
                                : "Save portfolio"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsAddingPortfolio(false)}
                              className="text-xs font-semibold text-white/60 transition-colors hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                          {portfolioError ? (
                            <p className="text-xs text-rose-300" role="alert">
                              {portfolioError}
                            </p>
                          ) : null}
                        </form>
                      ) : null}
                    </article>
                  ) : null}

                  {engineerCertificateItems.length > 0 || isSelf ? (
                    <article className="rounded-2xl border border-white/10 bg-surface p-6">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="font-heading text-2xl font-bold text-white">
                          Certificates
                        </h2>
                        {isSelf && !isAddingCertificate ? (
                          <button
                            type="button"
                            onClick={() => setIsAddingCertificate(true)}
                            className="text-xs font-semibold text-primary transition-colors hover:text-white"
                          >
                            + Add
                          </button>
                        ) : null}
                      </div>

                      {engineerCertificateItems.length === 0 &&
                      isSelf &&
                      !isAddingCertificate ? (
                        <button
                          type="button"
                          onClick={() => setIsAddingCertificate(true)}
                          className="mt-4 rounded-xl border border-dashed border-white/20 px-4 py-3 text-sm font-semibold text-white/70 transition-colors hover:border-primary hover:text-white"
                        >
                          + Add certificate
                        </button>
                      ) : null}

                      {engineerCertificateItems.length > 0 ? (
                        <div className="mt-4 space-y-3">
                          {engineerCertificateItems.map((certificate, index) => {
                            const key =
                              "_id" in certificate
                                ? certificate._id
                                : `${certificate.title}-${index}`;
                            const href =
                              "fileUrl" in certificate
                                ? certificate.fileUrl
                                : null;
                            return (
                              <article
                                key={key}
                                className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-void/40 p-4"
                              >
                                <div>
                                  {href ? (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-sm font-semibold text-primary transition-colors hover:text-glow"
                                    >
                                      {certificate.title}
                                    </a>
                                  ) : (
                                    <p className="text-sm font-semibold text-white">
                                      {certificate.title}
                                    </p>
                                  )}
                                  <p className="mt-1 text-xs text-white/45">
                                    Uploaded {formatDate(certificate.uploadedAt)}
                                  </p>
                                </div>
                                {isSelf && "_id" in certificate ? (
                                  <button
                                    type="button"
                                    disabled={deletingItemId === certificate._id}
                                    onClick={() =>
                                      void deleteOwnItem(
                                        "certificates",
                                        certificate._id,
                                      )
                                    }
                                    className="shrink-0 text-xs font-semibold text-white/50 transition-colors hover:text-rose-300"
                                  >
                                    {deletingItemId === certificate._id
                                      ? "Removing..."
                                      : "Delete"}
                                  </button>
                                ) : null}
                              </article>
                            );
                          })}
                        </div>
                      ) : null}

                      {isSelf && isAddingCertificate ? (
                        <form
                          onSubmit={(event) => void uploadCertificate(event)}
                          className="mt-4 space-y-3 rounded-xl border border-white/10 bg-void/40 p-4"
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
                            className="block w-full text-sm text-white/60 file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:font-semibold file:text-on-primary"
                          />
                          <div className="flex items-center gap-3">
                            <button
                              type="submit"
                              disabled={isUploadingCertificate}
                              className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-60"
                            >
                              {isUploadingCertificate
                                ? "Uploading..."
                                : "Save certificate"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsAddingCertificate(false)}
                              className="text-xs font-semibold text-white/60 transition-colors hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                          {certificateError ? (
                            <p className="text-xs text-rose-300" role="alert">
                              {certificateError}
                            </p>
                          ) : null}
                        </form>
                      ) : null}
                    </article>
                  ) : null}

                  {(reviews?.reviews.length ?? 0) > 0 || isSelf ? (
                    <article
                      id="engineer-reviews"
                      className="rounded-2xl border border-white/10 bg-surface p-6"
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
                        {reviews && reviews.totalReviews > 0 ? (
                          <span className="text-sm font-semibold text-amber-300">
                            {reviews.averageRating.toFixed(1)} ★
                          </span>
                        ) : null}
                      </div>

                      {reviewsError ? (
                        <p className="mt-4 text-sm text-rose-200">
                          {reviewsError}
                        </p>
                      ) : !reviews ? (
                        <p className="mt-4 text-sm text-white/50">
                          Loading reviews...
                        </p>
                      ) : reviews.reviews.length === 0 ? (
                        <p className="mt-4 text-sm text-white/55">
                          No reviews yet.
                        </p>
                      ) : (
                        <div className="mt-5 space-y-4">
                          <div className="rounded-xl border border-white/10 bg-void/40 p-4">
                            <p className="text-xs font-semibold text-white/60">
                              Rating breakdown
                            </p>
                            <div className="mt-3 space-y-2">
                              {reviewBreakdown.map((row) => (
                                <div
                                  key={row.stars}
                                  className="grid grid-cols-[30px_1fr_38px] items-center gap-2"
                                >
                                  <span className="text-xs text-white/65">
                                    {row.stars}★
                                  </span>
                                  <div className="h-2 rounded-full bg-white/10">
                                    <div
                                      className="h-2 rounded-full bg-primary"
                                      style={{ width: `${row.percent}%` }}
                                    />
                                  </div>
                                  <span className="text-right text-xs text-white/60">
                                    {row.count}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

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
                                      Client
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
                                          onClick={() =>
                                            setReplyingReviewId(null)
                                          }
                                          className="rounded-lg px-3 py-2 text-xs font-semibold text-white/60 transition-colors hover:text-white"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void submitReply(review.id)
                                          }
                                          disabled={isSubmittingReply}
                                          className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-50"
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
                                      onClick={() =>
                                        setReplyingReviewId(review.id)
                                      }
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

                  <div
                    className={entrance(3).className}
                    style={entrance(3).style}
                  >
                    {renderPostsSection(
                      isSelf && currentUser?.role === "engineer",
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}
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

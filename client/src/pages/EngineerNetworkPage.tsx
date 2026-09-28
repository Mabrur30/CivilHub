import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
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
import { canTakeProjects } from "../lib/dashboardPaths";
import { isProviderRole } from "../lib/dashboardPaths";
import { ImageLightbox } from "../components/dashboard/ImageLightbox";
import { ConnectionsPanel } from "../components/network/ConnectionsPanel";
import { IncomingRequestsPanel } from "../components/network/IncomingRequestsPanel";
import { SentRequestsPanel } from "../components/network/SentRequestsPanel";
import { SuggestionsPanel } from "../components/network/SuggestionsPanel";
import { type ConnectionUser, type NetworkUser, type PersonResult } from "../components/network/types";



type EngineerSearchResult = PersonResult;

interface SearchEngineersResponse {
  engineers: EngineerSearchResult[];
  page: number;
  limit: number;
  total: number;
}

interface FeedResponse {
  posts: FeedPost[];
  page: number;
  limit: number;
  total: number;
}

interface LikeResponse {
  likedByMe: boolean;
  likeCount: number;
}

interface SelfPublicProfile {
  userId: string;
  name: string;
  role: "client" | "engineer" | "organisation";
  profilePhotoUrl: string | null;
  bio: string;
  rating: number | null;
  reviewCount: number;
  connectionsCount?: number;
}

/** A "People you may know" entry from /api/network/suggestions. */
interface Suggestion {
  userId: string;
  name: string;
  role: "engineer" | "organisation";
  profilePhotoUrl: string | null;
  specialty: string | null;
  location: string | null;
  reason: string;
}

const isSuggestion = (value: unknown): value is Suggestion => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.userId === "string" &&
    typeof item.name === "string" &&
    typeof item.reason === "string" &&
    (typeof item.profilePhotoUrl === "string" || item.profilePhotoUrl === null)
  );
};

// Connections load a page at a time; the total comes from the profile.
const CONNECTIONS_PAGE_SIZE = 30;

interface EngineerOverviewResponse {
  activeProjects: number;
}

interface ClientOverviewResponse {
  activeProjects: number;
}

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const DEFAULT_SEARCH_LIMIT = 20;
const FEED_PAGE_LIMIT = 10;
const MAX_CONTENT_LENGTH = 2000;

const isRole = (value: unknown): value is "client" | "engineer" | "organisation" =>
  value === "client" || value === "engineer" || value === "organisation";

const getErrorMessage = (value: unknown, fallback: string): string => {
  if (typeof value === "object" && value !== null) {
    const body = value as ErrorResponse;
    if (typeof body.message === "string") {
      return body.message;
    }
  }
  return fallback;
};

const isNetworkUser = (value: unknown): value is NetworkUser => {
  if (typeof value !== "object" || value === null) return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user.id === "string" &&
    typeof user.userId === "string" &&
    typeof user.name === "string" &&
    isRole(user.role) &&
    user.status === "pending" &&
    (typeof user.profilePhotoUrl === "string" || user.profilePhotoUrl === null)
  );
};

const isConnectionUser = (value: unknown): value is ConnectionUser => {
  if (typeof value !== "object" || value === null) return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user.userId === "string" &&
    typeof user.name === "string" &&
    isRole(user.role) &&
    (typeof user.profilePhotoUrl === "string" ||
      user.profilePhotoUrl === null) &&
    (typeof user.rating === "number" || user.rating === null) &&
    typeof user.reviewCount === "number"
  );
};

const isEngineerSearchResult = (
  value: unknown,
): value is EngineerSearchResult => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    (typeof item.profilePhotoUrl === "string" ||
      item.profilePhotoUrl === null) &&
    typeof item.bio === "string" &&
    (typeof item.location === "string" || item.location === null)
  );
};

const isSearchEngineersResponse = (
  value: unknown,
): value is SearchEngineersResponse => {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    Array.isArray(body.engineers) &&
    body.engineers.every(isEngineerSearchResult) &&
    typeof body.page === "number" &&
    typeof body.limit === "number" &&
    typeof body.total === "number"
  );
};

const isFeedAuthor = (value: unknown): value is FeedAuthor => {
  if (typeof value !== "object" || value === null) return false;
  const author = value as Record<string, unknown>;
  return (
    typeof author.userId === "string" &&
    typeof author.name === "string" &&
    isRole(author.role) &&
    (typeof author.profilePhotoUrl === "string" ||
      author.profilePhotoUrl === null)
  );
};

const isFeedOriginalPost = (value: unknown): value is FeedOriginalPost => {
  if (typeof value !== "object" || value === null) return false;
  const original = value as Record<string, unknown>;
  return (
    typeof original.id === "string" &&
    typeof original.content === "string" &&
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
    (post.originalPost === null || isFeedOriginalPost(post.originalPost)) &&
    typeof post.createdAt === "string" &&
    typeof post.updatedAt === "string"
  );
};

// One malformed post is dropped (see loadFeed) rather than failing the feed.
const isFeedResponse = (value: unknown): value is FeedResponse => {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    Array.isArray(body.posts) &&
    typeof body.page === "number" &&
    typeof body.limit === "number" &&
    typeof body.total === "number"
  );
};

const isLikeResponse = (value: unknown): value is LikeResponse => {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.likedByMe === "boolean" && typeof body.likeCount === "number"
  );
};

const isSelfPublicProfile = (value: unknown): value is SelfPublicProfile => {
  if (typeof value !== "object" || value === null) return false;
  const profile = value as Record<string, unknown>;
  return (
    typeof profile.userId === "string" &&
    typeof profile.name === "string" &&
    isRole(profile.role) &&
    typeof profile.bio === "string" &&
    (typeof profile.profilePhotoUrl === "string" ||
      profile.profilePhotoUrl === null) &&
    (typeof profile.rating === "number" || profile.rating === null) &&
    typeof profile.reviewCount === "number"
  );
};

const isEngineerOverview = (
  value: unknown,
): value is EngineerOverviewResponse => {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return typeof body.activeProjects === "number";
};

const isClientOverview = (value: unknown): value is ClientOverviewResponse => {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return typeof body.activeProjects === "number";
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

export function EngineerNetworkPage(): ReactElement {
  const { currentUser } = useAuth();

  const incomingRef = useRef<HTMLDivElement | null>(null);
  const previousIncomingCount = useRef<number>(0);

  const [incoming, setIncoming] = useState<NetworkUser[]>([]);
  const [sent, setSent] = useState<NetworkUser[]>([]);
  const [connections, setConnections] = useState<ConnectionUser[]>([]);
  const [networkError, setNetworkError] = useState<string>("");
  const [actionError, setActionError] = useState<string>("");
  const [isNetworkLoading, setIsNetworkLoading] = useState<boolean>(true);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(
    null,
  );

  const [profile, setProfile] = useState<SelfPublicProfile | null>(null);
  const [projectCount, setProjectCount] = useState<number | null>(null);

  const [incomingExpanded, setIncomingExpanded] = useState<boolean>(false);
  const [sentExpanded, setSentExpanded] = useState<boolean>(false);
  const [hasMoreConnections, setHasMoreConnections] = useState<boolean>(false);
  const [isLoadingMoreConnections, setIsLoadingMoreConnections] = useState<boolean>(false);
  // Accepts and removals since the profile's count was loaded.
  const [connectionDelta, setConnectionDelta] = useState<number>(0);
  const [connectionsExpanded, setConnectionsExpanded] =
    useState<boolean>(false);
  const [searchExpanded, setSearchExpanded] = useState<boolean>(false);
  const [pulsePending, setPulsePending] = useState<boolean>(false);

  const [browsePeople, setBrowsePeople] = useState<EngineerSearchResult[]>([]);
  const [isBrowseLoading, setIsBrowseLoading] = useState<boolean>(false);
  const [browseError, setBrowseError] = useState<string>("");

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<EngineerSearchResult[]>(
    [],
  );
  const [isSearchLoading, setIsSearchLoading] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string>("");
  const [searchPage, setSearchPage] = useState<number>(1);
  const [searchLimit, setSearchLimit] = useState<number>(DEFAULT_SEARCH_LIMIT);
  const [searchTotal, setSearchTotal] = useState<number>(0);
  const [activeSearchUserId, setActiveSearchUserId] = useState<string | null>(
    null,
  );
  const [searchActionError, setSearchActionError] = useState<string>("");

  const [posts, setPosts] = useState<FeedPost[]>([]);
  // Where the next "Load more" continues from; null when there's nothing more.
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [isFeedLoading, setIsFeedLoading] = useState<boolean>(true);
  const [isFeedLoadingMore, setIsFeedLoadingMore] = useState<boolean>(false);
  const [feedError, setFeedError] = useState<string>("");

  const [content, setContent] = useState<string>("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string>("");
  const [isPosting, setIsPosting] = useState<boolean>(false);
  const [composerError, setComposerError] = useState<string>("");
  const [isComposerOpen, setIsComposerOpen] = useState<boolean>(false);

  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  const [likeLoadingIds, setLikeLoadingIds] = useState<string[]>([]);
  const [likedPulseId, setLikedPulseId] = useState<string | null>(null);

  const [activeMenuPostId, setActiveMenuPostId] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);

  const isEngineer = isProviderRole(currentUser?.role);

  const hasMoreFeed = feedCursor !== null;
  const remainingChars = MAX_CONTENT_LENGTH - content.length;
  const showRemainingCount = remainingChars <= 100;
  const composerFirstName = (profile?.name ?? currentUser?.name ?? "You")
    .trim()
    .split(/\s+/)[0];

  const searchTotalPages = Math.max(
    1,
    Math.ceil(searchTotal / Math.max(1, searchLimit)),
  );

  const connectableSuggestions = useMemo(() => {
    return browsePeople.filter((person) => {
      if (currentUser?.id === person.id) return false;
      const isConnected = connections.some((item) => item.userId === person.id);
      const isPendingIncoming = incoming.some(
        (item) => item.userId === person.id,
      );
      const isPendingSent = sent.some((item) => item.userId === person.id);
      return !isConnected && !isPendingIncoming && !isPendingSent;
    });
  }, [browsePeople, connections, currentUser?.id, incoming, sent]);

  const feedEmpty = !isFeedLoading && !feedError && posts.length === 0;
  const connectionTotal = Math.max(
    connections.length,
    (profile?.connectionsCount ?? connections.length) + connectionDelta,
  );

  const loadNetwork = async (): Promise<void> => {
    setIsNetworkLoading(true);
    setNetworkError("");
    setActionError("");

    try {
      const [incomingResponse, sentResponse, connectionsResponse] =
        await Promise.all([
          fetch(`${API_BASE_URL}/api/network/incoming`, {
            credentials: "include",
          }),
          fetch(`${API_BASE_URL}/api/network/sent`, { credentials: "include" }),
          fetch(
            `${API_BASE_URL}/api/network/connections?limit=${CONNECTIONS_PAGE_SIZE}&offset=0`,
            { credentials: "include" },
          ),
        ]);

      const [incomingBody, sentBody, connectionsBody]: [
        unknown,
        unknown,
        unknown,
      ] = await Promise.all([
        incomingResponse.json(),
        sentResponse.json(),
        connectionsResponse.json(),
      ]);

      if (
        !incomingResponse.ok ||
        !Array.isArray(incomingBody) ||
        !incomingBody.every(isNetworkUser)
      ) {
        setNetworkError(
          getErrorMessage(incomingBody, "Unable to load incoming requests."),
        );
        return;
      }

      if (
        !sentResponse.ok ||
        !Array.isArray(sentBody) ||
        !sentBody.every(isNetworkUser)
      ) {
        setNetworkError(
          getErrorMessage(sentBody, "Unable to load sent requests."),
        );
        return;
      }

      if (
        !connectionsResponse.ok ||
        !Array.isArray(connectionsBody) ||
        !connectionsBody.every(isConnectionUser)
      ) {
        setNetworkError(
          getErrorMessage(connectionsBody, "Unable to load your connections."),
        );
        return;
      }

      setIncoming(incomingBody);
      setSent(sentBody);
      setConnections(connectionsBody);
      setHasMoreConnections(connectionsBody.length === CONNECTIONS_PAGE_SIZE);
    } catch {
      setNetworkError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsNetworkLoading(false);
    }
  };

  const loadSelfProfile = async (): Promise<void> => {
    if (!currentUser?.id) return;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/users/${currentUser.id}/public-profile`,
        { credentials: "include" },
      );
      const body: unknown = await response.json();
      if (!response.ok || !isSelfPublicProfile(body)) {
        return;
      }

      setProfile(body);
    } catch {
      setProfile(null);
    }
  };

  const loadProjectCount = async (): Promise<void> => {
    if (!currentUser?.role) return;
    if (currentUser.role === "organisation" && !canTakeProjects(currentUser)) {
      return;
    }

    try {
      const endpoint =
        currentUser.role === "client"
          ? `${API_BASE_URL}/api/dashboard/client/overview`
          : `${API_BASE_URL}/api/dashboard/engineer/overview`;

      const response = await fetch(endpoint, { credentials: "include" });
      const body: unknown = await response.json();

      if (currentUser.role !== "client") {
        if (!response.ok || !isEngineerOverview(body)) return;
      } else if (!response.ok || !isClientOverview(body)) {
        return;
      }

      setProjectCount(body.activeProjects);
    } catch {
      setProjectCount(null);
    }
  };

  const loadFeed = async (append: boolean): Promise<void> => {
    if (append) {
      setIsFeedLoadingMore(true);
    } else {
      setIsFeedLoading(true);
    }
    setFeedError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/posts/feed?limit=${FEED_PAGE_LIMIT}${
          append && feedCursor ? `&before=${encodeURIComponent(feedCursor)}` : ""
        }`,
        { credentials: "include" },
      );
      const body: unknown = await response.json();

      if (!response.ok || !isFeedResponse(body)) {
        setFeedError(
          getErrorMessage(body, "Unable to load your feed right now."),
        );
        return;
      }

      const valid = (body.posts as unknown[]).filter(isFeedPost);
      setPosts((current) => {
        if (!append) return valid;
        const seen = new Set(current.map((post) => post.id));
        return [...current, ...valid.filter((post) => !seen.has(post.id))];
      });
      const next = (body as { nextCursor?: unknown }).nextCursor;
      setFeedCursor(typeof next === "string" ? next : null);
    } catch {
      setFeedError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsFeedLoading(false);
      setIsFeedLoadingMore(false);
    }
  };

  const loadBrowsePeople = async (): Promise<void> => {
    setIsBrowseLoading(true);
    setBrowseError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/network/suggestions?limit=12`,
        { credentials: "include" },
      );
      const body: unknown = await response.json();
      if (!response.ok || !Array.isArray(body)) {
        setBrowseError(getErrorMessage(body, "Unable to load suggestions."));
        return;
      }

      // Shown like search results; the line under the name says why.
      setBrowsePeople(
        body.filter(isSuggestion).map((person) => ({
          id: person.userId,
          name: person.name,
          role: person.role,
          profilePhotoUrl: person.profilePhotoUrl,
          // "Also Structural" already names the speciality; don't say it twice.
          bio:
            person.specialty && !person.reason.includes(person.specialty)
              ? `${person.specialty} · ${person.reason}`
              : person.reason,
          location: person.location,
        })),
      );
    } catch {
      setBrowseError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsBrowseLoading(false);
    }
  };

  useEffect(() => {
    const run = async (): Promise<void> => {
      await Promise.all([
        loadNetwork(),
        loadSelfProfile(),
        loadProjectCount(),
        loadFeed(false),
        loadBrowsePeople(),
      ]);
    };

    void run();
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
      setSearchPage(1);
    }, 400);

    return () => {
      window.clearTimeout(handle);
    };
  }, [searchQuery]);

  useEffect(() => {
    // A slower, older search must not overwrite the results of a newer one.
    const controller = new AbortController();
    const runSearch = async (): Promise<void> => {
      if (!searchExpanded || !debouncedQuery) {
        setSearchResults([]);
        setSearchError("");
        setSearchTotal(0);
        setSearchLimit(DEFAULT_SEARCH_LIMIT);
        setIsSearchLoading(false);
        return;
      }

      setIsSearchLoading(true);
      setSearchError("");
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/engineers/search?q=${encodeURIComponent(debouncedQuery)}&page=${searchPage}&limit=${DEFAULT_SEARCH_LIMIT}`,
          { credentials: "include", signal: controller.signal },
        );
        const body: unknown = await response.json();

        if (!response.ok || !isSearchEngineersResponse(body)) {
          setSearchError(getErrorMessage(body, "Unable to search engineers."));
          setSearchResults([]);
          return;
        }

        setSearchResults(body.engineers);
        setSearchPage(body.page);
        setSearchLimit(body.limit);
        setSearchTotal(body.total);
      } catch {
        if (controller.signal.aborted) return;
        setSearchError("Unable to connect to CivilHub. Please try again.");
        setSearchResults([]);
      } finally {
        if (!controller.signal.aborted) setIsSearchLoading(false);
      }
    };

    void runSearch();
    return () => controller.abort();
  }, [debouncedQuery, searchExpanded, searchPage]);

  useEffect(() => {
    if (
      incoming.length > previousIncomingCount.current &&
      previousIncomingCount.current > 0
    ) {
      setPulsePending(true);
      const timer = window.setTimeout(() => setPulsePending(false), 1400);
      return () => window.clearTimeout(timer);
    }

    previousIncomingCount.current = incoming.length;
    return;
  }, [incoming.length]);

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
        setComposerError(getErrorMessage(body, "Unable to publish this post."));
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

      if (!response.ok || !isLikeResponse(body)) {
        throw new Error("failed");
      }

      setPosts((list) =>
        list.map((post) =>
          post.id === postId
            ? { ...post, likedByMe: body.likedByMe, likeCount: body.likeCount }
            : post,
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
        setFeedError(getErrorMessage(body, "Unable to delete this post."));
        return;
      }

      setPosts((current) => current.filter((post) => post.id !== postId));
    } catch {
      setFeedError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setDeleteLoadingId(null);
      setActiveMenuPostId(null);
    }
  };

  const loadMoreConnections = async (): Promise<void> => {
    setIsLoadingMoreConnections(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/network/connections?limit=${CONNECTIONS_PAGE_SIZE}&offset=${connections.length}`,
        { credentials: "include" },
      );
      const body: unknown = await response.json();
      if (!response.ok || !Array.isArray(body) || !body.every(isConnectionUser)) {
        setActionError(getErrorMessage(body, "Unable to load more connections."));
        return;
      }
      setConnections((current) => {
        const seen = new Set(current.map((item) => item.userId));
        return [...current, ...body.filter((item) => !seen.has(item.userId))];
      });
      setHasMoreConnections(body.length === CONNECTIONS_PAGE_SIZE);
    } catch {
      setActionError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsLoadingMoreConnections(false);
    }
  };

  /** Withdraws a sent request or removes a connection, then updates in place. */
  const removeConnection = async (
    connectionId: string,
    kind: "withdraw" | "remove",
    name: string,
  ): Promise<void> => {
    if (kind === "remove" && !window.confirm(`Remove ${name} from your connections?`)) {
      return;
    }
    setActiveConnectionId(connectionId);
    setActionError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/network/${connectionId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        setActionError(
          getErrorMessage(
            body,
            kind === "withdraw" ? "Unable to withdraw this request." : "Unable to remove this connection.",
          ),
        );
        return;
      }
      if (kind === "withdraw") {
        setSent((current) => current.filter((item) => item.id !== connectionId));
      } else {
        setConnections((current) => current.filter((item) => item.connectionId !== connectionId));
        setConnectionDelta((delta) => delta - 1);
      }
    } catch {
      setActionError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setActiveConnectionId(null);
    }
  };

  const respond = async (
    connectionId: string,
    decision: "accept" | "decline",
  ): Promise<void> => {
    setActiveConnectionId(connectionId);
    setActionError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/network/${connectionId}/${decision}`,
        {
          method: "PATCH",
          credentials: "include",
        },
      );
      const body: unknown = await response.json();

      if (!response.ok) {
        setActionError(getErrorMessage(body, "Unable to update this request."));
        return;
      }

      // Update the lists in place so the feed, open comments and scroll stay put.
      const request = incoming.find((item) => item.id === connectionId);
      setIncoming((current) => current.filter((item) => item.id !== connectionId));
      if (decision === "accept" && request) {
        setConnectionDelta((delta) => delta + 1);
        setConnections((current) => [
          {
            userId: request.userId,
            name: request.name,
            role: request.role,
            profilePhotoUrl: request.profilePhotoUrl,
            rating: null,
            reviewCount: 0,
          },
          ...current.filter((item) => item.userId !== request.userId),
        ]);
      }
    } catch {
      setActionError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setActiveConnectionId(null);
    }
  };

  const sendConnectionRequest = async (targetUserId: string): Promise<void> => {
    setActiveSearchUserId(targetUserId);
    setSearchActionError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/network/${targetUserId}/request`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      const body: unknown = await response.json();

      if (!response.ok) {
        setSearchActionError(
          getErrorMessage(body, "Unable to send this connection request."),
        );
        return;
      }

      // Update the lists in place so the feed, open comments and scroll stay put.
      const person = [...searchResults, ...browsePeople].find(
        (item) => item.id === targetUserId,
      );
      const result = body as { id?: unknown; status?: unknown };
      if (person && typeof result.id === "string") {
        const role = person.role ?? "engineer";
        if (result.status === "accepted") {
          // They had already asked us, so connecting accepted their request.
          setIncoming((current) => current.filter((item) => item.userId !== targetUserId));
          setConnectionDelta((delta) => delta + 1);
          setConnections((current) => [
            {
              userId: person.id,
              name: person.name,
              role,
              profilePhotoUrl: person.profilePhotoUrl,
              rating: null,
              reviewCount: 0,
            },
            ...current,
          ]);
        } else {
          setSent((current) => [
            {
              id: result.id as string,
              userId: person.id,
              name: person.name,
              role,
              status: "pending",
              profilePhotoUrl: person.profilePhotoUrl,
            },
            ...current,
          ]);
        }
      }
    } catch {
      setSearchActionError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setActiveSearchUserId(null);
    }
  };

  const jumpToIncoming = (): void => {
    setIncomingExpanded(true);
    incomingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const isPersonConnected = (userId: string): boolean =>
    connections.some((connection) => connection.userId === userId);
  const isPersonPendingIncoming = (userId: string): boolean =>
    incoming.some((request) => request.userId === userId);
  const isPersonPendingSent = (userId: string): boolean =>
    sent.some((request) => request.userId === userId);

  const compactSuggestions = connectableSuggestions.slice(0, 4);
  const expandedPeopleList = debouncedQuery
    ? searchResults
    : connectableSuggestions;

  const selfAuthorMetrics = useMemo(() => {
    if (!currentUser?.id || !isProviderRole(currentUser.role)) {
      return { rating: null as number | null, reviewCount: 0 };
    }

    const authored = posts.find(
      (post) =>
        post.author.userId === currentUser.id &&
        isProviderRole(post.author.role),
    );

    return {
      rating: authored?.author.rating ?? null,
      reviewCount: authored?.author.reviewCount ?? 0,
    };
  }, [currentUser?.id, currentUser?.role, posts]);

  const selfProfileLink = profile?.userId ?? currentUser?.id ?? null;
  const selfRole = profile?.role ?? currentUser?.role;
  const selfRating = profile?.rating ?? selfAuthorMetrics.rating;
  const selfReviewCount = profile?.reviewCount ?? selfAuthorMetrics.reviewCount;

  return (
    <div className="mx-auto w-full max-w-[1240px] space-y-6 pb-6">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_2.2fr_1fr]">
        <aside className="order-1 space-y-4 lg:self-start lg:sticky lg:top-20">
          <section className="overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-sm">
            <div className="h-16 w-full bg-gradient-to-r from-primary/70 via-primary/35 to-primary/10" />
            <div className="p-5 pt-0">
              <div className="-mt-10">
                {selfProfileLink ? (
                  <Link
                    to={`/profile/${selfProfileLink}`}
                    aria-label="Open your public profile"
                  >
                    <Avatar
                      name={profile?.name ?? currentUser?.name ?? "You"}
                      photoUrl={profile?.profilePhotoUrl ?? null}
                      size="lg"
                    />
                  </Link>
                ) : (
                  <Avatar
                    name={profile?.name ?? currentUser?.name ?? "You"}
                    photoUrl={profile?.profilePhotoUrl ?? null}
                    size="lg"
                  />
                )}
              </div>
              <div className="mt-3">
                <div className="flex flex-wrap items-center gap-2">
                  {selfProfileLink ? (
                    <Link
                      to={`/profile/${selfProfileLink}`}
                      className="font-heading text-2xl font-bold text-white transition-colors duration-200 hover:text-primary"
                    >
                      {profile?.name ?? currentUser?.name}
                    </Link>
                  ) : (
                    <h2 className="font-heading text-2xl font-bold text-white">
                      {profile?.name ?? currentUser?.name}
                    </h2>
                  )}
                  {isProviderRole(selfRole) && (
                    <RatingBadge
                      rating={selfRating ?? null}
                      reviewCount={selfReviewCount ?? 0}
                      size="sm"
                    />
                  )}
                </div>
                <span className="mt-1 inline-flex rounded-full border border-primary/35 bg-primary/10 px-3 py-1 text-xs font-semibold capitalize text-primary">
                  {profile?.role ?? currentUser?.role}
                </span>
              </div>
              <p className="mt-3 [display:-webkit-box] overflow-hidden text-sm leading-6 text-white/65 [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                {profile?.bio.trim() ||
                  "Add a short bio in your profile so collaborators know your expertise."}
              </p>
              <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-sm">
                <div className="flex items-center justify-between text-white/65">
                  <span>Connections</span>
                  <span className="font-semibold text-primary">
                    {connectionTotal}
                  </span>
                </div>
                <div className="flex items-center justify-between text-white/65">
                  <span>Active projects</span>
                  <span className="font-semibold text-primary">
                    {projectCount ?? "--"}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-surface p-5 transition-all duration-200 hover:border-primary/30">
            <h3 className="font-heading text-xl font-bold text-white">
              Your Network
            </h3>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-void/40 px-3 py-2">
                <span className="text-white/60">Connections</span>
                <span className="font-semibold text-white">
                  {connectionTotal}
                </span>
              </div>
              <button
                type="button"
                onClick={jumpToIncoming}
                className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-void/40 px-3 py-2 text-left transition-colors duration-200 hover:border-primary"
              >
                <span className="text-white/60">Incoming requests</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    incoming.length > 0
                      ? "bg-primary text-on-primary"
                      : "bg-white/10 text-white/55"
                  } ${pulsePending && incoming.length > 0 ? "animate-pulse" : ""}`}
                >
                  {incoming.length}
                </span>
              </button>
              <Link
                to="/messages"
                className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-void/40 px-3 py-2 text-left transition-colors duration-200 hover:border-primary"
              >
                <span className="text-white/60">Messages</span>
                <span className="font-semibold text-white/75">Open</span>
              </Link>
            </div>
          </section>
        </aside>

        <section className="order-2 w-full space-y-4">
          {isEngineer ? (
            <div className="w-full rounded-2xl border border-white/10 bg-surface p-4 shadow-sm transition-all duration-200 hover:border-primary/30">
              <div className="flex items-center gap-3">
                <Avatar
                  name={profile?.name ?? currentUser?.name ?? "You"}
                  photoUrl={profile?.profilePhotoUrl ?? null}
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
          ) : null}

          <PostComposerModal
            isOpen={isComposerOpen}
            onClose={() => setIsComposerOpen(false)}
            authorName={profile?.name ?? currentUser?.name ?? "You"}
            authorPhotoUrl={profile?.profilePhotoUrl ?? null}
            authorRole={profile?.role ?? currentUser?.role}
            content={content}
            onContentChange={(value) => {
              setContent(value);
              setComposerError("");
            }}
            maxContentLength={MAX_CONTENT_LENGTH}
            remainingChars={remainingChars}
            showRemainingCount={showRemainingCount}
            selectedImagePreview={selectedImagePreview}
            onImageChange={handleImageChange}
            onClearImage={clearImage}
            composerError={composerError}
            isPosting={isPosting}
            onSubmit={(event) => void handleCreatePost(event)}
          />

          {feedError ? (
            <section
              className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-6 text-sm text-rose-200"
              role="alert"
            >
              {feedError}
            </section>
          ) : null}

          {isFeedLoading ? (
            <section className="space-y-4" aria-label="Loading feed">
              {["one", "two", "three"].map((key) => (
                <article
                  key={key}
                  className="animate-pulse rounded-2xl border border-white/10 bg-surface p-5"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-full bg-white/10" />
                    <div className="space-y-2">
                      <div className="h-4 w-36 rounded bg-white/10" />
                      <div className="h-3 w-24 rounded bg-white/10" />
                    </div>
                  </div>
                  <div className="mt-4 h-4 w-5/6 rounded bg-white/10" />
                  <div className="mt-2 h-4 w-3/4 rounded bg-white/10" />
                  <div className="mt-4 h-40 rounded-xl bg-white/10" />
                </article>
              ))}
            </section>
          ) : null}

          {feedEmpty ? (
            <section className="rounded-2xl border border-white/10 bg-surface p-8 text-center">
              <h2 className="font-heading text-2xl font-bold text-white">
                Your feed is quiet for now
              </h2>
              <p className="mt-3 text-sm text-white/60">
                Connect with engineers to see their updates here.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchExpanded(true);
                  incomingRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }}
                className="mt-5 inline-flex rounded-full border border-primary px-5 py-2.5 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary hover:text-on-primary"
              >
                Find people
              </button>
            </section>
          ) : null}

          {!isFeedLoading && posts.length > 0 ? (
            <section className="w-full space-y-4">
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
                  onReposted={(repost) => {
                    if (!isFeedPost(repost)) return;
                    setPosts((current) =>
                      current.some((item) => item.id === repost.id)
                        ? current
                        : [repost, ...current],
                    );
                  }}
                />
              ))}

              {hasMoreFeed ? (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => void loadFeed(true)}
                    disabled={isFeedLoadingMore}
                    className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-white/75 transition-all duration-200 hover:border-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isFeedLoadingMore ? "Loading..." : "Load More"}
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}
        </section>

        <aside className="order-3 space-y-4 lg:self-start lg:sticky lg:top-20">
          <IncomingRequestsPanel
            incoming={incoming}
            isLoading={isNetworkLoading}
            expanded={incomingExpanded}
            onToggleExpanded={() => setIncomingExpanded((open) => !open)}
            activeConnectionId={activeConnectionId}
            onRespond={(connectionId, decision) => void respond(connectionId, decision)}
            sectionRef={incomingRef}
          />

          <SuggestionsPanel
            people={searchExpanded ? expandedPeopleList : compactSuggestions}
            expanded={searchExpanded}
            onToggleExpanded={() => setSearchExpanded((open) => !open)}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            isLoading={isBrowseLoading || isSearchLoading}
            error={browseError || searchError || searchActionError}
            emptyMessage={
              searchExpanded
                ? debouncedQuery && expandedPeopleList.length === 0
                  ? "No results for this search."
                  : null
                : compactSuggestions.length === 0
                  ? "No new suggestions yet."
                  : null
            }
            statusOf={(userId) =>
              currentUser?.id === userId
                ? "self"
                : isPersonConnected(userId)
                  ? "connected"
                  : isPersonPendingIncoming(userId)
                    ? "received"
                    : isPersonPendingSent(userId)
                      ? "sent"
                      : "none"
            }
            activeUserId={activeSearchUserId}
            onConnect={(userId) => void sendConnectionRequest(userId)}
            pager={
              searchExpanded && debouncedQuery && searchTotal > searchLimit
                ? { page: searchPage, totalPages: searchTotalPages, onPageChange: setSearchPage }
                : null
            }
          />

          <SentRequestsPanel
            sent={sent}
            isLoading={isNetworkLoading}
            expanded={sentExpanded}
            onToggleExpanded={() => setSentExpanded((open) => !open)}
            activeConnectionId={activeConnectionId}
            onWithdraw={(connectionId, name) => void removeConnection(connectionId, "withdraw", name)}
          />

          <ConnectionsPanel
            connections={connections}
            isLoading={isNetworkLoading}
            expanded={connectionsExpanded}
            onToggleExpanded={() => setConnectionsExpanded((open) => !open)}
            hasMore={hasMoreConnections}
            isLoadingMore={isLoadingMoreConnections}
            onLoadMore={() => void loadMoreConnections()}
            activeConnectionId={activeConnectionId}
            onRemove={(connectionId, name) => void removeConnection(connectionId, "remove", name)}
          />

          {networkError || actionError ? (
            <p className="text-sm text-rose-300" role="alert">
              {networkError || actionError}
            </p>
          ) : null}
        </aside>
      </div>

      {lightboxImageUrl ? (
        <ImageLightbox
          imageUrl={lightboxImageUrl}
          onClose={() => setLightboxImageUrl(null)}
        />
      ) : null}
    </div>
  );
}

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
import { useAuth } from "../context/AuthContext";

interface NetworkUser {
  id: string;
  userId: string;
  name: string;
  role: "client" | "engineer";
  status: "pending";
  profilePhotoUrl: string | null;
}

interface ConnectionUser {
  userId: string;
  name: string;
  role: "client" | "engineer";
  profilePhotoUrl: string | null;
}

interface EngineerSearchResult {
  id: string;
  name: string;
  profilePhotoUrl: string | null;
  bio: string;
  location: string | null;
}

interface SearchEngineersResponse {
  engineers: EngineerSearchResult[];
  page: number;
  limit: number;
  total: number;
}

interface FeedAuthor {
  userId: string;
  name: string;
  role: "client" | "engineer";
  profilePhotoUrl: string | null;
}

interface FeedOriginalPost {
  id: string;
  content: string;
  author: FeedAuthor;
  createdAt: string;
}

interface FeedPost {
  id: string;
  content: string;
  imageUrl: string | null;
  author: FeedAuthor;
  likeCount: number;
  likedByMe: boolean;
  originalPost: FeedOriginalPost | null;
  createdAt: string;
  updatedAt: string;
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
  role: "client" | "engineer";
  profilePhotoUrl: string | null;
  bio: string;
}

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

const isRole = (value: unknown): value is "client" | "engineer" =>
  value === "client" || value === "engineer";

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
    (typeof user.profilePhotoUrl === "string" || user.profilePhotoUrl === null)
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

const isFeedResponse = (value: unknown): value is FeedResponse => {
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
      profile.profilePhotoUrl === null)
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

export function MyNetworkPage(): ReactElement {
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
  const [reloadKey, setReloadKey] = useState<number>(0);

  const [profile, setProfile] = useState<SelfPublicProfile | null>(null);
  const [projectCount, setProjectCount] = useState<number | null>(null);

  const [incomingExpanded, setIncomingExpanded] = useState<boolean>(false);
  const [sentExpanded, setSentExpanded] = useState<boolean>(false);
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
  const [feedPage, setFeedPage] = useState<number>(1);
  const [feedTotal, setFeedTotal] = useState<number>(0);
  const [isFeedLoading, setIsFeedLoading] = useState<boolean>(true);
  const [isFeedLoadingMore, setIsFeedLoadingMore] = useState<boolean>(false);
  const [feedError, setFeedError] = useState<string>("");

  const [content, setContent] = useState<string>("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string>("");
  const [isPosting, setIsPosting] = useState<boolean>(false);
  const [composerError, setComposerError] = useState<string>("");
  const [isComposerExpanded, setIsComposerExpanded] = useState<boolean>(false);

  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  const [likeLoadingIds, setLikeLoadingIds] = useState<string[]>([]);
  const [likedPulseId, setLikedPulseId] = useState<string | null>(null);

  const [activeMenuPostId, setActiveMenuPostId] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);

  const isEngineer = currentUser?.role === "engineer";

  const hasMoreFeed = posts.length < feedTotal;
  const remainingChars = MAX_CONTENT_LENGTH - content.length;
  const showRemainingCount = remainingChars <= 100;

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

  const feedEmpty = !isFeedLoading && posts.length === 0;

  const refreshAll = (): void => {
    setReloadKey((key) => key + 1);
  };

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
          fetch(`${API_BASE_URL}/api/network/connections`, {
            credentials: "include",
          }),
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

    try {
      const endpoint =
        currentUser.role === "engineer"
          ? `${API_BASE_URL}/api/dashboard/engineer/overview`
          : `${API_BASE_URL}/api/dashboard/client/overview`;

      const response = await fetch(endpoint, { credentials: "include" });
      const body: unknown = await response.json();

      if (currentUser.role === "engineer") {
        if (!response.ok || !isEngineerOverview(body)) return;
      } else if (!response.ok || !isClientOverview(body)) {
        return;
      }

      setProjectCount(body.activeProjects);
    } catch {
      setProjectCount(null);
    }
  };

  const loadFeed = async (
    targetPage: number,
    append: boolean,
  ): Promise<void> => {
    if (append) {
      setIsFeedLoadingMore(true);
    } else {
      setIsFeedLoading(true);
    }
    setFeedError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/posts/feed?page=${targetPage}&limit=${FEED_PAGE_LIMIT}`,
        { credentials: "include" },
      );
      const body: unknown = await response.json();

      if (!response.ok || !isFeedResponse(body)) {
        setFeedError(
          getErrorMessage(body, "Unable to load your feed right now."),
        );
        return;
      }

      setPosts((current) =>
        append ? [...current, ...body.posts] : body.posts,
      );
      setFeedPage(body.page);
      setFeedTotal(body.total);
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
        `${API_BASE_URL}/api/engineers/search?page=1&limit=12`,
        { credentials: "include" },
      );
      const body: unknown = await response.json();
      if (!response.ok || !isSearchEngineersResponse(body)) {
        setBrowseError(getErrorMessage(body, "Unable to load suggestions."));
        return;
      }

      setBrowsePeople(body.engineers);
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
        loadFeed(1, false),
        loadBrowsePeople(),
      ]);
    };

    void run();
  }, [reloadKey, currentUser?.id, currentUser?.role]);

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
          { credentials: "include" },
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
        setSearchError("Unable to connect to CivilHub. Please try again.");
        setSearchResults([]);
      } finally {
        setIsSearchLoading(false);
      }
    };

    void runSearch();
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
      setFeedTotal((current) => current + 1);
      setContent("");
      clearImage();
      setIsComposerExpanded(false);
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
      setFeedTotal((current) => Math.max(0, current - 1));
    } catch {
      setFeedError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setDeleteLoadingId(null);
      setActiveMenuPostId(null);
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

      refreshAll();
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

      refreshAll();
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

  return (
    <div className="mx-auto w-full max-w-[1240px] space-y-6 pb-6">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_2.2fr_1fr]">
        <aside className="order-1 space-y-4 lg:self-start lg:sticky lg:top-20">
          <section className="overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-[0_12px_30px_rgba(0,0,0,0.22)]">
            <div className="h-16 w-full bg-gradient-to-r from-primary/70 via-sky-400/40 to-emerald-300/35" />
            <div className="p-5 pt-0">
              <div className="-mt-10">
                <Avatar
                  name={profile?.name ?? currentUser?.name ?? "You"}
                  photoUrl={profile?.profilePhotoUrl ?? null}
                  size="lg"
                />
              </div>
              <div className="mt-3">
                <h2 className="font-heading text-2xl font-bold text-white">
                  {profile?.name ?? currentUser?.name}
                </h2>
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
                    {connections.length}
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
                  {connections.length}
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
                      ? "bg-primary text-white"
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
            <form
              onSubmit={(event) => void handleCreatePost(event)}
              className="w-full rounded-2xl border border-white/10 bg-surface p-5 shadow-[0_14px_36px_rgba(0,0,0,0.2)] transition-all duration-200 hover:border-primary/30 sm:p-6"
            >
              <div className="flex items-center gap-3">
                <Avatar
                  name={profile?.name ?? currentUser?.name ?? "You"}
                  photoUrl={profile?.profilePhotoUrl ?? null}
                  size="sm"
                />
                <button
                  type="button"
                  onClick={() => setIsComposerExpanded(true)}
                  className="w-full rounded-full border border-white/20 bg-void/40 px-4 py-2.5 text-left text-sm font-semibold text-white/70 transition-colors duration-200 hover:border-primary hover:text-white"
                >
                  Start a post
                </button>
              </div>

              {isComposerExpanded ? (
                <div className="mt-4 space-y-4">
                  <textarea
                    value={content}
                    maxLength={MAX_CONTENT_LENGTH}
                    onChange={(event) => {
                      setContent(event.target.value);
                      setComposerError("");
                    }}
                    placeholder="Share an update, a completed project, or industry insight..."
                    rows={4}
                    className="form-input min-h-[120px] resize-y"
                  />
                </div>
              ) : null}

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-4 text-xs font-semibold text-white/70 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:text-sm">
                <button
                  type="button"
                  onClick={() => setIsComposerExpanded(true)}
                  className="rounded-full border border-white/20 bg-white/5 px-3 py-2 text-left transition-colors duration-200 hover:border-primary hover:text-white"
                >
                  Video
                </button>
                <label className="cursor-pointer rounded-full border border-white/20 bg-white/5 px-3 py-2 text-left transition-colors duration-200 hover:border-primary hover:text-white">
                  Photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageChange}
                    className="sr-only"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setIsComposerExpanded(true)}
                  className="rounded-full border border-white/20 bg-white/5 px-3 py-2 text-left transition-colors duration-200 hover:border-primary hover:text-white"
                >
                  Write article
                </button>
              </div>

              {isComposerExpanded ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {showRemainingCount ? (
                      <span className="text-xs font-semibold text-white/55">
                        {remainingChars} characters left
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsComposerExpanded(false)}
                      className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 transition-colors duration-200 hover:border-primary hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isPosting || !content.trim()}
                      className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-all duration-200 hover:-translate-y-0.5 hover:bg-glow disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPosting ? "Posting..." : "Post"}
                    </button>
                  </div>
                </div>
              ) : null}

              {selectedImagePreview ? (
                <div className="relative mt-4 w-fit overflow-hidden rounded-xl border border-white/10">
                  <img
                    src={selectedImagePreview}
                    alt="Selected preview"
                    className="h-28 w-40 object-cover"
                  />
                  <button
                    type="button"
                    onClick={clearImage}
                    className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs font-semibold text-white transition-colors duration-200 hover:bg-primary"
                  >
                    X
                  </button>
                </div>
              ) : null}

              {composerError ? (
                <p className="mt-3 text-sm text-red-300" role="alert">
                  {composerError}
                </p>
              ) : null}
            </form>
          ) : null}

          {feedError ? (
            <section
              className="rounded-2xl border border-red-400/20 bg-red-400/5 p-6 text-sm text-red-200"
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
                className="mt-5 inline-flex rounded-full border border-primary px-5 py-2.5 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary hover:text-white"
              >
                Find people
              </button>
            </section>
          ) : null}

          {!isFeedLoading && posts.length > 0 ? (
            <section className="w-full space-y-4">
              {posts.map((post) => {
                const isLikeLoading = likeLoadingIds.includes(post.id);
                const isLiked = post.likedByMe;
                const isPulsing = likedPulseId === post.id;
                const isOwner = currentUser?.id === post.author.userId;

                return (
                  <article
                    key={post.id}
                    className="w-full rounded-2xl border border-white/10 bg-surface p-5 shadow-[0_14px_38px_rgba(0,0,0,0.24)] transition-all duration-200 hover:border-primary/25 sm:p-6"
                  >
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
                            onClick={() =>
                              setActiveMenuPostId((current) =>
                                current === post.id ? null : post.id,
                              )
                            }
                            className="rounded-full border border-white/15 px-2.5 py-1 text-sm text-white/65 transition-all duration-200 hover:border-primary hover:text-white"
                          >
                            ...
                          </button>
                          {activeMenuPostId === post.id ? (
                            <button
                              type="button"
                              onClick={() => void removePost(post.id)}
                              disabled={deleteLoadingId === post.id}
                              className="absolute right-0 top-10 whitespace-nowrap rounded-lg border border-red-400/30 bg-void px-3 py-2 text-xs font-semibold text-red-200 transition-colors duration-200 hover:bg-red-400/10 disabled:opacity-60"
                            >
                              {deleteLoadingId === post.id
                                ? "Deleting..."
                                : "Delete post"}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <p className="mt-4 whitespace-pre-line text-sm leading-7 text-white/80">
                      {post.content}
                    </p>

                    {post.originalPost ? (
                      <div className="mt-4 rounded-xl border border-white/10 bg-void/40 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
                          Repost context
                        </p>
                        <p className="mt-2 text-xs text-white/60">
                          {post.originalPost.author.name} •{" "}
                          {formatRelativeTime(post.originalPost.createdAt)}
                        </p>
                        <p className="mt-2 text-sm text-white/70">
                          {post.originalPost.content}
                        </p>
                      </div>
                    ) : null}

                    {post.imageUrl ? (
                      <button
                        type="button"
                        onClick={() => setLightboxImageUrl(post.imageUrl)}
                        className="mt-4 block overflow-hidden rounded-xl border border-white/10 transition-transform duration-200 hover:scale-[1.01]"
                      >
                        <img
                          src={post.imageUrl}
                          alt="Post attachment"
                          className="max-h-[420px] w-full object-cover"
                        />
                      </button>
                    ) : null}

                    <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-4">
                      <button
                        type="button"
                        onClick={() => void toggleLike(post.id)}
                        disabled={isLikeLoading}
                        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-all duration-200 ${
                          isLiked
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-white/15 text-white/65 hover:border-primary hover:text-white"
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
                        <span>{post.likeCount}</span>
                      </button>
                    </div>
                  </article>
                );
              })}

              {hasMoreFeed ? (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => void loadFeed(feedPage + 1, true)}
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
          <section
            ref={incomingRef}
            className="rounded-2xl border border-white/10 bg-surface p-5 transition-all duration-200 hover:border-primary/25"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-xl font-bold text-white">
                Incoming Requests
              </h3>
              {incoming.length > 3 ? (
                <button
                  type="button"
                  onClick={() => setIncomingExpanded((open) => !open)}
                  className="text-xs font-semibold text-primary transition-colors duration-200 hover:text-glow"
                >
                  {incomingExpanded ? "Show less" : "View all"}
                </button>
              ) : null}
            </div>

            {incoming.length === 0 ? (
              <p className="mt-3 text-sm text-white/50">
                No incoming requests.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {(incomingExpanded ? incoming : incoming.slice(0, 3)).map(
                  (request) => {
                    const isActing = activeConnectionId === request.id;
                    return (
                      <article
                        key={request.id}
                        className="rounded-xl border border-white/10 bg-void/45 p-3"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar
                            name={request.name}
                            photoUrl={request.profilePhotoUrl}
                            size="sm"
                          />
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {request.name}
                            </p>
                            <p className="text-[11px] capitalize text-white/45">
                              {request.role}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void respond(request.id, "accept")}
                            disabled={isActing}
                            className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-200 hover:bg-glow disabled:opacity-60"
                          >
                            {isActing ? "..." : "Accept"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void respond(request.id, "decline")}
                            disabled={isActing}
                            className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors duration-200 hover:border-red-300 hover:text-red-200 disabled:opacity-60"
                          >
                            Decline
                          </button>
                          <Link
                            to={`/profile/${request.userId}`}
                            className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors duration-200 hover:border-primary hover:text-white"
                          >
                            View
                          </Link>
                        </div>
                      </article>
                    );
                  },
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-surface p-5 transition-all duration-200 hover:border-primary/25">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-xl font-bold text-white">
                People You May Know
              </h3>
              <button
                type="button"
                onClick={() => setSearchExpanded((open) => !open)}
                className="text-xs font-semibold text-primary transition-colors duration-200 hover:text-glow"
              >
                {searchExpanded ? "Collapse" : "See more"}
              </button>
            </div>

            {searchExpanded ? (
              <div className="mt-3 space-y-3">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setSearchQuery(event.target.value)
                  }
                  placeholder="Search by name or bio"
                  className="form-input"
                />
              </div>
            ) : null}

            {isBrowseLoading || isSearchLoading ? (
              <p className="mt-3 text-sm text-white/50">
                Loading suggestions...
              </p>
            ) : null}

            {browseError || searchError || searchActionError ? (
              <p className="mt-3 text-sm text-red-300" role="alert">
                {browseError || searchError || searchActionError}
              </p>
            ) : null}

            {!isBrowseLoading && !isSearchLoading ? (
              <div
                className={`mt-4 space-y-3 overflow-hidden transition-all duration-200 ${
                  searchExpanded ? "max-h-[860px]" : "max-h-[420px]"
                }`}
              >
                {(searchExpanded ? expandedPeopleList : compactSuggestions).map(
                  (person) => {
                    const isSelf = currentUser?.id === person.id;
                    const isConnected = isPersonConnected(person.id);
                    const pendingIncoming = isPersonPendingIncoming(person.id);
                    const pendingSent = isPersonPendingSent(person.id);

                    return (
                      <article
                        key={person.id}
                        className="rounded-xl border border-white/10 bg-void/45 p-3"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar
                            name={person.name}
                            photoUrl={person.profilePhotoUrl}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-white">
                              {person.name}
                            </p>
                            <p className="truncate text-[11px] text-white/50">
                              {person.bio || "No bio provided"}
                            </p>
                          </div>
                          <Link
                            to={`/profile/${person.id}`}
                            className="text-[11px] font-semibold text-primary transition-colors duration-200 hover:text-glow"
                          >
                            View
                          </Link>
                        </div>
                        <div className="mt-3">
                          {isConnected ? (
                            <span className="rounded-full border border-emerald-300/40 bg-emerald-300/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
                              Connected
                            </span>
                          ) : isSelf ? (
                            <span className="rounded-full border border-white/20 px-2.5 py-1 text-[11px] font-semibold text-white/60">
                              You
                            </span>
                          ) : pendingIncoming ? (
                            <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
                              Request received
                            </span>
                          ) : pendingSent ? (
                            <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
                              Request sent
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                void sendConnectionRequest(person.id)
                              }
                              disabled={activeSearchUserId === person.id}
                              className="rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-white transition-colors duration-200 hover:bg-glow disabled:opacity-60"
                            >
                              {activeSearchUserId === person.id
                                ? "Sending..."
                                : "Connect"}
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  },
                )}

                {searchExpanded &&
                debouncedQuery &&
                searchTotal > searchLimit ? (
                  <div className="flex items-center justify-between rounded-xl border border-white/10 bg-void/45 p-3 text-xs text-white/65">
                    <span>
                      Page {searchPage} of {searchTotalPages}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSearchPage((p) => Math.max(1, p - 1))}
                        disabled={searchPage <= 1}
                        className="rounded-full border border-white/20 px-3 py-1 transition-colors duration-200 hover:border-primary disabled:opacity-50"
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSearchPage((p) =>
                            Math.min(searchTotalPages, p + 1),
                          )
                        }
                        disabled={searchPage >= searchTotalPages}
                        className="rounded-full border border-white/20 px-3 py-1 transition-colors duration-200 hover:border-primary disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                ) : null}

                {!searchExpanded && compactSuggestions.length === 0 ? (
                  <p className="text-sm text-white/50">
                    No new suggestions yet.
                  </p>
                ) : null}

                {searchExpanded &&
                debouncedQuery &&
                expandedPeopleList.length === 0 ? (
                  <p className="text-sm text-white/50">
                    No results for this search.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-white/10 bg-surface p-5 transition-all duration-200 hover:border-primary/25">
            <button
              type="button"
              onClick={() => setSentExpanded((open) => !open)}
              className="flex w-full items-center justify-between"
            >
              <h3 className="font-heading text-xl font-bold text-white">
                Sent Requests
              </h3>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/70">
                {sent.length}
              </span>
            </button>

            <div
              className={`overflow-hidden transition-all duration-200 ${
                sentExpanded ? "mt-4 max-h-[320px]" : "max-h-0"
              }`}
            >
              {sent.length === 0 ? (
                <p className="text-sm text-white/50">
                  No pending sent requests.
                </p>
              ) : (
                <div className="space-y-3">
                  {sent.map((request) => (
                    <article
                      key={request.id}
                      className="rounded-xl border border-white/10 bg-void/45 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Avatar
                            name={request.name}
                            photoUrl={request.profilePhotoUrl}
                            size="sm"
                          />
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {request.name}
                            </p>
                            <p className="text-[11px] capitalize text-white/45">
                              {request.role}
                            </p>
                          </div>
                        </div>
                        <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                          Pending
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-surface p-5 transition-all duration-200 hover:border-primary/25">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-xl font-bold text-white">
                Your Connections
              </h3>
              {connections.length > 4 ? (
                <button
                  type="button"
                  onClick={() => setConnectionsExpanded((open) => !open)}
                  className="text-xs font-semibold text-primary transition-colors duration-200 hover:text-glow"
                >
                  {connectionsExpanded ? "Show less" : "View all"}
                </button>
              ) : null}
            </div>

            {isNetworkLoading ? (
              <p className="mt-3 text-sm text-white/50">
                Loading connections...
              </p>
            ) : connections.length === 0 ? (
              <p className="mt-3 text-sm text-white/50">
                No accepted connections yet.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {(connectionsExpanded
                  ? connections
                  : connections.slice(0, 4)
                ).map((connection) => (
                  <article
                    key={connection.userId}
                    className="rounded-xl border border-white/10 bg-void/45 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Avatar
                          name={connection.name}
                          photoUrl={connection.profilePhotoUrl}
                          size="sm"
                        />
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {connection.name}
                          </p>
                          <p className="text-[11px] capitalize text-white/45">
                            {connection.role}
                          </p>
                        </div>
                      </div>
                      <Link
                        to={`/messages/${connection.userId}`}
                        className="rounded-full border border-emerald-300/40 bg-emerald-300/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 transition-colors duration-200 hover:bg-emerald-300/20"
                        aria-label={`Message ${connection.name}`}
                      >
                        Message
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {networkError || actionError ? (
            <p className="text-sm text-red-300" role="alert">
              {networkError || actionError}
            </p>
          ) : null}
        </aside>
      </div>

      {lightboxImageUrl ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4">
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
    </div>
  );
}

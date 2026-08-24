import { type ReactElement, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

interface ConversationParticipant {
  userId: string;
  name: string;
  role: "client" | "engineer";
  profilePhotoUrl: string | null;
}

interface ConversationPreviewMessage {
  id: string;
  content: string;
  createdAt: string;
  senderId: string;
}

interface ConversationSummary {
  id: string;
  otherParticipant: ConversationParticipant;
  lastMessage: ConversationPreviewMessage | null;
  unreadCount: number;
  updatedAt: string;
}

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const isParticipant = (value: unknown): value is ConversationParticipant => {
  if (typeof value !== "object" || value === null) return false;
  const participant = value as Record<string, unknown>;
  return (
    typeof participant.userId === "string" &&
    typeof participant.name === "string" &&
    (participant.role === "client" || participant.role === "engineer") &&
    (typeof participant.profilePhotoUrl === "string" ||
      participant.profilePhotoUrl === null)
  );
};

const isPreviewMessage = (
  value: unknown,
): value is ConversationPreviewMessage => {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message.id === "string" &&
    typeof message.content === "string" &&
    typeof message.createdAt === "string" &&
    typeof message.senderId === "string"
  );
};

const isConversationSummary = (
  value: unknown,
): value is ConversationSummary => {
  if (typeof value !== "object" || value === null) return false;
  const conversation = value as Record<string, unknown>;
  return (
    typeof conversation.id === "string" &&
    isParticipant(conversation.otherParticipant) &&
    (conversation.lastMessage === null ||
      isPreviewMessage(conversation.lastMessage)) &&
    typeof conversation.unreadCount === "number" &&
    typeof conversation.updatedAt === "string"
  );
};

const getErrorMessage = (value: unknown): string => {
  if (typeof value === "object" && value !== null) {
    const body = value as ErrorResponse;
    if (typeof body.message === "string") return body.message;
  }
  return "Unable to load conversations.";
};

const formatRelativeTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (60 * 1000));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
};

const truncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
};

export function ConversationListPage(): ReactElement {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const loadConversations = async (): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/conversations`, {
        credentials: "include",
      });
      const body: unknown = await response.json();

      if (
        !response.ok ||
        !Array.isArray(body) ||
        !body.every(isConversationSummary)
      ) {
        setError(getErrorMessage(body));
        return;
      }

      setError("");
      setConversations(body);
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    void loadConversations();

    const intervalId = window.setInterval(() => {
      void loadConversations();
    }, 8000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const sortedConversations = useMemo(
    () =>
      [...conversations].sort((first, second) => {
        const firstTime = new Date(
          first.lastMessage?.createdAt ?? first.updatedAt,
        ).getTime();
        const secondTime = new Date(
          second.lastMessage?.createdAt ?? second.updatedAt,
        ).getTime();
        return secondTime - firstTime;
      }),
    [conversations],
  );

  return (
    <main className="min-h-screen bg-void px-4 py-12 text-white sm:px-6 lg:px-8">
      <section className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
              Messaging
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-white sm:text-4xl">
              Conversations
            </h1>
          </div>
          <button
            type="button"
            onClick={() => void loadConversations()}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 hover:border-primary hover:text-white"
          >
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="mt-6 space-y-3" aria-label="Loading conversations">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`skeleton-${index}`}
                className="animate-pulse rounded-xl border border-white/10 bg-void/40 p-4"
              >
                <div className="h-4 w-1/3 rounded bg-white/10" />
                <div className="mt-3 h-3 w-2/3 rounded bg-white/10" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div
            className="mt-6 rounded-xl border border-red-400/25 bg-red-400/10 p-4"
            role="alert"
          >
            <p className="text-sm text-red-200">{error}</p>
          </div>
        ) : sortedConversations.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-white/15 bg-void/40 p-8 text-center">
            <h2 className="font-heading text-2xl font-bold text-white">
              No conversations yet
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-white/60">
              Connect with professionals in My Network, then start your first
              chat.
            </p>
            <Link
              to={
                currentUser?.role === "engineer"
                  ? "/dashboard/engineer/network"
                  : "/dashboard/client/network"
              }
              className="mt-6 inline-flex rounded-full border border-primary px-5 py-2.5 text-xs font-semibold text-primary hover:bg-primary hover:text-white"
            >
              Go to My Network
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {sortedConversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => navigate(`/messages/${conversation.id}`)}
                className="w-full rounded-xl border border-white/10 bg-void/40 p-4 text-left transition-colors hover:border-primary/50"
              >
                <div className="flex items-start gap-3">
                  {conversation.otherParticipant.profilePhotoUrl ? (
                    <img
                      src={conversation.otherParticipant.profilePhotoUrl}
                      alt={`${conversation.otherParticipant.name} profile`}
                      className="h-11 w-11 rounded-full border border-white/10 object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-sm font-bold text-primary">
                      {conversation.otherParticipant.name
                        .charAt(0)
                        .toUpperCase()}
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-white">
                        {conversation.otherParticipant.name}
                      </p>
                      <p className="text-[11px] text-white/45">
                        {formatRelativeTime(
                          conversation.lastMessage?.createdAt ??
                            conversation.updatedAt,
                        )}
                      </p>
                    </div>
                    <p className="mt-1 truncate text-xs text-white/60">
                      {conversation.lastMessage
                        ? truncate(conversation.lastMessage.content, 88)
                        : "No messages yet"}
                    </p>
                  </div>

                  {conversation.unreadCount > 0 ? (
                    <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-white">
                      {conversation.unreadCount}
                    </span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

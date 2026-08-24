import {
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

interface Participant {
  userId: string;
  name: string;
  role: "client" | "engineer";
  profilePhotoUrl: string | null;
}

interface ChatMessage {
  id: string;
  conversationId: string;
  content: string;
  createdAt: string;
  sender: Participant;
  isReadByRequester: boolean;
}

interface GetMessagesResponse {
  conversationId: string;
  otherParticipant: Participant | null;
  messages: ChatMessage[];
}

interface CreateConversationResponse {
  id: string;
  participants: string[];
  lastMessageAt: string | null;
}

interface ErrorResponse {
  message?: string;
}

interface OptimisticMessage extends ChatMessage {
  isPending?: boolean;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const isParticipant = (value: unknown): value is Participant => {
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

const isMessage = (value: unknown): value is ChatMessage => {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message.id === "string" &&
    typeof message.conversationId === "string" &&
    typeof message.content === "string" &&
    typeof message.createdAt === "string" &&
    isParticipant(message.sender) &&
    typeof message.isReadByRequester === "boolean"
  );
};

const isGetMessagesResponse = (
  value: unknown,
): value is GetMessagesResponse => {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.conversationId === "string" &&
    (body.otherParticipant === null || isParticipant(body.otherParticipant)) &&
    Array.isArray(body.messages) &&
    body.messages.every(isMessage)
  );
};

const isCreateConversationResponse = (
  value: unknown,
): value is CreateConversationResponse => {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.id === "string" &&
    Array.isArray(body.participants) &&
    body.participants.every((item) => typeof item === "string") &&
    (typeof body.lastMessageAt === "string" || body.lastMessageAt === null)
  );
};

const getErrorMessage = (value: unknown, fallback: string): string => {
  if (typeof value === "object" && value !== null) {
    const body = value as ErrorResponse;
    if (typeof body.message === "string") return body.message;
  }
  return fallback;
};

const formatTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const normalizeMessages = (
  messages: OptimisticMessage[],
): OptimisticMessage[] => {
  const deduped = new Map<string, OptimisticMessage>();
  messages.forEach((message) => {
    deduped.set(message.id, message);
  });

  return [...deduped.values()].sort(
    (first, second) =>
      new Date(first.createdAt).getTime() -
      new Date(second.createdAt).getTime(),
  );
};

export function ChatPage(): ReactElement {
  const { targetId } = useParams<{ targetId: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [otherParticipant, setOtherParticipant] = useState<Participant | null>(
    null,
  );
  const [messages, setMessages] = useState<OptimisticMessage[]>([]);
  const [draft, setDraft] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [sendError, setSendError] = useState<string>("");
  const [isForbiddenConversation, setIsForbiddenConversation] =
    useState<boolean>(false);

  const listRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = (): void => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  };

  const applyMessagesResponse = (response: GetMessagesResponse): void => {
    setConversationId(response.conversationId);
    setOtherParticipant(response.otherParticipant);
    setMessages((current) => {
      const pending = current.filter((message) => message.isPending);
      return normalizeMessages([...response.messages, ...pending]);
    });
  };

  const fetchMessagesByConversation = async (
    conversationIdValue: string,
  ): Promise<"ok" | "not_found" | "forbidden"> => {
    const response = await fetch(
      `${API_BASE_URL}/api/conversations/${conversationIdValue}/messages`,
      {
        credentials: "include",
      },
    );
    const body: unknown = await response.json();

    if (response.ok && isGetMessagesResponse(body)) {
      applyMessagesResponse(body);
      return "ok";
    }

    if (response.status === 403) {
      setIsForbiddenConversation(true);
      setError(getErrorMessage(body, "You cannot access this conversation."));
      return "forbidden";
    }

    if (response.status === 404 || response.status === 400) {
      return "not_found";
    }

    setError(getErrorMessage(body, "Unable to load this conversation."));
    return "forbidden";
  };

  const resolveConversationByUser = async (
    userId: string,
  ): Promise<string | null> => {
    const response = await fetch(
      `${API_BASE_URL}/api/conversations/with/${userId}`,
      {
        credentials: "include",
      },
    );
    const body: unknown = await response.json();

    if (!response.ok || !isCreateConversationResponse(body)) {
      setError(
        getErrorMessage(body, "Unable to start a conversation with this user."),
      );
      return null;
    }

    return body.id;
  };

  const loadChat = async (): Promise<void> => {
    if (!targetId) {
      setError("Conversation ID is required.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");
    setIsForbiddenConversation(false);

    try {
      const primaryResult = await fetchMessagesByConversation(targetId);

      if (primaryResult === "ok") {
        if (conversationId !== targetId) {
          setConversationId(targetId);
        }
        return;
      }

      if (primaryResult === "forbidden") {
        return;
      }

      const resolvedConversationId = await resolveConversationByUser(targetId);
      if (!resolvedConversationId) {
        return;
      }

      if (resolvedConversationId !== targetId) {
        navigate(`/messages/${resolvedConversationId}`, { replace: true });
      }

      const followupResult = await fetchMessagesByConversation(
        resolvedConversationId,
      );
      if (followupResult !== "ok") {
        return;
      }
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadChat();
  }, [targetId]);

  useEffect(() => {
    if (!conversationId) return;

    const intervalId = window.setInterval(() => {
      void fetchMessagesByConversation(conversationId);
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [conversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const send = async (): Promise<void> => {
    if (!conversationId || !currentUser) return;

    const content = draft.trim();
    if (!content || isSending) return;

    setIsSending(true);
    setSendError("");

    const temporaryId = `temp-${Date.now()}`;
    const optimisticMessage: OptimisticMessage = {
      id: temporaryId,
      conversationId,
      content,
      createdAt: new Date().toISOString(),
      sender: {
        userId: currentUser.id,
        name: currentUser.name,
        role: currentUser.role,
        profilePhotoUrl: null,
      },
      isReadByRequester: true,
      isPending: true,
    };

    setMessages((current) =>
      normalizeMessages([...current, optimisticMessage]),
    );
    setDraft("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ content }),
        },
      );
      const body: unknown = await response.json();

      if (!response.ok || !isMessage(body)) {
        setMessages((current) =>
          current.filter((message) => message.id !== temporaryId),
        );
        setSendError(getErrorMessage(body, "Unable to send message."));
        return;
      }

      setMessages((current) => {
        const withoutTemp = current.filter(
          (message) => message.id !== temporaryId,
        );
        return normalizeMessages([...withoutTemp, body]);
      });
    } catch {
      setMessages((current) =>
        current.filter((message) => message.id !== temporaryId),
      );
      setSendError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void send();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  const canSend = useMemo(
    () => draft.trim().length > 0 && !isSending,
    [draft, isSending],
  );

  if (!targetId) {
    return <Navigate to="/messages" replace />;
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-void px-4 py-8 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl animate-pulse rounded-2xl border border-white/10 bg-surface p-6">
          <div className="h-6 w-1/3 rounded bg-white/10" />
          <div className="mt-5 h-[55vh] rounded bg-white/10" />
        </div>
      </main>
    );
  }

  if (error || isForbiddenConversation) {
    return (
      <main className="min-h-screen bg-void px-4 py-8 text-white sm:px-6 lg:px-8">
        <section className="mx-auto max-w-3xl rounded-2xl border border-red-400/20 bg-red-400/5 p-8 text-center">
          <p className="text-sm text-red-200">
            {error || "Conversation unavailable."}
          </p>
          <Link
            to="/messages"
            className="mt-5 inline-flex rounded-full border border-primary px-5 py-2.5 text-xs font-semibold text-primary hover:bg-primary hover:text-white"
          >
            Back to conversations
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-void px-4 py-8 text-white sm:px-6 lg:px-8">
      <section className="mx-auto flex max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {otherParticipant?.profilePhotoUrl ? (
              <img
                src={otherParticipant.profilePhotoUrl}
                alt={`${otherParticipant.name} profile`}
                className="h-11 w-11 rounded-full border border-white/15 object-cover"
              />
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-sm font-bold text-primary">
                {(otherParticipant?.name ?? "?").charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {otherParticipant?.name ?? "Conversation"}
              </p>
              {otherParticipant ? (
                <Link
                  to={`/users/${otherParticipant.userId}`}
                  className="text-xs text-primary hover:text-glow"
                >
                  View profile
                </Link>
              ) : null}
            </div>
          </div>
          <Link
            to="/messages"
            className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/70 hover:border-primary hover:text-white"
          >
            All chats
          </Link>
        </header>

        <div
          ref={listRef}
          className="h-[56vh] space-y-3 overflow-y-auto px-4 py-4 sm:px-5"
          aria-label="Chat messages"
        >
          {messages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/15 bg-void/40 p-5 text-center text-sm text-white/55">
              No messages yet. Start the conversation.
            </div>
          ) : (
            messages.map((message) => {
              const isMine = message.sender.userId === currentUser?.id;
              return (
                <article
                  key={message.id}
                  className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${isMine ? "bg-primary text-white" : "border border-white/10 bg-void/50 text-white/90"}`}
                  >
                    {!isMine ? (
                      <p className="mb-1 text-[11px] font-semibold text-white/60">
                        {message.sender.name}
                      </p>
                    ) : null}
                    <p className="whitespace-pre-wrap text-sm leading-6">
                      {message.content}
                    </p>
                    <div className="mt-1 flex items-center justify-end gap-2">
                      <p className="text-[10px] text-white/65">
                        {formatTime(message.createdAt)}
                      </p>
                      {message.isPending ? (
                        <p className="text-[10px] text-amber-200">Sending...</p>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <form
          onSubmit={onSubmit}
          className="border-t border-white/10 bg-void/40 p-4 sm:p-5"
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder="Write a message..."
            className="w-full resize-none rounded-xl border border-white/15 bg-void px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-primary focus:outline-none"
          />
          <div className="mt-3 flex items-center justify-between">
            {sendError ? (
              <p className="text-xs text-red-300" role="alert">
                {sendError}
              </p>
            ) : (
              <span className="text-xs text-white/45">
                Press Enter to send, Shift+Enter for new line
              </span>
            )}
            <button
              type="submit"
              disabled={!canSend}
              className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-glow disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSending ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

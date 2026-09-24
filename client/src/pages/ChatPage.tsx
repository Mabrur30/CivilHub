import {
  MicrophoneIcon,
  PaperclipIcon,
  StopIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import {
  FileTypeIcon,
  MessageAttachmentView,
} from "../components/chat/MessageAttachmentView";
import { useAuth } from "../context/AuthContext";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import {
  ATTACHMENT_ACCEPT,
  AUDIO_MAX_SECONDS,
  formatBytes,
  formatDuration,
  isMessageAttachment,
  type MessageAttachment,
  type MessageType,
  postFormWithProgress,
  validateAttachmentFile,
} from "../lib/messageAttachments";

interface Participant {
  userId: string;
  name: string;
  role: "client" | "engineer";
  profilePhotoUrl: string | null;
}

interface ChatMessage {
  id: string;
  conversationId: string;
  messageType: MessageType;
  content: string;
  attachment: MessageAttachment | null;
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
    (message.messageType === "text" ||
      message.messageType === "file" ||
      message.messageType === "audio") &&
    typeof message.content === "string" &&
    (message.attachment === null || isMessageAttachment(message.attachment)) &&
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

const getRecordingExtension = (mimeType: string): string => {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mpeg")) return "mp3";
  return "webm";
};

const iconButtonClassName =
  "inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-primary hover:text-white active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/15 disabled:hover:text-white/70";

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

function UploadProgressBar({
  progress,
}: {
  progress: number | null;
}): ReactElement {
  const percent = Math.round((progress ?? 0) * 100);
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div
        className="h-1 flex-1 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-label="Upload progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-[11px] tabular-nums text-white/55">
        {percent < 100 ? `${percent}%` : "Processing"}
      </span>
    </div>
  );
}

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
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorder = useAudioRecorder();

  const pendingFilePreviewUrl = useMemo(
    () =>
      pendingFile && pendingFile.type.startsWith("image/")
        ? URL.createObjectURL(pendingFile)
        : null,
    [pendingFile],
  );

  useEffect(
    () => () => {
      if (pendingFilePreviewUrl) URL.revokeObjectURL(pendingFilePreviewUrl);
    },
    [pendingFilePreviewUrl],
  );

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

  const isUploading = uploadProgress !== null;
  const isRecorderActive =
    recorder.status === "requesting" || recorder.status === "recording";
  const hasRecording = recorder.status === "recorded" && recorder.recording;

  const onPickFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validationError = validateAttachmentFile(file);
    setSendError(validationError);
    if (!validationError) setPendingFile(file);
  };

  const onToggleRecording = (): void => {
    setSendError("");
    if (recorder.status === "recording") {
      recorder.stop();
      return;
    }
    void recorder.start();
  };

  const sendAttachment = async (): Promise<void> => {
    if (!conversationId || isUploading) return;

    const recording = recorder.status === "recorded" ? recorder.recording : null;
    if (!recording && !pendingFile) return;

    const caption = draft.trim();
    const formData = new FormData();
    if (recording) {
      formData.append("messageType", "audio");
      formData.append(
        "durationSeconds",
        String(Math.round(recording.durationSeconds)),
      );
      formData.append(
        "attachment",
        recording.blob,
        `voice-message.${getRecordingExtension(recording.mimeType)}`,
      );
    } else if (pendingFile) {
      formData.append("messageType", "file");
      if (caption) formData.append("content", caption);
      formData.append("attachment", pendingFile, pendingFile.name);
    }

    setSendError("");
    setUploadProgress(0);

    try {
      const result = await postFormWithProgress(
        `${API_BASE_URL}/api/conversations/${conversationId}/messages`,
        formData,
        setUploadProgress,
      );

      // On failure the file or recording stays in the composer so it can be retried.
      if (!result.ok || !isMessage(result.body)) {
        const fallback = recording
          ? "Voice message could not be sent. Try again."
          : "File could not be sent. Try again.";
        // 5xx bodies only say "Internal server error", which gives no direction.
        setSendError(
          result.status >= 500
            ? fallback
            : getErrorMessage(result.body, fallback),
        );
        return;
      }

      const sentMessage = result.body;
      setMessages((current) => normalizeMessages([...current, sentMessage]));
      if (recording) {
        recorder.discard();
      } else {
        setPendingFile(null);
        if (caption) setDraft("");
      }
    } catch {
      setSendError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setUploadProgress(null);
    }
  };

  const send = async (): Promise<void> => {
    if (!conversationId || !currentUser) return;

    if (pendingFile || hasRecording) {
      await sendAttachment();
      return;
    }

    const content = draft.trim();
    if (!content || isSending) return;

    setIsSending(true);
    setSendError("");

    const temporaryId = `temp-${Date.now()}`;
    const optimisticMessage: OptimisticMessage = {
      id: temporaryId,
      conversationId,
      messageType: "text",
      content,
      attachment: null,
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
    () =>
      (draft.trim().length > 0 || Boolean(pendingFile) || Boolean(hasRecording)) &&
      !isSending &&
      !isUploading &&
      !isRecorderActive,
    [draft, pendingFile, hasRecording, isSending, isUploading, isRecorderActive],
  );

  const composerError = sendError || recorder.error;

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
            <Avatar
              name={otherParticipant?.name ?? "Unknown user"}
              photoUrl={otherParticipant?.profilePhotoUrl ?? null}
              size="sm"
            />
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
              const attachment =
                message.messageType !== "text" ? message.attachment : null;
              return (
                <article
                  key={message.id}
                  className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl ${attachment ? "p-2" : "px-4 py-2.5"} ${isMine ? "bg-primary text-white" : "border border-white/10 bg-void/50 text-white/90"}`}
                  >
                    {!isMine ? (
                      <p
                        className={`mb-1 text-[11px] font-semibold text-white/60 ${attachment ? "px-2 pt-0.5" : ""}`}
                      >
                        {message.sender.name}
                      </p>
                    ) : null}
                    {attachment ? (
                      <MessageAttachmentView
                        messageType={message.messageType}
                        attachment={attachment}
                        isMine={isMine}
                      />
                    ) : null}
                    {message.content ? (
                      <p
                        className={`whitespace-pre-wrap text-sm leading-6 ${attachment ? "px-2 pt-2" : ""}`}
                      >
                        {message.content}
                      </p>
                    ) : null}
                    <div
                      className={`mt-1 flex items-center justify-end gap-2 ${attachment ? "px-2" : ""}`}
                    >
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
          {pendingFile ? (
            <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/15 bg-void px-3 py-2.5">
              {pendingFilePreviewUrl ? (
                <img
                  src={pendingFilePreviewUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
                  <FileTypeIcon
                    mimeType={pendingFile.type}
                    className="h-6 w-6"
                  />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {pendingFile.name}
                </p>
                {isUploading ? (
                  <UploadProgressBar progress={uploadProgress} />
                ) : (
                  <p className="text-[11px] text-white/55">
                    {formatBytes(pendingFile.size)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setPendingFile(null);
                  setSendError("");
                }}
                disabled={isUploading}
                className={iconButtonClassName}
                aria-label={`Remove ${pendingFile.name}`}
              >
                <XIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}

          {recorder.status === "recording" || recorder.status === "requesting" ? (
            <div className="flex min-h-[3.75rem] items-center gap-3 rounded-xl border border-primary/50 bg-void px-4 py-2">
              <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
              </span>
              <p className="text-sm text-white" aria-live="polite">
                {recorder.status === "requesting"
                  ? "Waiting for microphone access"
                  : "Recording"}
              </p>
              <p className="ml-auto text-sm tabular-nums text-white/70">
                {formatDuration(recorder.elapsedSeconds)}
                <span className="text-white/35">
                  {" "}
                  / {formatDuration(AUDIO_MAX_SECONDS)}
                </span>
              </p>
              <button
                type="button"
                onClick={recorder.discard}
                className={iconButtonClassName}
                aria-label="Cancel recording"
              >
                <TrashIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : hasRecording && recorder.recording ? (
            <div className="rounded-xl border border-white/15 bg-void px-3 py-2">
              <div className="flex items-center gap-3">
                <audio
                  controls
                  src={recorder.recording.url}
                  className="h-9 min-w-0 flex-1 scheme-dark"
                />
                <span className="text-xs tabular-nums text-white/60">
                  {formatDuration(recorder.recording.durationSeconds)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    recorder.discard();
                    setSendError("");
                  }}
                  disabled={isUploading}
                  className={iconButtonClassName}
                  aria-label="Discard voice message"
                >
                  <TrashIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              {isUploading ? (
                <UploadProgressBar progress={uploadProgress} />
              ) : null}
            </div>
          ) : (
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              placeholder={
                pendingFile ? "Add a note (optional)" : "Write a message..."
              }
              disabled={isUploading}
              className="w-full resize-none rounded-xl border border-white/15 bg-void px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-primary focus:outline-none disabled:opacity-60"
            />
          )}
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept={ATTACHMENT_ACCEPT}
                onChange={onPickFile}
                className="hidden"
                tabIndex={-1}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={
                  isUploading ||
                  isRecorderActive ||
                  Boolean(hasRecording) ||
                  Boolean(pendingFile)
                }
                className={iconButtonClassName}
                aria-label="Attach a file"
                title="Attach a file (images, PDF, Word, Excel, TXT, CSV up to 10 MB)"
              >
                <PaperclipIcon className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onToggleRecording}
                disabled={
                  isUploading ||
                  recorder.status === "requesting" ||
                  Boolean(hasRecording) ||
                  Boolean(pendingFile)
                }
                className={
                  recorder.status === "recording"
                    ? `${iconButtonClassName} border-primary bg-primary text-white hover:bg-glow`
                    : iconButtonClassName
                }
                aria-label={
                  recorder.status === "recording"
                    ? "Stop recording"
                    : "Record a voice message"
                }
                aria-pressed={recorder.status === "recording"}
                title={
                  recorder.status === "recording"
                    ? "Stop recording"
                    : "Record a voice message (up to 5 minutes)"
                }
              >
                {recorder.status === "recording" ? (
                  <StopIcon className="h-4 w-4" weight="fill" aria-hidden="true" />
                ) : (
                  <MicrophoneIcon className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
              {composerError ? (
                <p className="min-w-0 text-xs text-red-300" role="alert">
                  {composerError}
                </p>
              ) : (
                <span className="hidden text-xs text-white/45 sm:inline">
                  {recorder.status === "recording"
                    ? "Tap stop when you're done"
                    : hasRecording
                      ? "Play it back, then send or discard"
                      : "Press Enter to send, Shift+Enter for new line"}
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={!canSend}
              className="shrink-0 rounded-full bg-primary px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-glow disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploading ? "Uploading..." : isSending ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

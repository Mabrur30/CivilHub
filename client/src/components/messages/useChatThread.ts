import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type CurrentUser } from "../../context/AuthContext";
import {
  CONNECTION_ERROR,
  fetchMessages,
  resolveConversationWithUser,
  sendTextMessage,
} from "./api";
import {
  type ChatMessage,
  type ConversationProject,
  type GetMessagesResponse,
  type OptimisticMessage,
  type Participant,
  toConversationProjects,
} from "./types";

const POLL_MS = 4000;

const normalizeMessages = (
  messages: OptimisticMessage[],
): OptimisticMessage[] => {
  const deduped = new Map<string, OptimisticMessage>();
  messages.forEach((message) => deduped.set(message.id, message));
  return [...deduped.values()].sort(
    (first, second) =>
      new Date(first.createdAt).getTime() -
      new Date(second.createdAt).getTime(),
  );
};

export interface ChatThreadState {
  conversationId: string | null;
  otherParticipant: Participant | null;
  messages: OptimisticMessage[];
  isLoading: boolean;
  error: string;
  /** Projects this pair has talked about, newest first. */
  projects: ConversationProject[];
  /** The project new messages are about, or null for none. */
  activeProjectId: string | null;
  setActiveProjectId: (projectId: string | null) => void;
  /** Phone numbers and emails are masked until the pair has a hire. */
  contactsHidden: boolean;
  /** Resolves to an error message, or "" once the message is saved. */
  sendText: (content: string) => Promise<string>;
  addMessage: (message: ChatMessage) => void;
}

/**
 * Loads one conversation and keeps it fresh. `targetId` may be a conversation
 * ID or, from profile and network links, the other user's ID; a user ID is
 * resolved to its conversation and the URL is replaced with the real ID, which
 * remounts the thread for that ID.
 */
export function useChatThread(
  targetId: string,
  currentUser: CurrentUser | null,
  onLoaded?: (conversationId: string) => void,
  /** From ?project= on project pages' "Message" links. */
  requestedProjectId?: string | null,
): ChatThreadState {
  const navigate = useNavigate();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [otherParticipant, setOtherParticipant] = useState<Participant | null>(
    null,
  );
  const [messages, setMessages] = useState<OptimisticMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [projects, setProjects] = useState<ConversationProject[]>([]);
  const [contactsHidden, setContactsHidden] = useState<boolean>(false);
  // Null until chosen; then falls back to the link's project or the newest.
  const [chosenProjectId, setChosenProjectId] = useState<string | null>(
    requestedProjectId ?? null,
  );

  // Kept in a ref so a changing callback identity never restarts loading.
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  const apply = useCallback((response: GetMessagesResponse): void => {
    setConversationId(response.conversationId);
    setOtherParticipant(response.otherParticipant);
    setProjects(toConversationProjects(response.projects));
    setContactsHidden(response.contactsHidden === true);
    setMessages((current) =>
      normalizeMessages([
        ...response.messages,
        ...current.filter((message) => message.isPending),
      ]),
    );
    onLoadedRef.current?.(response.conversationId);
  }, []);

  useEffect(() => {
    // ThreadView is keyed by targetId, so state here always starts fresh.
    let isCancelled = false;

    const load = async (): Promise<void> => {
      try {
        const first = await fetchMessages(targetId);
        if (isCancelled) return;
        if (first.status === "ok") {
          apply(first.data);
          return;
        }
        if (first.status === "forbidden") {
          setError(first.error);
          return;
        }

        const resolved = await resolveConversationWithUser(
          targetId,
          requestedProjectId,
        );
        if (isCancelled) return;
        if (!resolved.ok) {
          setError(resolved.error);
          return;
        }
        if (resolved.data !== targetId) {
          // The effect reruns for the real ID and loads it from there. The
          // project stays in the URL so the thread opens about it.
          navigate(
            `/messages/${resolved.data}${
              requestedProjectId
                ? `?project=${encodeURIComponent(requestedProjectId)}`
                : ""
            }`,
            { replace: true },
          );
          return;
        }
        setError("Unable to load this conversation.");
      } catch {
        if (!isCancelled) setError(CONNECTION_ERROR);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      isCancelled = true;
    };
  }, [targetId, apply, navigate, requestedProjectId]);

  useEffect(() => {
    if (!conversationId) return;
    const intervalId = window.setInterval(() => {
      void fetchMessages(conversationId)
        .then((result) => {
          if (result.status === "ok") apply(result.data);
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(intervalId);
  }, [conversationId, apply]);

  const addMessage = useCallback((message: ChatMessage): void => {
    setMessages((current) => normalizeMessages([...current, message]));
  }, []);

  const activeProjectId =
    chosenProjectId && projects.some((project) => project.id === chosenProjectId)
      ? chosenProjectId
      : (projects[0]?.id ?? null);

  const sendText = useCallback(
    async (content: string): Promise<string> => {
      if (!conversationId || !currentUser) return "";

      const temporaryId = `temp-${Date.now()}`;
      const optimistic: OptimisticMessage = {
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
          profilePhotoUrl: currentUser.profilePhotoUrl,
        },
        isReadByRequester: true,
        projectId: activeProjectId,
        isPending: true,
      };
      setMessages((current) => normalizeMessages([...current, optimistic]));

      const withoutTemp = (current: OptimisticMessage[]): OptimisticMessage[] =>
        current.filter((message) => message.id !== temporaryId);

      try {
        const result = await sendTextMessage(
          conversationId,
          content,
          activeProjectId,
        );
        if (!result.ok) {
          setMessages(withoutTemp);
          return result.error;
        }
        setMessages((current) =>
          normalizeMessages([...withoutTemp(current), result.data]),
        );
        return "";
      } catch {
        setMessages(withoutTemp);
        return CONNECTION_ERROR;
      }
    },
    [conversationId, currentUser, activeProjectId],
  );

  return {
    conversationId,
    otherParticipant,
    messages,
    isLoading,
    error,
    projects,
    activeProjectId,
    setActiveProjectId: setChosenProjectId,
    contactsHidden,
    sendText,
    addMessage,
  };
}

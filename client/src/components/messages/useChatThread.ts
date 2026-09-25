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
  type GetMessagesResponse,
  type OptimisticMessage,
  type Participant,
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
): ChatThreadState {
  const navigate = useNavigate();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [otherParticipant, setOtherParticipant] = useState<Participant | null>(
    null,
  );
  const [messages, setMessages] = useState<OptimisticMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  // Kept in a ref so a changing callback identity never restarts loading.
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  const apply = useCallback((response: GetMessagesResponse): void => {
    setConversationId(response.conversationId);
    setOtherParticipant(response.otherParticipant);
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

        const resolved = await resolveConversationWithUser(targetId);
        if (isCancelled) return;
        if (!resolved.ok) {
          setError(resolved.error);
          return;
        }
        if (resolved.data !== targetId) {
          // The effect reruns for the real ID and loads it from there.
          navigate(`/messages/${resolved.data}`, { replace: true });
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
  }, [targetId, apply, navigate]);

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
        isPending: true,
      };
      setMessages((current) => normalizeMessages([...current, optimistic]));

      const withoutTemp = (current: OptimisticMessage[]): OptimisticMessage[] =>
        current.filter((message) => message.id !== temporaryId);

      try {
        const result = await sendTextMessage(conversationId, content);
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
    [conversationId, currentUser],
  );

  return {
    conversationId,
    otherParticipant,
    messages,
    isLoading,
    error,
    sendText,
    addMessage,
  };
}

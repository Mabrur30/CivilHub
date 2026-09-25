import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CONNECTION_ERROR,
  fetchConversations,
  markConversationRead,
  setConversationFlags,
} from "./api";
import {
  type ConversationSummary,
  conversationActivityTime,
  type InboxFilter,
} from "./types";

const POLL_MS = 8000;

export const matchesFilter = (
  conversation: ConversationSummary,
  filter: InboxFilter,
): boolean => {
  if (filter === "archived") return conversation.isArchived;
  if (conversation.isArchived) return false;
  if (filter === "unread") return conversation.unreadCount > 0;
  if (filter === "starred") return conversation.isStarred;
  return true;
};

export interface ConversationsState {
  conversations: ConversationSummary[];
  counts: Record<InboxFilter, number>;
  isLoading: boolean;
  error: string;
  reload: () => Promise<void>;
  setStarred: (id: string, starred: boolean) => Promise<void>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  /** Clears the unread pill once the thread is open (the server already marked it read). */
  clearUnread: (id: string) => void;
}

/**
 * The inbox list, newest activity first, polled like the old conversation page.
 * Star, archive and read changes apply immediately and roll back if the server
 * refuses them.
 */
export function useConversations(): ConversationsState {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const reload = useCallback(async (): Promise<void> => {
    try {
      const result = await fetchConversations();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError("");
      setConversations(result.data);
    } catch {
      setError(CONNECTION_ERROR);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const intervalId = window.setInterval(() => void reload(), POLL_MS);
    return () => window.clearInterval(intervalId);
  }, [reload]);

  const patch = useCallback(
    (id: string, changes: Partial<ConversationSummary>): void => {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === id
            ? { ...conversation, ...changes }
            : conversation,
        ),
      );
    },
    [],
  );

  const setStarred = useCallback(
    async (id: string, starred: boolean): Promise<void> => {
      patch(id, { isStarred: starred });
      const ok = await setConversationFlags(id, { starred }).catch(() => false);
      if (!ok) patch(id, { isStarred: !starred });
    },
    [patch],
  );

  const setArchived = useCallback(
    async (id: string, archived: boolean): Promise<void> => {
      patch(id, { isArchived: archived });
      const ok = await setConversationFlags(id, { archived }).catch(
        () => false,
      );
      if (!ok) patch(id, { isArchived: !archived });
    },
    [patch],
  );

  const markRead = useCallback(
    async (id: string): Promise<void> => {
      const previous = conversations.find(
        (conversation) => conversation.id === id,
      )?.unreadCount;
      patch(id, { unreadCount: 0 });
      const ok = await markConversationRead(id).catch(() => false);
      if (!ok && previous) patch(id, { unreadCount: previous });
    },
    [conversations, patch],
  );

  const clearUnread = useCallback(
    (id: string): void => patch(id, { unreadCount: 0 }),
    [patch],
  );

  const sorted = useMemo(
    () =>
      [...conversations].sort(
        (first, second) =>
          conversationActivityTime(second) - conversationActivityTime(first),
      ),
    [conversations],
  );

  const counts = useMemo(
    () => ({
      all: sorted.filter((item) => matchesFilter(item, "all")).length,
      unread: sorted.filter((item) => matchesFilter(item, "unread")).length,
      starred: sorted.filter((item) => matchesFilter(item, "starred")).length,
      archived: sorted.filter((item) => matchesFilter(item, "archived")).length,
    }),
    [sorted],
  );

  return {
    conversations: sorted,
    counts,
    isLoading,
    error,
    reload,
    setStarred,
    setArchived,
    markRead,
    clearUnread,
  };
}

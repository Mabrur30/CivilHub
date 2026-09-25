import {
  CaretDownIcon,
  ChatsCircleIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  type ReactElement,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { ConversationRow } from "./ConversationRow";
import { type InboxFilter } from "./types";
import { type ConversationsState, matchesFilter } from "./useConversations";
import { useDismiss } from "./useDismiss";

const filterLabels: Record<InboxFilter, string> = {
  all: "All messages",
  unread: "Unread",
  starred: "Starred",
  archived: "Archived",
};

const filterOrder: InboxFilter[] = ["all", "unread", "starred", "archived"];

const emptyCopy: Record<InboxFilter, string> = {
  all: "No conversations yet.",
  unread: "You're all caught up.",
  starred: "Star a conversation to keep it here.",
  archived: "Nothing archived.",
};

interface ConversationListProps {
  inbox: ConversationsState;
  selectedId: string | null;
  currentUserId: string | undefined;
  networkPath: string;
  onSelect: (conversationId: string) => void;
}

function FilterMenu({
  value,
  counts,
  onChange,
}: {
  value: InboxFilter;
  counts: Record<InboxFilter, number>;
  onChange: (filter: InboxFilter) => void;
}): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const close = useCallback(() => setIsOpen(false), []);
  useDismiss(ref, isOpen, close);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-glow"
      >
        {filterLabels[value]}
        <CaretDownIcon
          className="h-3.5 w-3.5 text-white/60"
          aria-hidden="true"
        />
      </button>
      {isOpen ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 w-52 rounded-xl border border-white/10 bg-surface p-1.5 shadow-2xl"
        >
          {filterOrder.map((filter) => (
            <button
              key={filter}
              type="button"
              role="menuitemradio"
              aria-checked={filter === value}
              onClick={() => {
                onChange(filter);
                setIsOpen(false);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-white/80 transition-colors hover:bg-white/5 hover:text-white"
            >
              <span className="flex items-center gap-2">
                <CheckIcon
                  className={`h-3.5 w-3.5 ${filter === value ? "text-primary" : "invisible"}`}
                  weight="bold"
                  aria-hidden="true"
                />
                {filterLabels[filter]}
              </span>
              <span className="text-xs tabular-nums text-white/40">
                {counts[filter]}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ConversationList({
  inbox,
  selectedId,
  currentUserId,
  networkPath,
  onSelect,
}: ConversationListProps): ReactElement {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [query, setQuery] = useState<string>("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return inbox.conversations.filter((conversation) => {
      if (!matchesFilter(conversation, filter)) return false;
      if (!needle) return true;
      return (
        conversation.otherParticipant.name.toLowerCase().includes(needle) ||
        (conversation.lastMessage?.content ?? "").toLowerCase().includes(needle)
      );
    });
  }, [inbox.conversations, filter, query]);

  const closeSearch = (): void => {
    setIsSearching(false);
    setQuery("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3">
        {isSearching ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <MagnifyingGlassIcon
              className="h-4 w-4 shrink-0 text-white/45"
              aria-hidden="true"
            />
            <input
              id="inbox-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") closeSearch();
              }}
              placeholder="Search by name or message"
              aria-label="Search conversations"
              autoFocus
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-white outline-none placeholder:text-white/35"
            />
            <button
              type="button"
              onClick={closeSearch}
              aria-label="Close search"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/55 hover:bg-white/5 hover:text-white"
            >
              <XIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <>
            <FilterMenu
              value={filter}
              counts={inbox.counts}
              onChange={setFilter}
            />
            <button
              type="button"
              onClick={() => setIsSearching(true)}
              aria-label="Search conversations"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/65 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-glow"
            >
              <MagnifyingGlassIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {inbox.isLoading ? (
          <ul className="space-y-1" aria-label="Loading conversations">
            {Array.from({ length: 5 }).map((_, index) => (
              <li key={index} className="flex animate-pulse gap-3 px-3 py-3">
                <span className="h-10 w-10 shrink-0 rounded-full bg-white/10" />
                <span className="flex-1 space-y-2 pt-1">
                  <span className="block h-3 w-1/2 rounded bg-white/10" />
                  <span className="block h-2.5 w-3/4 rounded bg-white/10" />
                </span>
              </li>
            ))}
          </ul>
        ) : inbox.error && inbox.conversations.length === 0 ? (
          <p
            role="alert"
            className="m-2 rounded-xl border border-rose-400/25 bg-rose-400/10 p-3 text-sm text-rose-200"
          >
            {inbox.error}
          </p>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <ChatsCircleIcon
              className="h-8 w-8 text-white/25"
              aria-hidden="true"
            />
            <p className="mt-3 text-sm text-white/60">
              {query ? `No conversations match "${query}".` : emptyCopy[filter]}
            </p>
            {filter === "all" && !query && inbox.conversations.length === 0 ? (
              <Link
                to={networkPath}
                className="mt-4 text-sm font-semibold text-primary hover:text-glow"
              >
                Find people in My Network
              </Link>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {visible.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                isSelected={conversation.id === selectedId}
                currentUserId={currentUserId}
                onSelect={() => onSelect(conversation.id)}
                onToggleStar={() =>
                  void inbox.setStarred(
                    conversation.id,
                    !conversation.isStarred,
                  )
                }
                onToggleArchive={() =>
                  void inbox.setArchived(
                    conversation.id,
                    !conversation.isArchived,
                  )
                }
                onMarkRead={() => void inbox.markRead(conversation.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

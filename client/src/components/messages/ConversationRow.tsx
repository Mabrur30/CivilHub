import {
  ArchiveIcon,
  CheckIcon,
  DotsThreeIcon,
  StarIcon,
  TrayArrowUpIcon,
} from "@phosphor-icons/react";
import { type ReactElement, useCallback, useRef, useState } from "react";
import { Avatar } from "../Avatar";
import { formatRelativeTime } from "../dashboard/notificationUtils";
import { ConversationPreview } from "./ConversationPreview";
import { type ConversationSummary } from "./types";
import { useDismiss } from "./useDismiss";

interface ConversationRowProps {
  conversation: ConversationSummary;
  isSelected: boolean;
  currentUserId: string | undefined;
  onSelect: () => void;
  onToggleStar: () => void;
  onToggleArchive: () => void;
  onMarkRead: () => void;
}

const iconButton =
  "inline-flex h-7 w-7 items-center justify-center rounded-full text-white/45 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-glow";

const menuItem =
  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-white/80 transition-colors hover:bg-white/5 hover:text-white";

export function ConversationRow({
  conversation,
  isSelected,
  currentUserId,
  onSelect,
  onToggleStar,
  onToggleArchive,
  onMarkRead,
}: ConversationRowProps): ReactElement {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);
  useDismiss(menuRef, isMenuOpen, closeMenu);

  const {
    otherParticipant: other,
    unreadCount,
    isStarred,
    isArchived,
  } = conversation;
  const isUnread = unreadCount > 0;
  const time = formatRelativeTime(
    conversation.lastMessage?.createdAt ?? conversation.updatedAt,
  );

  const run = (action: () => void) => () => {
    setIsMenuOpen(false);
    action();
  };

  return (
    <li
      className={`group relative rounded-xl transition-colors ${
        isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
      }`}
    >
      {isSelected ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-primary"
        />
      ) : null}

      <button
        type="button"
        onClick={onSelect}
        aria-current={isSelected ? "true" : undefined}
        className="flex w-full items-start gap-3 rounded-xl py-3 pl-3 pr-10 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-glow"
      >
        <Avatar name={other.name} photoUrl={other.profilePhotoUrl} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span
              className={`truncate text-sm ${isUnread ? "font-bold text-white" : "font-semibold text-white/85"}`}
            >
              {other.name}
            </span>
            <span className="shrink-0 text-[11px] text-white/45">{time}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <ConversationPreview
              message={conversation.lastMessage}
              currentUserId={currentUserId}
              className={`min-w-0 flex-1 ${isUnread ? "text-white/80!" : ""}`}
            />
            {isUnread ? (
              <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-on-primary">
                {unreadCount}
              </span>
            ) : null}
          </span>
        </span>
      </button>

      {/* A narrow column at the row's right edge, as in Fiverr: the menu on
          the name line and the star under it. The button keeps pr-10 clear. */}
      <div
        ref={menuRef}
        className="absolute right-1.5 top-2 flex flex-col-reverse items-center gap-1"
      >
        <button
          type="button"
          onClick={onToggleStar}
          aria-pressed={isStarred}
          aria-label={isStarred ? `Unstar ${other.name}` : `Star ${other.name}`}
          className={`${iconButton} ${
            isStarred
              ? "text-amber-300"
              : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          }`}
        >
          <StarIcon
            className="h-4 w-4"
            weight={isStarred ? "fill" : "regular"}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          aria-label={`More actions for ${other.name}`}
          className={`${iconButton} ${
            isMenuOpen
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          }`}
        >
          <DotsThreeIcon className="h-4 w-4" weight="bold" aria-hidden="true" />
        </button>

        {isMenuOpen ? (
          <div
            role="menu"
            className="absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-white/10 bg-surface p-1.5 shadow-2xl"
          >
            <button
              type="button"
              role="menuitem"
              onClick={run(onToggleStar)}
              className={menuItem}
            >
              <StarIcon className="h-4 w-4" aria-hidden="true" />
              {isStarred ? "Unstar" : "Star"}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={run(onToggleArchive)}
              className={menuItem}
            >
              {isArchived ? (
                <TrayArrowUpIcon className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ArchiveIcon className="h-4 w-4" aria-hidden="true" />
              )}
              {isArchived ? "Move to inbox" : "Archive"}
            </button>
            {isUnread ? (
              <button
                type="button"
                role="menuitem"
                onClick={run(onMarkRead)}
                className={menuItem}
              >
                <CheckIcon className="h-4 w-4" aria-hidden="true" />
                Mark as read
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

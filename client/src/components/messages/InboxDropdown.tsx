import { EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { type ReactElement } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../Avatar";
import { formatRelativeTime } from "../dashboard/notificationUtils";
import { ConversationPreview } from "./ConversationPreview";
import { type ConversationSummary } from "./types";

const DROPDOWN_LIMIT = 6;

interface InboxDropdownProps {
  isOpen: boolean;
  conversations: ConversationSummary[];
  unreadCount: number;
  currentUserId: string | undefined;
  onNavigate: () => void;
}

// The header's quick look at recent conversations, after Fiverr's inbox
// popover: newest first, archived ones left out, a link to the full inbox.
export function InboxDropdown({
  isOpen,
  conversations,
  unreadCount,
  currentUserId,
  onNavigate,
}: InboxDropdownProps): ReactElement {
  const recent = conversations
    .filter((conversation) => !conversation.isArchived)
    .slice(0, DROPDOWN_LIMIT);

  return (
    <div
      role="menu"
      aria-hidden={!isOpen}
      aria-label="Recent messages"
      className={`absolute right-0 top-full z-50 mt-3 w-88 max-w-[calc(100vw-2rem)] origin-top-right overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-2xl transition-all duration-150 ${
        isOpen
          ? "scale-100 opacity-100"
          : "pointer-events-none scale-95 opacity-0"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <EnvelopeSimpleIcon
          className="h-4 w-4 text-white/60"
          aria-hidden="true"
        />
        <p className="text-sm font-semibold text-white">
          Inbox{" "}
          <span className="tabular-nums text-white/50">({unreadCount})</span>
        </p>
      </div>

      {recent.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-white/55">
          No conversations yet.
        </p>
      ) : (
        <ul className="max-h-96 divide-y divide-white/10 overflow-y-auto">
          {recent.map((conversation) => {
            const other = conversation.otherParticipant;
            const isUnread = conversation.unreadCount > 0;
            return (
              <li key={conversation.id}>
                <Link
                  to={`/messages/${conversation.id}`}
                  role="menuitem"
                  tabIndex={isOpen ? 0 : -1}
                  onClick={onNavigate}
                  className="flex gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.04] focus-visible:outline-none"
                >
                  <Avatar
                    name={other.name}
                    photoUrl={other.profilePhotoUrl}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span
                        className={`truncate text-sm ${isUnread ? "font-bold text-white" : "font-semibold text-white/85"}`}
                      >
                        {other.name}
                      </span>
                      {isUnread ? (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-primary"
                          aria-label="Unread"
                        />
                      ) : null}
                    </span>
                    <ConversationPreview
                      message={conversation.lastMessage}
                      currentUserId={currentUserId}
                      lines={2}
                      className="mt-0.5"
                    />
                    <span className="mt-1 block text-[11px] text-white/40">
                      {formatRelativeTime(
                        conversation.lastMessage?.createdAt ??
                          conversation.updatedAt,
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-white/10 px-4 py-2.5 text-right">
        <Link
          to="/messages"
          tabIndex={isOpen ? 0 : -1}
          onClick={onNavigate}
          className="text-xs font-semibold text-primary hover:text-glow"
        >
          See all in inbox
        </Link>
      </div>
    </div>
  );
}

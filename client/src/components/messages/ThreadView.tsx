import {
  ArchiveIcon,
  ArrowLeftIcon,
  InfoIcon,
  ShieldCheckIcon,
  StarIcon,
  TrayArrowUpIcon,
} from "@phosphor-icons/react";
import { type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { type CurrentUser } from "../../context/AuthContext";
import { Avatar } from "../Avatar";
import { AboutPanel } from "./AboutPanel";
import { Composer } from "./Composer";
import { groupMessages } from "./groupMessages";
import { DayDivider, MessageGroup } from "./MessageGroup";
import { type ConversationsState } from "./useConversations";
import { useChatThread } from "./useChatThread";

interface ThreadViewProps {
  targetId: string;
  currentUser: CurrentUser | null;
  inbox: ConversationsState;
  onBack: () => void;
}

const headerButton =
  "inline-flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-glow";

export function ThreadView({
  targetId,
  currentUser,
  inbox,
  onBack,
}: ThreadViewProps): ReactElement {
  const { clearUnread, reload } = inbox;
  const thread = useChatThread(targetId, currentUser, clearUnread);
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const summary = inbox.conversations.find(
    (conversation) => conversation.id === thread.conversationId,
  );
  const other = thread.otherParticipant ?? summary?.otherParticipant ?? null;

  const items = useMemo(
    () => groupMessages(thread.messages, currentUser?.id),
    [thread.messages, currentUser?.id],
  );

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [thread.messages.length, thread.conversationId]);

  if (thread.isLoading) {
    return (
      <div
        className="flex h-full min-w-0 flex-1 flex-col"
        aria-label="Loading conversation"
      >
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
          <span className="h-10 w-10 animate-pulse rounded-full bg-white/10" />
          <span className="h-3.5 w-40 animate-pulse rounded-full bg-white/10" />
        </div>
        <div className="flex-1 space-y-5 p-5">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex gap-3">
              <span className="h-8 w-8 animate-pulse rounded-full bg-white/10" />
              <span className="flex-1 space-y-2">
                <span className="block h-3 w-28 animate-pulse rounded-full bg-white/10" />
                <span className="block h-3 w-2/3 animate-pulse rounded-full bg-white/10" />
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (thread.error || !thread.conversationId || !other) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="max-w-sm text-sm text-rose-200" role="alert">
          {thread.error || "This conversation isn't available."}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 hover:border-white/40 hover:text-white"
        >
          Back to inbox
        </button>
      </div>
    );
  }

  const conversationId = thread.conversationId;

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to inbox"
              className={`${headerButton} lg:hidden`}
            >
              <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
            </button>
            <Avatar
              name={other.name}
              photoUrl={other.profilePhotoUrl}
              size="sm"
            />
            <div className="min-w-0">
              <Link
                to={`/profile/${other.userId}`}
                className="block truncate text-[15px] font-semibold text-white underline decoration-white/25 underline-offset-4 hover:decoration-white/70"
              >
                {other.name}
              </Link>
              <p className="text-xs capitalize text-white/50">{other.role}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {summary ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    void inbox.setStarred(conversationId, !summary.isStarred)
                  }
                  aria-pressed={summary.isStarred}
                  aria-label={
                    summary.isStarred
                      ? "Unstar conversation"
                      : "Star conversation"
                  }
                  title={summary.isStarred ? "Unstar" : "Star"}
                  className={`${headerButton} ${summary.isStarred ? "text-amber-300" : ""}`}
                >
                  <StarIcon
                    className="h-5 w-5"
                    weight={summary.isStarred ? "fill" : "regular"}
                    aria-hidden="true"
                  />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void inbox.setArchived(conversationId, !summary.isArchived)
                  }
                  aria-label={
                    summary.isArchived
                      ? "Move to inbox"
                      : "Archive conversation"
                  }
                  title={summary.isArchived ? "Move to inbox" : "Archive"}
                  className={headerButton}
                >
                  {summary.isArchived ? (
                    <TrayArrowUpIcon className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <ArchiveIcon className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => setIsAboutOpen(true)}
              aria-label={`About ${other.name}`}
              title="Details"
              className={`${headerButton} xl:hidden`}
            >
              <InfoIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div
          ref={listRef}
          role="log"
          aria-live="polite"
          aria-label={`Messages with ${other.name}`}
          className="min-h-0 flex-1 overflow-y-auto pb-3"
        >
          <p className="mx-auto flex max-w-lg items-start justify-center gap-2 px-6 pb-2 pt-5 text-center text-xs leading-relaxed text-white/50">
            <ShieldCheckIcon
              className="mt-px h-4 w-4 shrink-0 text-primary"
              weight="fill"
              aria-hidden="true"
            />
            <span>
              Keep payments and project files inside CivilHub so milestones and
              disputes stay protected.
            </span>
          </p>

          {items.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-white/50">
              No messages yet. Say hello to {other.name.split(" ")[0]}.
            </p>
          ) : (
            items.map((item) =>
              item.kind === "day" ? (
                <DayDivider key={item.key} label={item.label} />
              ) : (
                <MessageGroup key={item.key} group={item} />
              ),
            )
          )}
        </div>

        <Composer
          key={conversationId}
          conversationId={conversationId}
          recipientName={other.name.split(" ")[0]}
          sendText={thread.sendText}
          onSent={(message) => {
            if (message) thread.addMessage(message);
            void reload();
          }}
        />
      </section>

      <div className="hidden w-72 shrink-0 border-l border-white/10 xl:block">
        <AboutPanel key={other.userId} participant={other} />
      </div>

      {isAboutOpen ? (
        <div className="absolute inset-0 z-30 flex justify-end xl:hidden">
          <button
            type="button"
            aria-label="Close details"
            onClick={() => setIsAboutOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative h-full w-80 max-w-[90%] border-l border-white/10 shadow-2xl">
            <AboutPanel
              key={other.userId}
              participant={other}
              onClose={() => setIsAboutOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

import { type ReactElement } from "react";
import { Avatar } from "../Avatar";
import { MessageAttachmentView } from "../chat/MessageAttachmentView";
import { type ThreadItem } from "./groupMessages";

const formatTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

export function DayDivider({ label }: { label: string }): ReactElement {
  return (
    <div className="flex items-center gap-3 px-5 py-3" role="separator">
      <span className="h-px flex-1 bg-white/10" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
        {label}
      </span>
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}

// Fiverr-style flat rows: one avatar and name per run, each message below it,
// all left-aligned. Your own messages are marked by "Me", not by colour.
export function MessageGroup({
  group,
}: {
  group: Extract<ThreadItem, { kind: "group" }>;
}): ReactElement {
  const first = group.messages[0];

  return (
    <article className="flex gap-3 px-5 py-2.5">
      <Avatar
        name={group.sender.name}
        photoUrl={group.sender.profilePhotoUrl}
        size="xs"
      />
      <div className="min-w-0 flex-1">
        <header className="flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-semibold text-white">
            {group.isMine ? "Me" : group.sender.name}
          </p>
          <time
            dateTime={first.createdAt}
            className="shrink-0 text-xs tabular-nums text-white/45"
          >
            {formatTime(first.createdAt)}
          </time>
        </header>

        <div className="mt-1 space-y-2">
          {group.messages.map((message) => {
            const attachment =
              message.messageType !== "text" ? message.attachment : null;
            return (
              <div
                key={message.id}
                className={message.isPending ? "opacity-60" : undefined}
              >
                {attachment ? (
                  <div className="mb-1.5">
                    <MessageAttachmentView
                      messageType={message.messageType}
                      attachment={attachment}
                    />
                  </div>
                ) : null}
                {message.content ? (
                  <p className="max-w-[68ch] whitespace-pre-wrap break-words text-[15px] leading-relaxed text-white/85">
                    {message.content}
                  </p>
                ) : null}
                {message.isPending ? (
                  <p className="mt-0.5 text-[11px] text-white/45">Sending…</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}

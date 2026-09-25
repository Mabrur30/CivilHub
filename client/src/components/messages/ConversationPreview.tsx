import { PaperclipIcon, WaveformIcon } from "@phosphor-icons/react";
import { type ReactElement } from "react";
import { formatDuration } from "../../lib/messageAttachments";
import { type ConversationPreviewMessage } from "./types";

interface ConversationPreviewProps {
  message: ConversationPreviewMessage | null;
  currentUserId: string | undefined;
  /** Two lines in the header dropdown, one in the inbox list. */
  lines?: 1 | 2;
  className?: string;
}

// The last message as a single quiet line: "You:" when it was yours, and an
// icon plus a label for files and voice notes.
export function ConversationPreview({
  message,
  currentUserId,
  lines = 1,
  className = "",
}: ConversationPreviewProps): ReactElement {
  const clamp = lines === 2 ? "line-clamp-2" : "truncate";
  const prefix = message && message.senderId === currentUserId ? "You: " : "";

  if (message?.messageType === "file" || message?.messageType === "audio") {
    const isAudio = message.messageType === "audio";
    const Icon = isAudio ? WaveformIcon : PaperclipIcon;
    const label = isAudio
      ? `Voice message${typeof message.durationSeconds === "number" ? ` (${formatDuration(message.durationSeconds)})` : ""}`
      : (message.attachmentName ?? "Attachment");

    return (
      <p
        className={`flex min-w-0 items-center gap-1.5 text-[13px] text-white/55 ${className}`}
      >
        {prefix ? <span className="shrink-0">{prefix}</span> : null}
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </p>
    );
  }

  return (
    <p className={`${clamp} text-[13px] text-white/55 ${className}`}>
      {message ? `${prefix}${message.content}` : "No messages yet"}
    </p>
  );
}

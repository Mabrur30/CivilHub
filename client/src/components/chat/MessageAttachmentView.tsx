import {
  DownloadSimpleIcon,
  FileCsvIcon,
  FileDocIcon,
  FileIcon,
  FilePdfIcon,
  FileTextIcon,
  FileXlsIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import { type ReactElement } from "react";
import {
  formatBytes,
  formatDuration,
  getFileExtensionLabel,
  type MessageAttachment,
  type MessageType,
} from "../../lib/messageAttachments";

interface MessageAttachmentViewProps {
  messageType: MessageType;
  attachment: MessageAttachment;
}

export const FileTypeIcon = ({
  mimeType,
  className,
}: {
  mimeType: string;
  className: string;
}): ReactElement => {
  if (mimeType === "application/pdf") {
    return <FilePdfIcon className={className} aria-hidden="true" />;
  }
  if (mimeType.includes("word")) {
    return <FileDocIcon className={className} aria-hidden="true" />;
  }
  if (mimeType.includes("excel") || mimeType.includes("spreadsheet")) {
    return <FileXlsIcon className={className} aria-hidden="true" />;
  }
  if (mimeType === "text/csv") {
    return <FileCsvIcon className={className} aria-hidden="true" />;
  }
  if (mimeType === "text/plain") {
    return <FileTextIcon className={className} aria-hidden="true" />;
  }
  return <FileIcon className={className} aria-hidden="true" />;
};

export function MessageAttachmentView({
  messageType,
  attachment,
}: MessageAttachmentViewProps): ReactElement {
  const insetClassName = "border-white/10 bg-void/70";

  if (messageType === "audio") {
    return (
      <div className={`w-72 max-w-full rounded-xl border p-2 ${insetClassName}`}>
        <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] text-white/70">
          <WaveformIcon className="h-4 w-4" aria-hidden="true" />
          <span>Voice message</span>
          {attachment.durationSeconds !== null ? (
            <span className="ml-auto tabular-nums">
              {formatDuration(attachment.durationSeconds)}
            </span>
          ) : null}
        </div>
        <audio
          controls
          preload="metadata"
          src={attachment.url}
          className="h-9 w-full scheme-dark"
        >
          <a href={attachment.url}>Download voice message</a>
        </audio>
      </div>
    );
  }

  if (attachment.mimeType.startsWith("image/")) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noreferrer"
        className={`group block w-72 max-w-full overflow-hidden rounded-xl border ${insetClassName} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white`}
      >
        <img
          src={attachment.url}
          alt={attachment.name}
          loading="lazy"
          // Fixed height so the thread doesn't jump when the image finishes loading.
          className="h-48 w-full object-cover transition-opacity group-hover:opacity-90"
        />
        <span className="flex items-center justify-between gap-3 px-3 py-2 text-[11px] text-white/70">
          <span className="truncate">{attachment.name}</span>
          {attachment.size !== null ? (
            <span className="shrink-0 tabular-nums">
              {formatBytes(attachment.size)}
            </span>
          ) : null}
        </span>
      </a>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      className={`flex w-80 max-w-full items-center gap-3 rounded-xl border p-3 transition-colors hover:border-white/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${insetClassName}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
        <FileTypeIcon mimeType={attachment.mimeType} className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white">
          {attachment.name}
        </span>
        <span className="block text-[11px] text-white/65">
          {getFileExtensionLabel(attachment.name, attachment.mimeType)}
          {attachment.size !== null ? `, ${formatBytes(attachment.size)}` : ""}
        </span>
      </span>
      <DownloadSimpleIcon
        className="h-5 w-5 shrink-0 text-white/75"
        aria-label="Download"
      />
    </a>
  );
}

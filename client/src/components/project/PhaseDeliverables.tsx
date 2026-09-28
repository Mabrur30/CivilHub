import {
  CaretRightIcon,
  DownloadSimpleIcon,
  PackageIcon,
} from "@phosphor-icons/react";
import { type ReactElement } from "react";
import { countOf } from "../../lib/format";
import {
  formatBytes,
  getFileExtensionLabel,
} from "../../lib/messageAttachments";
import { FileTypeIcon } from "../chat/MessageAttachmentView";

export interface DeliverableFile {
  url: string;
  name: string;
  mimeType: string;
  size: number;
  resourceType: "image" | "raw";
}

/** What the engineer handed over when they submitted a phase. */
export interface PhaseSubmission {
  note: string;
  files: DeliverableFile[];
  submittedAt: string;
}

const formatSubmittedDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};

const tileClassName =
  "rounded-xl border border-white/10 bg-void/70 transition-colors hover:border-white/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow";

/** Photos as thumbnails, everything else as a download row. */
export function DeliverableFiles({
  files,
}: {
  files: DeliverableFile[];
}): ReactElement | null {
  if (files.length === 0) return null;
  const images = files.filter((file) => file.mimeType.startsWith("image/"));
  const documents = files.filter((file) => !file.mimeType.startsWith("image/"));

  return (
    <div className="grid gap-2">
      {images.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((file) => (
            <li key={file.url}>
              <a
                href={file.url}
                target="_blank"
                rel="noreferrer"
                className={`group block overflow-hidden ${tileClassName}`}
              >
                <img
                  src={file.url}
                  alt={file.name}
                  loading="lazy"
                  className="aspect-4/3 w-full object-cover transition-opacity group-hover:opacity-90"
                />
                <span className="block truncate px-2.5 py-1.5 text-[11px] text-white/65">
                  {file.name}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {documents.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {documents.map((file) => (
            <li key={file.url}>
              <a
                href={file.url}
                target="_blank"
                rel="noreferrer"
                className={`flex items-center gap-3 p-2.5 ${tileClassName}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
                  <FileTypeIcon mimeType={file.mimeType} className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">
                    {file.name}
                  </span>
                  <span className="block text-[11px] text-white/55">
                    {getFileExtensionLabel(file.name, file.mimeType)},{" "}
                    {formatBytes(file.size)}
                  </span>
                </span>
                <DownloadSimpleIcon
                  className="h-4 w-4 shrink-0 text-white/60"
                  aria-label="Download"
                />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SubmissionBody({
  submission,
}: {
  submission: PhaseSubmission;
}): ReactElement {
  return (
    <div className="grid gap-3">
      <p className="whitespace-pre-line text-sm leading-6 text-white/80">
        {submission.note}
      </p>
      <DeliverableFiles files={submission.files} />
    </div>
  );
}

const summaryClassName =
  "flex cursor-pointer list-none items-center gap-2 rounded text-sm font-semibold text-white/70 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow [&::-webkit-details-marker]:hidden";

function Disclosure({
  label,
  children,
}: {
  label: string;
  children: ReactElement;
}): ReactElement {
  return (
    <details className="group/disclosure">
      <summary className={summaryClassName}>
        <CaretRightIcon
          className="h-3.5 w-3.5 shrink-0 transition-transform group-open/disclosure:rotate-90"
          aria-hidden="true"
        />
        {label}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function EarlierSubmissions({
  submissions,
}: {
  submissions: PhaseSubmission[];
}): ReactElement | null {
  if (submissions.length === 0) return null;
  return (
    <Disclosure label={`Earlier handovers (${submissions.length})`}>
      <ol className="grid gap-4 border-l border-white/10 pl-4">
        {[...submissions].reverse().map((submission) => (
          <li key={submission.submittedAt}>
            <p className="mb-1.5 text-xs text-white/45">
              Sent {formatSubmittedDate(submission.submittedAt)}
            </p>
            <SubmissionBody submission={submission} />
          </li>
        ))}
      </ol>
    </Disclosure>
  );
}

const filesLabel = (submission: PhaseSubmission): string =>
  submission.files.length > 0
    ? ` · ${countOf(submission.files.length, "file", "files")}`
    : "";

/**
 * What the engineer handed over for a phase. Open while the client is
 * deciding, folded away once the phase is done or back in progress.
 */
export function PhaseHandover({
  submissions,
  phaseStatus,
  viewer,
}: {
  submissions: PhaseSubmission[];
  phaseStatus: string;
  viewer: "engineer" | "client" | "other";
}): ReactElement | null {
  const latest = submissions[submissions.length - 1];
  if (!latest) return null;
  const earlier = submissions.slice(0, -1);

  if (phaseStatus === "awaiting_approval") {
    return (
      <section
        aria-label="Handover"
        className="mt-4 grid gap-3 rounded-xl border border-violet-300/25 bg-violet-300/5 p-4"
      >
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-violet-100">
          <PackageIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {viewer === "client"
            ? "Handed over for your review"
            : "Handed over to the client"}
          <span className="font-normal text-white/50">
            {formatSubmittedDate(latest.submittedAt)}
          </span>
        </p>
        <SubmissionBody submission={latest} />
        <EarlierSubmissions submissions={earlier} />
      </section>
    );
  }

  const label =
    phaseStatus === "completed"
      ? `Delivered ${formatSubmittedDate(latest.submittedAt)}${filesLabel(latest)}`
      : `Last handover, ${formatSubmittedDate(latest.submittedAt)}${filesLabel(latest)}`;

  return (
    <div className="mt-4 rounded-xl border border-white/10 px-4 py-3">
      <Disclosure label={label}>
        <div className="grid gap-4">
          <SubmissionBody submission={latest} />
          <EarlierSubmissions submissions={earlier} />
        </div>
      </Disclosure>
    </div>
  );
}

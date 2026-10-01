import { PackageIcon } from "@phosphor-icons/react";
import { type ReactElement, useState } from "react";
import {
  inputClassName,
  panelClassName,
  primaryButtonClassName,
} from "../dashboard/ui/buttonStyles";
import { DeliverableFiles, type PhaseSubmission } from "./PhaseDeliverables";
import { API_BASE_URL } from "../../lib/apiBase";

const REPLY_LIMIT = 500;

export interface ProjectReview {
  id: string;
  rating: number;
  reviewText: string;
  engineerReply: string | null;
  engineerRepliedAt: string | null;
  createdAt: string;
}

interface HandoverPhase {
  id: string;
  name: string;
  order: number;
  description: string;
  submissions: PhaseSubmission[];
}

const formatLongDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};

/** Every phase's scope and final handover, in one place once the project ends. */
export function ProjectHandover({
  phases,
}: {
  phases: HandoverPhase[];
}): ReactElement {
  const fileCount = phases.reduce(
    (sum, phase) => sum + (phase.submissions.at(-1)?.files.length ?? 0),
    0,
  );

  return (
    <section className={`${panelClassName} p-6 sm:p-8`} aria-labelledby="handover-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="handover-heading" className="font-heading text-2xl font-bold text-white">
          Handover
        </h2>
        <p className="text-sm text-white/50">
          {fileCount === 0
            ? "No files were attached"
            : `${fileCount} ${fileCount === 1 ? "file" : "files"} delivered`}
        </p>
      </div>
      <p className="mt-2 max-w-[65ch] text-sm leading-6 text-white/60">
        What was agreed for each phase and what was handed over when it was approved.
      </p>

      <ol className="mt-6 divide-y divide-white/10 rounded-xl border border-white/10">
        {phases.map((phase) => {
          const final = phase.submissions.at(-1);
          return (
            <li key={phase.id} className="grid gap-4 px-4 py-5 sm:px-5">
              <div>
                <p className="text-xs text-white/45">Phase {phase.order + 1}</p>
                <h3 className="mt-0.5 font-semibold text-white">{phase.name}</h3>
              </div>
              {phase.description ? (
                <div>
                  <p className="text-xs font-semibold text-white/45">Scope</p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-6 text-white/65">
                    {phase.description}
                  </p>
                </div>
              ) : null}
              {final ? (
                <div className="grid gap-3">
                  <p className="flex items-center gap-2 text-xs font-semibold text-white/45">
                    <PackageIcon className="h-4 w-4" aria-hidden="true" />
                    Handed over {formatLongDate(final.submittedAt)}
                  </p>
                  <p className="whitespace-pre-line text-sm leading-6 text-white/80">
                    {final.note}
                  </p>
                  <DeliverableFiles files={final.files} />
                </div>
              ) : (
                <p className="text-sm text-white/45">
                  Approved before handovers were recorded.
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Stars({ rating }: { rating: number }): ReactElement {
  return (
    <p className="flex gap-0.5 text-lg text-amber-300" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} aria-hidden="true" className={index < rating ? "" : "text-white/15"}>
          ★
        </span>
      ))}
    </p>
  );
}

/** The engineer's or company's side of the closing review: read it and reply. */
export function ProviderReviewCard({
  review,
  clientName,
  onReplied,
}: {
  review: ProjectReview | null;
  clientName: string;
  onReplied: (review: ProjectReview) => void;
}): ReactElement {
  const [reply, setReply] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isSending, setIsSending] = useState<boolean>(false);

  if (!review) {
    return (
      <section className={`${panelClassName} p-6 sm:p-8`}>
        <h2 className="font-heading text-2xl font-bold text-white">Client review</h2>
        <p className="mt-2 max-w-[60ch] text-sm leading-6 text-white/60">
          {clientName} hasn't reviewed this project yet. We've asked them to, and
          you'll get a notification when they do.
        </p>
      </section>
    );
  }

  const sendReply = async (): Promise<void> => {
    if (!reply.trim()) {
      setError("Write a reply before sending.");
      return;
    }
    setIsSending(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/reviews/${review.id}/reply`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: reply.trim() }),
      });
      const body = (await response.json()) as { message?: string; review?: ProjectReview };
      if (!response.ok || !body.review) {
        setError(body.message ?? "Unable to send your reply.");
        return;
      }
      onReplied({ ...review, engineerReply: body.review.engineerReply, engineerRepliedAt: body.review.engineerRepliedAt });
      setReply("");
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className={`${panelClassName} p-6 sm:p-8`}>
      <h2 className="font-heading text-2xl font-bold text-white">
        {clientName}'s review
      </h2>
      <div className="mt-3">
        <Stars rating={review.rating} />
      </div>
      <p className="mt-3 max-w-[65ch] whitespace-pre-line text-sm leading-6 text-white/75">
        {review.reviewText}
      </p>
      <p className="mt-3 text-xs text-white/40">Left {formatLongDate(review.createdAt)}</p>

      {review.engineerReply ? (
        <div className="mt-5 border-l-2 border-primary/50 pl-4">
          <p className="text-xs font-semibold text-white/55">
            Your reply
            {review.engineerRepliedAt ? `, ${formatLongDate(review.engineerRepliedAt)}` : ""}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm leading-6 text-white/75">
            {review.engineerReply}
          </p>
        </div>
      ) : (
        <form
          className="mt-6 grid gap-2 border-t border-white/10 pt-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void sendReply();
          }}
        >
          <label htmlFor="review-reply" className="text-sm font-semibold text-white/80">
            Reply publicly
          </label>
          <textarea
            id="review-reply"
            rows={3}
            value={reply}
            maxLength={REPLY_LIMIT}
            onChange={(event) => {
              setReply(event.target.value);
              setError("");
            }}
            aria-describedby="review-reply-hint"
            className={`${inputClassName} resize-y`}
          />
          <p id="review-reply-hint" className="flex justify-between gap-4 text-xs text-white/45">
            <span>Your reply shows under the review on your profile.</span>
            <span className="tabular-nums">
              {reply.length}/{REPLY_LIMIT}
            </span>
          </p>
          {error ? (
            <p role="alert" className="text-sm text-rose-300">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={isSending} className={`${primaryButtonClassName} mt-2`}>
            {isSending ? "Sending..." : "Send reply"}
          </button>
        </form>
      )}
    </section>
  );
}

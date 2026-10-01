import { type ReactElement, useState } from "react";
import {
  inputClassName,
  panelClassName,
  primaryButtonClassName,
} from "../../dashboard/ui/buttonStyles";
import { type CustomerReview, isCustomerReview } from "./profileTypes";
import { API_BASE_URL } from "../../../lib/apiBase";

const TEXT_LIMIT = 1000;

const formatLongDate = (value: string): string =>
  new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/**
 * A provider rating the person they worked for: the client after a project,
 * or the renter after a rental. Shows the review once it's written.
 */
export function CustomerReviewForm({
  target,
  subjectName,
  subjectKind,
  existing,
  onSaved,
}: {
  target: { projectId: string } | { bookingId: string };
  subjectName: string;
  subjectKind: "client" | "renter";
  existing: CustomerReview | null;
  onSaved: (review: CustomerReview) => void;
}): ReactElement {
  const [rating, setRating] = useState<number>(0);
  const [text, setText] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isSending, setIsSending] = useState<boolean>(false);
  const fieldId = "projectId" in target ? `customer-review-${target.projectId}` : `customer-review-${target.bookingId}`;

  if (existing) {
    return (
      <section className={`${panelClassName} p-6 sm:p-8`}>
        <h2 className="font-heading text-2xl font-bold text-white">
          Your review of {subjectName}
        </h2>
        <p className="mt-3 flex gap-0.5 text-lg text-amber-300" aria-label={`${existing.rating} out of 5 stars`}>
          {Array.from({ length: 5 }, (_, index) => (
            <span key={index} aria-hidden="true" className={index < existing.rating ? "" : "text-white/15"}>
              ★
            </span>
          ))}
        </p>
        <p className="mt-3 max-w-[65ch] whitespace-pre-line text-sm leading-6 text-white/75">
          {existing.reviewText}
        </p>
        <p className="mt-3 text-xs text-white/40">
          Left {formatLongDate(existing.createdAt)} · shown on their profile
        </p>
      </section>
    );
  }

  const send = async (): Promise<void> => {
    if (rating === 0 || !text.trim()) {
      setError("Choose a rating and write a few words before sending.");
      return;
    }
    setIsSending(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/reviews/customer`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...target, rating, reviewText: text.trim() }),
      });
      const body = (await response.json()) as { message?: string; review?: unknown };
      if (!response.ok || !isCustomerReview(body.review)) {
        setError(body.message ?? "Unable to send your review.");
        return;
      }
      onSaved(body.review);
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className={`${panelClassName} p-6 sm:p-8`}>
      <h2 className="font-heading text-2xl font-bold text-white">
        How was {subjectName} as a {subjectKind}?
      </h2>
      <p className="mt-2 max-w-[60ch] text-sm leading-6 text-white/60">
        {subjectKind === "client"
          ? "Clear briefs, quick approvals, paying on time. Your review shows on their profile and helps other engineers decide."
          : "Care of the machine, returning on time, communication. Your review shows on their profile and helps other owners decide."}
      </p>
      <form
        className="mt-5 grid gap-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <fieldset>
          <legend className="text-sm font-semibold text-white/80">Rating</legend>
          <div className="mt-2 flex gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                aria-label={`${value} star${value === 1 ? "" : "s"}`}
                aria-pressed={value === rating}
                onClick={() => {
                  setRating(value);
                  setError("");
                }}
                className={`rounded text-3xl leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow ${value <= rating ? "text-amber-300" : "text-white/20 hover:text-amber-200/70"}`}
              >
                ★
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-2">
          <label htmlFor={fieldId} className="text-sm font-semibold text-white/80">
            Your review
          </label>
          <textarea
            id={fieldId}
            rows={4}
            value={text}
            maxLength={TEXT_LIMIT}
            onChange={(event) => {
              setText(event.target.value);
              setError("");
            }}
            className={`${inputClassName} resize-none`}
          />
          <p className="text-right text-xs tabular-nums text-white/45">
            {text.length}/{TEXT_LIMIT}
          </p>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={isSending} className={primaryButtonClassName}>
          {isSending ? "Sending..." : "Send review"}
        </button>
      </form>
    </section>
  );
}

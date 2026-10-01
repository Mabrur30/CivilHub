import { type ReactElement, useState } from "react";
import { formatDate } from "../../../lib/format";
import { Avatar } from "../../Avatar";
import {
  inputClassName,
  panelClassName,
  primaryButtonBaseClassName,
  rowButtonClassName,
} from "../../dashboard/ui/buttonStyles";
import {
  type CustomerReview,
  type CustomerReviewsResponse,
  type ProviderReview,
  type ProviderReviewsResponse,
} from "./profileTypes";
import { API_BASE_URL } from "../../../lib/apiBase";

const REPLY_LIMIT = 500;

type TabKey = "project" | "equipment" | "customer";

interface ReviewItem {
  id: string;
  rating: number;
  reviewText: string;
  createdAt: string;
  person: { name: string; photoUrl: string | null };
  /** "Client", "Rented CAT 320", "Engineer · Duplex in Mirpur". */
  context: string;
  reply: string | null;
  /** Provider reviews can be replied to by the provider. */
  replyable: boolean;
}

const roleLabel = (role: string): string =>
  role === "organisation" ? "Company" : role === "client" ? "Client" : "Engineer";

const fromProvider = (review: ProviderReview): ReviewItem => ({
  id: review.id,
  rating: review.rating,
  reviewText: review.reviewText,
  createdAt: review.createdAt,
  person: { name: review.client.name, photoUrl: review.client.profilePhotoUrl },
  context:
    review.kind === "equipment"
      ? `Rented ${review.equipmentTitle ?? "equipment"}`
      : "Project client",
  reply: review.engineerReply,
  replyable: true,
});

const fromCustomer = (review: CustomerReview): ReviewItem => ({
  id: review.id,
  rating: review.rating,
  reviewText: review.reviewText,
  createdAt: review.createdAt,
  person: { name: review.author.name, photoUrl: review.author.profilePhotoUrl },
  context: `${roleLabel(review.author.role)} · ${review.context === "rental" ? `rented out ${review.title}` : review.title}`,
  reply: null,
  replyable: false,
});

function Stars({ rating }: { rating: number }): ReactElement {
  return (
    <span className="shrink-0 text-sm tracking-wide text-amber-300" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} aria-hidden="true" className={index < rating ? "" : "text-white/15"}>
          ★
        </span>
      ))}
    </span>
  );
}

function Breakdown({ items }: { items: ReviewItem[] }): ReactElement {
  const average = items.reduce((sum, item) => sum + item.rating, 0) / items.length;
  return (
    <div className="grid gap-4 rounded-xl border border-white/10 bg-void/40 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-6">
      <div>
        <p className="font-heading text-4xl font-bold tabular-nums text-white">{average.toFixed(1)}</p>
        <p className="text-xs text-white/50">
          {items.length} {items.length === 1 ? "review" : "reviews"}
        </p>
      </div>
      <div className="grid gap-1.5">
        {[5, 4, 3, 2, 1].map((stars) => {
          const count = items.filter((item) => item.rating === stars).length;
          return (
            <div key={stars} className="grid grid-cols-[28px_1fr_28px] items-center gap-2">
              <span className="text-xs text-white/60">{stars}★</span>
              <div className="h-1.5 rounded-full bg-white/10">
                <div
                  className="h-1.5 rounded-full bg-primary"
                  style={{ width: `${(count / items.length) * 100}%` }}
                />
              </div>
              <span className="text-right text-xs tabular-nums text-white/55">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReplyBox({
  reviewId,
  onReplied,
}: {
  reviewId: string;
  onReplied: (reviewId: string, reply: string) => void;
}): ReactElement {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [text, setText] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isSending, setIsSending] = useState<boolean>(false);

  if (!isOpen) {
    return (
      <button type="button" onClick={() => setIsOpen(true)} className={`${rowButtonClassName} mt-3`}>
        Reply
      </button>
    );
  }

  const send = async (): Promise<void> => {
    if (!text.trim()) {
      setError("Write a reply before sending.");
      return;
    }
    setIsSending(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/reviews/${reviewId}/reply`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: text.trim() }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        setError(body.message ?? "Unable to send your reply.");
        return;
      }
      onReplied(reviewId, text.trim());
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const fieldId = `reply-${reviewId}`;
  return (
    <form
      className="mt-3 grid gap-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <label htmlFor={fieldId} className="sr-only">
        Your reply
      </label>
      <textarea
        id={fieldId}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setError("");
        }}
        maxLength={REPLY_LIMIT}
        rows={3}
        placeholder="Thank them, or add context. Your reply is public."
        className={`${inputClassName} resize-y`}
      />
      {error ? (
        <p role="alert" className="text-xs text-rose-300">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setIsOpen(false)} disabled={isSending} className={rowButtonClassName}>
          Cancel
        </button>
        <button type="submit" disabled={isSending} className={`${primaryButtonBaseClassName} px-4 py-2`}>
          {isSending ? "Sending..." : "Send reply"}
        </button>
      </div>
    </form>
  );
}

/**
 * Reviews on a profile, split by what they were for: project work, equipment
 * rentals, and what providers said about this person as a customer.
 */
export function ProfileReviews({
  providerReviews,
  customerReviews,
  customerLabel,
  isLoading,
  error,
  canReply,
  onReplied,
  emptyText,
}: {
  providerReviews: ProviderReviewsResponse | null;
  customerReviews: CustomerReviewsResponse | null;
  /** The tab for reviews of this person as a customer, e.g. "As a client". */
  customerLabel: string;
  isLoading: boolean;
  error: string;
  canReply: boolean;
  onReplied: (reviewId: string, reply: string) => void;
  emptyText: string;
}): ReactElement {
  const tabs: Array<{ key: TabKey; label: string; items: ReviewItem[] }> = [
    {
      key: "project" as const,
      label: "Projects",
      items: (providerReviews?.reviews ?? []).filter((review) => review.kind === "project").map(fromProvider),
    },
    {
      key: "equipment" as const,
      label: "Equipment rentals",
      items: (providerReviews?.reviews ?? []).filter((review) => review.kind === "equipment").map(fromProvider),
    },
    {
      key: "customer" as const,
      label: customerLabel,
      items: (customerReviews?.reviews ?? []).map(fromCustomer),
    },
  ].filter((tab) => tab.items.length > 0);

  const [chosen, setChosen] = useState<TabKey | null>(null);
  const active = tabs.find((tab) => tab.key === chosen) ?? tabs[0];

  return (
    <section className={`${panelClassName} p-6`} aria-labelledby="profile-reviews-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="profile-reviews-heading" className="font-heading text-2xl font-bold text-white">
          Reviews
        </h2>
        {tabs.length > 1 ? (
          <div className="flex flex-wrap gap-1 rounded-full border border-white/10 p-1" role="group" aria-label="Show reviews for">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                aria-pressed={tab.key === active?.key}
                onClick={() => setChosen(tab.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow ${
                  tab.key === active?.key ? "bg-primary text-on-primary" : "text-white/65 hover:text-white"
                }`}
              >
                {tab.label} ({tab.items.length})
              </button>
            ))}
          </div>
        ) : active ? (
          <p className="text-sm text-white/50">{active.label}</p>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 text-sm text-rose-200">{error}</p>
      ) : isLoading ? (
        <p className="mt-4 text-sm text-white/50">Loading reviews...</p>
      ) : !active ? (
        <p className="mt-4 text-sm text-white/55">{emptyText}</p>
      ) : (
        <div className="mt-5 grid gap-4">
          <Breakdown items={active.items} />
          <ul className="grid gap-3">
            {active.items.map((item) => (
              <li key={item.id} className="rounded-xl border border-white/10 bg-void/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={item.person.name} photoUrl={item.person.photoUrl} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{item.person.name}</p>
                      <p className="truncate text-xs text-white/45">
                        {item.context} · {formatDate(item.createdAt)}
                      </p>
                    </div>
                  </div>
                  <Stars rating={item.rating} />
                </div>
                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-white/75">{item.reviewText}</p>
                {item.reply ? (
                  <div className="mt-3 border-l-2 border-primary/50 pl-4">
                    <p className="text-xs font-semibold text-white/55">Reply</p>
                    <p className="mt-1 whitespace-pre-line text-sm leading-6 text-white/65">{item.reply}</p>
                  </div>
                ) : item.replyable && canReply ? (
                  <ReplyBox reviewId={item.id} onReplied={onReplied} />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

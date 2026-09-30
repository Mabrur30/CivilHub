import { StarIcon } from "@phosphor-icons/react";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorNote, Loading, PageHeader, Pager, ReasonDialog, panel, secondaryButton } from "../components/ui";
import { type ListingRow, type Paged, type ReviewRow, adminApi } from "../lib/api";
import { formatDate, formatTaka } from "../lib/format";

type Tab = "provider" | "customer" | "listings";

const TABS: Array<{ value: Tab; label: string }> = [
  { value: "provider", label: "Reviews of providers" },
  { value: "customer", label: "Reviews of clients" },
  { value: "listings", label: "Equipment listings" },
];

type PendingAction =
  | { kind: "review"; row: ReviewRow; part: "review" | "reply" }
  | { kind: "pause" | "unpause"; row: ListingRow };

function Stars({ rating }: { rating: number }): ReactElement {
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-300" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <StarIcon key={index} weight={index < rating ? "fill" : "regular"} className="h-3.5 w-3.5" aria-hidden="true" />
      ))}
    </span>
  );
}

/** Reviews and equipment listings, to take down what breaks the rules. */
export function ContentPage(): ReactElement {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((item) => item.value === params.get("tab"))?.value ?? "provider";
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const page = Number(params.get("page") ?? "1") || 1;
  const [draft, setDraft] = useState<string>(q);
  const [reviews, setReviews] = useState<Paged<ReviewRow> | null>(null);
  const [listings, setListings] = useState<Paged<ListingRow> | null>(null);
  const [error, setError] = useState<string>("");
  const [pending, setPending] = useState<PendingAction | null>(null);

  const load = useCallback((): (() => void) => {
    let isActive = true;
    setError("");
    const query = new URLSearchParams({ q, page: String(page) });
    const request =
      tab === "listings"
        ? adminApi<Paged<ListingRow>>(`/content/listings?${query.toString()}&status=${status}`).then((body) => {
            if (isActive) setListings(body);
          })
        : adminApi<Paged<ReviewRow>>(`/content/reviews?${query.toString()}&kind=${tab}`).then((body) => {
            if (isActive) setReviews(body);
          });
    request.catch((caught: unknown) => {
      if (isActive) setError(caught instanceof Error ? caught.message : "Couldn't load content.");
    });
    return () => {
      isActive = false;
    };
  }, [tab, q, status, page]);

  useEffect(() => {
    setReviews(null);
    setListings(null);
    return load();
  }, [load]);

  const update = (changes: Record<string, string>): void => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!("page" in changes)) next.delete("page");
    setParams(next);
  };

  const data = tab === "listings" ? listings : reviews;

  return (
    <>
      <PageHeader
        title="Content"
        intro="Remove reviews (or a provider's reply) that break the rules, and pause equipment listings. The author or owner is told why, and the removed text stays in the action log."
      />
      <div role="tablist" aria-label="Content type" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={tab === item.value}
            onClick={() => {
              setDraft("");
              setParams(item.value === "provider" ? {} : { tab: item.value });
            }}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              tab === item.value ? "bg-primary/15 text-primary" : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          update({ q: draft.trim() });
        }}
      >
        <label htmlFor="content-search" className="sr-only">
          Search
        </label>
        <input
          id="content-search"
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={tab === "listings" ? "Listing title or owner name" : "Name of the author or the person reviewed"}
          className="form-input max-w-xs"
        />
        {tab === "listings" ? (
          <>
            <label htmlFor="listing-status" className="sr-only">
              Status
            </label>
            <select id="listing-status" value={status} onChange={(event) => update({ status: event.target.value })} className="form-input w-auto">
              <option value="">All listings</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="held">Paused by CivilHub</option>
            </select>
          </>
        ) : null}
        <button type="submit" className={secondaryButton}>
          Search
        </button>
      </form>

      <ErrorNote message={error} />
      {!data && !error ? <Loading /> : null}
      {data && data.items.length === 0 ? <p className={`${panel} p-6 text-sm text-white/60`}>Nothing matches.</p> : null}

      {tab !== "listings" && reviews && reviews.items.length > 0 ? (
        <ul className="grid gap-3">
          {reviews.items.map((row) => (
            <li key={row.id} className={`${panel} p-5`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <p className="text-white/70">
                  {row.author ? (
                    <Link to={`/users/${row.author.id}`} className="font-semibold text-white hover:text-primary">
                      {row.author.name}
                    </Link>
                  ) : (
                    "Deleted account"
                  )}{" "}
                  on{" "}
                  {row.subject ? (
                    <Link to={`/users/${row.subject.id}`} className="font-semibold text-white hover:text-primary">
                      {row.subject.name}
                    </Link>
                  ) : (
                    "a deleted account"
                  )}
                </p>
                <p className="flex items-center gap-2 text-xs text-white/50">
                  <Stars rating={row.rating} />
                  {formatDate(row.createdAt)}
                  {row.about ? ` · ${row.about}` : ""}
                </p>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-white/80">{row.text}</p>
              {row.reply ? (
                <p className="mt-2 rounded-xl bg-void/40 p-3 text-sm text-white/70">
                  <span className="block text-xs text-white/45">Reply from {row.subject?.name ?? "the provider"}</span>
                  {row.reply}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={secondaryButton} onClick={() => setPending({ kind: "review", row, part: "review" })}>
                  Remove review
                </button>
                {row.reply ? (
                  <button type="button" className={secondaryButton} onClick={() => setPending({ kind: "review", row, part: "reply" })}>
                    Remove reply only
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === "listings" && listings && listings.items.length > 0 ? (
        <ul className={`${panel} divide-y divide-white/5`}>
          {listings.items.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-4 p-4">
              {row.photoUrl ? (
                <img src={row.photoUrl} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover" loading="lazy" />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white">{row.title}</p>
                <p className="text-xs text-white/50">
                  {row.category} · {row.location} · {formatTaka(row.dailyRate)}/day ·{" "}
                  {row.owner ? (
                    <Link to={`/users/${row.owner.id}`} className="text-primary hover:text-glow">
                      {row.owner.name}
                    </Link>
                  ) : (
                    "Deleted account"
                  )}
                </p>
                {row.adminHold ? (
                  <p className="mt-1 text-xs text-amber-200/80">
                    Paused by CivilHub {formatDate(row.adminHold.at)}: {row.adminHold.reason}
                  </p>
                ) : row.status === "paused" ? (
                  <p className="mt-1 text-xs text-white/45">Paused by the owner</p>
                ) : null}
              </div>
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setPending({ kind: row.adminHold ? "unpause" : "pause", row })}
              >
                {row.adminHold ? "Reopen" : "Pause listing"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {data ? (
        <Pager page={data.page} pageSize={data.pageSize} total={data.total} onChange={(next) => update({ page: String(next) })} />
      ) : null}

      {pending?.kind === "review" ? (
        <ReasonDialog
          title={pending.part === "reply" ? "Remove this reply?" : "Remove this review?"}
          description={
            pending.part === "reply"
              ? "The review stays; the provider's reply goes. The provider is told why."
              : "It disappears from profiles and ratings, and its author is told why. They can write a new one within the rules."
          }
          confirmLabel={pending.part === "reply" ? "Remove reply" : "Remove review"}
          danger
          onConfirm={async ({ reason }) => {
            await adminApi(`/content/reviews/${pending.row.kind}/${pending.row.id}/remove`, {
              method: "POST",
              body: { reason, part: pending.part },
            });
            setPending(null);
            load();
          }}
          onClose={() => setPending(null)}
        />
      ) : null}
      {pending?.kind === "pause" || pending?.kind === "unpause" ? (
        <ReasonDialog
          title={pending.kind === "pause" ? `Pause ${pending.row.title}?` : `Reopen ${pending.row.title}?`}
          description={
            pending.kind === "pause"
              ? "It leaves search and can't be booked; bookings already made carry on. The owner is told why and can't reopen it themselves."
              : "It shows in search and can be booked again. The owner is told."
          }
          confirmLabel={pending.kind === "pause" ? "Pause listing" : "Reopen"}
          danger={pending.kind === "pause"}
          onConfirm={async ({ reason }) => {
            await adminApi(`/content/listings/${pending.row.id}/${pending.kind}`, { method: "POST", body: { reason } });
            setPending(null);
            load();
          }}
          onClose={() => setPending(null)}
        />
      ) : null}
    </>
  );
}

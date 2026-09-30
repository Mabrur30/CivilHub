import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { type ReactElement, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../Avatar";
import { type PersonResult } from "./types";
import { VerifiedBadge } from "../VerifiedBadge";

export type PersonStatus = "self" | "connected" | "received" | "sent" | "none";

const chipClassName =
  "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold";

/** People You May Know, which expands into search across engineers and companies. */
export function SuggestionsPanel({
  people,
  expanded,
  onToggleExpanded,
  searchQuery,
  onSearchQueryChange,
  isLoading,
  error,
  emptyMessage,
  statusOf,
  activeUserId,
  onConnect,
  pager,
}: {
  /** The suggestions, or the search results when expanded with a query. */
  people: PersonResult[];
  expanded: boolean;
  onToggleExpanded: () => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  isLoading: boolean;
  error: string;
  emptyMessage: string | null;
  statusOf: (userId: string) => PersonStatus;
  activeUserId: string | null;
  onConnect: (userId: string) => void;
  /** Present when search results run to more than one page. */
  pager: { page: number; totalPages: number; onPageChange: (page: number) => void } | null;
}): ReactElement {
  const renderAction = (person: PersonResult): ReactNode => {
    switch (statusOf(person.id)) {
      case "connected":
        return (
          <span className={`${chipClassName} border-white/15 bg-white/5 text-white/70`}>
            Connected
          </span>
        );
      case "self":
        return (
          <span className={`${chipClassName} border-white/20 text-white/60`}>You</span>
        );
      case "received":
        return (
          <span className={`${chipClassName} border-violet-300/30 bg-violet-300/10 text-violet-200`}>
            Request received
          </span>
        );
      case "sent":
        return (
          <span className={`${chipClassName} border-violet-300/30 bg-violet-300/10 text-violet-200`}>
            Request sent
          </span>
        );
      default:
        return (
          <button
            type="button"
            onClick={() => onConnect(person.id)}
            disabled={activeUserId === person.id}
            aria-label={`Connect with ${person.name}`}
            className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-on-primary transition-colors duration-200 hover:bg-glow disabled:opacity-60"
          >
            {activeUserId === person.id ? "Sending..." : "Connect"}
          </button>
        );
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-surface p-5 transition-all duration-200 hover:border-primary/25">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-xl font-bold text-white">
          People You May Know
        </h3>
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          className="text-xs font-semibold text-primary transition-colors duration-200 hover:text-glow"
        >
          {expanded ? "Collapse" : "See more"}
        </button>
      </div>

      {expanded ? (
        <div className="relative mt-3">
          <MagnifyingGlassIcon
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search by name or bio"
            aria-label="Search engineers and companies"
            className="form-input py-2.5! pl-10! pr-10! text-sm"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => onSearchQueryChange("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-white/45 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-glow"
            >
              <XIcon aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <p className="mt-3 text-sm text-white/50">
          {expanded && searchQuery ? "Searching..." : "Loading suggestions..."}
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-rose-300" role="alert">
          {error}
        </p>
      ) : null}

      {!isLoading ? (
        <div
          className={`mt-4 space-y-2 overflow-y-auto pr-1 ${
            expanded ? "max-h-[860px]" : "max-h-[420px]"
          }`}
        >
          {people.map((person) => (
            <article
              key={person.id}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-void/45 p-3"
            >
              <Link
                to={`/profile/${person.id}`}
                className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow"
              >
                <Avatar
                  name={person.name}
                  photoUrl={person.profilePhotoUrl}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="flex min-w-0 items-center gap-1 text-sm font-semibold text-white transition-colors duration-200 group-hover:text-primary">
                    <span className="truncate">{person.name}</span>
                    {person.verified ? <VerifiedBadge compact /> : null}
                  </p>
                  <p className="truncate text-[11px] text-white/50">
                    {person.bio || "No bio provided"}
                  </p>
                </div>
              </Link>
              {renderAction(person)}
            </article>
          ))}

          {pager ? (
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-void/45 p-3 text-xs text-white/65">
              <span>
                Page {pager.page} of {pager.totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => pager.onPageChange(Math.max(1, pager.page - 1))}
                  disabled={pager.page <= 1}
                  className="rounded-full border border-white/20 px-3 py-1 transition-colors duration-200 hover:border-primary disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => pager.onPageChange(Math.min(pager.totalPages, pager.page + 1))}
                  disabled={pager.page >= pager.totalPages}
                  className="rounded-full border border-white/20 px-3 py-1 transition-colors duration-200 hover:border-primary disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}

          {emptyMessage ? (
            <p className="rounded-xl border border-dashed border-white/15 p-4 text-center text-sm text-white/50">
              {emptyMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

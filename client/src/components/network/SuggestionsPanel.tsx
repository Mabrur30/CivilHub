import { type ReactElement } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../Avatar";
import { type PersonResult } from "./types";

export type PersonStatus = "self" | "connected" | "received" | "sent" | "none";

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
        <div className="mt-3 space-y-3">
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search by name or bio"
            aria-label="Search engineers and companies"
            className="form-input"
          />
        </div>
      ) : null}

      {isLoading ? (
        <p className="mt-3 text-sm text-white/50">
          Loading suggestions...
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-rose-300" role="alert">
          {error}
        </p>
      ) : null}

      {!isLoading ? (
        <div
          className={`mt-4 space-y-3 overflow-y-auto pr-1 ${
            expanded ? "max-h-[860px]" : "max-h-[420px]"
          }`}
        >
          {people.map(
            (person) => {
              const status = statusOf(person.id);

              return (
                <article
                  key={person.id}
                  className="rounded-xl border border-white/10 bg-void/45 p-3"
                >
                  <div className="flex items-center gap-3">
                    <Avatar
                      name={person.name}
                      photoUrl={person.profilePhotoUrl}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">
                        {person.name}
                      </p>
                      <p className="truncate text-[11px] text-white/50">
                        {person.bio || "No bio provided"}
                      </p>
                    </div>
                    <Link
                      to={`/profile/${person.id}`}
                      className="text-[11px] font-semibold text-primary transition-colors duration-200 hover:text-glow"
                    >
                      View
                    </Link>
                  </div>
                  <div className="mt-3">
                    {status === "connected" ? (
                      <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/70">
                        Connected
                      </span>
                    ) : status === "self" ? (
                      <span className="rounded-full border border-white/20 px-2.5 py-1 text-[11px] font-semibold text-white/60">
                        You
                      </span>
                    ) : status === "received" ? (
                      <span className="rounded-full border border-violet-300/30 bg-violet-300/10 px-2.5 py-1 text-[11px] font-semibold text-violet-200">
                        Request received
                      </span>
                    ) : status === "sent" ? (
                      <span className="rounded-full border border-violet-300/30 bg-violet-300/10 px-2.5 py-1 text-[11px] font-semibold text-violet-200">
                        Request sent
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onConnect(person.id)}
                        disabled={activeUserId === person.id}
                        className="rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-on-primary transition-colors duration-200 hover:bg-glow disabled:opacity-60"
                      >
                        {activeUserId === person.id
                          ? "Sending..."
                          : "Connect"}
                      </button>
                    )}
                  </div>
                </article>
              );
            },
          )}

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
      <p className="text-sm text-white/50">{emptyMessage}</p>
    ) : null}

      
        </div>
      ) : null}
    </section>
  );
}

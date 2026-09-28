import { type ReactElement } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../Avatar";
import { RatingBadge } from "../RatingBadge";
import { isProviderRole } from "../../lib/dashboardPaths";
import { type ConnectionUser } from "./types";

/** The people you're connected to, a page at a time, with Message and Remove. */
export function ConnectionsPanel({
  connections,
  isLoading,
  expanded,
  onToggleExpanded,
  hasMore,
  isLoadingMore,
  onLoadMore,
  activeConnectionId,
  onRemove,
}: {
  connections: ConnectionUser[];
  isLoading: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  activeConnectionId: string | null;
  onRemove: (connectionId: string, name: string) => void;
}): ReactElement {
  return (
    <section className="rounded-2xl border border-white/10 bg-surface p-5 transition-all duration-200 hover:border-primary/25">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-xl font-bold text-white">
          Your Connections
        </h3>
        {connections.length > 4 || hasMore ? (
          <button
            type="button"
            onClick={onToggleExpanded}
            aria-expanded={expanded}
            className="text-xs font-semibold text-primary transition-colors duration-200 hover:text-glow"
          >
            {expanded ? "Show less" : "View all"}
          </button>
        ) : null}
      </div>

      {isLoading ? (
        <p className="mt-3 text-sm text-white/50">
          Loading connections...
        </p>
      ) : connections.length === 0 ? (
        <p className="mt-3 text-sm text-white/50">
          No accepted connections yet.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {(expanded
            ? connections
            : connections.slice(0, 4)
          ).map((connection) => (
            <article
              key={connection.userId}
              className="rounded-xl border border-white/10 bg-void/45 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Avatar
                    name={connection.name}
                    photoUrl={connection.profilePhotoUrl}
                    size="sm"
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-white">
                        {connection.name}
                      </p>
                      {isProviderRole(connection.role) && (
                        <RatingBadge
                          rating={connection.rating ?? null}
                          reviewCount={connection.reviewCount ?? 0}
                          size="sm"
                        />
                      )}
                    </div>
                    <p className="text-[11px] capitalize text-white/45">
                      {connection.role}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Link
                    to={`/messages/${connection.userId}`}
                    className="rounded-full border border-primary px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors duration-200 hover:bg-primary hover:text-on-primary"
                    aria-label={`Message ${connection.name}`}
                  >
                    Message
                  </Link>
                  {connection.connectionId ? (
                    <button
                      type="button"
                      onClick={() => onRemove(connection.connectionId as string, connection.name)}
                      disabled={activeConnectionId === connection.connectionId}
                      aria-label={`Remove ${connection.name} from your connections`}
                      className="rounded-full px-2 py-1 text-[11px] font-semibold text-white/45 transition-colors hover:text-rose-300 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
          {expanded && hasMore ? (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="w-full rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-white/70 transition-colors hover:border-white/35 hover:text-white disabled:opacity-50"
            >
              {isLoadingMore ? "Loading…" : "Load more connections"}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

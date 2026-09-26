import { type ReactElement, type Ref } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../Avatar";
import { type NetworkUser } from "./types";

/** Requests waiting for you, with Accept and Decline. */
export function IncomingRequestsPanel({
  incoming,
  isLoading,
  expanded,
  onToggleExpanded,
  activeConnectionId,
  onRespond,
  sectionRef,
}: {
  incoming: NetworkUser[];
  isLoading: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  activeConnectionId: string | null;
  onRespond: (connectionId: string, decision: "accept" | "decline") => void;
  /** Lets the page scroll here from "Find people" and the stats. */
  sectionRef?: Ref<HTMLElement>;
}): ReactElement {
  return (
    <section
      ref={sectionRef}
      className="rounded-2xl border border-white/10 bg-surface p-5 transition-all duration-200 hover:border-primary/25"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-xl font-bold text-white">
          Incoming Requests
        </h3>
        {incoming.length > 3 ? (
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
        <p className="mt-3 text-sm text-white/50">Loading…</p>
      ) : incoming.length === 0 ? (
        <p className="mt-3 text-sm text-white/50">
          No incoming requests.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {(expanded ? incoming : incoming.slice(0, 3)).map(
            (request) => {
              const isActing = activeConnectionId === request.id;
              return (
                <article
                  key={request.id}
                  className="rounded-xl border border-white/10 bg-void/45 p-3"
                >
                  <div className="flex items-center gap-3">
                    <Avatar
                      name={request.name}
                      photoUrl={request.profilePhotoUrl}
                      size="sm"
                    />
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {request.name}
                      </p>
                      <p className="text-[11px] capitalize text-white/45">
                        {request.role}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onRespond(request.id, "accept")}
                      disabled={isActing}
                      className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors duration-200 hover:bg-glow disabled:opacity-60"
                    >
                      {isActing ? "Accepting…" : "Accept"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRespond(request.id, "decline")}
                      disabled={isActing}
                      className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors duration-200 hover:border-rose-300 hover:text-rose-200 disabled:opacity-60"
                    >
                      Decline
                    </button>
                    <Link
                      to={`/profile/${request.userId}`}
                      className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors duration-200 hover:border-primary hover:text-white"
                    >
                      View
                    </Link>
                  </div>
                </article>
              );
            },
          )}
        </div>
      )}
    </section>
  );
}

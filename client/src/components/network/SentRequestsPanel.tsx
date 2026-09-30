import { type ReactElement } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../Avatar";
import { type NetworkUser } from "./types";

/** Requests you sent that are still waiting, each with Withdraw. */
export function SentRequestsPanel({
  sent,
  isLoading,
  expanded,
  onToggleExpanded,
  activeConnectionId,
  onWithdraw,
}: {
  sent: NetworkUser[];
  isLoading: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  activeConnectionId: string | null;
  onWithdraw: (connectionId: string, name: string) => void;
}): ReactElement {
  return (
    <section className="rounded-2xl border border-white/10 bg-surface p-5 transition-all duration-200 hover:border-primary/25">
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between"
      >
        <h3 className="font-heading text-xl font-bold text-white">
          Sent Requests
        </h3>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/70">
          {sent.length}
        </span>
      </button>

      <div
        className={
          expanded ? "mt-4 max-h-[320px] overflow-y-auto pr-1" : "hidden"
        }
      >
        {isLoading ? (
          <p className="text-sm text-white/50">Loading…</p>
        ) : sent.length === 0 ? (
          <p className="text-sm text-white/50">
            No pending sent requests.
          </p>
        ) : (
          <div className="space-y-3">
            {sent.map((request) => (
              <article
                key={request.id}
                className="rounded-xl border border-white/10 bg-void/45 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <Link to={`/profile/${request.userId}`} className="group flex min-w-0 items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow">
                    <Avatar
                      name={request.name}
                      photoUrl={request.profilePhotoUrl}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white transition-colors duration-200 group-hover:text-primary">
                        {request.name}
                      </p>
                      <p className="text-[11px] capitalize text-white/45">
                        {request.role}
                      </p>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => onWithdraw(request.id, request.name)}
                    disabled={activeConnectionId === request.id}
                    aria-label={`Withdraw request to ${request.name}`}
                    className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-white/65 transition-colors hover:border-rose-400/40 hover:text-rose-300 disabled:opacity-50"
                  >
                    {activeConnectionId === request.id ? "Withdrawing…" : "Withdraw"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

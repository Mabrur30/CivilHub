import { type ReactElement, useEffect, useState } from "react";

interface ClientBid {
  id: string;
  engineerName: string;
  amount: number;
  message: string;
  submittedDate: string;
  status: "pending" | "accepted" | "declined";
}

interface ProjectBids {
  projectId: string;
  projectName: string;
  bids: ClientBid[];
}

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const isClientBid = (value: unknown): value is ClientBid => {
  if (typeof value !== "object" || value === null) return false;
  const bid = value as Record<string, unknown>;
  return (
    typeof bid.id === "string" &&
    typeof bid.engineerName === "string" &&
    typeof bid.amount === "number" &&
    typeof bid.message === "string" &&
    typeof bid.submittedDate === "string" &&
    (bid.status === "pending" ||
      bid.status === "accepted" ||
      bid.status === "declined")
  );
};

const isProjectBids = (value: unknown): value is ProjectBids => {
  if (typeof value !== "object" || value === null) return false;
  const project = value as Record<string, unknown>;
  return (
    typeof project.projectId === "string" &&
    typeof project.projectName === "string" &&
    Array.isArray(project.bids) &&
    project.bids.every(isClientBid)
  );
};

const getErrorMessage = (value: unknown, fallback: string): string => {
  if (typeof value === "object" && value !== null) {
    const body = value as ErrorResponse;
    if (typeof body.message === "string") return body.message;
  }
  return fallback;
};

const formatAmount = (amount: number): string =>
  `$${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const formatDate = (date: string): string => {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString();
};

const BidSkeleton = (): ReactElement => (
  <div className="animate-pulse rounded-xl border border-white/10 bg-void/50 p-5">
    <div className="h-6 w-1/3 rounded bg-white/10" />
    <div className="mt-4 h-4 w-1/4 rounded bg-white/10" />
    <div className="mt-5 h-12 rounded bg-white/10" />
    <div className="mt-5 h-9 w-1/2 rounded bg-white/10" />
  </div>
);

export function ClientBidsPage(): ReactElement {
  const [projects, setProjects] = useState<ProjectBids[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>("");
  const [retryKey, setRetryKey] = useState<number>(0);
  const [actionBidId, setActionBidId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadBids = async (): Promise<void> => {
      setIsLoading(true);
      setLoadError("");
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/bids/my-projects-bids`,
          {
            credentials: "include",
          },
        );
        const body: unknown = await response.json();
        if (
          !response.ok ||
          !Array.isArray(body) ||
          !body.every(isProjectBids)
        ) {
          setLoadError(getErrorMessage(body, "Unable to load your bids."));
          return;
        }
        setProjects(body);
        setExpanded(new Set(body.map((project) => project.projectId)));
      } catch {
        setLoadError("Unable to connect to CivilHub. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };
    void loadBids();
  }, [retryKey]);

  const decide = async (
    bidId: string,
    decision: "accept" | "decline",
  ): Promise<void> => {
    setActionBidId(bidId);
    setActionError((current) => ({ ...current, [bidId]: "" }));
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/bids/${bidId}/${decision}`,
        {
          method: "PATCH",
          credentials: "include",
        },
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        setActionError((current) => ({
          ...current,
          [bidId]: getErrorMessage(
            body,
            response.status === 409
              ? "This project has already been assigned."
              : "Unable to update this bid.",
          ),
        }));
        return;
      }
      setRetryKey((key) => key + 1);
    } catch {
      setActionError((current) => ({
        ...current,
        [bidId]: "Unable to connect to CivilHub. Please try again.",
      }));
    } finally {
      setActionBidId(null);
    }
  };

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
          Partner selection
        </p>
        <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Bids
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Review proposals side by side and choose the team that best fits each
          brief.
        </p>
      </div>

      {isLoading ? (
        <section className="space-y-5" aria-label="Loading bids">
          <BidSkeleton />
          <BidSkeleton />
        </section>
      ) : loadError ? (
        <section
          className="rounded-2xl border border-red-400/20 bg-red-400/5 p-8 text-center"
          role="alert"
        >
          <p className="text-sm text-red-200">{loadError}</p>
          <button
            type="button"
            onClick={() => setRetryKey((key) => key + 1)}
            className="mt-5 rounded-full border border-primary px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary hover:text-white"
          >
            Try again
          </button>
        </section>
      ) : projects.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-white/15 bg-surface/50 p-12 text-center">
          <h2 className="font-heading text-3xl font-bold text-white">
            No bids yet
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/55">
            Bids from engineering partners will appear here as they respond to
            your projects.
          </p>
        </section>
      ) : (
        <div className="space-y-5">
          {projects.map((project) => {
            const isExpanded = expanded.has(project.projectId);
            return (
              <section
                key={project.projectId}
                className="rounded-2xl border border-white/10 bg-surface"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(project.projectId))
                        next.delete(project.projectId);
                      else next.add(project.projectId);
                      return next;
                    })
                  }
                  className="flex w-full items-center justify-between gap-4 p-6 text-left"
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                      {project.bids.length} proposals
                    </p>
                    <h2 className="mt-2 font-heading text-2xl font-bold text-white">
                      {project.projectName}
                    </h2>
                  </div>
                  <span className="text-white/50">
                    {isExpanded ? "-" : "+"}
                  </span>
                </button>
                {isExpanded ? (
                  <div className="space-y-3 border-t border-white/10 p-4 sm:p-6">
                    {project.bids.map((bid) => {
                      const isActing = actionBidId === bid.id;
                      const isPending = bid.status === "pending";
                      return (
                        <article
                          key={bid.id}
                          className={`rounded-xl border p-5 ${bid.status === "accepted" ? "border-emerald-400/40 bg-emerald-400/5" : bid.status === "declined" ? "border-white/5 bg-black/10 opacity-60" : "border-white/10 bg-void/50"}`}
                        >
                          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                            <div>
                              <h3 className="font-heading text-xl font-bold text-white">
                                {bid.engineerName}
                              </h3>
                              <p className="mt-1 text-xs text-white/40">
                                Submitted {formatDate(bid.submittedDate)}
                              </p>
                            </div>
                            <p className="font-heading text-2xl font-bold text-primary">
                              {formatAmount(bid.amount)}
                            </p>
                          </div>
                          <p className="mt-4 text-sm leading-6 text-white/60">
                            {bid.message}
                          </p>
                          <div className="mt-5 flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              disabled={!isPending || isActing}
                              onClick={() => void decide(bid.id, "accept")}
                              className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-glow disabled:cursor-not-allowed disabled:bg-emerald-500/20 disabled:text-emerald-200"
                            >
                              {isActing
                                ? "Updating..."
                                : bid.status === "accepted"
                                  ? "Accepted"
                                  : "Accept Bid"}
                            </button>
                            <button
                              type="button"
                              disabled={!isPending || isActing}
                              onClick={() => void decide(bid.id, "decline")}
                              className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/70 hover:border-red-300 hover:text-red-200 disabled:cursor-not-allowed"
                            >
                              {isActing
                                ? "Updating..."
                                : bid.status === "declined"
                                  ? "Declined"
                                  : "Decline"}
                            </button>
                            {bid.status === "accepted" ? (
                              <span className="text-xs font-semibold text-emerald-300">
                                Selected for this project
                              </span>
                            ) : null}
                            {bid.status === "declined" ? (
                              <span className="text-xs font-semibold text-white/40">
                                Not selected
                              </span>
                            ) : null}
                          </div>
                          {actionError[bid.id] ? (
                            <p
                              className="mt-3 text-xs text-red-300"
                              role="alert"
                            >
                              {actionError[bid.id]}
                            </p>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

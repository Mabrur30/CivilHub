import { type ReactElement, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

interface EngineerBid {
  id: string;
  projectId: string;
  clientUserId: string;
  projectTitle: string;
  clientName: string;
  amount: number;
  status: "pending" | "accepted" | "declined";
  submittedDate: string;
  projectStatus: string;
}

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const isEngineerBid = (value: unknown): value is EngineerBid => {
  if (typeof value !== "object" || value === null) return false;
  const bid = value as Record<string, unknown>;
  return (
    typeof bid.id === "string" &&
    typeof bid.projectId === "string" &&
    typeof bid.clientUserId === "string" &&
    typeof bid.projectTitle === "string" &&
    typeof bid.clientName === "string" &&
    typeof bid.amount === "number" &&
    (bid.status === "pending" ||
      bid.status === "accepted" ||
      bid.status === "declined") &&
    typeof bid.submittedDate === "string" &&
    typeof bid.projectStatus === "string"
  );
};

const getErrorMessage = (value: unknown): string => {
  if (typeof value === "object" && value !== null) {
    const body = value as ErrorResponse;
    if (typeof body.message === "string") return body.message;
  }
  return "Unable to load your bids.";
};

const formatAmount = (amount: number): string =>
  `$${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const formatDate = (date: string): string => {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString();
};

const statusStyles: Record<EngineerBid["status"], string> = {
  pending: "border-amber-300/30 bg-amber-300/10 text-amber-200",
  accepted: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  declined: "border-white/15 bg-white/5 text-white/50",
};

const statusLabels: Record<EngineerBid["status"], string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
};

export function EngineerBidsPage(): ReactElement {
  const navigate = useNavigate();
  const [bids, setBids] = useState<EngineerBid[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [retryKey, setRetryKey] = useState<number>(0);

  useEffect(() => {
    const loadBids = async (): Promise<void> => {
      setIsLoading(true);
      setError("");
      try {
        const response = await fetch(`${API_BASE_URL}/api/bids/my-bids`, {
          credentials: "include",
        });
        const body: unknown = await response.json();
        if (
          !response.ok ||
          !Array.isArray(body) ||
          !body.every(isEngineerBid)
        ) {
          setError(getErrorMessage(body));
          return;
        }
        setBids(body);
      } catch {
        setError("Unable to connect to CivilHub. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };
    void loadBids();
  }, [retryKey]);

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
          Your proposals
        </p>
        <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
          My Bids
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Track every proposal and see where each opportunity stands.
        </p>
      </div>

      {isLoading ? (
        <section className="space-y-4" aria-label="Loading bids">
          {["one", "two", "three"].map((key) => (
            <div
              key={key}
              className="animate-pulse rounded-2xl border border-white/10 bg-surface p-6"
            >
              <div className="h-6 w-1/3 rounded bg-white/10" />
              <div className="mt-4 h-4 w-1/4 rounded bg-white/10" />
              <div className="mt-6 h-4 w-1/2 rounded bg-white/10" />
            </div>
          ))}
        </section>
      ) : error ? (
        <section
          className="rounded-2xl border border-red-400/20 bg-red-400/5 p-8 text-center"
          role="alert"
        >
          <p className="text-sm text-red-200">{error}</p>
          <button
            type="button"
            onClick={() => setRetryKey((key) => key + 1)}
            className="mt-5 rounded-full border border-primary px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary hover:text-white"
          >
            Try again
          </button>
        </section>
      ) : bids.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-white/15 bg-surface/50 p-12 text-center">
          <h2 className="font-heading text-3xl font-bold text-white">
            You haven&apos;t submitted any bids yet
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/55">
            Explore open projects and send your first proposal to a client.
          </p>
          <Link
            to="/dashboard/engineer/marketplace"
            className="mt-6 inline-block rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-glow"
          >
            Browse marketplace
          </Link>
        </section>
      ) : (
        <section className="space-y-4" aria-label="My submitted bids">
          {bids.map((bid) => {
            const isAccepted = bid.status === "accepted";
            return (
              <button
                key={bid.id}
                type="button"
                disabled={!isAccepted}
                onClick={() =>
                  navigate(`/dashboard/engineer/projects/${bid.projectId}`)
                }
                className={`w-full rounded-2xl border bg-surface p-6 text-left transition-all ${isAccepted ? "cursor-pointer border-emerald-400/20 hover:-translate-y-0.5 hover:border-emerald-400/50" : "cursor-default border-white/10"}`}
              >
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <h2 className="font-heading text-2xl font-bold text-white">
                      {bid.projectTitle}
                    </h2>
                    <p className="mt-2 text-sm font-semibold text-white/60">
                      Client: {bid.clientName}
                    </p>
                    <Link
                      to={`/users/${bid.clientUserId}`}
                      className="mt-2 inline-flex text-xs font-semibold text-primary hover:text-glow"
                    >
                      View profile
                    </Link>
                  </div>
                  <span
                    className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[bid.status]}`}
                  >
                    {statusLabels[bid.status]}
                  </span>
                </div>
                <div className="mt-6 grid gap-4 border-t border-white/10 pt-5 sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-white/40">
                      Your bid
                    </p>
                    <p className="mt-2 font-heading text-2xl font-bold text-primary">
                      {formatAmount(bid.amount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-white/40">
                      Submitted
                    </p>
                    <p className="mt-2 text-sm font-semibold text-white/80">
                      {formatDate(bid.submittedDate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-white/40">
                      Project status
                    </p>
                    <p className="mt-2 text-sm font-semibold capitalize text-white/80">
                      {bid.projectStatus.replaceAll("_", " ")}
                    </p>
                  </div>
                </div>
                {isAccepted ? (
                  <p className="mt-5 text-xs font-semibold text-emerald-300">
                    Open project progress -&gt;
                  </p>
                ) : null}
              </button>
            );
          })}
        </section>
      )}
    </div>
  );
}

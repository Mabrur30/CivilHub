import { type ReactElement, useEffect, useState } from "react";
import {
  ActivityFeedItem,
  isActivityItem,
  type ActivityItem,
} from "../components/dashboard/ActivityFeedItem";

interface DashboardStat {
  label: string;
  value: string;
  detail: string;
}

interface ClientOverview {
  activeProjects: number;
  pendingBidReviews: number;
  unreadMessages: number;
  totalSpent: number;
  recentActivity: ActivityItem[];
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const isClientOverview = (value: unknown): value is ClientOverview => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const overview = value as Record<string, unknown>;
  return (
    typeof overview.activeProjects === "number" &&
    typeof overview.pendingBidReviews === "number" &&
    typeof overview.unreadMessages === "number" &&
    typeof overview.totalSpent === "number" &&
    Array.isArray(overview.recentActivity) &&
    overview.recentActivity.every(isActivityItem)
  );
};

const getErrorMessage = (value: unknown): string => {
  if (typeof value === "object" && value !== null) {
    const response = value as { message?: unknown };
    if (typeof response.message === "string") {
      return response.message;
    }
  }

  return "Unable to load your dashboard overview.";
};

export function ClientOverviewPage(): ReactElement {
  const [overview, setOverview] = useState<ClientOverview | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [retryKey, setRetryKey] = useState<number>(0);

  useEffect(() => {
    const loadOverview = async (): Promise<void> => {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/dashboard/client/overview`,
          { credentials: "include" },
        );
        const body: unknown = await response.json();

        if (!response.ok || !isClientOverview(body)) {
          setError(getErrorMessage(body));
          return;
        }

        setOverview(body);
      } catch {
        setError("Unable to connect to CivilHub. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadOverview();
  }, [retryKey]);

  const stats: DashboardStat[] = overview
    ? [
        {
          label: "Active Projects",
          value: String(overview.activeProjects),
          detail: "Projects in motion",
        },
        {
          label: "Pending Bid Reviews",
          value: String(overview.pendingBidReviews),
          detail: "Across your project pipeline",
        },
        {
          label: "Unread Messages",
          value: String(overview.unreadMessages),
          detail: "No message model yet",
        },
        {
          label: "Total Spent",
          value: `$${overview.totalSpent.toLocaleString()}`,
          detail: "Payments not yet built",
        },
      ]
    : [];

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
          Client workspace
        </p>
        <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Your projects, in focus.
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Track delivery, review new partners, and keep every decision moving.
        </p>
      </div>

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Client dashboard summary"
      >
        {isLoading
          ? ["one", "two", "three", "four"].map((key) => (
              <article
                key={key}
                className="animate-pulse rounded-2xl border border-white/10 bg-surface p-5"
              >
                <div className="h-4 w-1/2 rounded bg-white/10" />
                <div className="mt-5 h-12 w-1/4 rounded bg-white/10" />
                <div className="mt-4 h-3 w-2/3 rounded bg-white/10" />
              </article>
            ))
          : stats.map((stat) => (
              <article
                key={stat.label}
                className="rounded-2xl border border-white/10 bg-surface p-5 transition-transform duration-300 hover:-translate-y-1"
              >
                <p className="text-sm text-white/55">{stat.label}</p>
                <p className="mt-4 font-heading text-4xl font-bold text-primary">
                  {stat.value}
                </p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
                  {stat.detail}
                </p>
              </article>
            ))}
      </section>

      {error ? (
        <section
          className="max-w-3xl rounded-2xl border border-red-400/20 bg-red-400/5 p-8 text-center"
          role="alert"
        >
          <p className="text-sm text-red-200">{error}</p>
          <button
            type="button"
            onClick={() => setRetryKey((key) => key + 1)}
            className="mt-5 rounded-full border border-primary px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
          >
            Try again
          </button>
        </section>
      ) : (
        <section className="max-w-3xl rounded-2xl border border-white/10 bg-surface p-6 sm:p-8">
          <div className="border-b border-white/10 pb-5">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Your timeline
            </p>
            <h2 className="mt-2 font-heading text-3xl font-bold text-white">
              Recent Activity
            </h2>
          </div>
          <div className="divide-y divide-white/10">
            {overview?.recentActivity.length ? (
              overview.recentActivity.map((activity) => (
                <ActivityFeedItem
                  key={`${activity.message}-${activity.timestamp}`}
                  activity={activity}
                />
              ))
            ) : (
              <p className="py-8 text-sm text-white/50">
                No recent activity yet.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

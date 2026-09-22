import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  ActivityFeedItem,
  getFeedEntryCategory,
  getFeedEntryKey,
  isFeedEntry,
  type ActivityCategory,
  type FeedEntry,
} from "../components/dashboard/ActivityFeedItem";
import { useAuth } from "../context/AuthContext";

interface DashboardStat {
  label: string;
  value: number;
  route: string;
  detail: ReactNode;
  tier: "primary" | "secondary";
  icon: ReactElement;
}

interface StatIconProps {
  className: string;
}

const iconBaseProps = {
  viewBox: "0 0 24 24",
  "aria-hidden": true,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.8",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const ProjectsIcon = ({ className }: StatIconProps): ReactElement => (
  <svg {...iconBaseProps} className={className}>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5" />
    <path d="m3 17 9 5 9-5" />
  </svg>
);

const BidsIcon = ({ className }: StatIconProps): ReactElement => (
  <svg {...iconBaseProps} className={className}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6" />
    <path d="M9 17h4" />
  </svg>
);

const MessagesIcon = ({ className }: StatIconProps): ReactElement => (
  <svg {...iconBaseProps} className={className}>
    <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-4 4V6z" />
  </svg>
);

const MilestonesIcon = ({ className }: StatIconProps): ReactElement => (
  <svg {...iconBaseProps} className={className}>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <path d="M4 22v-7" />
  </svg>
);

interface EngineerOverview {
  activeProjects: number;
  pendingBids: number;
  unreadMessages: number;
  upcomingMilestones: number;
  recentActivity: FeedEntry[];
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const loadingSkeletonTiers = [
  "primary",
  "primary",
  "secondary",
  "secondary",
] as const;

const activityFilterTabs: { key: ActivityCategory; label: string }[] = [
  { key: "all", label: "All" },
  { key: "bids", label: "Bids" },
  { key: "messages", label: "Messages" },
  { key: "projects", label: "Projects" },
  { key: "bookings", label: "Bookings" },
  { key: "network", label: "Network" },
];

const isEngineerOverview = (value: unknown): value is EngineerOverview => {
  if (typeof value !== "object" || value === null) return false;
  const overview = value as Record<string, unknown>;
  return (
    typeof overview.activeProjects === "number" &&
    typeof overview.pendingBids === "number" &&
    typeof overview.unreadMessages === "number" &&
    typeof overview.upcomingMilestones === "number" &&
    Array.isArray(overview.recentActivity) &&
    overview.recentActivity.every(isFeedEntry)
  );
};

const getErrorMessage = (value: unknown): string => {
  if (typeof value === "object" && value !== null) {
    const response = value as { message?: unknown };
    if (typeof response.message === "string") return response.message;
  }
  return "Unable to load your dashboard overview.";
};

export function EngineerOverviewPage(): ReactElement {
  const [overview, setOverview] = useState<EngineerOverview | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [retryKey, setRetryKey] = useState<number>(0);
  const [activityFilter, setActivityFilter] = useState<ActivityCategory>("all");
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const loadOverview = async (): Promise<void> => {
      setIsLoading(true);
      setError("");
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/dashboard/engineer/overview`,
          { credentials: "include" },
        );
        const body: unknown = await response.json();
        if (!response.ok || !isEngineerOverview(body)) {
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
          tier: "primary",
          icon: <ProjectsIcon className="h-6 w-6" />,
          value: overview.activeProjects,
          route:
            overview.activeProjects === 0
              ? "/dashboard/engineer/marketplace"
              : "/dashboard/engineer/projects",
          detail:
            overview.activeProjects === 0 ? (
              <>
                No active projects — browse the{" "}
                <span className="text-primary">Marketplace</span>
              </>
            ) : (
              "Assigned to you"
            ),
        },
        {
          label: "Pending Bids",
          tier: "primary",
          icon: <BidsIcon className="h-6 w-6" />,
          value: overview.pendingBids,
          route: "/dashboard/engineer/bids",
          detail:
            overview.pendingBids === 0
              ? "No pending bids"
              : "Awaiting client review",
        },
        {
          label: "Unread Messages",
          tier: "secondary",
          icon: <MessagesIcon className="h-5 w-5" />,
          value: overview.unreadMessages,
          route: "/messages",
          detail:
            overview.unreadMessages === 0
              ? "You're all caught up"
              : "Waiting for your reply",
        },
        {
          label: "Upcoming Milestones",
          tier: "secondary",
          icon: <MilestonesIcon className="h-5 w-5" />,
          value: overview.upcomingMilestones,
          route: "/dashboard/engineer/projects",
          detail:
            overview.upcomingMilestones === 0
              ? "No upcoming deadlines"
              : "Future due dates",
        },
      ]
    : [];

  const filteredActivity = useMemo(() => {
    if (!overview) return [];
    if (activityFilter === "all") return overview.recentActivity;
    return overview.recentActivity.filter(
      (entry) => getFeedEntryCategory(entry) === activityFilter,
    );
  }, [overview, activityFilter]);

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
          Engineer workspace
        </p>
        <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Good morning, {currentUser?.name.split(" ")[0] ?? "there"}.
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Keep your active work moving and stay close to every project decision.
        </p>
      </div>

      <section
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:grid-rows-2"
        aria-label="Dashboard summary"
      >
        {isLoading
          ? loadingSkeletonTiers.map((tier, index) => (
              <article
                key={`${tier}-${index}`}
                className={`animate-pulse rounded-2xl border border-white/10 bg-surface ${
                  tier === "primary"
                    ? "flex flex-col justify-between p-6 lg:row-span-2"
                    : "flex items-center gap-4 p-4"
                }`}
              >
                {tier === "primary" ? (
                  <>
                    <div className="h-6 w-1/2 rounded bg-white/10" />
                    <div>
                      <div className="h-14 w-1/3 rounded bg-white/10" />
                      <div className="mt-4 h-3 w-2/3 rounded bg-white/10" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="h-9 w-9 shrink-0 rounded bg-white/10" />
                    <div className="flex-1">
                      <div className="h-3.5 w-2/3 rounded bg-white/10" />
                      <div className="mt-2 h-3 w-1/2 rounded bg-white/10" />
                    </div>
                  </>
                )}
              </article>
            ))
          : stats.map((stat) =>
              stat.tier === "primary" ? (
                <button
                  key={stat.label}
                  type="button"
                  onClick={() => navigate(stat.route)}
                  className="flex w-full flex-col justify-between rounded-2xl border border-white/10 bg-surface p-6 text-left transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_0_30px_rgba(225,29,46,0.15)] lg:row-span-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-primary">{stat.icon}</span>
                    <p className="text-base text-white/85">{stat.label}</p>
                  </div>
                  <div className="mt-8">
                    <p className="font-heading text-6xl font-bold text-primary">
                      {stat.value}
                    </p>
                    <p className="mt-3 text-xs text-white/40">{stat.detail}</p>
                  </div>
                </button>
              ) : (
                <button
                  key={stat.label}
                  type="button"
                  onClick={() => navigate(stat.route)}
                  className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-surface p-4 text-left transition-all duration-200 hover:-translate-y-1 hover:border-primary/30"
                >
                  <p className="font-heading text-4xl font-bold text-primary">
                    {stat.value}
                  </p>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white/85">{stat.label}</p>
                    <p className="mt-0.5 text-xs text-white/40">
                      {stat.detail}
                    </p>
                  </div>
                  <span className="shrink-0 text-white/30">{stat.icon}</span>
                </button>
              ),
            )}
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
          <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
                Your timeline
              </p>
              <h2 className="mt-2 font-heading text-3xl font-bold text-white">
                Recent Activity
              </h2>
            </div>
            <span className="text-sm text-white/40">Latest updates</span>
          </div>

          <div className="flex flex-wrap gap-2 pt-5">
            {activityFilterTabs.map((tab) => {
              const isActive = tab.key === activityFilter;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActivityFilter(tab.key)}
                  className={
                    isActive
                      ? "rounded-full border border-primary bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors"
                      : "rounded-full border border-primary px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
                  }
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="divide-y divide-white/10">
            {filteredActivity.length ? (
              filteredActivity.map((entry) => (
                <ActivityFeedItem
                  key={getFeedEntryKey(entry)}
                  entry={entry}
                  role="engineer"
                />
              ))
            ) : (
              <p className="py-8 text-sm text-white/50">
                {overview?.recentActivity.length
                  ? "No activity in this category yet."
                  : "No recent activity yet."}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

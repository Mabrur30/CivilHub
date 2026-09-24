import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ActivityFeedItem,
  getFeedEntryCategory,
  getFeedEntryKey,
  isFeedEntry,
  type ActivityCategory,
  type FeedEntry,
} from "../components/dashboard/ActivityFeedItem";
import {
  StatBand,
  type BandStat,
} from "../components/dashboard/overview/StatBand";
import { UpNextProjects } from "../components/dashboard/overview/UpNextProjects";
import {
  primaryButtonClassName,
  quietLinkClassName,
} from "../components/dashboard/ui/buttonStyles";
import { FilterTabs } from "../components/dashboard/ui/FilterTabs";
import { PageHeader } from "../components/dashboard/ui/PageHeader";
import { ErrorPanel } from "../components/dashboard/ui/StatePanels";
import { useAuth } from "../context/AuthContext";
import { countOf } from "../lib/format";
import { isProjectProgress, type ProjectProgress } from "../lib/projectProgress";

interface EngineerOverview {
  activeProjects: number;
  pendingBids: number;
  unreadMessages: number;
  upcomingMilestones: number;
  recentActivity: FeedEntry[];
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const MARKETPLACE_ROUTE = "/dashboard/engineer/marketplace";
const ACTIVITY_SKELETON_ROWS = 4;

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

const getErrorMessage = (value: unknown, fallback: string): string => {
  if (typeof value === "object" && value !== null) {
    const response = value as { message?: unknown };
    if (typeof response.message === "string") return response.message;
  }
  return fallback;
};

const getGreeting = (date: Date): string => {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const getSummary = (overview: EngineerOverview | null): string => {
  if (!overview) return "Here is where your projects and bids stand today.";

  const sentences: string[] = [];
  if (overview.activeProjects > 0) {
    sentences.push(
      `${countOf(overview.activeProjects, "project", "projects")} in delivery.`,
    );
  }
  if (overview.pendingBids > 0) {
    sentences.push(
      `${countOf(overview.pendingBids, "bid", "bids")} waiting on clients.`,
    );
  }
  if (overview.unreadMessages > 0) {
    sentences.push(
      `${countOf(overview.unreadMessages, "unread message", "unread messages")}.`,
    );
  }

  return sentences.length
    ? sentences.join(" ")
    : "Nothing needs your attention right now.";
};

const getStats = (overview: EngineerOverview): BandStat[] => [
  {
    label: "Active projects",
    value: overview.activeProjects,
    route:
      overview.activeProjects === 0
        ? MARKETPLACE_ROUTE
        : "/dashboard/engineer/projects",
    detail:
      overview.activeProjects === 0
        ? "Browse the marketplace for open briefs"
        : "Assigned to you",
  },
  {
    label: "Pending bids",
    value: overview.pendingBids,
    route: "/dashboard/engineer/bids",
    detail:
      overview.pendingBids === 0 ? "No bids pending" : "Awaiting client review",
  },
  {
    label: "Unread messages",
    value: overview.unreadMessages,
    route: "/messages",
    detail:
      overview.unreadMessages === 0
        ? "You're all caught up"
        : "Waiting for your reply",
  },
  {
    label: "Milestones ahead",
    value: overview.upcomingMilestones,
    route: "/dashboard/engineer/projects",
    detail:
      overview.upcomingMilestones === 0
        ? "No upcoming deadlines"
        : "Across your active projects",
  },
];

function ActivitySkeleton(): ReactElement {
  return (
    <div aria-label="Loading activity">
      {Array.from({ length: ACTIVITY_SKELETON_ROWS }).map((_, index) => (
        <div
          key={`activity-skeleton-${index}`}
          className="flex animate-pulse items-center gap-4 px-3 py-4"
        >
          <div className="h-8 w-8 shrink-0 rounded-full bg-white/10" />
          <div className="flex-1">
            <div className="h-3.5 w-3/4 rounded bg-white/10" />
            <div className="mt-2 h-3 w-1/4 rounded bg-white/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EngineerOverviewPage(): ReactElement {
  const [overview, setOverview] = useState<EngineerOverview | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [retryKey, setRetryKey] = useState<number>(0);
  const [projects, setProjects] = useState<ProjectProgress[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState<boolean>(true);
  const [projectsError, setProjectsError] = useState<string>("");
  const [projectsRetryKey, setProjectsRetryKey] = useState<number>(0);
  const [activityFilter, setActivityFilter] = useState<ActivityCategory>("all");
  const { currentUser } = useAuth();

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
          setError(
            getErrorMessage(body, "Unable to load your dashboard overview."),
          );
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

  // Loaded separately from the overview so a failure in one section never
  // blanks the other.
  useEffect(() => {
    const loadProjects = async (): Promise<void> => {
      setIsLoadingProjects(true);
      setProjectsError("");
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/projects/my-projects`,
          { credentials: "include" },
        );
        const body: unknown = await response.json();
        if (!response.ok) {
          setProjectsError(
            getErrorMessage(body, "Unable to load your projects."),
          );
          return;
        }
        if (!Array.isArray(body) || !body.every(isProjectProgress)) {
          setProjectsError("The project data returned by CivilHub is invalid.");
          return;
        }
        setProjects(body);
      } catch {
        setProjectsError("Unable to connect to CivilHub. Please try again.");
      } finally {
        setIsLoadingProjects(false);
      }
    };
    void loadProjects();
  }, [projectsRetryKey]);

  const filteredActivity = useMemo(() => {
    if (!overview) return [];
    if (activityFilter === "all") return overview.recentActivity;
    return overview.recentActivity.filter(
      (entry) => getFeedEntryCategory(entry) === activityFilter,
    );
  }, [overview, activityFilter]);

  const firstName = currentUser?.name.split(" ")[0] ?? "there";

  return (
    <div className="space-y-8">
      <PageHeader
        title={`${getGreeting(new Date())}, ${firstName}.`}
        summary={getSummary(isLoading ? null : overview)}
        action={
          <Link to={MARKETPLACE_ROUTE} className={primaryButtonClassName}>
            <MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />
            Find projects
          </Link>
        }
      />

      {error ? (
        <ErrorPanel
          message={error}
          onRetry={() => setRetryKey((key) => key + 1)}
        />
      ) : (
        <StatBand
          stats={overview ? getStats(overview) : []}
          isLoading={isLoading}
        />
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <UpNextProjects
            projects={projects}
            isLoading={isLoadingProjects}
            error={projectsError}
            onRetry={() => setProjectsRetryKey((key) => key + 1)}
          />
        </div>

        <section
          className="rounded-2xl border border-white/10 bg-surface p-3 sm:p-4 lg:col-span-5"
          aria-labelledby="recent-activity-heading"
        >
          <div className="flex items-baseline justify-between gap-4 px-2 pt-2">
            <h2
              id="recent-activity-heading"
              className="font-heading text-2xl font-bold text-white"
            >
              Recent activity
            </h2>
            <Link
              to="/notifications"
              className={quietLinkClassName}
            >
              All notifications
            </Link>
          </div>

          <FilterTabs
            options={activityFilterTabs}
            value={activityFilter}
            onChange={setActivityFilter}
            label="Filter activity"
            className="mt-4 px-1 pb-3"
          />

          <div className="divide-y divide-white/10 border-t border-white/10">
            {isLoading ? (
              <ActivitySkeleton />
            ) : error ? (
              <p className="px-3 py-8 text-sm text-white/50">
                Activity will appear once your dashboard loads.
              </p>
            ) : filteredActivity.length ? (
              filteredActivity.map((entry) => (
                <ActivityFeedItem
                  key={getFeedEntryKey(entry)}
                  entry={entry}
                  role="engineer"
                />
              ))
            ) : (
              <p className="px-3 py-8 text-sm text-white/50">
                {overview?.recentActivity.length
                  ? "No activity in this category yet."
                  : "No recent activity yet."}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

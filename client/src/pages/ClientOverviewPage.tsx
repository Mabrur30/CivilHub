import { PlusIcon } from "@phosphor-icons/react";
import { type ReactElement, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ActivityFeedItem,
  getFeedEntryCategory,
  getFeedEntryKey,
  type ActivityCategory,
} from "../components/dashboard/ActivityFeedItem";
import { useClientWorkspace } from "../components/dashboard/client/ClientWorkspace";
import {
  type ClientOverview,
  type ClientProject,
  describeProjectState,
  getProjectStage,
  projectHref,
  stageLabels,
} from "../components/dashboard/client/clientData";
import { DecisionQueue } from "../components/dashboard/client/DecisionQueue";
import {
  type LedgerEntry,
  LedgerBand,
} from "../components/dashboard/client/LedgerBand";
import { useClientProjects } from "../components/dashboard/client/useClientProjects";
import {
  panelClassName,
  primaryButtonClassName,
  quietLinkClassName,
} from "../components/dashboard/ui/buttonStyles";
import { FilterTabs } from "../components/dashboard/ui/FilterTabs";
import { PageHeader } from "../components/dashboard/ui/PageHeader";
import { ErrorPanel } from "../components/dashboard/ui/StatePanels";
import { useAuth } from "../context/AuthContext";
import { countOf, formatCurrency } from "../lib/format";

const SNAPSHOT_LIMIT = 5;

const activityFilterTabs: { key: ActivityCategory; label: string }[] = [
  { key: "all", label: "All" },
  { key: "bids", label: "Bids" },
  { key: "messages", label: "Messages" },
  { key: "projects", label: "Projects" },
  { key: "network", label: "Network" },
];

const getGreeting = (date: Date): string => {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const getSummary = (overview: ClientOverview | null): string => {
  if (!overview) return "Here is what your projects need from you today.";
  const waiting = overview.actionItems.length;
  if (waiting > 0) {
    const due =
      overview.money.dueNow > 0
        ? `, ${formatCurrency(overview.money.dueNow)} due if you approve them all`
        : "";
    return `${countOf(waiting, "decision is", "decisions are")} waiting on you${due}.`;
  }
  if (overview.activeProjects > 0) {
    return `Nothing needs you right now. ${countOf(overview.activeProjects, "project is", "projects are")} moving ahead.`;
  }
  return "Post a brief to start getting bids from engineers.";
};

const getLedger = (overview: ClientOverview): LedgerEntry[] => [
  {
    label: "Committed",
    value: formatCurrency(overview.money.committed),
    detail:
      overview.money.committed === 0
        ? "Nothing agreed with an engineer yet"
        : "Agreed with the engineers you hired",
  },
  {
    label: "Paid to date",
    value: formatCurrency(overview.money.paidToDate),
    detail: "Advances and approved phases",
  },
  {
    label: "Due now",
    value: formatCurrency(overview.money.dueNow),
    detail:
      overview.money.dueNow === 0
        ? "Nothing to pay right now"
        : "If you approve everything waiting on you",
  },
];

function ProjectSnapshot({
  projects,
  isLoading,
  error,
  onRetry,
}: {
  projects: ClientProject[];
  isLoading: boolean;
  error: string;
  onRetry: () => void;
}): ReactElement {
  // Projects that need a decision float to the top.
  const ordered = [...projects]
    .filter((project) => getProjectStage(project) !== "cancelled")
    .sort(
      (a, b) =>
        Number(describeProjectState(b).needsYou) -
        Number(describeProjectState(a).needsYou),
    )
    .slice(0, SNAPSHOT_LIMIT);

  return (
    <section className={panelClassName} aria-labelledby="snapshot-heading">
      <div className="flex items-baseline justify-between gap-4 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
        <h2
          id="snapshot-heading"
          className="font-heading text-2xl font-bold text-white"
        >
          Your projects
        </h2>
        <Link to="/dashboard/client/projects" className={quietLinkClassName}>
          All projects
        </Link>
      </div>
      {error ? (
        <div className="border-t border-white/10 p-4">
          <ErrorPanel message={error} onRetry={onRetry} />
        </div>
      ) : isLoading ? (
        <ul className="divide-y divide-white/10 border-t border-white/10" aria-label="Loading projects">
          {[0, 1, 2].map((row) => (
            <li key={row} className="animate-pulse px-6 py-4">
              <div className="h-4 w-1/2 rounded bg-white/10" />
              <div className="mt-2 h-3 w-1/3 rounded bg-white/10" />
            </li>
          ))}
        </ul>
      ) : ordered.length === 0 ? (
        <p className="border-t border-white/10 px-5 py-8 text-sm text-white/55 sm:px-6">
          No projects yet. Post a brief and engineers can start bidding on it.
        </p>
      ) : (
        <ul className="divide-y divide-white/10 border-t border-white/10">
          {ordered.map((project) => {
            const state = describeProjectState(project);
            return (
              <li key={project.id}>
                <Link
                  to={projectHref(project)}
                  className="block px-5 py-4 transition-colors hover:bg-white/4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-glow sm:px-6"
                >
                  <p className="truncate font-semibold text-white">
                    {project.projectName}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-2 text-sm">
                    <span className="text-white/45">
                      {stageLabels[getProjectStage(project)]}
                    </span>
                    <span
                      className={
                        state.needsYou ? "text-amber-200" : "text-white/60"
                      }
                    >
                      {state.text}
                    </span>
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function ClientOverviewPage(): ReactElement {
  const { currentUser } = useAuth();
  const workspace = useClientWorkspace();
  const projects = useClientProjects();
  const [activityFilter, setActivityFilter] = useState<ActivityCategory>("all");

  const overview = workspace?.overview ?? null;
  const isLoading = workspace?.isLoading ?? true;
  const error = workspace?.error ?? "";
  const firstName = currentUser?.name.split(" ")[0] ?? "there";

  const filteredActivity = useMemo(() => {
    if (!overview) return [];
    if (activityFilter === "all") return overview.recentActivity;
    return overview.recentActivity.filter(
      (entry) => getFeedEntryCategory(entry) === activityFilter,
    );
  }, [overview, activityFilter]);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`${getGreeting(new Date())}, ${firstName}.`}
        summary={getSummary(isLoading ? null : overview)}
        action={
          <Link to="/dashboard/client/post-project" className={primaryButtonClassName}>
            <PlusIcon className="h-4 w-4" weight="bold" aria-hidden="true" />
            Post a project
          </Link>
        }
      />

      {error && !overview ? (
        <ErrorPanel message={error} onRetry={() => void workspace?.refresh()} />
      ) : (
        <>
          <DecisionQueue
            items={overview?.actionItems ?? []}
            isLoading={isLoading}
          />
          <LedgerBand
            label="Project money"
            entries={overview ? getLedger(overview) : []}
            isLoading={isLoading}
          />
        </>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <ProjectSnapshot
            projects={projects.projects}
            isLoading={projects.isLoading}
            error={projects.error}
            onRetry={projects.reload}
          />
        </div>

        <section
          className="rounded-2xl border border-white/10 bg-surface p-3 sm:p-4 lg:col-span-6"
          aria-labelledby="recent-activity-heading"
        >
          <div className="flex items-baseline justify-between gap-4 px-2 pt-2">
            <h2
              id="recent-activity-heading"
              className="font-heading text-2xl font-bold text-white"
            >
              Recent activity
            </h2>
            <Link to="/notifications" className={quietLinkClassName}>
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
              <p className="px-3 py-8 text-sm text-white/45">Loading activity...</p>
            ) : filteredActivity.length ? (
              filteredActivity.map((entry) => (
                <ActivityFeedItem
                  key={getFeedEntryKey(entry)}
                  entry={entry}
                  role="client"
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

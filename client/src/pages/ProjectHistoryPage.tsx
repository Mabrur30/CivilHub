import { StarIcon } from "@phosphor-icons/react";
import { type ReactElement, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { StatBand, type BandStat } from "../components/dashboard/overview/StatBand";
import {
  inlineLinkClassName,
  panelClassName,
} from "../components/dashboard/ui/buttonStyles";
import { PageHeader } from "../components/dashboard/ui/PageHeader";
import { EmptyPanel, ErrorPanel } from "../components/dashboard/ui/StatePanels";
import { useAuth } from "../context/AuthContext";
import { countOf, formatCurrency, formatDate } from "../lib/format";

interface HistoryItem {
  id: string;
  title: string;
  otherParty: { id: string; name: string } | null;
  completedAt: string;
  totalValuePaid: number;
  rating: number | null;
}

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const isHistoryItem = (value: unknown): value is HistoryItem => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  const otherParty = item.otherParty as Record<string, unknown> | null;
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    (otherParty === null ||
      (typeof otherParty.id === "string" &&
        typeof otherParty.name === "string")) &&
    typeof item.completedAt === "string" &&
    typeof item.totalValuePaid === "number" &&
    (typeof item.rating === "number" || item.rating === null)
  );
};

const getErrorMessage = (value: unknown): string => {
  if (typeof value === "object" && value !== null) {
    const error = value as ErrorResponse;
    if (typeof error.message === "string") return error.message;
  }
  return "Unable to load project history.";
};

const getTime = (value: string): number => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

function HistoryRow({
  project,
  projectPath,
  partyLabel,
}: {
  project: HistoryItem;
  projectPath: string;
  partyLabel: string;
}): ReactElement {
  return (
    <li className="grid gap-3 px-5 py-5 sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-6">
      <div className="min-w-0 lg:col-span-5">
        <Link
          to={projectPath}
          className="rounded font-heading text-xl font-bold text-white transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-glow"
        >
          {project.title}
        </Link>
        <p className="mt-1 text-sm text-white/50">
          {project.otherParty ? (
            <>
              {partyLabel}{" "}
              <Link
                to={`/users/${project.otherParty.id}`}
                className={inlineLinkClassName}
              >
                {project.otherParty.name}
              </Link>
            </>
          ) : (
            `${partyLabel} not recorded`
          )}
        </p>
      </div>

      <p className="text-sm text-white/55 lg:col-span-2">
        {formatDate(project.completedAt)}
      </p>

      <p className="font-heading text-xl font-bold tabular-nums text-white lg:col-span-2">
        {formatCurrency(project.totalValuePaid)}
      </p>

      <div className="lg:col-span-3 lg:text-right">
        {project.rating !== null ? (
          <span
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-white"
            aria-label={`Rated ${project.rating.toFixed(1)} out of 5`}
          >
            <StarIcon
              weight="fill"
              className="h-4 w-4 text-amber-300"
              aria-hidden="true"
            />
            {project.rating.toFixed(1)}
          </span>
        ) : (
          <span className="text-sm text-white/40">Not reviewed</span>
        )}
      </div>
    </li>
  );
}

function HistoryListSkeleton(): ReactElement {
  return (
    <section className={panelClassName} aria-label="Loading project history">
      <ul className="divide-y divide-white/10">
        {[1, 2, 3].map((item) => (
          <li
            key={item}
            className="grid animate-pulse gap-4 px-5 py-5 sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-6"
          >
            <div className="lg:col-span-5">
              <div className="h-5 w-2/3 rounded bg-white/10" />
              <div className="mt-2 h-3.5 w-1/3 rounded bg-white/10" />
            </div>
            <div className="h-3.5 w-20 rounded bg-white/10 lg:col-span-2" />
            <div className="h-6 w-24 rounded bg-white/10 lg:col-span-2" />
            <div className="h-4 w-12 rounded bg-white/10 lg:col-span-3 lg:ml-auto" />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProjectHistoryPage(): ReactElement {
  const { currentUser } = useAuth();
  const [projects, setProjects] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [retryKey, setRetryKey] = useState<number>(0);

  useEffect(() => {
    const loadHistory = async (): Promise<void> => {
      setIsLoading(true);
      setError("");
      try {
        const response = await fetch(`${API_BASE_URL}/api/projects/history`, {
          credentials: "include",
        });
        const body: unknown = await response.json();
        if (!response.ok) {
          setError(getErrorMessage(body));
          return;
        }
        if (!Array.isArray(body) || !body.every(isHistoryItem)) {
          setError("The project history returned by CivilHub is invalid.");
          return;
        }
        setProjects(
          [...body].sort(
            (first, second) =>
              getTime(second.completedAt) - getTime(first.completedAt),
          ),
        );
      } catch {
        setError("Unable to connect to CivilHub. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadHistory();
  }, [retryKey]);

  // This page serves both dashboards, so every label that names the other
  // side of the project follows the viewer's role.
  const isClient = currentUser?.role === "client";
  const dashboardBase = isClient ? "/dashboard/client" : "/dashboard/engineer";
  const partyLabel = isClient ? "Engineer:" : "Client:";
  const otherSide = isClient ? "engineers" : "clients";

  const totalValue = projects.reduce(
    (sum, project) => sum + project.totalValuePaid,
    0,
  );
  const ratings = projects
    .map((project) => project.rating)
    .filter((rating): rating is number => rating !== null);
  const averageRating = ratings.length
    ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
    : null;

  const partnerCount = new Set(
    projects.flatMap((project) =>
      project.otherParty ? [project.otherParty.id] : [],
    ),
  ).size;

  const stats: BandStat[] = [
    {
      label: "Completed projects",
      value: projects.length,
      detail:
        partnerCount > 0
          ? `Delivered with ${countOf(partnerCount, isClient ? "engineer" : "client", otherSide)}`
          : "Delivered on CivilHub",
    },
    {
      label: isClient ? "Total paid" : "Total earned",
      value: totalValue,
      display: formatCurrency(Math.round(totalValue)),
      detail: "Across all completed projects",
    },
  ];
  if (averageRating !== null) {
    stats.push({
      label: "Average rating",
      value: averageRating,
      display: averageRating.toFixed(1),
      detail: `From ${countOf(ratings.length, "review", "reviews")}`,
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Project history"
        summary={`Finished work and the ${otherSide} you delivered it with.`}
      />

      {isLoading ? (
        <>
          <StatBand
            stats={[]}
            isLoading
            columnsClassName="grid-cols-1 sm:grid-cols-3"
            skeletonCount={3}
          />
          <HistoryListSkeleton />
        </>
      ) : error ? (
        <ErrorPanel
          message={error}
          onRetry={() => setRetryKey((key) => key + 1)}
        />
      ) : projects.length === 0 ? (
        <EmptyPanel
          title="No completed projects yet"
          body="Finished projects move here with their final value and review."
        />
      ) : (
        <>
          <StatBand
            stats={stats}
            isLoading={false}
            columnsClassName={
              stats.length === 3
                ? "grid-cols-1 sm:grid-cols-3"
                : "grid-cols-1 sm:grid-cols-2"
            }
          />

          <section
            className={panelClassName}
            aria-labelledby="completed-heading"
          >
            <div className="px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
              <h2
                id="completed-heading"
                className="font-heading text-2xl font-bold text-white"
              >
                Completed
              </h2>
            </div>
            <div
              className="hidden border-t border-white/10 px-6 py-2.5 text-xs font-semibold text-white/40 lg:grid lg:grid-cols-12 lg:gap-6"
              aria-hidden="true"
            >
              <span className="col-span-5">Project</span>
              <span className="col-span-2">Completed</span>
              <span className="col-span-2">Value</span>
              <span className="col-span-3 text-right">Review</span>
            </div>
            <ul className="divide-y divide-white/10 border-t border-white/10">
              {projects.map((project) => (
                <HistoryRow
                  key={project.id}
                  project={project}
                  projectPath={`${dashboardBase}/projects/${project.id}`}
                  partyLabel={partyLabel}
                />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { type ReactElement, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  panelClassName,
  primaryButtonClassName,
} from "../components/dashboard/ui/buttonStyles";
import { PageHeader } from "../components/dashboard/ui/PageHeader";
import { ProgressBar } from "../components/dashboard/ui/ProgressBar";
import { EmptyPanel, ErrorPanel } from "../components/dashboard/ui/StatePanels";
import { countOf } from "../lib/format";
import {
  dueToneClassName,
  getDueLabel,
  hasMilestonePlan,
  isProjectProgress,
  type ProjectProgress,
} from "../lib/projectProgress";

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const MARKETPLACE_ROUTE = "/dashboard/engineer/marketplace";

const getErrorMessage = (value: unknown): string => {
  if (typeof value === "object" && value !== null) {
    const response = value as ErrorResponse;
    if (typeof response.message === "string") {
      return response.message;
    }
  }

  return "Unable to load your projects.";
};

// Overdue and due-this-week milestones are the ones an engineer has to act on,
// so they are pulled out above everything else.
const needsAttention = (project: ProjectProgress): boolean => {
  const tone = getDueLabel(project)?.tone;
  return tone === "late" || tone === "soon";
};

const getSummary = (projects: ProjectProgress[]): string => {
  if (projects.length === 0) return "No projects are assigned to you yet.";

  const overdue = projects.filter(
    (project) => getDueLabel(project)?.tone === "late",
  ).length;
  const awaitingPlan = projects.filter(
    (project) => !hasMilestonePlan(project),
  ).length;

  const sentences = [
    `${countOf(projects.length, "project", "projects")} in delivery.`,
  ];
  if (overdue > 0) {
    sentences.push(
      `${countOf(overdue, "milestone is", "milestones are")} overdue.`,
    );
  }
  if (awaitingPlan > 0) {
    sentences.push(
      `${countOf(awaitingPlan, "project is", "projects are")} waiting on a milestone plan.`,
    );
  }
  return sentences.join(" ");
};

function ProjectRow({ project }: { project: ProjectProgress }): ReactElement {
  const due = getDueLabel(project);

  return (
    <li>
      <Link
        to={`/dashboard/engineer/projects/${project.id}`}
        className="grid gap-4 px-5 py-5 transition-colors hover:bg-white/4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-glow sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-6"
      >
        <div className="min-w-0 lg:col-span-5">
          <p className="truncate font-heading text-xl font-bold text-white">
            {project.projectName}
          </p>
          <p className="mt-1 truncate text-sm text-white/50">
            {project.currentPhaseName} for {project.clientName}
          </p>
        </div>

        <div className="lg:col-span-3">
          <ProgressBar
            value={project.progressPercentage}
            label={`${project.projectName} progress`}
          />
        </div>

        <div className="min-w-0 lg:col-span-4 lg:text-right">
          {hasMilestonePlan(project) ? (
            <>
              <p className="truncate text-sm text-white/85">
                {project.nextMilestone}
              </p>
              {due ? (
                <p
                  className={`mt-1 text-sm font-semibold ${dueToneClassName[due.tone]}`}
                  title={due.fullDate}
                >
                  {due.text}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-white/50">
              No milestone plan approved yet
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}

interface ProjectGroupProps {
  title: string;
  projects: ProjectProgress[];
}

function ProjectGroup({ title, projects }: ProjectGroupProps): ReactElement {
  const headingId = `project-group-${title.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <section className={panelClassName} aria-labelledby={headingId}>
      <div className="flex items-baseline justify-between gap-4 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
        <h2 id={headingId} className="font-heading text-2xl font-bold text-white">
          {title}
        </h2>
        <span className="text-sm text-white/45">
          {countOf(projects.length, "project", "projects")}
        </span>
      </div>
      <div
        className="hidden border-t border-white/10 px-6 py-2.5 text-xs font-semibold text-white/40 lg:grid lg:grid-cols-12 lg:gap-6"
        aria-hidden="true"
      >
        <span className="col-span-5">Project</span>
        <span className="col-span-3">Progress</span>
        <span className="col-span-4 text-right">Next milestone</span>
      </div>
      <ul className="divide-y divide-white/10 border-t border-white/10">
        {projects.map((project) => (
          <ProjectRow key={project.id} project={project} />
        ))}
      </ul>
    </section>
  );
}

function ProjectListSkeleton(): ReactElement {
  return (
    <section className={panelClassName} aria-label="Loading projects">
      <div className="px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
        <div className="h-7 w-40 animate-pulse rounded bg-white/10" />
      </div>
      <ul className="divide-y divide-white/10 border-t border-white/10">
        {[1, 2, 3].map((item) => (
          <li
            key={item}
            className="grid animate-pulse gap-4 px-5 py-5 sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-6"
          >
            <div className="lg:col-span-5">
              <div className="h-5 w-2/3 rounded bg-white/10" />
              <div className="mt-2 h-3.5 w-1/2 rounded bg-white/10" />
            </div>
            <div className="h-1.5 rounded-full bg-white/10 lg:col-span-3" />
            <div className="lg:col-span-4">
              <div className="h-3.5 w-3/4 rounded bg-white/10 lg:ml-auto" />
              <div className="mt-2 h-3.5 w-1/3 rounded bg-white/10 lg:ml-auto" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EngineerProjectsPage(): ReactElement {
  const [projects, setProjects] = useState<ProjectProgress[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [retryKey, setRetryKey] = useState<number>(0);

  useEffect(() => {
    const loadProjects = async (): Promise<void> => {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/projects/my-projects`,
          {
            credentials: "include",
          },
        );
        const body: unknown = await response.json();

        if (!response.ok) {
          setError(getErrorMessage(body));
          return;
        }

        if (!Array.isArray(body) || !body.every(isProjectProgress)) {
          setError("The project data returned by CivilHub is invalid.");
          return;
        }

        setProjects(body);
      } catch {
        setError("Unable to connect to CivilHub. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadProjects();
  }, [retryKey]);

  const urgentProjects = projects.filter(needsAttention);
  const laterProjects = projects.filter((project) => !needsAttention(project));
  const isSplit = urgentProjects.length > 0 && laterProjects.length > 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="My projects"
        summary={
          isLoading
            ? "Your active projects, ordered by their next milestone."
            : getSummary(projects)
        }
      />

      {isLoading ? (
        <ProjectListSkeleton />
      ) : error ? (
        <ErrorPanel
          message={error}
          onRetry={() => setRetryKey((key) => key + 1)}
        />
      ) : projects.length === 0 ? (
        <EmptyPanel
          title="No active projects yet"
          body="When a client accepts one of your bids, the project shows up here with its progress and next milestone."
          action={
            <Link to={MARKETPLACE_ROUTE} className={primaryButtonClassName}>
              <MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />
              Find projects
            </Link>
          }
        />
      ) : isSplit ? (
        <>
          <ProjectGroup title="Needs attention" projects={urgentProjects} />
          <ProjectGroup title="Later" projects={laterProjects} />
        </>
      ) : (
        <ProjectGroup title="Active projects" projects={projects} />
      )}
    </div>
  );
}

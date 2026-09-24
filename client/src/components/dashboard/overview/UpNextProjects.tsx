import { type ReactElement } from "react";
import { Link } from "react-router-dom";
import {
  dueToneClassName,
  getDueLabel,
  hasMilestonePlan,
  type ProjectProgress,
} from "../../../lib/projectProgress";
import {
  panelClassName,
  quietLinkClassName,
  retryButtonClassName,
} from "../ui/buttonStyles";
import { ProgressBar } from "../ui/ProgressBar";

interface UpNextProjectsProps {
  projects: ProjectProgress[];
  isLoading: boolean;
  error: string;
  onRetry: () => void;
}

const VISIBLE_PROJECTS = 4;

function ProjectRow({ project }: { project: ProjectProgress }): ReactElement {
  const due = getDueLabel(project);
  const hasMilestone = hasMilestonePlan(project);

  return (
    <li>
      <Link
        to={`/dashboard/engineer/projects/${project.id}`}
        className="block px-5 py-5 transition-colors hover:bg-white/4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-glow sm:px-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate font-heading text-xl font-bold text-white">
              {project.projectName}
            </p>
            <p className="mt-1 truncate text-sm text-white/50">
              {project.currentPhaseName} for {project.clientName}
            </p>
          </div>
          {due ? (
            <p
              className={`shrink-0 text-sm font-semibold ${dueToneClassName[due.tone]}`}
              title={due.fullDate}
            >
              {due.text}
            </p>
          ) : null}
        </div>

        <div className="mt-4">
          <ProgressBar
            value={project.progressPercentage}
            label={`${project.projectName} progress`}
          />
        </div>

        <p className="mt-3 text-sm text-white/50">
          {hasMilestone ? (
            <>
              Next milestone:{" "}
              <span className="text-white/85">{project.nextMilestone}</span>
            </>
          ) : (
            "No milestone plan approved yet"
          )}
        </p>
      </Link>
    </li>
  );
}

function ProjectRowSkeleton(): ReactElement {
  return (
    <li className="animate-pulse px-5 py-5 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="h-5 w-1/2 rounded bg-white/10" />
          <div className="mt-2 h-3.5 w-1/3 rounded bg-white/10" />
        </div>
        <div className="h-3.5 w-20 rounded bg-white/10" />
      </div>
      <div className="mt-5 h-1.5 rounded-full bg-white/10" />
      <div className="mt-4 h-3.5 w-2/5 rounded bg-white/10" />
    </li>
  );
}

export function UpNextProjects({
  projects,
  isLoading,
  error,
  onRetry,
}: UpNextProjectsProps): ReactElement {
  const visibleProjects = projects.slice(0, VISIBLE_PROJECTS);
  const showAllLink = !isLoading && !error && projects.length > 0;

  return (
    <section
      className={panelClassName}
      aria-labelledby="up-next-heading"
    >
      <div className="flex items-baseline justify-between gap-4 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
        <h2
          id="up-next-heading"
          className="font-heading text-2xl font-bold text-white"
        >
          Up next
        </h2>
        {showAllLink ? (
          <Link
            to="/dashboard/engineer/projects"
            className={quietLinkClassName}
          >
            All projects
          </Link>
        ) : null}
      </div>

      {isLoading ? (
        <ul
          className="divide-y divide-white/10 border-t border-white/10"
          aria-label="Loading projects"
        >
          <ProjectRowSkeleton />
          <ProjectRowSkeleton />
          <ProjectRowSkeleton />
        </ul>
      ) : error ? (
        <div className="border-t border-white/10 px-5 py-8 sm:px-6" role="alert">
          <p className="text-sm text-red-200">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className={`mt-4 ${retryButtonClassName}`}
          >
            Try again
          </button>
        </div>
      ) : visibleProjects.length === 0 ? (
        <div className="border-t border-white/10 px-5 py-10 sm:px-6">
          <p className="font-semibold text-white/85">No active projects yet</p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-white/50">
            Projects you win will show up here, ordered by their next milestone.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-white/10 border-t border-white/10">
          {visibleProjects.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </ul>
      )}
    </section>
  );
}

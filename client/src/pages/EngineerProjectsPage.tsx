import { type ReactElement, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export interface ProjectProgress {
  id: string;
  projectName: string;
  clientName: string;
  currentPhaseName: string;
  progressPercentage: number;
  nextMilestone: string;
  nextMilestoneDueDate: string;
}

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const isProjectProgress = (value: unknown): value is ProjectProgress => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const project = value as Record<string, unknown>;
  return (
    typeof project.id === "string" &&
    typeof project.projectName === "string" &&
    typeof project.clientName === "string" &&
    typeof project.currentPhaseName === "string" &&
    typeof project.progressPercentage === "number" &&
    typeof project.nextMilestone === "string" &&
    typeof project.nextMilestoneDueDate === "string"
  );
};

const getErrorMessage = (value: unknown): string => {
  if (typeof value === "object" && value !== null) {
    const response = value as ErrorResponse;
    if (typeof response.message === "string") {
      return response.message;
    }
  }

  return "Unable to load your projects.";
};

const ProjectSkeleton = (): ReactElement => (
  <div
    className="animate-pulse rounded-2xl border border-white/10 bg-surface p-6"
    aria-label="Loading project"
  >
    <div className="h-3 w-1/3 rounded bg-white/10" />
    <div className="mt-4 h-7 w-2/3 rounded bg-white/10" />
    <div className="mt-8 h-2 rounded-full bg-white/10" />
    <div className="mt-8 h-12 rounded bg-white/10" />
  </div>
);

export function EngineerProjectsPage(): ReactElement {
  const navigate = useNavigate();
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

  return (
    <div className="space-y-10">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
            Delivery pipeline
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
            My Projects
          </h1>
          <p className="mt-3 max-w-2xl text-white/60">
            A live-looking view of your current commitments, milestones, and
            delivery health.
          </p>
        </div>
        <span className="w-fit rounded-full border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          {isLoading ? "..." : projects.length} active projects
        </span>
      </div>

      {isLoading ? (
        <section
          className="grid gap-5 lg:grid-cols-2"
          aria-label="Loading projects"
        >
          <ProjectSkeleton />
          <ProjectSkeleton />
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
            className="mt-5 rounded-full border border-primary px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
          >
            Try again
          </button>
        </section>
      ) : projects.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-white/15 bg-surface/50 p-12 text-center">
          <h2 className="font-heading text-3xl font-bold text-white">
            No active projects yet
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/55">
            Once a client assigns a project to you, its progress and upcoming
            milestones will appear here.
          </p>
        </section>
      ) : (
        <section
          className="grid gap-5 lg:grid-cols-2"
          aria-label="Active projects"
        >
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() =>
                navigate(`/dashboard/engineer/projects/${project.id}`)
              }
              className="group rounded-2xl border border-white/10 bg-surface p-6 text-left transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_16px_40px_rgba(0,0,0,0.25)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                    {project.clientName}
                  </p>
                  <h2 className="mt-2 font-heading text-2xl font-bold text-white">
                    {project.projectName}
                  </h2>
                </div>
                <span className="text-sm font-semibold text-white/60">
                  {project.progressPercentage}%
                </span>
              </div>
              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between text-xs text-white/45">
                  <span>Overall progress</span>
                  <span>{project.currentPhaseName}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${project.progressPercentage}%` }}
                  />
                </div>
              </div>
              <div className="mt-6 flex items-end justify-between gap-4 border-t border-white/10 pt-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-white/40">
                    Next milestone
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white/85">
                    {project.nextMilestone}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-[0.14em] text-white/40">
                    Due
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white/85">
                    {project.nextMilestoneDueDate}
                  </p>
                </div>
              </div>
              <p className="mt-5 text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                Open project progress <span aria-hidden="true">-&gt;</span>
              </p>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

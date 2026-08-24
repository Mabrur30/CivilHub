import { type ReactElement, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface ClientProject {
  id: string;
  projectName: string;
  assignedEngineer: string | null;
  currentPhaseName: string;
  progressPercentage: number;
  nextMilestone: string;
  nextMilestoneDueDate: string;
}

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const isClientProject = (value: unknown): value is ClientProject => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const project = value as Record<string, unknown>;

  return (
    typeof project.id === "string" &&
    typeof project.projectName === "string" &&
    (typeof project.assignedEngineer === "string" ||
      project.assignedEngineer === null) &&
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

  return "Unable to load your posted projects.";
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

export function ClientProjectsPage(): ReactElement {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ClientProject[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [retryKey, setRetryKey] = useState<number>(0);

  useEffect(() => {
    const loadProjects = async (): Promise<void> => {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/projects/my-posted-projects`,
          {
            credentials: "include",
          },
        );
        const body: unknown = await response.json();

        if (!response.ok) {
          setError(getErrorMessage(body));
          return;
        }

        if (!Array.isArray(body) || !body.every(isClientProject)) {
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
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
          Your delivery portfolio
        </p>
        <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
          My Projects
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          See where every project stands, from partner selection to final
          delivery.
        </p>
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
            You haven&apos;t posted any projects yet
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/55">
            Post your first brief to start receiving qualified engineering bids.
          </p>
          <button
            type="button"
            onClick={() => navigate("/dashboard/client/post-project")}
            className="mt-6 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-glow"
          >
            Post a project
          </button>
        </section>
      ) : (
        <section
          className="grid gap-5 lg:grid-cols-2"
          aria-label="Client projects"
        >
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() =>
                navigate(
                  project.assignedEngineer
                    ? `/dashboard/client/projects/${project.id}`
                    : "/dashboard/client/bids",
                )
              }
              className="group rounded-2xl border border-white/10 bg-surface p-6 text-left transition-all duration-300 hover:-translate-y-1 hover:border-primary/50"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                    {project.assignedEngineer ?? "Partner search open"}
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
                    className="h-full rounded-full bg-primary"
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
                {project.assignedEngineer
                  ? "Open project progress ->"
                  : "Review bids ->"}
              </p>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

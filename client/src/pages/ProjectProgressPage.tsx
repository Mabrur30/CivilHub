import { type ReactElement, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type ProjectPhaseStatus =
  | "not_started"
  | "in_progress"
  | "awaiting_approval"
  | "completed"
  | "delayed";

interface ProjectPhase {
  id: string;
  name: string;
  order: number;
  status: ProjectPhaseStatus;
  dueDate: string | null;
  completedAt: string | null;
  updatedAt: string;
}

interface ProjectProgressResponse {
  project: {
    id: string;
    name: string;
    status: string;
    clientId: string | null;
    assignedEngineerId: string | null;
    currentPhaseName: string;
    progressPercentage: number;
    nextMilestone: string;
    nextMilestoneDueDate: string | null;
  };
  phases: ProjectPhase[];
  canUpdate: boolean;
}

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const statusOptions: Array<{
  value: ProjectPhaseStatus;
  label: string;
}> = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "awaiting_approval", label: "Awaiting approval" },
  { value: "completed", label: "Completed" },
  { value: "delayed", label: "Delayed" },
];

const statusBadgeClass: Record<ProjectPhaseStatus, string> = {
  not_started: "border-white/20 bg-white/10 text-white/70",
  in_progress: "border-sky-300/40 bg-sky-300/10 text-sky-200",
  awaiting_approval: "border-amber-300/40 bg-amber-300/10 text-amber-200",
  completed: "border-emerald-300/40 bg-emerald-300/10 text-emerald-200",
  delayed: "border-red-300/40 bg-red-300/10 text-red-200",
};

const isProjectPhaseStatus = (value: unknown): value is ProjectPhaseStatus =>
  value === "not_started" ||
  value === "in_progress" ||
  value === "awaiting_approval" ||
  value === "completed" ||
  value === "delayed";

const isProjectPhase = (value: unknown): value is ProjectPhase => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const phase = value as Record<string, unknown>;
  return (
    typeof phase.id === "string" &&
    typeof phase.name === "string" &&
    typeof phase.order === "number" &&
    isProjectPhaseStatus(phase.status) &&
    (typeof phase.dueDate === "string" || phase.dueDate === null) &&
    (typeof phase.completedAt === "string" || phase.completedAt === null) &&
    typeof phase.updatedAt === "string"
  );
};

const isProjectProgressResponse = (
  value: unknown,
): value is ProjectProgressResponse => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const body = value as Record<string, unknown>;
  if (typeof body.canUpdate !== "boolean" || !Array.isArray(body.phases)) {
    return false;
  }

  if (!body.phases.every(isProjectPhase)) {
    return false;
  }

  if (typeof body.project !== "object" || body.project === null) {
    return false;
  }

  const project = body.project as Record<string, unknown>;
  return (
    typeof project.id === "string" &&
    typeof project.name === "string" &&
    typeof project.status === "string" &&
    (typeof project.clientId === "string" || project.clientId === null) &&
    (typeof project.assignedEngineerId === "string" ||
      project.assignedEngineerId === null) &&
    typeof project.currentPhaseName === "string" &&
    typeof project.progressPercentage === "number" &&
    typeof project.nextMilestone === "string" &&
    (typeof project.nextMilestoneDueDate === "string" ||
      project.nextMilestoneDueDate === null)
  );
};

const getErrorMessage = (value: unknown): string => {
  if (typeof value === "object" && value !== null) {
    const body = value as ErrorResponse;
    if (typeof body.message === "string") {
      return body.message;
    }
  }

  return "Unable to load project progress.";
};

const formatDate = (value: string | null): string => {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
};

export function ProjectProgressPage(): ReactElement {
  const { projectId } = useParams<{ projectId: string }>();
  const { currentUser } = useAuth();
  const [data, setData] = useState<ProjectProgressResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [updatingPhaseId, setUpdatingPhaseId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string>("");

  const backPath = useMemo(() => {
    if (currentUser?.role === "client") {
      return "/dashboard/client/projects";
    }
    return "/dashboard/engineer/projects";
  }, [currentUser?.role]);

  const loadProgress = async (): Promise<void> => {
    if (!projectId) {
      setError("Project ID is missing.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${projectId}/progress`,
        {
          credentials: "include",
        },
      );
      const body: unknown = await response.json();

      if (!response.ok || !isProjectProgressResponse(body)) {
        setError(getErrorMessage(body));
        setData(null);
        return;
      }

      setData(body);
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadProgress();
  }, [projectId]);

  const handleUpdatePhase = async (
    phaseId: string,
    status: ProjectPhaseStatus,
  ): Promise<void> => {
    if (!projectId) {
      return;
    }

    setUpdatingPhaseId(phaseId);
    setUpdateError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/projects/${projectId}/phases/${phaseId}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );

      const body: unknown = await response.json();
      if (!response.ok) {
        setUpdateError(getErrorMessage(body));
        return;
      }

      await loadProgress();
    } catch {
      setUpdateError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setUpdatingPhaseId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        to={backPath}
        className="text-sm font-semibold text-primary hover:text-glow"
      >
        &lt;- Back to projects
      </Link>

      {isLoading ? (
        <section className="animate-pulse rounded-2xl border border-white/10 bg-surface p-8">
          <div className="h-4 w-1/4 rounded bg-white/10" />
          <div className="mt-4 h-8 w-2/3 rounded bg-white/10" />
          <div className="mt-8 h-3 w-full rounded bg-white/10" />
        </section>
      ) : error ? (
        <section
          className="rounded-2xl border border-red-400/20 bg-red-400/5 p-8"
          role="alert"
        >
          <p className="text-sm text-red-200">{error}</p>
          <button
            type="button"
            onClick={() => void loadProgress()}
            className="mt-5 rounded-full border border-primary px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
          >
            Try again
          </button>
        </section>
      ) : data ? (
        <>
          <section className="rounded-2xl border border-white/10 bg-surface p-6 sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Project progress
            </p>
            <h1 className="mt-3 font-heading text-4xl font-bold text-white">
              {data.project.name}
            </h1>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-void/45 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-white/45">
                  Current phase
                </p>
                <p className="mt-2 text-sm font-semibold text-white/85">
                  {data.project.currentPhaseName}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-void/45 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-white/45">
                  Progress
                </p>
                <p className="mt-2 text-sm font-semibold text-white/85">
                  {data.project.progressPercentage}%
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-void/45 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-white/45">
                  Next milestone
                </p>
                <p className="mt-2 text-sm font-semibold text-white/85">
                  {data.project.nextMilestone}
                </p>
                <p className="mt-1 text-xs text-white/55">
                  Due {formatDate(data.project.nextMilestoneDueDate)}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-surface p-6 sm:p-8">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-2xl font-bold text-white">
                Phase tracker
              </h2>
              {data.canUpdate ? (
                <span className="rounded-full border border-emerald-300/40 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                  Editable by you
                </span>
              ) : (
                <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-white/60">
                  Read-only view
                </span>
              )}
            </div>

            {data.phases.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-white/15 bg-void/40 p-5 text-sm text-white/60">
                Phases are not set up for this project yet.
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {data.phases.map((phase) => {
                  const isUpdating = updatingPhaseId === phase.id;

                  return (
                    <article
                      key={phase.id}
                      className="rounded-xl border border-white/10 bg-void/45 p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.14em] text-white/45">
                            Phase {phase.order + 1}
                          </p>
                          <h3 className="mt-1 text-sm font-semibold text-white">
                            {phase.name}
                          </h3>
                          <p className="mt-1 text-xs text-white/50">
                            Due {formatDate(phase.dueDate)}
                          </p>
                        </div>
                        <span
                          className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClass[phase.status]}`}
                        >
                          {phase.status.replaceAll("_", " ")}
                        </span>
                      </div>

                      {data.canUpdate ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {statusOptions.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              disabled={
                                isUpdating || option.value === phase.status
                              }
                              onClick={() =>
                                void handleUpdatePhase(phase.id, option.value)
                              }
                              className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:border-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Mark {option.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}

            {updateError ? (
              <p className="mt-4 text-sm text-red-300" role="alert">
                {updateError}
              </p>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

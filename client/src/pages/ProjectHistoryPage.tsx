import { type ReactElement, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

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

const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};

const formatCurrency = (value: number): string => `$${value.toFixed(2)}`;

const getErrorMessage = (value: unknown): string => {
  if (typeof value === "object" && value !== null) {
    const error = value as ErrorResponse;
    if (typeof error.message === "string") return error.message;
  }
  return "Unable to load project history.";
};

export function ProjectHistoryPage(): ReactElement {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
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
        setProjects(body);
      } catch {
        setError("Unable to connect to CivilHub. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadHistory();
  }, [retryKey]);

  const roleLabel = currentUser?.role === "client" ? "engineers" : "clients";

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
          Completed delivery
        </p>
        <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Project History
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          A record of finished work and the {roleLabel} who helped deliver it.
        </p>
      </div>

      {isLoading ? (
        <section
          className="grid gap-5 lg:grid-cols-2"
          aria-label="Loading project history"
        >
          {[1, 2].map((item) => (
            <div
              key={item}
              className="animate-pulse rounded-2xl border border-white/10 bg-surface p-6"
            >
              <div className="h-3 w-1/3 rounded bg-white/10" />
              <div className="mt-4 h-7 w-2/3 rounded bg-white/10" />
              <div className="mt-8 h-12 rounded bg-white/10" />
            </div>
          ))}
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
            No completed projects yet
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/55">
            Finished projects will be kept here for easy reference.
          </p>
        </section>
      ) : (
        <section
          className="grid gap-5 lg:grid-cols-2"
          aria-label="Completed projects"
        >
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() =>
                navigate(
                  `${currentUser?.role === "client" ? "/dashboard/client" : "/dashboard/engineer"}/projects/${project.id}`,
                )
              }
              className="group rounded-2xl border border-white/10 bg-surface p-6 text-left transition-all duration-300 hover:-translate-y-1 hover:border-emerald-300/35 hover:shadow-[0_16px_40px_rgba(0,0,0,0.25)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
                    Completed
                  </p>
                  <h2 className="mt-2 font-heading text-2xl font-bold text-white">
                    {project.title}
                  </h2>
                </div>
                {project.rating !== null && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-amber-300">
                    <span>★</span>
                    <span className="text-white">
                      {project.rating.toFixed(1)}
                    </span>
                  </span>
                )}
              </div>
              <div className="mt-6 grid gap-4 border-t border-white/10 pt-5 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-white/40">
                    {currentUser?.role === "client" ? "Engineer" : "Client"}
                  </p>
                  {project.otherParty ? (
                    <Link
                      to={`/users/${project.otherParty.id}`}
                      onClick={(event) => event.stopPropagation()}
                      className="mt-2 inline-flex text-sm font-semibold text-primary hover:text-glow"
                    >
                      {project.otherParty.name}
                    </Link>
                  ) : (
                    <p className="mt-2 text-sm text-white/55">Not assigned</p>
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-white/40">
                    Completed
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white/80">
                    {formatDate(project.completedAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-white/40">
                    Value paid
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white/80">
                    {formatCurrency(project.totalValuePaid)}
                  </p>
                </div>
              </div>
              <p className="mt-5 text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                Open project history <span aria-hidden="true">-&gt;</span>
              </p>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

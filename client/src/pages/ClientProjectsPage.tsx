import { type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

interface ClientProject {
  id: string;
  projectName: string;
  assignedEngineer: string | null;
  currentPhaseName: string;
  progressPercentage: number;
  nextMilestone: string;
}

const projects: ClientProject[] = [
  {
    id: "northline-bypass",
    projectName: "Northline By-Pass",
    assignedEngineer: "Morgan Rivera",
    currentPhaseName: "Structural design review",
    progressPercentage: 78,
    nextMilestone: "Design package approval",
  },
  {
    id: "harbor-link",
    projectName: "Harbor Link Interchange",
    assignedEngineer: "Amara Stone",
    currentPhaseName: "Site investigation",
    progressPercentage: 46,
    nextMilestone: "Geotechnical report",
  },
  {
    id: "east-ridge-water",
    projectName: "East Ridge Water Main",
    assignedEngineer: null,
    currentPhaseName: "Reviewing bids",
    progressPercentage: 12,
    nextMilestone: "Select engineering partner",
  },
];

export function ClientProjectsPage(): ReactElement {
  const navigate = useNavigate();
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
            <div className="mt-6 border-t border-white/10 pt-5">
              <p className="text-xs uppercase tracking-[0.14em] text-white/40">
                Next milestone
              </p>
              <p className="mt-2 text-sm font-semibold text-white/85">
                {project.nextMilestone}
              </p>
            </div>
            <p className="mt-5 text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
              {project.assignedEngineer
                ? "Open project progress ->"
                : "Review bids ->"}
            </p>
          </button>
        ))}
      </section>
    </div>
  );
}

import { type ReactElement } from "react";
import { formatDate } from "../../../lib/format";
import { panelClassName } from "../../dashboard/ui/buttonStyles";
import { type DeliveredProject } from "./profileTypes";

/** Projects someone finished on CivilHub. Prices stay private to the parties. */
export function DeliveredProjects({
  projects,
  emptyText,
  headingId,
}: {
  projects: DeliveredProject[];
  emptyText: string;
  headingId: string;
}): ReactElement {
  return (
    <section className={`${panelClassName} p-6`} aria-labelledby={headingId}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id={headingId} className="font-heading text-2xl font-bold text-white">
          Projects delivered on CivilHub
        </h2>
        {projects.length > 0 ? (
          <p className="text-sm tabular-nums text-white/50">{projects.length} shown</p>
        ) : null}
      </div>
      {projects.length === 0 ? (
        <p className="mt-3 text-sm text-white/55">{emptyText}</p>
      ) : (
        <ul className="mt-4 divide-y divide-white/10">
          {projects.map((project) => (
            <li key={project.id} className="py-3">
              <p className="text-sm font-semibold text-white">{project.title}</p>
              <p className="mt-0.5 text-xs text-white/55">
                {project.category}
                {project.location ? ` · ${project.location}` : ""} · Completed{" "}
                {formatDate(project.completedAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

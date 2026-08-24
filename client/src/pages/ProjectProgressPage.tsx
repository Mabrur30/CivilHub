import { type ReactElement } from "react";
import { Link, useParams } from "react-router-dom";

export function ProjectProgressPage(): ReactElement {
  const { projectId } = useParams<{ projectId: string }>();
  const projectName =
    projectId
      ?.split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ") ?? "Project";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/dashboard/engineer/projects"
        className="text-sm font-semibold text-primary hover:text-glow"
      >
        &lt;- Back to My Projects
      </Link>
      <section className="rounded-2xl border border-white/10 bg-surface p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
          Project progress
        </p>
        <h1 className="mt-3 font-heading text-4xl font-bold text-white">
          {projectName}
        </h1>
        <p className="mt-4 text-white/60">
          Detailed progress tracking will connect to the project service in the
          next integration step.
        </p>
      </section>
    </div>
  );
}

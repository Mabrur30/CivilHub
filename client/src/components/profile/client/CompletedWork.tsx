import { MapPinIcon } from "@phosphor-icons/react";
import { type ReactElement } from "react";
import { Link } from "react-router-dom";
import { formatDate } from "../../../lib/format";
import { Avatar } from "../../Avatar";
import { panelClassName } from "../../dashboard/ui/buttonStyles";
import { type ClientCompletedProject } from "./clientProfile";

interface CompletedWorkProps {
  projects: ClientCompletedProject[];
  totalCompleted: number;
  isOwner: boolean;
  profilePath: string;
  profileName: string;
}

export function CompletedWork({
  projects,
  totalCompleted,
  isOwner,
  profilePath,
  profileName,
}: CompletedWorkProps): ReactElement | null {
  // Visitors are not shown an empty section; the track record already says
  // nothing has been delivered. The owner gets a line explaining what will
  // appear here.
  if (projects.length === 0 && !isOwner) return null;

  return (
    <section aria-labelledby="completed-work-heading" className="grid gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id="completed-work-heading"
          className="font-heading text-2xl font-bold text-white"
        >
          Completed projects
        </h2>
        {totalCompleted > projects.length ? (
          <p className="text-sm text-white/50">
            Latest {projects.length} of {totalCompleted}
          </p>
        ) : null}
      </div>

      {projects.length === 0 ? (
        <p className={`${panelClassName} px-5 py-8 text-sm text-white/55 sm:px-6`}>
          Projects an engineer delivers for you show here, with a link to
          their profile.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((project) => (
            <li
              key={project.id}
              className={`${panelClassName} flex flex-col justify-between p-5`}
            >
              <div>
                <p className="text-xs font-semibold text-white/50">
                  {project.category}
                </p>
                <h3 className="mt-1.5 font-heading text-lg font-bold leading-snug text-white">
                  {project.title}
                </h3>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/50">
                  {project.location ? (
                    <span className="flex items-center gap-1">
                      <MapPinIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      {project.location}
                    </span>
                  ) : null}
                  <span>Finished {formatDate(project.completedAt)}</span>
                </p>
              </div>

              {project.engineer ? (
                <Link
                  to={`/profile/${project.engineer.id}`}
                  state={{ backTo: profilePath, backLabel: `Back to ${profileName}` }}
                  className="group mt-5 flex items-center gap-3 border-t border-white/10 pt-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-glow"
                >
                  <Avatar
                    name={project.engineer.name}
                    photoUrl={project.engineer.profilePhotoUrl}
                    size="xs"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs text-white/45">
                      Delivered by
                    </span>
                    <span className="block truncate font-semibold text-white/85 underline decoration-white/20 underline-offset-4 transition-colors group-hover:text-white group-hover:decoration-white/60">
                      {project.engineer.name}
                    </span>
                  </span>
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

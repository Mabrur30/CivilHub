import { ArrowRightIcon, BriefcaseIcon } from "@phosphor-icons/react";
import { type ReactElement } from "react";
import { Link } from "react-router-dom";
import { type UserRole } from "../../context/AuthContext";
import { projectPathFor, relationLabel } from "./projectContext";
import { type ConversationProject } from "./types";

const chipClass: Record<ConversationProject["relation"], string> = {
  hired: "bg-emerald-400/10 text-emerald-300",
  bidding: "bg-sky-400/10 text-sky-300",
  open: "bg-primary/10 text-primary",
  closed: "bg-white/5 text-white/55",
};

/**
 * The project this chat is about, under the thread header. With several
 * projects between the pair, a select picks which one new messages are about.
 */
export function ProjectContextBar({
  projects,
  activeProjectId,
  onChange,
  viewerRole,
}: {
  projects: ConversationProject[];
  activeProjectId: string | null;
  onChange: (projectId: string) => void;
  viewerRole: UserRole | undefined;
}): ReactElement | null {
  const active = projects.find((project) => project.id === activeProjectId) ?? projects[0];
  if (!active) return null;
  const path = projectPathFor(active, viewerRole);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/10 bg-void/40 px-4 py-2.5 sm:px-5">
      <BriefcaseIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-white/45" />
      <span className="text-xs font-semibold text-white/45">About</span>
      {projects.length > 1 ? (
        <select
          aria-label="Project this message is about"
          value={active.id}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 max-w-[16rem] truncate rounded-lg border border-white/15 bg-void px-2 py-1 text-sm font-semibold text-white outline-none focus:border-primary"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </select>
      ) : (
        <span className="min-w-0 truncate text-sm font-semibold text-white">{active.title}</span>
      )}
      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${chipClass[active.relation]}`}>
        {relationLabel(active, viewerRole)}
      </span>
      {path ? (
        <Link
          to={path}
          className="ml-auto inline-flex items-center gap-1 rounded text-xs font-semibold text-white/60 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow"
        >
          {active.relation === "hired" ? "Open project" : viewerRole === "client" ? "See bids" : "View brief"}
          <ArrowRightIcon aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

import {
  CalendarBlankIcon,
  CaretDownIcon,
  CheckIcon,
  MapPinIcon,
} from "@phosphor-icons/react";
import { type ReactElement, useId, useState } from "react";
import { Link } from "react-router-dom";
import { formatDate } from "../../../lib/format";
import { formatRelativeTime } from "../../dashboard/notificationUtils";
import {
  panelClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "../../dashboard/ui/buttonStyles";
import { type BidStatus, type ClientOpenProject } from "./clientProfile";

export type BriefViewer = "owner" | "engineer" | "other";

interface OpenBriefsProps {
  projects: ClientOpenProject[];
  totalOpen: number;
  viewer: BriefViewer;
  clientFirstName: string;
}

const bidStatusCopy: Record<BidStatus, { label: string; className: string }> = {
  pending: {
    label: "Bid submitted",
    className: "bg-white/5 text-white/65",
  },
  accepted: {
    label: "Your bid was accepted",
    className: "bg-emerald-400/10 text-emerald-200",
  },
  declined: {
    label: "Your bid was declined",
    className: "bg-white/5 text-white/45",
  },
};

function BriefAction({
  project,
  viewer,
}: {
  project: ClientOpenProject;
  viewer: BriefViewer;
}): ReactElement | null {
  if (viewer === "owner") {
    return project.bidCount === 0 ? null : (
      <Link to="/dashboard/client/bids" className={secondaryButtonClassName}>
        {project.bidCount === 1 ? "Review bid" : "Review bids"}
      </Link>
    );
  }
  if (viewer !== "engineer") return null;

  if (project.myBidStatus) {
    const status = bidStatusCopy[project.myBidStatus];
    return (
      <p
        className={`inline-flex w-fit items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold ${status.className}`}
      >
        <CheckIcon className="h-4 w-4" aria-hidden="true" />
        {status.label}
      </p>
    );
  }

  return (
    <Link
      to={`/dashboard/engineer/marketplace?project=${encodeURIComponent(project.id)}`}
      className={primaryButtonClassName}
    >
      Submit bid
    </Link>
  );
}

function BriefRow({
  project,
  viewer,
  isOpen,
  onToggle,
}: {
  project: ClientOpenProject;
  viewer: BriefViewer;
  isOpen: boolean;
  onToggle: () => void;
}): ReactElement {
  const panelId = useId();
  const posted = formatRelativeTime(project.postedDate);
  const bids =
    project.bidCount === 0
      ? "No bids yet"
      : `${project.bidCount} ${project.bidCount === 1 ? "bid" : "bids"}`;

  return (
    <li>
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={panelId}
          className="group flex w-full items-start gap-4 px-5 py-5 text-left transition-colors hover:bg-white/3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-glow sm:px-6"
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
              <span className="rounded-full bg-white/5 px-2.5 py-1 font-semibold text-white/70">
                {project.category}
              </span>
              <span className="text-white/45" title={formatDate(project.postedDate)}>
                Posted {posted ? posted.toLowerCase() : formatDate(project.postedDate)}
              </span>
            </span>
            <span className="mt-2 block font-heading text-xl font-bold text-white">
              {project.title}
            </span>
            <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="font-semibold text-white/85">
                {project.budgetRange}
              </span>
              <span className="text-white/50">{bids}</span>
            </span>
          </span>
          <CaretDownIcon
            className={`mt-1 h-5 w-5 shrink-0 text-white/45 transition-transform duration-300 group-hover:text-white/80 motion-reduce:transition-none ${
              isOpen ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>
      </h3>

      {/* Grid rows animate from 0fr to 1fr, so the panel opens to its real
          height without measuring it. */}
      <div
        id={panelId}
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
        inert={!isOpen}
      >
        <div className="overflow-hidden">
          <div className="grid gap-4 px-5 pb-6 sm:px-6">
            <p className="max-w-[65ch] whitespace-pre-line text-sm leading-6 text-white/65">
              {project.description.trim() || "No description added yet."}
            </p>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/60">
              {project.location ? (
                <li className="flex items-center gap-1.5">
                  <MapPinIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {project.location}
                </li>
              ) : null}
              {project.targetStartDate ? (
                <li className="flex items-center gap-1.5">
                  <CalendarBlankIcon
                    className="h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  Wants to start {formatDate(project.targetStartDate)}
                </li>
              ) : null}
            </ul>
            <BriefAction project={project} viewer={viewer} />
          </div>
        </div>
      </div>
    </li>
  );
}

export function OpenBriefs({
  projects,
  totalOpen,
  viewer,
  clientFirstName,
}: OpenBriefsProps): ReactElement {
  // The newest brief starts open so the section shows what a brief contains
  // without a click; the rest stay folded to keep the list scannable.
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(projects[0] ? [projects[0].id] : []),
  );

  const toggle = (id: string): void =>
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section aria-labelledby="open-briefs-heading" className="grid gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id="open-briefs-heading"
          className="font-heading text-2xl font-bold text-white"
        >
          Open briefs
        </h2>
        {totalOpen > projects.length ? (
          <p className="text-sm text-white/50">
            Showing the newest {projects.length} of {totalOpen}
          </p>
        ) : null}
      </div>

      {projects.length === 0 ? (
        <div className={`${panelClassName} px-5 py-8 sm:px-6`}>
          {viewer === "owner" ? (
            <>
              <p className="text-sm text-white/65">
                You have no briefs taking bids right now. Post one and it shows
                here for engineers who visit your profile.
              </p>
              <Link
                to="/dashboard/client/post-project"
                className={`${primaryButtonClassName} mt-5`}
              >
                Post a project
              </Link>
            </>
          ) : (
            <p className="text-sm text-white/55">
              {clientFirstName} has no briefs taking bids right now.
            </p>
          )}
        </div>
      ) : (
        <ul className={`${panelClassName} divide-y divide-white/10`}>
          {projects.map((project) => (
            <BriefRow
              key={project.id}
              project={project}
              viewer={viewer}
              isOpen={openIds.has(project.id)}
              onToggle={() => toggle(project.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

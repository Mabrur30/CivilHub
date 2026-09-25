import { LockSimpleIcon } from "@phosphor-icons/react";
import { type ReactElement } from "react";
import { formatCurrency } from "../../../lib/format";
import { type BandStat, StatBand } from "../../dashboard/overview/StatBand";
import { panelClassName } from "../../dashboard/ui/buttonStyles";
import { type ClientTrackRecord } from "./clientProfile";

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

// Each figure carries a sentence saying what it is counted from, so an engineer
// never has to guess whether "67%" is good or how many projects it rests on.
const toBandStats = (stats: ClientTrackRecord): BandStat[] => [
  {
    label: "Projects posted",
    value: stats.projectsPosted,
    detail:
      stats.projectsPosted === 0
        ? "No briefs posted yet"
        : `${stats.activeProjects} in progress, ${stats.openProjects} taking bids`,
  },
  {
    label: "Hire rate",
    value: stats.hireRate ?? 0,
    display: stats.hireRate === null ? "New" : `${stats.hireRate}%`,
    detail:
      stats.hireRate === null
        ? "No brief has been awarded or closed yet"
        : `Hired on ${stats.hiredProjects} of ${plural(stats.decidedProjects, "decided brief", "decided briefs")}`,
  },
  {
    label: "Phase payments",
    value: stats.phasesPaid,
    display:
      stats.phasesDue === 0
        ? "None due"
        : `${stats.phasesPaid}/${stats.phasesDue}`,
    detail:
      stats.phasesDue === 0
        ? "No payments have fallen due yet"
        : stats.phasesPaid === stats.phasesDue
          ? "Every finished phase has been paid"
          : `${plural(stats.phasesDue - stats.phasesPaid, "finished phase is", "finished phases are")} waiting for payment`,
  },
  {
    label: "Completed",
    value: stats.completedProjects,
    detail:
      stats.completedProjects === 0
        ? "Nothing delivered yet"
        : "Delivered with an engineer on CivilHub",
  },
];

export function ClientTrackRecord({
  stats,
}: {
  stats: ClientTrackRecord;
}): ReactElement {
  return (
    <section aria-labelledby="track-record-heading" className="grid gap-3">
      <h2
        id="track-record-heading"
        className="font-heading text-2xl font-bold text-white"
      >
        Track record
      </h2>
      <StatBand stats={toBandStats(stats)} isLoading={false} />
    </section>
  );
}

interface TypicalWorkProps {
  stats: ClientTrackRecord;
  phone: string | null;
  onEditPhone?: () => void;
}

export function TypicalWork({
  stats,
  phone,
  onEditPhone,
}: TypicalWorkProps): ReactElement {
  const budget =
    stats.budgetMin !== null && stats.budgetMax !== null
      ? stats.budgetMin === stats.budgetMax
        ? formatCurrency(stats.budgetMin)
        : `${formatCurrency(stats.budgetMin)} - ${formatCurrency(stats.budgetMax)}`
      : null;

  return (
    <aside className="grid content-start gap-4">
      <section className={`${panelClassName} p-5 sm:p-6`}>
        <h2 className="font-heading text-xl font-bold text-white">
          Typical work
        </h2>
        <dl className="mt-4 grid gap-4 text-sm">
          <div>
            <dt className="text-xs font-semibold text-white/45">
              Budgets posted
            </dt>
            <dd className="mt-1 font-semibold text-white/90">
              {budget ?? (
                <span className="font-normal text-white/50">
                  No budgets posted yet
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-white/45">Hires for</dt>
            <dd className="mt-2">
              {stats.topCategories.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {stats.topCategories.map((category) => (
                    <li
                      key={category}
                      className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-semibold text-white/75"
                    >
                      {category}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-white/50">No hires yet</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {phone !== null ? (
        <section className={`${panelClassName} p-5 sm:p-6`}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-bold text-white">
              Contact
            </h2>
            {onEditPhone ? (
              <button
                type="button"
                onClick={onEditPhone}
                className="rounded text-sm font-semibold text-primary transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow"
              >
                Edit
              </button>
            ) : null}
          </div>
          <p className="mt-3 text-sm text-white/85">
            {phone.trim() || (
              <span className="text-white/50">No phone number added</span>
            )}
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-white/45">
            <LockSimpleIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Only you can see this
          </p>
        </section>
      ) : null}
    </aside>
  );
}

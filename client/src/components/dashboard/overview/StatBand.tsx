import { type ReactElement, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useCountUp } from "../../../hooks/useCountUp";

export interface BandStat {
  label: string;
  value: number;
  /** Formatted value to show instead of the bare number, e.g. "৳12,400". */
  display?: string;
  detail: string;
  route?: string;
}

interface StatBandProps {
  stats: BandStat[];
  isLoading: boolean;
  /** Grid column classes. Pick counts that divide evenly so no empty cell
      shows through the hairline backing. Four stats (2x2, then 1x4) by default. */
  columnsClassName?: string;
  /** How many placeholder cells to show while loading. */
  skeletonCount?: number;
}

const SKELETON_CELLS = 4;

// One band split by hairlines rather than four floating cards: the figures are
// peers, and none of them earns more elevation than the others. The hairlines
// come from a 1px gap over a white/10 backing, so they stay correct whether the
// grid is 2x2 on phones or a single row on desktop.
const bandClassName =
  "grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10";

const cellClassName = "group flex flex-col bg-surface p-5 sm:p-6";

// Cells with somewhere to go are links; a figure that is only a record (a
// lifetime total, an average) is plain text, so it never pretends to be a link.
function CellWrapper({
  route,
  children,
}: {
  route?: string;
  children: ReactNode;
}): ReactElement {
  if (!route) return <div className={cellClassName}>{children}</div>;
  return (
    <Link
      to={route}
      className={`${cellClassName} transition-colors hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-glow active:bg-white/[0.03]`}
    >
      {children}
    </Link>
  );
}

function StatCell({ stat }: { stat: BandStat }): ReactElement {
  const displayValue = useCountUp(stat.display ?? String(stat.value), true);

  return (
    <CellWrapper route={stat.route}>
      {/* The accent is kept for figures that need attention; a zero is muted
          so an empty dashboard does not shout four red noughts. */}
      <span
        className={`font-heading text-4xl font-bold tabular-nums sm:text-5xl ${
          stat.value === 0 ? "text-white/35" : "text-primary"
        }`}
      >
        {displayValue}
      </span>
      <span className="mt-3 text-sm font-semibold text-white/85 transition-colors group-hover:text-white">
        {stat.label}
      </span>
      <span className="mt-1 text-xs leading-5 text-white/45">
        {stat.detail}
      </span>
    </CellWrapper>
  );
}

export function StatBand({
  stats,
  isLoading,
  columnsClassName = "grid-cols-2 lg:grid-cols-4",
  skeletonCount = SKELETON_CELLS,
}: StatBandProps): ReactElement {
  const className = `${bandClassName} ${columnsClassName}`;

  if (isLoading) {
    return (
      <div className={className} aria-label="Loading summary">
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <div
            key={`stat-skeleton-${index}`}
            className="animate-pulse bg-surface p-5 sm:p-6"
          >
            <div className="h-10 w-12 rounded bg-white/10 sm:h-12" />
            <div className="mt-4 h-3.5 w-2/3 rounded bg-white/10" />
            <div className="mt-2 h-3 w-1/2 rounded bg-white/10" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <section className={className} aria-label="Summary">
      {stats.map((stat) => (
        <StatCell key={stat.label} stat={stat} />
      ))}
    </section>
  );
}

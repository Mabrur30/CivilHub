import { type ReactElement } from "react";
import { MatchRow } from "./MatchRow";
import { MilestoneRow } from "./MilestoneRow";
import { MockFrame } from "./MockFrame";
import { ProgressRow } from "./ProgressRow";
import { StatTile } from "./StatTile";

/**
 * One illustrative mockup per workflow stage. Each is composed from the shared
 * primitives but shaped differently — a form, a list, a progress view, a
 * close-out — so the four sections do not read as the same card four times.
 *
 * Deliberately narrower in scope than the hero's Northline card: that one is the
 * whole project dashboard, these are each a single moment from it.
 */

function FieldRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/3 px-3 py-2.5">
      <span className="shrink-0 text-xs uppercase tracking-[0.16em] text-white/40">
        {label}
      </span>
      <span className="truncate text-sm text-white/80">{value}</span>
    </div>
  );
}

export function PostBriefMockup(): ReactElement {
  return (
    <MockFrame eyebrow="New project" title="Project brief" status="Draft">
      <div className="space-y-2.5">
        <FieldRow label="Scope" value="Road widening, 4.2 km" />
        <FieldRow label="Site" value="Northline corridor, Sector 7" />
        <FieldRow label="Timeline" value="Start November · 14 weeks" />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/3 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-white/45">
          Budget range
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {["Under $250k", "$250k–500k", "$500k+"].map((band, index) => (
            <span
              key={band}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                index === 1
                  ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                  : "bg-white/5 text-white/50"
              }`}
            >
              {band}
            </span>
          ))}
        </div>
      </div>
    </MockFrame>
  );
}

export function MatchingMockup(): ReactElement {
  return (
    <MockFrame
      eyebrow="Matching"
      title="Suggested engineers"
      status="6 matches"
    >
      <div className="space-y-2.5">
        <MatchRow
          name="Tanvir Rahman"
          discipline="Structural · 11 yrs"
          rating={4.9}
          reviewCount={34}
          matchPercent={96}
        />
        <MatchRow
          name="Sadia Karim"
          discipline="Geotechnical · 8 yrs"
          rating={4.8}
          reviewCount={21}
          matchPercent={91}
        />
        <MatchRow
          name="Imran Hossain"
          discipline="Highway & drainage · 14 yrs"
          rating={4.7}
          reviewCount={47}
          matchPercent={88}
        />
      </div>
    </MockFrame>
  );
}

export function ProgressMockup(): ReactElement {
  return (
    <MockFrame eyebrow="In delivery" title="Site progress" status="On track">
      <ProgressRow label="Package 2 — earthworks" percent={64} />

      <div className="space-y-2.5">
        <MilestoneRow label="Survey approval" state="done" stateLabel="Done" />
        <MilestoneRow
          label="Structural design review"
          state="active"
          stateLabel="In review"
        />
        <MilestoneRow
          label="Site mobilization"
          state="pending"
          stateLabel="Pending"
        />
      </div>
    </MockFrame>
  );
}

export function HandoverMockup(): ReactElement {
  return (
    <MockFrame
      eyebrow="Close-out"
      title="Handover record"
      status="Signed off"
      statusTone="positive"
    >
      <div className="space-y-2.5">
        <MilestoneRow
          label="As-built drawings"
          state="done"
          stateLabel="Filed"
        />
        <MilestoneRow
          label="Compliance certificates"
          state="done"
          stateLabel="Filed"
        />
        <MilestoneRow
          label="Final inspection"
          state="done"
          stateLabel="Cleared"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile label="Delivered" value="On schedule" />
        <StatTile label="Variance" value="+1.4%" />
      </div>
    </MockFrame>
  );
}

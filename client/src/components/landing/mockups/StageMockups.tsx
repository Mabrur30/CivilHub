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
        <FieldRow label="Type" value="Roads & transport" />
        <FieldRow label="Scope" value="Road widening, 4.2 km" />
        <FieldRow label="Site" value="Mirpur, Dhaka · area only" />
        <FieldRow label="Timeline" value="Start November · 14 weeks" />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/3 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-white/45">
          Budget range
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {["Under ৳25 lakh", "৳25 lakh–1 crore", "৳1 crore+"].map((band, index) => (
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
    <MockFrame eyebrow="Marketplace" title="Bids received" status="6 bids">
      <div className="space-y-2.5">
        <MatchRow
          name="Tanvir Rahman"
          specialities={["Roads & transport", "Structural"]}
          rating={4.9}
          reviewCount={34}
          bidAmount="৳18.5 lakh"
        />
        <MatchRow
          name="Sadia Karim"
          specialities={["Geotechnical", "Civil & site works"]}
          rating={4.8}
          reviewCount={21}
          bidAmount="৳17.2 lakh"
        />
        <MatchRow
          name="Delta Earthworks Ltd."
          specialities={["Civil & site works", "Water & drainage"]}
          rating={4.7}
          reviewCount={47}
          bidAmount="৳19.8 lakh"
        />
      </div>

      <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-white/55">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
        Phone numbers and emails stay hidden in chat until you hire.
      </div>
    </MockFrame>
  );
}

export function ProgressMockup(): ReactElement {
  return (
    <MockFrame eyebrow="In delivery" title="Phase plan" status="On track">
      <ProgressRow label="Phase 2 — earthworks" percent={64} />

      <div className="space-y-2.5">
        <MilestoneRow label="Phase 1 · Survey" state="done" stateLabel="Paid" />
        <MilestoneRow
          label="Phase 2 · Earthworks"
          state="awaiting"
          stateLabel="Awaiting approval"
        />
        <MilestoneRow
          label="Phase 3 · Paving"
          state="pending"
          stateLabel="Upcoming"
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/3 px-3.5 py-3 text-sm">
        <span className="min-w-0 truncate text-white/65">
          Handover note · 3 files
        </span>
        <span className="shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-on-primary">
          Approve &amp; pay
        </span>
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
          label="Phase files gathered"
          state="done"
          stateLabel="12 files"
        />
        <MilestoneRow
          label="As-built drawings"
          state="done"
          stateLabel="Filed"
        />
        <MilestoneRow
          label="Final phase payment"
          state="done"
          stateLabel="Paid"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile label="Delivered" value="On schedule" />
        <StatTile label="Reviews" value="Both sides" />
      </div>
    </MockFrame>
  );
}

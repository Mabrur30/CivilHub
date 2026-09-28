import { type ReactElement } from "react";

export type MilestoneState = "done" | "active" | "awaiting" | "pending";

export interface MilestoneRowProps {
  label: string;
  state: MilestoneState;
  stateLabel: string;
}

// Same status language as the dashboards: emerald for paid/done, sky for in
// progress, violet for "awaiting / needs you".
const stateClassMap: Record<MilestoneState, string> = {
  done: "text-emerald-400",
  active: "text-sky-300",
  awaiting: "text-violet-200",
  pending: "text-white/40",
};

const dotClassMap: Record<MilestoneState, string> = {
  done: "bg-emerald-400",
  active: "bg-sky-300",
  awaiting: "bg-violet-300",
  pending: "bg-white/25",
};

export function MilestoneRow({
  label,
  state,
  stateLabel,
}: MilestoneRowProps): ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3 py-2 text-sm">
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClassMap[state]}`}
        />
        <span className="truncate text-white/75">{label}</span>
      </span>
      <span className={`shrink-0 ${stateClassMap[state]}`}>{stateLabel}</span>
    </div>
  );
}

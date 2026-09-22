import { type ReactElement } from "react";

export type MilestoneState = "done" | "active" | "pending";

export interface MilestoneRowProps {
  label: string;
  state: MilestoneState;
  stateLabel: string;
}

const stateClassMap: Record<MilestoneState, string> = {
  done: "text-emerald-400",
  active: "text-amber-300",
  pending: "text-white/40",
};

export function MilestoneRow({
  label,
  state,
  stateLabel,
}: MilestoneRowProps): ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2 text-sm">
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            state === "done"
              ? "bg-emerald-400"
              : state === "active"
                ? "bg-amber-300"
                : "bg-white/25"
          }`}
        />
        <span className="truncate text-white/75">{label}</span>
      </span>
      <span className={`shrink-0 ${stateClassMap[state]}`}>{stateLabel}</span>
    </div>
  );
}

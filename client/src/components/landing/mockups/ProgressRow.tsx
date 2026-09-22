import { type ReactElement } from "react";

export interface ProgressRowProps {
  label: string;
  percent: number;
}

export function ProgressRow({ label, percent }: ProgressRowProps): ReactElement {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/3 p-4">
      <div className="flex items-center justify-between text-sm text-white/65">
        <span>{label}</span>
        <span className="font-semibold text-white">{percent}%</span>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-glow"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

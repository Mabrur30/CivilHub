import { type ReactElement } from "react";

export interface StatTileProps {
  label: string;
  value: string;
}

export function StatTile({ label, value }: StatTileProps): ReactElement {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/3 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-white/45">{label}</p>
      <p className="mt-3 font-heading text-2xl text-white sm:text-3xl">
        {value}
      </p>
    </div>
  );
}

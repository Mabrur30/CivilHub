import { type ReactElement } from "react";

export interface LedgerEntry {
  label: string;
  value: string;
  detail: string;
}

// Money reads as a ledger: plain tabular figures separated by hairlines. The
// large red display numbers stay with counts on the engineer side; amounts a
// client pays should be easy to compare, not loud.
export function LedgerBand({
  entries,
  isLoading,
  label,
}: {
  entries: LedgerEntry[];
  isLoading: boolean;
  label: string;
}): ReactElement {
  return (
    <section
      aria-label={label}
      className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3"
    >
      {isLoading
        ? [0, 1, 2].map((cell) => (
            <div key={cell} className="animate-pulse bg-surface p-5 sm:p-6">
              <div className="h-3.5 w-1/3 rounded bg-white/10" />
              <div className="mt-3 h-8 w-1/2 rounded bg-white/10" />
              <div className="mt-3 h-3 w-2/3 rounded bg-white/10" />
            </div>
          ))
        : entries.map((entry) => (
            <div key={entry.label} className="bg-surface p-5 sm:p-6">
              <p className="text-sm text-white/55">{entry.label}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-white sm:text-3xl">
                {entry.value}
              </p>
              <p className="mt-2 text-xs leading-5 text-white/45">
                {entry.detail}
              </p>
            </div>
          ))}
    </section>
  );
}

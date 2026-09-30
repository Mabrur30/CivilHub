import { type ReactElement } from "react";
import { useCountUp } from "../../hooks/useCountUp";
import { useReveal } from "../../hooks/useReveal";
import { formatRate, useCommissionRate } from "../../lib/platform";

interface TrustStatsProps {}

interface Fact {
  value: string;
  label: string;
}

// Promises the product keeps today, not counts: every figure here is a rule,
// so it stays true however many projects there are. The commission is the
// live rate an admin set.
const factsFor = (rate: number | null): Fact[] => [
  { value: rate === null ? "…" : formatRate(rate), label: "commission, only when you get paid" },
  { value: "0%", label: "on security deposits" },
  { value: "3 days", label: "to appeal any dispute decision" },
  { value: "24 h", label: "to add your own photos at pickup and return" },
];

function StatValue({
  value,
  active,
}: {
  value: string;
  active: boolean;
}): ReactElement {
  const rendered = useCountUp(value, active);

  return (
    <div
      className="font-heading text-4xl font-bold text-white tabular-nums sm:text-5xl"
      // Screen readers get the real figure once, rather than every frame of the count.
      aria-label={value}
    >
      <span aria-hidden="true">{rendered}</span>
    </div>
  );
}

export function TrustStats(_props: TrustStatsProps): ReactElement {
  // One observer gates all four counters, so they run as a single event.
  const { ref, revealed } = useReveal<HTMLDivElement>(0.3);
  const rate = useCommissionRate();

  return (
    <section id="impact" className="bg-surface px-4 py-20 sm:px-6 lg:px-8" aria-label="CivilHub in numbers">
      <div ref={ref} className="mx-auto max-w-7xl">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {factsFor(rate).map((fact) => (
            <div
              key={fact.label}
              className="rounded-3xl border border-white/10 bg-void p-6 text-center transition-transform duration-300 hover:-translate-y-1"
            >
              {/* Keyed on the value so the count restarts once the live rate arrives. */}
              <StatValue key={fact.value} value={fact.value} active={revealed} />
              <p className="mt-3 text-base text-white/65">{fact.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

import { type ReactElement } from "react";
import { useCountUp } from "../../hooks/useCountUp";
import { useReveal } from "../../hooks/useReveal";

interface TrustStatsProps {}

const stats = [
  { value: "1,200+", label: "Projects coordinated" },
  { value: "320", label: "Verified specialists" },
  { value: "94%", label: "Client retention" },
  { value: "28 days", label: "Average mobilization" },
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

  return (
    <section id="impact" className="bg-surface px-4 py-20 sm:px-6 lg:px-8">
      <div ref={ref} className="mx-auto max-w-7xl">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-3xl border border-white/10 bg-void p-6 text-center transition-transform duration-300 hover:-translate-y-1"
            >
              <StatValue value={stat.value} active={revealed} />
              <p className="mt-3 text-base text-white/65">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

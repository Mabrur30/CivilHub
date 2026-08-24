import { type ReactElement } from "react";

interface TrustStatsProps {}

const stats = [
  { value: "1,200+", label: "Projects coordinated" },
  { value: "320", label: "Verified specialists" },
  { value: "94%", label: "Client retention" },
  { value: "28 days", label: "Average mobilization" },
];

export function TrustStats(_props: TrustStatsProps): ReactElement {
  return (
    <section className="bg-surface px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-3xl border border-white/10 bg-void p-6 text-center transition-transform duration-300 hover:-translate-y-1"
            >
              <div className="font-heading text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
                {stat.value}
              </div>
              <p className="mt-3 text-base text-white/65">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

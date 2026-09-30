import { type ReactElement } from "react";
import { formatRate, useCommissionRate } from "../../lib/platform";
import { Reveal } from "./Reveal";

interface PricingProps {}

interface Plan {
  figure: string;
  title: string;
  description: string;
  highlight?: boolean;
}

// The commission is the live rate an admin set (GET /api/public/platform).
const plansFor = (rate: number | null): Plan[] => {
  const figure = rate === null ? "…" : formatRate(rate);
  return [
    {
      figure: "Free",
      title: "To join, post and bid",
      description: "Post briefs, send bids, message and browse equipment. No subscription.",
    },
    {
      figure,
      title: "Only when you get paid",
      description: `Clients pay the agreed price. CivilHub keeps ${figure} of each payment before it reaches the engineer, company or equipment owner.`,
      highlight: true,
    },
    {
      figure: "0%",
      title: "On security deposits",
      description: "A deposit is held, not earned. We never take a cut of it.",
    },
  ];
};

export function Pricing(_props: PricingProps): ReactElement {
  const rate = useCommissionRate();

  return (
    <section id="pricing" className="bg-surface px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Reveal variant="head" className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">
            Pricing
          </p>
          <h2 className="mt-4 text-balance font-heading text-4xl font-bold text-white sm:text-5xl">
            Free to join. We earn when you do.
          </h2>
        </Reveal>

        <Reveal className="mt-12 grid gap-5 md:grid-cols-3">
          {plansFor(rate).map((plan) => (
            <div
              key={plan.title}
              className={`rounded-[28px] border p-6 sm:p-8 ${
                plan.highlight
                  ? "border-primary/50 bg-primary/6"
                  : "border-white/10 bg-void"
              }`}
            >
              <p className="font-heading text-5xl font-bold tabular-nums text-white sm:text-6xl">
                {plan.figure}
              </p>
              <h3 className="mt-3 font-heading text-xl font-bold text-primary">
                {plan.title}
              </h3>
              <p className="mt-4 text-base leading-7 text-white/65">
                {plan.description}
              </p>
            </div>
          ))}
        </Reveal>

        <p className="mt-8 text-center text-sm text-white/50">
          All amounts in Taka. Payments run through SSLCommerz: bKash, Nagad, cards and internet banking.
        </p>
      </div>
    </section>
  );
}

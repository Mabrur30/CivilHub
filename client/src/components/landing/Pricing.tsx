import { type ReactElement } from "react";
import { Reveal } from "./Reveal";

interface PricingProps {}

interface Plan {
  figure: string;
  title: string;
  description: string;
  highlight?: boolean;
}

// The 10% mirrors the server default (PLATFORM_COMMISSION_RATE in
// server/src/config/payments.ts). The landing page is public and the rate
// endpoints sit behind login, so it is written here — change both together.
const plans: Plan[] = [
  {
    figure: "Free",
    title: "To join and to post",
    description:
      "Create an account, post briefs, receive bids, message providers and browse equipment without paying anything.",
  },
  {
    figure: "10%",
    title: "Only when you get paid",
    description:
      "Clients pay the listed price. CivilHub keeps 10% of each payment before it reaches the engineer, company or equipment owner.",
    highlight: true,
  },
  {
    figure: "0%",
    title: "On security deposits",
    description:
      "An equipment deposit is held, not earned, so no commission is ever taken from it.",
  },
];

export function Pricing(_props: PricingProps): ReactElement {
  return (
    <section id="pricing" className="bg-surface px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Reveal variant="head" className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">
            Pricing
          </p>
          <h2 className="mt-4 text-balance font-heading text-4xl font-bold text-white sm:text-5xl">
            No subscription. We earn when the work does.
          </h2>
        </Reveal>

        <Reveal className="mt-12 grid gap-5 md:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.title}
              className={`rounded-[28px] border p-6 sm:p-8 ${
                plan.highlight
                  ? "border-primary/50 bg-primary/[0.06]"
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
          All amounts are in Taka. Payments are processed securely by
          SSLCommerz.
        </p>
      </div>
    </section>
  );
}

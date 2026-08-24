import { type ReactElement } from "react";
interface Step {
  number: string;
  title: string;
  description: string;
}

interface HowItWorksProps {}

const steps: Step[] = [
  {
    number: "01",
    title: "Post a project brief",
    description:
      "Outline scope, location, deadlines, and technical requirements so the right engineering partners can respond with real fit and pricing.",
  },
  {
    number: "02",
    title: "Get matched fast",
    description:
      "Review pre-qualified client or contractor matches based on sector expertise, availability, and contract profile without the noise.",
  },
  {
    number: "03",
    title: "Track progress together",
    description:
      "Keep approvals, drawings, RFIs, and milestones visible in one active project timeline that everyone can trust.",
  },
  {
    number: "04",
    title: "Deliver with clarity",
    description:
      "Close out handover, compliance, and final signoff from a shared record that reduces rework and delays.",
  },
];

export function HowItWorks(_props: HowItWorksProps): ReactElement {
  return (
    <section id="how-it-works" className="bg-void px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">
            How it works
          </p>
          <h2 className="mt-4 font-heading text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
            A clearer path from scope to site delivery.
          </h2>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-4">
          {steps.map((step) => (
            <div
              key={step.number}
              className="group rounded-3xl border border-white/10 bg-surface p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_0_22px_rgba(225,29,46,0.18)]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary ring-1 ring-primary/30">
                {step.number}
              </div>
              <h3 className="mt-6 font-heading text-2xl font-bold text-white">
                {step.title}
              </h3>
              <p className="mt-4 text-base leading-7 text-white/70">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

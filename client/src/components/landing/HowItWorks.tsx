import { type ReactElement } from "react";
import { Reveal } from "./Reveal";
import {
  HandoverMockup,
  MatchingMockup,
  PostBriefMockup,
  ProgressMockup,
} from "./mockups/StageMockups";

interface Step {
  number: string;
  title: string;
  description: string;
  mockup: () => ReactElement;
}

interface HowItWorksProps {}

const steps: Step[] = [
  {
    number: "01",
    title: "Post a project brief",
    description:
      "Outline scope, location, deadlines, and technical requirements so the right engineering partners can respond with real fit and pricing.",
    mockup: PostBriefMockup,
  },
  {
    number: "02",
    title: "Get matched fast",
    description:
      "Review pre-qualified client or contractor matches based on sector expertise, availability, and contract profile without the noise.",
    mockup: MatchingMockup,
  },
  {
    number: "03",
    title: "Track progress together",
    description:
      "Keep approvals, drawings, RFIs, and milestones visible in one active project timeline that everyone can trust.",
    mockup: ProgressMockup,
  },
  {
    number: "04",
    title: "Deliver with clarity",
    description:
      "Close out handover, compliance, and final signoff from a shared record that reduces rework and delays.",
    mockup: HandoverMockup,
  },
];

export function HowItWorks(_props: HowItWorksProps): ReactElement {
  return (
    <section id="how-it-works" className="bg-void px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Reveal variant="head" className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">
            How it works
          </p>
          <h2 className="mt-4 text-balance font-heading text-4xl font-bold text-white sm:text-5xl">
            A clearer path from scope to site delivery.
          </h2>
        </Reveal>

        <div className="relative mt-16">
          <div className="space-y-16 lg:space-y-24">
            {steps.map((step, index) => {
              const Mockup = step.mockup;
              const mockupFirst = index % 2 === 1;

              return (
                <Reveal
                  key={step.number}
                  className="relative grid items-center gap-8 lg:grid-cols-2 lg:gap-16"
                >
                  {/* min-w-0: grid items default to min-width:auto, which lets a
                      wide descendant push the track past the container. */}
                  <div
                    className={`relative min-w-0 ${
                      mockupFirst ? "lg:order-2 lg:pl-8" : "lg:pr-8"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-lg font-bold text-primary ring-1 ring-primary/30">
                        {step.number}
                      </span>
                      <h3 className="font-heading text-2xl font-bold text-white sm:text-3xl">
                        {step.title}
                      </h3>
                    </div>

                    <p className="mt-5 max-w-lg text-base leading-7 text-white/70">
                      {step.description}
                    </p>
                  </div>

                  <div
                    className={`min-w-0 ${
                      mockupFirst ? "lg:order-1 lg:pr-8" : "lg:pl-8"
                    }`}
                    aria-hidden="true"
                  >
                    <Mockup />
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

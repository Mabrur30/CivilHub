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
    title: "Post the brief",
    description:
      "Answer the questions engineers need to price your kind of job, and pin the site. Only the area is public until you hire.",
    mockup: PostBriefMockup,
  },
  {
    number: "02",
    title: "Compare bids",
    description:
      "Specialities, reviews and the Verified badge, side by side. Chat with anyone who bids; phone numbers stay hidden until you hire.",
    mockup: MatchingMockup,
  },
  {
    number: "03",
    title: "Fund, build, approve",
    description:
      "Fund the phase and CivilHub holds the money. The engineer delivers with notes and files. Approve it, and the money's released. Not happy? Ask for changes.",
    mockup: ProgressMockup,
  },
  {
    number: "04",
    title: "Close out on record",
    description:
      "Every file from every phase in one handover. Both sides leave a review for the next job.",
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
            From brief to handover. No chasing.
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

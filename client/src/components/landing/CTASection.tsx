import { type ReactElement } from "react";
import { GetStartedMenu } from "./GetStartedMenu";
import { Reveal } from "./Reveal";

interface CTASectionProps {}

export function CTASection(_props: CTASectionProps): ReactElement {
  return (
    <section
      id="pricing"
      className="bg-gradient-to-r from-primary via-primary to-glow px-4 py-20 sm:px-6 lg:px-8"
    >
      <Reveal className="mx-auto max-w-5xl rounded-[32px] border border-void/20 bg-void/90 px-6 py-10 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)] backdrop-blur-sm sm:px-10 lg:px-14">
        <div className="flex flex-col items-center justify-between gap-8 text-center lg:flex-row lg:text-left">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/75">
              Ready to scale delivery
            </p>
            <h2 className="mt-4 font-heading text-4xl font-bold text-white sm:text-5xl">
              Bring your next infrastructure project into focus.
            </h2>
          </div>

          <GetStartedMenu />
        </div>
      </Reveal>
    </section>
  );
}

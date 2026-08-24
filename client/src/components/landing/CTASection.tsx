import { type ReactElement } from "react";
import { GetStartedMenu } from "./GetStartedMenu";

interface CTASectionProps {}

export function CTASection(_props: CTASectionProps): ReactElement {
  return (
    <section
      id="pricing"
      className="bg-gradient-to-r from-primary via-primary to-glow px-4 py-20 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-5xl rounded-[32px] border border-white/10 bg-white/5 px-6 py-10 shadow-[0_0_40px_rgba(255,59,78,0.18)] backdrop-blur-sm sm:px-10 lg:px-14">
        <div className="flex flex-col items-center justify-between gap-8 text-center lg:flex-row lg:text-left">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/75">
              Ready to scale delivery
            </p>
            <h2 className="mt-4 font-heading text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
              Bring your next infrastructure project into focus.
            </h2>
          </div>

          <GetStartedMenu />
        </div>
      </div>
    </section>
  );
}

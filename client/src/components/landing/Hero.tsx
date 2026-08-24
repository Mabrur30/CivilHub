import { type ReactElement } from "react";
import { Link } from "react-router-dom";

interface HeroProps {}

export function Hero(_props: HeroProps): ReactElement {
  return (
    <section id="home" className="relative overflow-hidden bg-void text-white">
      <div className="absolute inset-0 opacity-80">
        <svg
          viewBox="0 0 1200 900"
          className="h-full w-full"
          aria-hidden="true"
          preserveAspectRatio="xMidYMid slice"
        >
          <g fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1">
            <path d="M0 120H1200M0 240H1200M0 360H1200M0 480H1200M0 600H1200M0 720H1200" />
            <path d="M120 0V900M240 0V900M360 0V900M480 0V900M600 0V900M720 0V900M840 0V900M960 0V900M1080 0V900" />
          </g>
          <g fill="none" stroke="rgba(255,59,78,0.28)" strokeWidth="2">
            <path d="M150 680L350 520L520 600L720 420L920 500L1050 340" />
            <path d="M150 690L350 540L520 620L720 440L920 520L1050 360" />
            <path d="M250 770L390 660L520 720L640 580L840 630L972 500" />
            <circle cx="150" cy="680" r="6" fill="rgba(255,59,78,0.45)" />
            <circle cx="720" cy="420" r="6" fill="rgba(255,59,78,0.45)" />
            <circle cx="1050" cy="340" r="6" fill="rgba(255,59,78,0.45)" />
          </g>
        </svg>
      </div>

      <div className="relative mx-auto grid min-h-[calc(100vh-80px)] max-w-7xl items-center gap-12 px-4 pb-16 pt-16 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
        <div className="max-w-2xl">
          <span className="inline-flex rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            Built for civil delivery
          </span>
          <h1 className="mt-6 font-heading text-5xl font-bold leading-[1.04] tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl">
            Precision planning.
            <span className="block text-primary">Trusted execution.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/70 sm:text-xl">
            Connect clients, engineers, and contractors on one clear platform
            for bids, approvals, site coordination, and project visibility from
            concept to completion.
          </p>

          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <Link
              to="/signup/client"
              className="rounded-full bg-primary px-6 py-3.5 text-center text-base font-semibold text-white shadow-glow transition-all duration-300 hover:-translate-y-0.5 hover:bg-glow hover:shadow-[0_0_28px_rgba(255,59,78,0.45)]"
            >
              I&apos;m a Client
            </Link>
            <Link
              to="/signup/engineer"
              className="rounded-full border border-white/20 bg-white/5 px-6 py-3.5 text-center text-base font-semibold text-white transition-all duration-300 hover:border-primary hover:text-primary"
            >
              I&apos;m an Engineer
            </Link>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-6 text-sm text-white/65">
            <span>FIDIC-aligned workflows</span>
            <span className="h-1 w-1 rounded-full bg-primary" />
            <span>Verified partners</span>
            <span className="h-1 w-1 rounded-full bg-primary" />
            <span>Project clarity</span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xl">
          <div className="relative rounded-[32px] border border-white/10 bg-white/5 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.26)] backdrop-blur-sm">
            <div className="rounded-[24px] border border-white/10 bg-[#101011] p-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-white/45">
                    Live Project
                  </p>
                  <h2 className="mt-2 font-heading text-2xl text-white">
                    Northline By-Pass
                  </h2>
                </div>
                <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                  On Track
                </span>
              </div>

              <div className="mt-6 space-y-5">
                <div className="rounded-2xl border border-white/10 bg-white/3 p-4">
                  <div className="flex items-center justify-between text-sm text-white/65">
                    <span>Progress</span>
                    <span className="font-semibold text-white">78%</span>
                  </div>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-[78%] rounded-full bg-gradient-to-r from-primary to-glow" />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/3 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-white/45">
                      Budget
                    </p>
                    <p className="mt-3 font-heading text-3xl text-white">
                      $4.2M
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/3 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-white/45">
                      Due
                    </p>
                    <p className="mt-3 font-heading text-3xl text-white">
                      12 weeks
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/3 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-white/65">Milestones</p>
                    <span className="text-sm font-semibold text-primary">
                      3 open
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {[
                      ["Survey approval", "Done"],
                      ["Structural design review", "In review"],
                      ["Site mobilization", "Pending"],
                    ].map(([label, state]) => (
                      <div
                        key={label}
                        className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 text-sm"
                      >
                        <span className="text-white/75">{label}</span>
                        <span
                          className={
                            state === "Done"
                              ? "text-emerald-400"
                              : "text-amber-300"
                          }
                        >
                          {state}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

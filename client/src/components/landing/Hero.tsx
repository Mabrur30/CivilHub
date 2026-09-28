import { BulldozerIcon } from "@phosphor-icons/react";
import { type ReactElement } from "react";
import { Link } from "react-router-dom";

interface HeroProps {}

interface Persona {
  side: "client" | "engineer";
  label: string;
  headline: string;
  valueProp: string;
  cta: string;
  to: string;
}

const personas: Persona[] = [
  {
    side: "client",
    label: "For clients",
    headline: "Post a project, compare bids from engineers who fit",
    valueProp:
      "Set out the scope once, hear from engineers and firms in the right speciality, and pay only as each phase is approved.",
    cta: "I'm a Client",
    to: "/signup/client",
  },
  {
    side: "engineer",
    label: "For engineers",
    headline: "Find briefs in your speciality, get paid phase by phase",
    valueProp:
      "Bid on work you can price properly, hand over each phase with its files, and get paid as the client approves.",
    cta: "I'm an Engineer",
    to: "/signup/engineer",
  },
];

export function Hero(_props: HeroProps): ReactElement {
  return (
    <section id="home" className="relative overflow-hidden bg-void text-white">
      {/* Survey grid with a road alignment traversing the panel seam — the same
          centerline idea the two halves are divided on. */}
      <div className="absolute inset-0 opacity-80" aria-hidden="true">
        <svg
          viewBox="0 0 1200 900"
          className="h-full w-full"
          preserveAspectRatio="xMidYMid slice"
        >
          <g fill="none" className="stroke-white/8" strokeWidth="1">
            <path d="M0 120H1200M0 240H1200M0 360H1200M0 480H1200M0 600H1200M0 720H1200" />
            <path d="M120 0V900M240 0V900M360 0V900M480 0V900M600 0V900M720 0V900M840 0V900M960 0V900M1080 0V900" />
          </g>
          <g fill="none" className="stroke-glow/30" strokeWidth="2">
            <path d="M80 700L330 560L600 620L870 430L1120 470" />
            <path d="M80 712L330 572L600 632L870 442L1120 482" />
            <circle cx="330" cy="560" r="6" className="fill-glow/45" />
            <circle cx="600" cy="620" r="6" className="fill-glow/45" />
            <circle cx="870" cy="430" r="6" className="fill-glow/45" />
          </g>
        </svg>
      </div>

      <h1 className="sr-only">
        CivilHub — post a project and compare bids from engineers who fit, find
        briefs in your speciality and get paid phase by phase, or rent and list
        construction equipment.
      </h1>

      <div className="relative mx-auto flex min-h-[calc(100vh-80px)] max-w-7xl flex-col justify-center px-4 pb-16 pt-12 sm:px-6 lg:px-8">
        <div className="relative grid gap-10 lg:grid-cols-2 lg:gap-0">
          {/* The centerline. Vertical between the two panels on wide screens,
              horizontal between the stacked panels below lg. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-primary/60 to-transparent lg:block"
          />

          {personas.map((persona) => (
            <div
              key={persona.side}
              className={`group relative flex flex-col justify-start rounded-3xl px-2 py-6 transition-colors duration-500 hover:bg-white/[0.02] focus-within:bg-white/[0.02] sm:px-6 lg:py-8 ${
                persona.side === "client"
                  ? "lg:pr-14 lg:text-right lg:items-end"
                  : "lg:pl-14"
              }`}
            >
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
                {persona.label}
              </p>

              <p className="mt-4 max-w-lg font-heading text-3xl font-bold leading-[1.12] text-white sm:text-4xl lg:text-[2.4rem]">
                {persona.headline}
              </p>

              <p className="mt-4 max-w-sm text-base leading-7 text-white/65">
                {persona.valueProp}
              </p>

              <Link
                to={persona.to}
                className={`mt-6 inline-flex w-fit rounded-full px-6 py-3.5 text-base font-semibold transition-all duration-300 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-glow ${
                  persona.side === "client"
                    ? "bg-primary text-on-primary shadow-[0_0_28px_rgba(255,133,52,0.28)] hover:bg-glow hover:shadow-[0_0_34px_rgba(255,133,52,0.45)]"
                    : "border border-white/20 bg-white/5 text-white hover:border-primary hover:text-primary"
                }`}
              >
                {persona.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* Companies and plant hire sit across both sides of the seam: they bid
            like engineers and rent equipment to everyone. A strip rather than a
            third panel keeps the client | engineer split as the hero. */}
        <div className="relative mx-auto mt-4 flex w-full max-w-3xl flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-center backdrop-blur-sm sm:flex-row sm:justify-between sm:text-left lg:mt-6">
          <div className="flex items-center gap-3">
            <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary sm:flex">
              <BulldozerIcon size={22} weight="bold" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                For companies &amp; plant hire
              </p>
              <p className="mt-1 text-sm text-white/75">
                Rent excavators, cranes and rollers, or list your own fleet.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-4 text-sm font-semibold">
            <Link
              to="/signup/company"
              className="rounded text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-glow"
            >
              Join as a company
            </Link>
            <Link
              to="/signup/client"
              className="rounded text-white/70 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-glow"
            >
              Rent equipment
            </Link>
          </div>
        </div>

        {/* The project both sides are working on, sitting across the seam. */}
        <div className="relative mx-auto mt-6 w-full max-w-sm lg:mt-2">
          <div className="rounded-[32px] border border-white/10 bg-white/5 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-md">
            <div className="rounded-[24px] border border-white/10 bg-void p-4">
              <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-white/45">
                    Live project
                  </p>
                  <p className="mt-2 font-heading text-2xl text-white">
                    Northline By-Pass
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                  On track
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-white/10 bg-white/3 p-3.5">
                  <div className="flex items-center justify-between text-sm text-white/65">
                    <span>Progress</span>
                    <span className="font-semibold text-white">78%</span>
                  </div>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-[78%] rounded-full bg-gradient-to-r from-primary to-glow" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/3 p-3.5">
                    <p className="text-xs uppercase tracking-[0.2em] text-white/45">
                      Budget
                    </p>
                    <p className="mt-1.5 font-heading text-2xl text-white">
                      ৳4.2 crore
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/3 p-3.5">
                    <p className="text-xs uppercase tracking-[0.2em] text-white/45">
                      Due
                    </p>
                    <p className="mt-1.5 font-heading text-2xl text-white">
                      12 weeks
                    </p>
                  </div>
                </div>

                {/* Milestone rows deliberately live in the How It Works
                    progress mockup rather than here, so the hero card stays a
                    project-at-a-glance and the two do not read as the same
                    illustration twice. The one phase row shows the payment
                    moment the client acts on. */}
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/3 px-3.5 py-3 text-sm">
                  <span className="text-white/65">Phase 3 payment</span>
                  <span className="rounded-full bg-violet-300/10 px-2.5 py-0.5 text-xs font-semibold text-violet-200">
                    Awaiting approval
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-white/60">
          <span>Phase-by-phase payments</span>
          <span className="h-1 w-1 rounded-full bg-primary" />
          <span>Contacts protected until hire</span>
          <span className="h-1 w-1 rounded-full bg-primary" />
          <span>Handover on record</span>
        </div>
      </div>
    </section>
  );
}

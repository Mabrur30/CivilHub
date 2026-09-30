import {
  BuildingsIcon,
  HardHatIcon,
  HouseIcon,
  type Icon,
} from "@phosphor-icons/react";
import { type ReactElement } from "react";
import { Reveal } from "./Reveal";

interface RoleCardProps {
  role: "Clients" | "Engineers" | "Companies";
  title: string;
  description: string;
  bullets: string[];
  accent: string;
}

interface ForClientsForEngineersProps {}

const roleIcons: Record<RoleCardProps["role"], Icon> = {
  Clients: HouseIcon,
  Engineers: HardHatIcon,
  Companies: BuildingsIcon,
};

function RoleCard({
  role,
  title,
  description,
  bullets,
  accent,
}: RoleCardProps): ReactElement {
  const RoleIcon = roleIcons[role];

  return (
    <div className="rounded-[28px] border border-white/10 bg-surface p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            For {role}
          </p>
          <h3 className="mt-3 text-balance font-heading text-3xl font-bold text-white">
            {title}
          </h3>
        </div>
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${accent}`}
        >
          <RoleIcon
            size={22}
            weight="bold"
            className="text-on-primary"
            aria-hidden="true"
          />
        </div>
      </div>

      <p className="mt-5 text-base leading-7 text-white/70">{description}</p>

      <ul className="mt-6 space-y-4">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-3 text-white/80">
            <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
              ✓
            </span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ForClientsForEngineers(
  _props: ForClientsForEngineersProps,
): ReactElement {
  return (
    <section
      id="for-engineers-clients"
      className="bg-void px-4 py-20 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <Reveal variant="head" className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">
            Who it's for
          </p>
          <h2 className="mt-4 text-balance font-heading text-4xl font-bold text-white sm:text-5xl">
            One platform. Every side of the site.
          </h2>
        </Reveal>

        <Reveal className="mt-12 grid gap-8 lg:grid-cols-3">
          <RoleCard
            role="Clients"
            title="Pay for progress, not promises"
            description="Homeowners and developers post once, compare bids, and pay out only for work they've seen and approved."
            bullets={[
              "Questions tailored to your project type. Your exact site stays private.",
              "Compare bids, reviews and Verified badges. Chat before you commit.",
              "Your money is held, and released only when you approve.",
            ]}
            accent="bg-primary/90"
          />
          <RoleCard
            role="Engineers"
            title="Win work that fits. Get paid without chasing."
            description="Pick your specialities, bid on briefs you can price properly, and see each phase funded before you start."
            bullets={[
              "Briefs come with the facts you need to price the job.",
              "The client funds each phase first. Approval releases it to you.",
              "A profile that proves it: reviews, certificates and the Verified badge.",
            ]}
            accent="bg-glow/90"
          />
          <RoleCard
            role="Companies"
            title="Run projects. Rent out your fleet."
            description="Construction firms and plant-hire companies pick what they do: projects, equipment, or both."
            bullets={[
              "Bid on and deliver projects as a firm, phase by phase.",
              "List plant by the day, week or month, with a held deposit.",
              "Rent equipment yourself, and work with engineers directly.",
            ]}
            accent="bg-primary/70"
          />
        </Reveal>
      </div>
    </section>
  );
}

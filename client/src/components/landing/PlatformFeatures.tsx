import {
  ChatCircleTextIcon,
  FilesIcon,
  GavelIcon,
  type Icon,
  LockKeyIcon,
  MapPinIcon,
  SealCheckIcon,
} from "@phosphor-icons/react";
import { type ReactElement } from "react";
import { Reveal } from "./Reveal";

interface PlatformFeaturesProps {}

interface Feature {
  icon: Icon;
  title: string;
  description: string;
}

// Each card describes something the product does today. Keep it that way:
// nothing on the roadmap goes here.
const features: Feature[] = [
  {
    icon: LockKeyIcon,
    title: "Held until approved",
    description:
      "Clients fund each phase up front, so engineers know the money's there. CivilHub releases it only for work the client approves.",
  },
  {
    icon: SealCheckIcon,
    title: "Verified badge",
    description:
      "Engineers show their IEB membership, companies their trade licence. CivilHub checks both before the badge goes up.",
  },
  {
    icon: MapPinIcon,
    title: "Private site location",
    description: "Briefs show the area. The exact pin and directions go only to the engineer you hire.",
  },
  {
    icon: ChatCircleTextIcon,
    title: "Protected contacts",
    description: "Chat before you hire. Phone numbers and emails stay masked until you have a deal.",
  },
  {
    icon: GavelIcon,
    title: "A fair referee",
    description:
      "Stuck? Ask CivilHub to step in. We pause the project, hear both sides and decide, and either side can appeal once.",
  },
  {
    icon: FilesIcon,
    title: "Handover on record",
    description:
      "Every phase arrives with notes and files, kept for good. Reviews go both ways, so good clients get noticed too.",
  },
];

export function PlatformFeatures(_props: PlatformFeaturesProps): ReactElement {
  return (
    <section id="features" className="bg-void px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Reveal variant="head" className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">
            Built in
          </p>
          <h2 className="mt-4 text-balance font-heading text-4xl font-bold text-white sm:text-5xl">
            Safeguards built in. Paperwork left out.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => {
            const FeatureIcon = feature.icon;
            return (
              <Reveal key={feature.title} delay={(index % 3) * 80}>
                {/* Card styles sit inside Reveal so the hover lift does not
                    fight the reveal's own transform transition. */}
                <div className="h-full rounded-[28px] border border-white/10 bg-surface p-6 transition-transform duration-300 hover:-translate-y-1">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <FeatureIcon size={22} weight="bold" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 font-heading text-2xl font-bold text-white">
                    {feature.title}
                  </h3>
                  <p className="mt-3 text-base leading-7 text-white/65">
                    {feature.description}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

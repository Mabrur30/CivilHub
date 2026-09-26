import {
  CalculatorIcon,
  ChatCircleTextIcon,
  CreditCardIcon,
  FilesIcon,
  type Icon,
  MapPinIcon,
  StarIcon,
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
// anything still on the roadmap (verification, payouts, disputes) stays off.
const features: Feature[] = [
  {
    icon: CreditCardIcon,
    title: "Payments per phase",
    description:
      "Advances, phase payments and equipment bookings all go through SSLCommerz, and a phase only completes once its payment is verified.",
  },
  {
    icon: MapPinIcon,
    title: "Private site locations",
    description:
      "Public briefs show the district and a rough area. The exact pin, address and directions go only to the engineer you hire.",
  },
  {
    icon: ChatCircleTextIcon,
    title: "Protected contacts",
    description:
      "Chat before you hire, tied to the project. Phone numbers and emails stay masked until the two of you have a deal.",
  },
  {
    icon: FilesIcon,
    title: "Handover you can open",
    description:
      "Every phase arrives with a note and up to five files. Resubmissions are kept, and the finished project gathers them all.",
  },
  {
    icon: StarIcon,
    title: "Reviews both ways",
    description:
      "Clients rate engineers and companies, providers rate their clients, and equipment owners rate the people who rent from them.",
  },
  {
    icon: CalculatorIcon,
    title: "Estimator and network",
    description:
      "Rough out a cost before you post, then connect with engineers and firms and share work in the professional feed.",
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
            The safeguards a site deal needs, without the paperwork.
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

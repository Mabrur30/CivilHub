import { BulldozerIcon } from "@phosphor-icons/react";
import { type ReactElement } from "react";
import { Link } from "react-router-dom";
import { MilestoneRow } from "./mockups/MilestoneRow";
import { MockFrame } from "./mockups/MockFrame";
import { Reveal } from "./Reveal";

interface EquipmentBandProps {}

const points = [
  "Rent by the day, week or month. Clients, engineers and firms alike.",
  "List your fleet with photos, rates, an operator and a deposit.",
  "Deposits are held and never charged commission. Disagree with a damage claim? CivilHub decides.",
];

function BookingMockup(): ReactElement {
  return (
    <MockFrame eyebrow="Equipment" title="Booking request" status="Confirmed">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/3 p-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <BulldozerIcon size={22} weight="bold" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            Excavator · 20 tonne
          </p>
          <p className="truncate text-xs text-white/50">
            Plant-hire company · Verified
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-white">
          ৳12,000<span className="text-white/45">/day</span>
        </span>
      </div>

      <div className="space-y-2.5">
        <MilestoneRow label="4 – 10 Nov · 7 days" state="done" stateLabel="৳84,000" />
        <MilestoneRow
          label="Security deposit"
          state="active"
          stateLabel="Held · ৳50,000"
        />
        <MilestoneRow label="Owner & renter reviews" state="pending" stateLabel="After return" />
      </div>
    </MockFrame>
  );
}

export function EquipmentBand(_props: EquipmentBandProps): ReactElement {
  return (
    <section id="equipment" className="bg-surface px-4 py-20 sm:px-6 lg:px-8">
      <Reveal className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="min-w-0 lg:pr-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">
            Equipment rental
          </p>
          <h2 className="mt-4 text-balance font-heading text-4xl font-bold text-white sm:text-5xl">
            Need an excavator? Someone here has one.
          </h2>

          <ul className="mt-8 space-y-4">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-white/75">
                <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  ✓
                </span>
                <span className="leading-7">{point}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/signup/company"
              className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-on-primary transition-all duration-300 hover:-translate-y-0.5 hover:bg-glow focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-glow"
            >
              List your equipment
            </Link>
            <Link
              to="/signup/client"
              className="rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-glow"
            >
              Browse &amp; rent
            </Link>
          </div>
        </div>

        <div className="min-w-0 lg:pl-8" aria-hidden="true">
          <BookingMockup />
        </div>
      </Reveal>
    </section>
  );
}

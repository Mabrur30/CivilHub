import { HardHatIcon } from "@phosphor-icons/react";
import { type ReactElement } from "react";
import { VerifiedBadge } from "../../VerifiedBadge";

export interface MatchRowProps {
  /** A kind of bidder, not a person: the landing page shows no invented people. */
  name: string;
  /** The bidder's own chosen specialities — main one first. */
  specialities: string[];
  verified: boolean;
  bidAmount: string;
}

/**
 * One bid in the "Bids received" mockup. Reuses the real VerifiedBadge rather
 * than restyling it, so this illustration stays in step with the marketplace.
 *
 * Shows the bid amount rather than a "% match" score: the marketplace has no
 * matching score, and the landing page should not promise one.
 */
export function MatchRow({
  name,
  specialities,
  verified,
  bidAmount,
}: MatchRowProps): ReactElement {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/3 p-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70">
        <HardHatIcon className="h-4 w-4" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{name}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {specialities.map((speciality, index) => (
            <span
              key={speciality}
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                index === 0
                  ? "bg-primary/15 text-primary"
                  : "bg-white/5 text-white/55"
              }`}
            >
              {speciality}
            </span>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-semibold tabular-nums text-sm text-white">
          {bidAmount}
        </span>
        {verified ? <VerifiedBadge /> : <span className="text-[11px] text-white/40">Not verified</span>}
      </div>
    </div>
  );
}

import { type ReactElement } from "react";
import { Avatar } from "../../Avatar";
import { RatingBadge } from "../../RatingBadge";

export interface MatchRowProps {
  name: string;
  /** The bidder's own chosen specialities — main one first. */
  specialities: string[];
  rating: number;
  reviewCount: number;
  bidAmount: string;
}

/**
 * One bid in the "Bids received" mockup. Reuses the real Avatar and RatingBadge
 * components rather than restyling them, so this illustration stays in step
 * with the actual marketplace UI as that evolves.
 *
 * Shows the bid amount rather than a "% match" score: the marketplace has no
 * matching score, and the landing page should not promise one.
 */
export function MatchRow({
  name,
  specialities,
  rating,
  reviewCount,
  bidAmount,
}: MatchRowProps): ReactElement {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/3 p-3">
      <Avatar name={name} size="sm" />

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
        <RatingBadge rating={rating} reviewCount={reviewCount} size="sm" />
      </div>
    </div>
  );
}

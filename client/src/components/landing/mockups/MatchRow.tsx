import { type ReactElement } from "react";
import { Avatar } from "../../Avatar";
import { RatingBadge } from "../../RatingBadge";

export interface MatchRowProps {
  name: string;
  discipline: string;
  rating: number;
  reviewCount: number;
  matchPercent: number;
}

/**
 * One engineer suggestion in the matching mockup. Reuses the real Avatar and
 * RatingBadge components rather than restyling them, so this illustration stays
 * in step with the actual marketplace UI as that evolves.
 */
export function MatchRow({
  name,
  discipline,
  rating,
  reviewCount,
  matchPercent,
}: MatchRowProps): ReactElement {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/3 p-3">
      <Avatar name={name} size="sm" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{name}</p>
        <p className="truncate text-xs text-white/50">{discipline}</p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <RatingBadge rating={rating} reviewCount={reviewCount} size="sm" />
        <span className="text-xs font-semibold text-primary">
          {matchPercent}% match
        </span>
      </div>
    </div>
  );
}

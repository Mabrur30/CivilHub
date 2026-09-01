import { type ReactElement } from "react";

export interface RatingBadgeProps {
  rating: number | null;
  reviewCount: number;
  size?: "sm" | "md";
}

export function RatingBadge({
  rating,
  reviewCount,
  size = "md",
}: RatingBadgeProps): ReactElement | null {
  if (typeof rating !== "number" || !Number.isFinite(rating)) return null;
  if (!Number.isFinite(reviewCount) || reviewCount <= 0) return null;

  const textClass = size === "sm" ? "text-xs" : "text-sm";
  const starClass = size === "sm" ? "text-sm" : "text-base";

  return (
    <span className={`inline-flex items-center gap-1.5 ${textClass}`}>
      <span
        className={`${starClass} leading-none text-amber-400`}
        aria-hidden="true"
      >
        ★
      </span>
      <span className="font-semibold text-white">{rating.toFixed(1)}</span>
      <span className="font-normal text-white/45">({reviewCount})</span>
    </span>
  );
}

import { SealCheckIcon } from "@phosphor-icons/react";
import { type ReactElement } from "react";

const LABEL = "Verified by CivilHub";

/**
 * Shown beside an engineer's or company's name once CivilHub has checked
 * their IEB membership or trade licence, and their national ID.
 * `compact` is the icon alone, for tight rows like chat lists.
 */
export function VerifiedBadge({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}): ReactElement {
  if (compact) {
    return (
      <span
        role="img"
        aria-label={LABEL}
        title={LABEL}
        className={`inline-flex shrink-0 align-[-0.125em] text-primary ${className}`}
      >
        <SealCheckIcon weight="fill" className="h-[1em] w-[1em]" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      title={LABEL}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary ${className}`}
    >
      <SealCheckIcon weight="fill" className="h-3.5 w-3.5" aria-hidden="true" />
      Verified
    </span>
  );
}

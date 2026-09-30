import { SealCheckIcon } from "@phosphor-icons/react";
import { type ReactElement } from "react";
import { Link } from "react-router-dom";

export type OwnVerificationStatus = "none" | "pending" | "verified" | "rejected" | "lapsed";

/**
 * On an engineer's or company's own profile, before they're verified: a
 * nudge to Settings, or a note that their details are being checked.
 */
export function GetVerifiedLink({ status }: { status: OwnVerificationStatus | undefined }): ReactElement | null {
  if (!status || status === "verified") return null;
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-0.5 text-xs font-semibold text-white/60">
        <SealCheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
        Verification in review
      </span>
    );
  }
  return (
    <Link
      to="/settings#verification"
      className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/50 px-2 py-0.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
    >
      <SealCheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
      {status === "none" ? "Get verified" : "Verify again"}
    </Link>
  );
}

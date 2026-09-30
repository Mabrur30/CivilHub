import { type ReactElement } from "react";
import { type DecisionReview } from "../lib/api";
import { formatDateTime } from "../lib/format";

/**
 * A decision that hasn't taken effect yet: when it will, who has accepted
 * it, and any appeal against it, with who made it for the admin reviewing.
 */
export function DecisionStatus({
  stage,
  summary,
  note,
  decidedAt,
  appealDeadline,
  acceptedBy,
  appeal,
  review,
}: {
  stage: "awaiting_final" | "appealed";
  summary: string;
  note: string;
  decidedAt: string;
  appealDeadline: string;
  acceptedBy: string[];
  appeal: { role: string; reason: string; openedAt: string } | null;
  review: DecisionReview | null;
}): ReactElement {
  const decider = review?.isOwnDecision ? "you" : (review?.decidedByName ?? "an admin");
  return (
    <div className="mb-6 rounded-2xl border border-amber-300/30 bg-amber-300/5 p-5 text-sm text-white/80">
      <p className="font-semibold text-white">
        {stage === "appealed" ? "Decision appealed" : "Decided; waiting out the appeal window"}
      </p>
      <p className="mt-1">
        {summary} Decided by {decider} on {formatDateTime(decidedAt)}.
      </p>
      <p className="mt-2 text-white/65">“{note}”</p>
      {stage === "awaiting_final" ? (
        <p className="mt-2">
          Takes effect on {formatDateTime(appealDeadline)} unless a side appeals.
          {acceptedBy.length > 0 ? ` Accepted so far by the ${acceptedBy.join(" and the ")}.` : " Neither side has accepted it yet."}
        </p>
      ) : null}
      {stage === "appealed" && appeal ? (
        <div className="mt-3 rounded-xl bg-void/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">
            The {appeal.role}’s appeal · {formatDateTime(appeal.openedAt)}
          </p>
          <p className="mt-1 whitespace-pre-line">{appeal.reason}</p>
          <p className="mt-2 text-xs text-white/55">
            {review?.mayReview
              ? review.isOwnDecision
                ? "You made this decision, but no other admin is active, so you can review the appeal."
                : `You're reviewing ${decider}'s decision. Your decision is final and takes effect at once.`
              : "You made this decision, so another admin needs to review the appeal."}
          </p>
        </div>
      ) : null}
    </div>
  );
}

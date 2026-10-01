import { GavelIcon } from "@phosphor-icons/react";
import { type ReactElement, useState } from "react";
import { inputClassName, primaryButtonClassName, rowButtonClassName, secondaryButtonClassName } from "../dashboard/ui/buttonStyles";
import { Dialog } from "../dashboard/ui/Dialog";
import { FormField } from "../dashboard/ui/FormField";
import { API_BASE_URL } from "../../lib/apiBase";

const APPEAL_MIN = 20;

export interface DecisionNoticeProps {
  caseType: "project" | "deposit";
  caseId: string;
  /** The viewer's side: "client"/"provider" or "renter"/"owner". */
  viewerRole: string;
  stage: "review" | "awaiting_final" | "appealed";
  /** What CivilHub decided, as a sentence: "CivilHub decided to …". */
  what: string;
  note: string;
  appealDeadline: string;
  acceptedBy: string[];
  appeal: { role: string; reason: string; openedAt: string } | null;
  onChanged: () => void;
}

const formatDay = (value: string): string =>
  new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

/**
 * A dispute decision that hasn't taken effect yet. Either side can appeal it
 * once before the deadline, or accept it; once both accept it takes effect.
 */
export function DecisionNotice({
  caseType,
  caseId,
  viewerRole,
  stage,
  what,
  note,
  appealDeadline,
  acceptedBy,
  appeal,
  onChanged,
}: DecisionNoticeProps): ReactElement {
  const [isAppealing, setIsAppealing] = useState<boolean>(false);
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const haveAccepted = acceptedBy.includes(viewerRole);
  const otherAccepted = acceptedBy.some((role) => role !== viewerRole);

  const send = async (action: "accept" | "appeal", body?: unknown): Promise<void> => {
    setIsBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/dispute-cases/${caseType}/${caseId}/${action}`, {
        method: "POST",
        credentials: "include",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(result?.message ?? "That didn't work. Please try again.");
        return;
      }
      setIsAppealing(false);
      setReason("");
      onChanged();
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm text-white/75">
      <p className="inline-flex items-center gap-2 font-semibold text-white">
        <GavelIcon className="h-4 w-4 text-primary" aria-hidden="true" />
        {stage === "appealed" ? "CivilHub's decision was appealed" : "CivilHub has decided"}
      </p>
      <p className="mt-1">{what}</p>
      {note ? <p className="mt-1 text-white/60">Note from CivilHub: {note}</p> : null}

      {stage === "appealed" && appeal ? (
        <p className="mt-2">
          {appeal.role === viewerRole ? "You" : "The other side"} appealed on {formatDay(appeal.openedAt)}. Another admin is
          reviewing it, and nothing changes until they decide. Their decision is final.
        </p>
      ) : (
        <>
          <p className="mt-2">
            It takes effect on <span className="font-semibold text-white">{formatDay(appealDeadline)}</span> unless either of
            you appeals. Nothing changes until then.
            {haveAccepted
              ? " You've accepted it; it takes effect sooner if the other side accepts too."
              : otherAccepted
                ? " The other side has accepted it; if you accept too, it takes effect now."
                : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!haveAccepted ? (
              <button type="button" disabled={isBusy} onClick={() => void send("accept")} className={rowButtonClassName}>
                Accept decision
              </button>
            ) : null}
            <button type="button" disabled={isBusy} onClick={() => setIsAppealing(true)} className={rowButtonClassName}>
              Appeal
            </button>
          </div>
          {error && !isAppealing ? (
            <p role="alert" className="mt-2 text-sm text-rose-300">
              {error}
            </p>
          ) : null}
        </>
      )}

      {isAppealing ? (
        <Dialog
          title="Appeal CivilHub's decision"
          description="Another admin reviews the case again, including anything you add in your messages with CivilHub. Each dispute can be appealed once, and the second decision is final."
          onClose={() => {
            setIsAppealing(false);
            setError("");
          }}
          isBusy={isBusy}
        >
          <div className="mt-5 grid gap-4">
            <FormField id="appeal-reason" label="Why is the decision wrong?" hint="What did CivilHub miss or get wrong?">
              <textarea
                id="appeal-reason"
                rows={5}
                maxLength={2000}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setError("");
                }}
                className={inputClassName}
              />
            </FormField>
            {error ? (
              <p role="alert" className="text-sm text-rose-300">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setIsAppealing(false)} disabled={isBusy} className={secondaryButtonClassName}>
                Cancel
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  if (reason.trim().length < APPEAL_MIN) {
                    setError("Explain in a few sentences why the decision is wrong.");
                    return;
                  }
                  void send("appeal", { reason: reason.trim() });
                }}
                className={primaryButtonClassName}
              >
                {isBusy ? "Sending..." : "Send appeal"}
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

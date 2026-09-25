import { ChatCircleTextIcon, HourglassIcon } from "@phosphor-icons/react";
import { type ReactElement, useState } from "react";
import { formatCurrency } from "../../lib/format";
import {
  inputClassName,
  primaryButtonBaseClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "../dashboard/ui/buttonStyles";
import { Dialog } from "../dashboard/ui/Dialog";

export type PhaseStatus =
  | "not_started"
  | "in_progress"
  | "awaiting_approval"
  | "completed"
  | "delayed";

export interface PhaseChangeRequest {
  note: string;
  requestedAt: string;
}

export interface PhaseActionTarget {
  id: string;
  name: string;
  order: number;
  status: PhaseStatus;
  paymentStatus: "paid" | "unpaid";
  amountDue: number;
  changeRequest: PhaseChangeRequest | null;
}

interface PhaseActionsProps {
  phase: PhaseActionTarget;
  previousPhase: PhaseActionTarget | null;
  isFinalPhase: boolean;
  viewer: "engineer" | "client" | "other";
  paymentPlan: "phase_by_phase" | "full_upfront" | null | undefined;
  advancePaid: boolean;
  fullPaymentPaid: boolean;
  remainingBalance: number;
  isBusy: boolean;
  onSetStatus: (status: PhaseStatus) => void;
  onApprove: () => void;
  onRequestChanges: (note: string) => Promise<boolean>;
}

const NOTE_LIMIT = 500;

const formatShortDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

function RequestChangesDialog({
  phaseName,
  onClose,
  onSubmit,
}: {
  phaseName: string;
  onClose: () => void;
  onSubmit: (note: string) => Promise<boolean>;
}): ReactElement {
  const [note, setNote] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isSending, setIsSending] = useState<boolean>(false);

  const send = async (): Promise<void> => {
    if (!note.trim()) {
      setError("Say what needs to change so the engineer knows what to fix.");
      return;
    }
    setIsSending(true);
    const sent = await onSubmit(note.trim());
    setIsSending(false);
    if (sent) onClose();
  };

  return (
    <Dialog
      title="Request changes"
      description={`${phaseName} goes back to the engineer with your note. Nothing is charged.`}
      onClose={onClose}
      isBusy={isSending}
    >
      <form
        className="grid gap-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <div className="grid gap-2">
          <label
            htmlFor="change-note"
            className="text-sm font-semibold text-white/80"
          >
            What needs to change?
          </label>
          <textarea
            id="change-note"
            rows={4}
            autoFocus
            value={note}
            maxLength={NOTE_LIMIT}
            onChange={(event) => {
              setNote(event.target.value);
              setError("");
            }}
            aria-describedby="change-note-hint"
            className={`${inputClassName} resize-none`}
          />
          <p
            id="change-note-hint"
            className="flex justify-between gap-4 text-xs text-white/45"
          >
            <span>Be specific: what is missing or wrong, and where.</span>
            <span className="tabular-nums">
              {note.length}/{NOTE_LIMIT}
            </span>
          </p>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className={secondaryButtonClassName}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSending}
            className={primaryButtonBaseClassName}
          >
            {isSending ? "Sending..." : "Send back to engineer"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** The client's last "request changes" note, shown until the phase is approved. */
export function ChangeRequestNote({
  changeRequest,
}: {
  changeRequest: PhaseChangeRequest;
}): ReactElement {
  return (
    <div className="mt-4 flex gap-3 rounded-xl border border-violet-300/25 bg-violet-300/5 p-3.5">
      <ChatCircleTextIcon
        className="mt-0.5 h-4 w-4 shrink-0 text-violet-200"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-violet-100">
          Client asked for changes on {formatShortDate(changeRequest.requestedAt)}
        </p>
        <p className="mt-1 whitespace-pre-line text-sm leading-6 text-white/75">
          {changeRequest.note}
        </p>
      </div>
    </div>
  );
}

function WaitingNote({ children }: { children: string }): ReactElement {
  return (
    <p className="inline-flex items-center gap-2 text-sm text-white/55">
      <HourglassIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}

// Shows each person only the moves the server will accept from this phase's
// current status, instead of a dropdown of every status.
export function PhaseActions({
  phase,
  previousPhase,
  isFinalPhase,
  viewer,
  paymentPlan,
  advancePaid,
  fullPaymentPaid,
  remainingBalance,
  isBusy,
  onSetStatus,
  onApprove,
  onRequestChanges,
}: PhaseActionsProps): ReactElement | null {
  const [isRequestingChanges, setIsRequestingChanges] =
    useState<boolean>(false);
  const isPhaseByPhase = paymentPlan === "phase_by_phase";

  if (viewer === "engineer") {
    switch (phase.status) {
      case "not_started": {
        const previousDone =
          !previousPhase ||
          (previousPhase.status === "completed" &&
            (!isPhaseByPhase || previousPhase.paymentStatus === "paid"));
        if (!advancePaid) {
          return <WaitingNote>Waiting for the client's advance payment</WaitingNote>;
        }
        if (!previousDone) {
          return (
            <WaitingNote>{`Starts after ${previousPhase?.name ?? "the previous phase"} is approved`}</WaitingNote>
          );
        }
        return (
          <button
            type="button"
            onClick={() => onSetStatus("in_progress")}
            disabled={isBusy}
            className={primaryButtonClassName}
          >
            {isBusy ? "Starting..." : "Start phase"}
          </button>
        );
      }
      case "in_progress":
      case "delayed":
        return (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSetStatus("awaiting_approval")}
              disabled={isBusy}
              className={primaryButtonClassName}
            >
              {isBusy ? "Updating..." : "Submit for approval"}
            </button>
            <button
              type="button"
              onClick={() =>
                onSetStatus(phase.status === "delayed" ? "in_progress" : "delayed")
              }
              disabled={isBusy}
              className={secondaryButtonClassName}
            >
              {phase.status === "delayed" ? "Resume work" : "Mark delayed"}
            </button>
          </div>
        );
      case "awaiting_approval":
        return <WaitingNote>Waiting for the client to approve</WaitingNote>;
      case "completed":
        return null;
    }
  }

  if (viewer !== "client") return null;

  // Phases completed under the old rules, before clients approved them, may
  // still be unpaid on the phase-by-phase plan.
  if (
    phase.status === "completed" &&
    isPhaseByPhase &&
    phase.paymentStatus === "unpaid"
  ) {
    return (
      <button
        type="button"
        onClick={onApprove}
        disabled={isBusy}
        className={primaryButtonClassName}
      >
        {isBusy ? "Paying..." : `Pay ${formatCurrency(phase.amountDue)}`}
      </button>
    );
  }

  if (phase.status !== "awaiting_approval") return null;

  const approveLabel = isPhaseByPhase
    ? `Approve and pay ${formatCurrency(phase.amountDue)}`
    : isFinalPhase && !fullPaymentPaid
      ? `Approve and pay remaining ${formatCurrency(remainingBalance)}`
      : "Approve phase";

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onApprove}
          disabled={isBusy}
          className={primaryButtonClassName}
        >
          {isBusy ? "Approving..." : approveLabel}
        </button>
        <button
          type="button"
          onClick={() => setIsRequestingChanges(true)}
          disabled={isBusy}
          className={secondaryButtonClassName}
        >
          Request changes
        </button>
      </div>
      {isRequestingChanges ? (
        <RequestChangesDialog
          phaseName={phase.name}
          onClose={() => setIsRequestingChanges(false)}
          onSubmit={onRequestChanges}
        />
      ) : null}
    </>
  );
}

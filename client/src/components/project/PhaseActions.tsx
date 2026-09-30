import {
  ChatCircleTextIcon,
  HourglassIcon,
  PaperclipIcon,
  XIcon,
} from "@phosphor-icons/react";
import { type ReactElement, useRef, useState } from "react";
import { formatCurrency } from "../../lib/format";
import {
  ATTACHMENT_ACCEPT,
  formatBytes,
  validateAttachmentFile,
} from "../../lib/messageAttachments";
import { FileTypeIcon } from "../chat/MessageAttachmentView";
import {
  inputClassName,
  primaryButtonBaseClassName,
  primaryButtonClassName,
  rowButtonClassName,
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
  /**
   * Work is paid into CivilHub's hold before it starts: each phase on the
   * phase-by-phase plan, the whole balance on full upfront. False only for
   * projects planned before funding.
   */
  fundsBeforeWork: boolean;
  isBusy: boolean;
  onSetStatus: (status: PhaseStatus) => void;
  /** Opens checkout to fund this phase. */
  onFund: () => void;
  /** Hands the phase over; resolves to an error message, or "" when sent. */
  onSubmitPhase: (
    note: string,
    files: File[],
    onProgress: (fraction: number) => void,
  ) => Promise<string>;
  onApprove: () => void;
  onRequestChanges: (note: string) => Promise<boolean>;
}

const NOTE_LIMIT = 500;
// Mirror the server's limits in ProjectPhase.model.ts.
const HANDOVER_NOTE_LIMIT = 1000;
const HANDOVER_FILE_LIMIT = 5;

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

function SubmitPhaseDialog({
  phaseName,
  changeRequest,
  onClose,
  onSubmit,
}: {
  phaseName: string;
  changeRequest: PhaseChangeRequest | null;
  onClose: () => void;
  onSubmit: PhaseActionsProps["onSubmitPhase"];
}): ReactElement {
  const [note, setNote] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string>("");
  const [progress, setProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSending = progress !== null;

  const addFiles = (picked: FileList | null): void => {
    if (!picked) return;
    const next = [...files];
    for (const file of Array.from(picked)) {
      const problem = validateAttachmentFile(file);
      if (problem) {
        setError(`${file.name}: ${problem}`);
        return;
      }
      if (next.length >= HANDOVER_FILE_LIMIT) {
        setError(`Attach at most ${HANDOVER_FILE_LIMIT} files.`);
        return;
      }
      next.push(file);
    }
    setFiles(next);
    setError("");
  };

  const send = async (): Promise<void> => {
    if (!note.trim()) {
      setError("Describe what you're handing over so the client knows what to review.");
      return;
    }
    setError("");
    setProgress(0);
    const problem = await onSubmit(note.trim(), files, setProgress);
    if (problem) {
      setError(problem);
      setProgress(null);
      return;
    }
    onClose();
  };

  return (
    <Dialog
      title="Submit for approval"
      description={`Hand ${phaseName} over to the client. They review it, then approve it or ask for changes.`}
      onClose={onClose}
      isBusy={isSending}
      size="lg"
    >
      <form
        className="grid gap-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        {changeRequest ? (
          <ChangeRequestNote changeRequest={changeRequest} className="" />
        ) : null}

        <div className="grid gap-2">
          <label htmlFor="handover-note" className="text-sm font-semibold text-white/80">
            What are you handing over?
          </label>
          <textarea
            id="handover-note"
            rows={5}
            autoFocus
            value={note}
            maxLength={HANDOVER_NOTE_LIMIT}
            onChange={(event) => {
              setNote(event.target.value);
              setError("");
            }}
            aria-describedby="handover-note-hint"
            className={`${inputClassName} resize-y`}
          />
          <p id="handover-note-hint" className="flex justify-between gap-4 text-xs text-white/45">
            <span>
              {changeRequest
                ? "Say how you addressed the client's note."
                : "The work done, and anything the client should check."}
            </span>
            <span className="tabular-nums">
              {note.length}/{HANDOVER_NOTE_LIMIT}
            </span>
          </p>
        </div>

        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white/80">
              Files <span className="font-normal text-white/45">(optional)</span>
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending || files.length >= HANDOVER_FILE_LIMIT}
              className={rowButtonClassName}
            >
              <PaperclipIcon className="h-4 w-4" aria-hidden="true" />
              Attach files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </div>
          {files.length > 0 ? (
            <ul className="grid gap-2">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-void/70 p-2.5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
                    <FileTypeIcon mimeType={file.type} className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">
                      {file.name}
                    </span>
                    <span className="block text-[11px] text-white/55">
                      {formatBytes(file.size)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setFiles(files.filter((_, i) => i !== index))}
                    disabled={isSending}
                    aria-label={`Remove ${file.name}`}
                    className="rounded-full p-1.5 text-white/55 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow disabled:opacity-50"
                  >
                    <XIcon className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-white/45">
              Drawings, site photos, reports or spreadsheets. Up to {HANDOVER_FILE_LIMIT} files, 10 MB each.
            </p>
          )}
        </div>

        {progress !== null && files.length > 0 ? (
          <div className="grid gap-1.5" aria-live="polite">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="text-xs tabular-nums text-white/55">
              {progress < 1 ? `Uploading ${Math.round(progress * 100)}%` : "Finishing up..."}
            </p>
          </div>
        ) : null}

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
          <button type="submit" disabled={isSending} className={primaryButtonBaseClassName}>
            {isSending ? "Sending..." : "Submit for approval"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** The client's last "request changes" note, shown until the phase is approved. */
export function ChangeRequestNote({
  changeRequest,
  className = "mt-4",
}: {
  changeRequest: PhaseChangeRequest;
  className?: string;
}): ReactElement {
  return (
    <div className={`${className} flex gap-3 rounded-xl border border-violet-300/25 bg-violet-300/5 p-3.5`}>
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
  fundsBeforeWork,
  isBusy,
  onSetStatus,
  onFund,
  onSubmitPhase,
  onApprove,
  onRequestChanges,
}: PhaseActionsProps): ReactElement | null {
  const [isRequestingChanges, setIsRequestingChanges] =
    useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const isPhaseByPhase = paymentPlan === "phase_by_phase";
  const isFunded = (target: PhaseActionTarget): boolean =>
    !fundsBeforeWork ||
    (isPhaseByPhase
      ? target.paymentStatus === "paid" || target.amountDue <= 0
      : fullPaymentPaid);

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
        if (!isFunded(phase)) {
          return (
            <WaitingNote>
              {isPhaseByPhase
                ? "Waiting for the client to fund this phase"
                : "Waiting for the client to pay the remaining balance"}
            </WaitingNote>
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
          <>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIsSubmitting(true)}
                disabled={isBusy}
                className={primaryButtonClassName}
              >
                Submit for approval
              </button>
              <button
                type="button"
                onClick={() =>
                  onSetStatus(phase.status === "delayed" ? "in_progress" : "delayed")
                }
                disabled={isBusy}
                className={secondaryButtonClassName}
              >
                {isBusy
                  ? "Updating..."
                  : phase.status === "delayed"
                    ? "Resume work"
                    : "Mark delayed"}
              </button>
            </div>
            {isSubmitting ? (
              <SubmitPhaseDialog
                phaseName={phase.name}
                changeRequest={phase.changeRequest}
                onClose={() => setIsSubmitting(false)}
                onSubmit={onSubmitPhase}
              />
            ) : null}
          </>
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
        {isBusy ? "Opening payment..." : `Pay ${formatCurrency(phase.amountDue)}`}
      </button>
    );
  }

  // Funding a phase before work on it starts. Phases are funded in order,
  // but the client may fund ahead while the one before is still under way.
  if (
    fundsBeforeWork &&
    isPhaseByPhase &&
    advancePaid &&
    phase.status === "not_started" &&
    !isFunded(phase) &&
    (!previousPhase || isFunded(previousPhase))
  ) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onFund} disabled={isBusy} className={primaryButtonClassName}>
          {isBusy ? "Opening payment..." : `Fund phase ${formatCurrency(phase.amountDue)}`}
        </button>
        <p className="text-xs text-white/50">
          CivilHub holds it until you approve the phase.
        </p>
      </div>
    );
  }

  if (phase.status !== "awaiting_approval") return null;

  // Paid approvals go through SSLCommerz; the phase completes once it confirms.
  // Funded phases were paid before work started, so approving them is free.
  const needsPayment = isFunded(phase) && fundsBeforeWork
    ? false
    : isPhaseByPhase
      ? phase.amountDue > 0
      : isFinalPhase && !fullPaymentPaid && remainingBalance > 0;
  const approveLabel = !needsPayment
    ? fundsBeforeWork && isPhaseByPhase && phase.amountDue > 0
      ? `Approve and release ${formatCurrency(phase.amountDue)}`
      : "Approve phase"
    : isPhaseByPhase
      ? `Approve and pay ${formatCurrency(phase.amountDue)}`
      : `Approve and pay remaining ${formatCurrency(remainingBalance)}`;
  const busyLabel = needsPayment ? "Opening payment..." : "Approving...";

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onApprove}
          disabled={isBusy}
          className={primaryButtonClassName}
        >
          {isBusy ? busyLabel : approveLabel}
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

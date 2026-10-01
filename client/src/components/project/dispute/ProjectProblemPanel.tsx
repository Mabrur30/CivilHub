import { HandshakeIcon, PauseCircleIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { type ReactElement, type ReactNode, useCallback, useEffect, useState } from "react";
import {
  inputClassName,
  panelClassName,
  primaryButtonClassName,
  rowButtonClassName,
  secondaryButtonClassName,
} from "../../dashboard/ui/buttonStyles";
import { ConfirmDialog } from "../../dashboard/ui/ConfirmDialog";
import { Dialog } from "../../dashboard/ui/Dialog";
import { FormField } from "../../dashboard/ui/FormField";
import { MoneyInput } from "../../dashboard/ui/MoneyInput";
import { formatCurrency } from "../../../lib/format";
import { moneyValue } from "../../../lib/money";
import { CaseThread } from "../../disputes/CaseThread";
import { DecisionNotice } from "../../disputes/DecisionNotice";
import { API_BASE_URL } from "../../../lib/apiBase";

const REASONS = [
  { value: "quality", label: "The work isn't up to standard" },
  { value: "delay", label: "The work is late" },
  { value: "scope", label: "We disagree about what's included" },
  { value: "payment", label: "A payment problem" },
  { value: "communication", label: "The other side isn't communicating" },
  { value: "no_response", label: "The client hasn't answered a hand-over or funded the next phase" },
  { value: "other", label: "Something else" },
] as const;

interface DisputeView {
  id: string;
  status: "open" | "resolved" | "withdrawn";
  /** While open: under review, a decision waiting to take effect, or appealed. */
  stage?: "review" | "awaiting_final" | "appealed";
  decision?: {
    outcome: "resumed" | "phase_approved" | "cancelled";
    note: string;
    providerAmount: number | null;
    appealDeadline: string;
    acceptedBy: string[];
  } | null;
  appeal?: { role: string; reason: string; openedAt: string } | null;
  openedByRole: "client" | "provider";
  openedBy: string;
  reason: string;
  reasonLabel: string;
  description: string;
  openedAt: string;
  resolution: {
    outcome: "resumed" | "phase_approved" | "cancelled";
    note: string;
    providerAmount: number | null;
    refundAmount: number | null;
    decidedAt: string;
  } | null;
}

export interface ProjectProblemState {
  status: string;
  paused: boolean;
  held: number | null;
  dispute: DisputeView | null;
  lastResolved: DisputeView | null;
  canReportNoResponse: boolean;
  /** The phase the provider can't start until the client funds it. */
  waitingForFunding?: { phaseId: string; phase: string; since: string } | null;
  proposal: { proposedBy: string; providerAmount: number; note: string | null; proposedAt: string } | null;
  cancellation: {
    by: "agreement" | "admin";
    held: number;
    providerAmount: number;
    refundAmount: number;
    cancelledAt: string | null;
  } | null;
}

const isState = (value: unknown): value is ProjectProblemState =>
  typeof value === "object" && value !== null && typeof (value as ProjectProblemState).paused === "boolean";

const formatDay = (value: string): string =>
  new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

const post = async (path: string, body?: unknown): Promise<string> => {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.ok) return "";
    const result = (await response.json().catch(() => null)) as { message?: string } | null;
    return result?.message ?? "That didn't work. Please try again.";
  } catch {
    return "Unable to connect to CivilHub. Please try again.";
  }
};

function Banner({
  tone,
  icon,
  title,
  children,
}: {
  tone: "amber" | "rose" | "neutral";
  icon: ReactElement;
  title: string;
  children: ReactNode;
}): ReactElement {
  const tones = {
    amber: "border-amber-300/35 bg-amber-300/5",
    rose: "border-rose-400/35 bg-rose-400/5",
    neutral: "border-white/10 bg-surface",
  };
  return (
    <section className={`rounded-2xl border p-5 sm:p-6 ${tones[tone]}`} aria-label={title}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-white/70">{icon}</span>
        <div className="min-w-0 flex-1 text-sm text-white/75">
          <h2 className="font-heading text-xl font-bold text-white">{title}</h2>
          {children}
        </div>
      </div>
    </section>
  );
}

/**
 * What happens when something goes wrong mid-project: asking CivilHub to step
 * in (which pauses the project), or ending it early by agreement with a split
 * of the money CivilHub holds. Tells the page when the project is locked.
 */
export function ProjectProblemPanel({
  projectId,
  viewerId,
  viewerRole,
  otherName,
  onLockChange,
  onSettled,
}: {
  projectId: string;
  viewerId: string;
  viewerRole: "client" | "provider";
  otherName: string;
  /** True while the project is paused for a dispute, or cancelled. */
  onLockChange: (locked: boolean) => void;
  /** After something that changes the project's work or money, so the page reloads. */
  onSettled: () => void;
}): ReactElement | null {
  const [state, setState] = useState<ProjectProblemState | null>(null);
  const [dialog, setDialog] = useState<"dispute" | "propose" | "accept" | "withdrawProposal" | "withdrawDispute" | null>(null);
  const [reason, setReason] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [providerShare, setProviderShare] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isBusy, setIsBusy] = useState<boolean>(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/dispute`, { credentials: "include" });
      const body: unknown = await response.json().catch(() => null);
      if (response.ok && isState(body)) {
        setState(body);
        onLockChange(body.paused || body.status === "cancelled");
      }
    } catch {
      // The rest of the page still works; this panel just stays hidden.
    }
  }, [projectId, onLockChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const close = (): void => {
    setDialog(null);
    setError("");
  };

  const run = async (path: string, body?: unknown): Promise<void> => {
    setIsBusy(true);
    setError("");
    const failure = await post(`/api/projects/${projectId}${path}`, body);
    setIsBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    close();
    setDescription("");
    setNote("");
    setProviderShare("");
    await load();
    onSettled();
  };

  if (!state) return null;

  const held = state.held ?? 0;
  const share = moneyValue(providerShare);
  const refund = share === null ? null : Math.max(0, Math.round((held - share) * 100) / 100);
  const isInProgress = state.status === "in-progress";

  const cancelledBanner = state.cancellation ? (
    <Banner tone="rose" icon={<XCircleIcon className="h-6 w-6" aria-hidden="true" />} title="This project was cancelled">
      <p className="mt-1">
        {state.cancellation.by === "agreement"
          ? "You and the other side agreed to end it early"
          : "CivilHub ended it after a dispute"}
        {state.cancellation.cancelledAt ? ` on ${formatDay(state.cancellation.cancelledAt)}` : ""}.
      </p>
      {state.cancellation.held > 0 ? (
        <p className="mt-2">
          Of the {formatCurrency(state.cancellation.held)} CivilHub was holding,{" "}
          <span className="font-semibold text-white">{formatCurrency(state.cancellation.providerAmount)}</span> goes to the
          provider and <span className="font-semibold text-white">{formatCurrency(state.cancellation.refundAmount)}</span> is
          refunded to the client.
          {viewerRole === "client" && state.cancellation.refundAmount > 0
            ? " CivilHub sends your refund to the card or wallet you paid with."
            : ""}
        </p>
      ) : null}
      {state.lastResolved?.resolution?.note ? (
        <p className="mt-2 text-white/60">Note from CivilHub: {state.lastResolved.resolution.note}</p>
      ) : null}
    </Banner>
  ) : null;

  const dispute = state.dispute;
  const disputeBanner = dispute ? (
    <Banner tone="amber" icon={<PauseCircleIcon className="h-6 w-6" aria-hidden="true" />} title="Paused while CivilHub reviews a problem">
      <p className="mt-1">
        {dispute.openedBy === viewerId ? "You" : otherName} asked CivilHub to step in on {formatDay(dispute.openedAt)}:{" "}
        {dispute.reasonLabel.toLowerCase()}. Nobody can approve, pay for or change phases until CivilHub decides. You can
        still message each other.
      </p>
      <p className="mt-2 whitespace-pre-line rounded-xl bg-void/40 p-3 text-white/70">{dispute.description}</p>
      {dispute.decision && dispute.stage && dispute.stage !== "review" ? (
        <DecisionNotice
          caseType="project"
          caseId={dispute.id}
          viewerRole={viewerRole}
          stage={dispute.stage}
          what={
            dispute.decision.outcome === "cancelled"
              ? `CivilHub decided to end the project: the provider keeps ${formatCurrency(dispute.decision.providerAmount ?? 0)} of the ${formatCurrency(held)} it holds, and the client is refunded ${formatCurrency(Math.max(0, held - (dispute.decision.providerAmount ?? 0)))}.`
              : "CivilHub decided to approve the handed-over phase for the client, and to resume the project."
          }
          note={dispute.decision.note}
          appealDeadline={dispute.decision.appealDeadline}
          acceptedBy={dispute.decision.acceptedBy}
          appeal={dispute.appeal ?? null}
          onChanged={() => {
            void load();
            onSettled();
          }}
        />
      ) : null}
      <CaseThread caseType="project" caseId={dispute.id} />
      {dispute.openedBy === viewerId && (dispute.stage ?? "review") === "review" ? (
        <button type="button" onClick={() => setDialog("withdrawDispute")} className={`${rowButtonClassName} mt-3`}>
          Withdraw, we've sorted it out
        </button>
      ) : null}
    </Banner>
  ) : null;

  const proposal = state.proposal;
  const isProposer = proposal?.proposedBy === viewerId;
  const proposalBanner = proposal ? (
    <Banner tone="amber" icon={<HandshakeIcon className="h-6 w-6" aria-hidden="true" />} title={isProposer ? "You proposed ending this project early" : `${otherName} proposed ending this project early`}>
      <p className="mt-1">
        The provider keeps <span className="font-semibold text-white">{formatCurrency(proposal.providerAmount)}</span> of the{" "}
        {formatCurrency(held)} CivilHub holds, and the client is refunded{" "}
        <span className="font-semibold text-white">{formatCurrency(Math.max(0, held - proposal.providerAmount))}</span>. Money
        already released for approved work stays with the provider.
      </p>
      {proposal.note ? <p className="mt-2 text-white/60">“{proposal.note}”</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {isProposer ? (
          <button type="button" onClick={() => setDialog("withdrawProposal")} className={rowButtonClassName}>
            Withdraw proposal
          </button>
        ) : (
          <>
            <button type="button" onClick={() => setDialog("accept")} className={rowButtonClassName}>
              Accept and end the project
            </button>
            <button type="button" disabled={isBusy} onClick={() => void run("/cancellation/decline")} className={rowButtonClassName}>
              Decline
            </button>
          </>
        )}
      </div>
    </Banner>
  ) : null;

  const resolvedNote =
    !dispute && !state.cancellation && state.lastResolved?.resolution ? (
      <p className={`${panelClassName} px-5 py-3 text-sm text-white/65`}>
        CivilHub closed a dispute on this project on {formatDay(state.lastResolved.resolution.decidedAt)}:{" "}
        {state.lastResolved.resolution.note}
      </p>
    ) : null;

  const actions =
    isInProgress && !dispute && !proposal ? (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 text-white/50">
          <WarningCircleIcon className="h-4 w-4" aria-hidden="true" />
          Problem with this project?
        </span>
        <button
          type="button"
          onClick={() => {
            setReason(viewerRole === "provider" && state.canReportNoResponse ? "no_response" : "");
            setDialog("dispute");
          }}
          className={rowButtonClassName}
        >
          Ask CivilHub to step in
        </button>
        <button type="button" onClick={() => setDialog("propose")} className={rowButtonClassName}>
          Propose ending early
        </button>
        {viewerRole === "provider" && state.canReportNoResponse ? (
          <span className="text-xs text-amber-200/80">
            {state.waitingForFunding
              ? `The client hasn't funded ${state.waitingForFunding.phase} for a week.`
              : "The client hasn't answered your hand-over for a week."}
          </span>
        ) : null}
      </div>
    ) : null;

  const reasons = REASONS.filter(
    (option) => option.value !== "no_response" || (viewerRole === "provider" && state.canReportNoResponse),
  );

  return (
    <div className="space-y-3">
      {cancelledBanner}
      {disputeBanner}
      {proposalBanner}
      {resolvedNote}
      {actions}

      {dialog === "dispute" ? (
        <Dialog
          title="Ask CivilHub to step in"
          description="The project is paused while CivilHub looks into it: nobody can approve, pay for or change phases. CivilHub reads both sides, the phase hand-overs and your messages with each other, then decides."
          onClose={close}
          isBusy={isBusy}
        >
          <div className="mt-5 grid gap-4">
            <FormField id="dispute-reason" label="What's the problem?" required>
              <select
                id="dispute-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className={inputClassName}
              >
                <option value="" disabled>
                  Choose one
                </option>
                {reasons.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="dispute-description" label="What happened?" hint="At least a couple of sentences: dates, phases and what you'd like to happen." required>
              <textarea
                id="dispute-description"
                rows={5}
                maxLength={2000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className={inputClassName}
              />
            </FormField>
            {error ? (
              <p role="alert" className="text-sm text-rose-300">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={close} disabled={isBusy} className={secondaryButtonClassName}>
                Cancel
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  if (!reason) return setError("Choose what the problem is about.");
                  if (description.trim().length < 20) return setError("Describe what happened in a few sentences.");
                  void run("/dispute", { reason, description: description.trim() });
                }}
                className={primaryButtonClassName}
              >
                {isBusy ? "Sending..." : "Pause and ask CivilHub"}
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}

      {dialog === "propose" ? (
        <Dialog
          title="Propose ending the project early"
          description={`CivilHub holds ${formatCurrency(held)} of what the client paid that isn't yet earned by approved work. Suggest how much of it the provider keeps; the client is refunded the rest. ${otherName} accepts or declines.`}
          onClose={close}
          isBusy={isBusy}
        >
          <div className="mt-5 grid gap-4">
            <FormField id="cancel-provider-share" label="The provider keeps" required>
              <MoneyInput id="cancel-provider-share" value={providerShare} onChange={setProviderShare} />
            </FormField>
            {share !== null && refund !== null ? (
              <p className="rounded-xl bg-white/5 p-3 text-sm text-white/70">
                Provider: <span className="font-semibold text-white">{formatCurrency(share)}</span> (less CivilHub's fee) ·
                Client refund: <span className="font-semibold text-white">{formatCurrency(refund)}</span>
              </p>
            ) : null}
            <FormField id="cancel-note" label="Note (optional)">
              <textarea
                id="cancel-note"
                rows={3}
                maxLength={1000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className={inputClassName}
              />
            </FormField>
            {error ? (
              <p role="alert" className="text-sm text-rose-300">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={close} disabled={isBusy} className={secondaryButtonClassName}>
                Cancel
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  if (share === null || share < 0 || share > held) {
                    return setError(`Enter an amount from ${formatCurrency(0)} to ${formatCurrency(held)}.`);
                  }
                  void run("/cancellation", { providerAmount: share, note: note.trim() });
                }}
                className={primaryButtonClassName}
              >
                {isBusy ? "Sending..." : "Send proposal"}
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}

      {dialog === "accept" && proposal ? (
        <ConfirmDialog
          title="End the project?"
          description={`The project is cancelled for good. The provider keeps ${formatCurrency(proposal.providerAmount)} and the client is refunded ${formatCurrency(Math.max(0, held - proposal.providerAmount))}.`}
          confirmLabel="Accept and end it"
          busyLabel="Ending..."
          tone="danger"
          isBusy={isBusy}
          error={error}
          onConfirm={() => void run("/cancellation/accept")}
          onClose={close}
        />
      ) : null}
      {dialog === "withdrawProposal" ? (
        <ConfirmDialog
          title="Withdraw your proposal?"
          confirmLabel="Withdraw"
          busyLabel="Withdrawing..."
          isBusy={isBusy}
          error={error}
          onConfirm={() => void run("/cancellation/withdraw")}
          onClose={close}
        />
      ) : null}
      {dialog === "withdrawDispute" ? (
        <ConfirmDialog
          title="Withdraw the dispute?"
          description="The project resumes straight away, and CivilHub closes the case."
          confirmLabel="Withdraw"
          busyLabel="Withdrawing..."
          isBusy={isBusy}
          error={error}
          onConfirm={() => void run("/dispute/withdraw")}
          onClose={close}
        />
      ) : null}
    </div>
  );
}

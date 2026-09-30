import { ArrowLeftIcon, PaperclipIcon } from "@phosphor-icons/react";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CaseThreads } from "../components/CaseThreads";
import { EvidenceFile } from "../components/EvidenceFile";
import { DecisionStatus } from "../components/DecisionStatus";
import { DialogActions, ErrorNote, Loading, Modal, PageHeader, panel, primaryButton } from "../components/ui";
import { type ProjectDisputeDetail, type ProjectDisputeOutcome, adminApi } from "../lib/api";
import {
  OUTCOME_LABELS,
  PAYMENT_TYPE_LABELS,
  PHASE_STATUS_LABELS,
  formatDate,
  formatDateTime,
  formatTaka,
} from "../lib/format";

/** In words, what a decision does, for the panels that show it. */
const describeOutcome = (detail: ProjectDisputeDetail, outcome: ProjectDisputeOutcome, phaseId: string | null, providerAmount: number | null): string => {
  if (outcome === "phase_approved") {
    return `Approve ${detail.phases.find((phase) => phase.id === phaseId)?.name ?? "a phase"} for the client and resume.`;
  }
  if (outcome === "cancelled") {
    const held = detail.held ?? 0;
    return `Cancel the project: the provider keeps ${formatTaka(providerAmount ?? 0)} of ${formatTaka(held)} held, and the client is refunded ${formatTaka(Math.max(0, held - (providerAmount ?? 0)))}.`;
  }
  return "Resume the project.";
};

function ResolveDialog({
  detail,
  mode = "decide",
  onDone,
  onClose,
}: {
  detail: ProjectDisputeDetail;
  /** "appeal": another admin upholds or changes a decision that was appealed. */
  mode?: "decide" | "appeal";
  onDone: () => void;
  onClose: () => void;
}): ReactElement {
  const [appealChoice, setAppealChoice] = useState<"uphold" | "change">("uphold");
  const approvable = detail.phases.filter((phase) => phase.canApproveForClient);
  const held = detail.held ?? 0;
  const [outcome, setOutcome] = useState<ProjectDisputeOutcome>("resumed");
  const [phaseId, setPhaseId] = useState<string>(approvable[0]?.id ?? "");
  const [providerAmount, setProviderAmount] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isBusy, setIsBusy] = useState<boolean>(false);

  const provider = Number(providerAmount);
  const validAmount = providerAmount !== "" && Number.isFinite(provider) && provider >= 0 && provider <= held;

  const upholding = mode === "appeal" && appealChoice === "uphold";

  const submit = async (): Promise<void> => {
    if (!upholding && outcome === "phase_approved" && !phaseId) return setError("Choose the phase to approve.");
    if (!upholding && outcome === "cancelled" && !validAmount) {
      return setError(`Enter the provider's share, from ${formatTaka(0)} to ${formatTaka(held)}.`);
    }
    if (!note.trim()) return setError("Write a note. Both sides see it, and it goes in the log.");
    setIsBusy(true);
    setError("");
    const chosen = {
      outcome,
      ...(outcome === "phase_approved" ? { phaseId } : {}),
      ...(outcome === "cancelled" ? { providerAmount: provider } : {}),
    };
    try {
      await adminApi(`/project-disputes/${detail.id}/${mode === "appeal" ? "appeal" : "resolve"}`, {
        method: "POST",
        body:
          mode === "appeal"
            ? upholding
              ? { decision: "uphold", note: note.trim() }
              : { decision: "change", note: note.trim(), ...chosen }
            : { note: note.trim(), ...chosen },
      });
      onDone();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      setIsBusy(false);
    }
  };

  const options: Array<{ value: ProjectDisputeOutcome; label: string; hint: string; disabled?: boolean }> = [
    { value: "resumed", label: "Resume the project", hint: "Close the dispute and let work carry on as it was." },
    {
      value: "phase_approved",
      label: "Approve a phase for the client",
      hint: approvable.length
        ? "The handed-over work is acceptable; approve it and resume."
        : "No handed-over phase can be approved without a new payment.",
      disabled: approvable.length === 0,
    },
    {
      value: "cancelled",
      label: "Cancel the project",
      hint: `End it and split the ${formatTaka(held)} CivilHub holds. Money already released for approved work stays with the provider.`,
    },
  ];

  return (
    <Modal
      title={mode === "appeal" ? "Decide the appeal" : "Resolve the dispute"}
      description={
        mode === "appeal"
          ? "Your decision is final and takes effect at once."
          : `${detail.projectTitle} · ${detail.reasonLabel}. Resuming takes effect now; approving a phase or cancelling waits 3 days for an appeal.`
      }
      isBusy={isBusy}
      onClose={onClose}
    >
      {mode === "appeal" && detail.decision ? (
        <fieldset className="mt-5 grid gap-2">
          <legend className="sr-only">Uphold or change</legend>
          {(
            [
              { value: "uphold", label: "Uphold the decision", hint: describeOutcome(detail, detail.decision.outcome, detail.decision.phase, detail.decision.providerAmount) },
              { value: "change", label: "Change it", hint: "Choose a different outcome below." },
            ] as const
          ).map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${
                appealChoice === option.value ? "border-primary bg-primary/5" : "border-white/10 hover:border-white/30"
              }`}
            >
              <input
                type="radio"
                name="appeal-choice"
                checked={appealChoice === option.value}
                onChange={() => {
                  setAppealChoice(option.value);
                  setError("");
                }}
                className="mt-1"
              />
              <span>
                <span className="block font-semibold text-white">{option.label}</span>
                <span className="text-white/55">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <fieldset className={`mt-5 grid gap-2 ${upholding ? "hidden" : ""}`}>
        <legend className="sr-only">Outcome</legend>
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex gap-3 rounded-xl border p-3 text-sm ${
              option.disabled
                ? "cursor-not-allowed border-white/5 opacity-50"
                : outcome === option.value
                  ? "cursor-pointer border-primary bg-primary/5"
                  : "cursor-pointer border-white/10 hover:border-white/30"
            }`}
          >
            <input
              type="radio"
              name="outcome"
              value={option.value}
              disabled={option.disabled}
              checked={outcome === option.value}
              onChange={() => {
                setOutcome(option.value);
                setError("");
              }}
              className="mt-1"
            />
            <span>
              <span className="block font-semibold text-white">{option.label}</span>
              <span className="text-white/55">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {!upholding && outcome === "phase_approved" && approvable.length > 1 ? (
        <label className="mt-4 grid gap-1.5 text-sm font-semibold text-white/80">
          Phase
          <select value={phaseId} onChange={(event) => setPhaseId(event.target.value)} className="form-input">
            {approvable.map((phase) => (
              <option key={phase.id} value={phase.id}>
                {phase.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {!upholding && outcome === "cancelled" ? (
        <>
          <label className="mt-4 grid gap-1.5 text-sm font-semibold text-white/80">
            The provider keeps (৳)
            <input
              type="number"
              min={0}
              max={held}
              step="0.01"
              inputMode="decimal"
              value={providerAmount}
              onChange={(event) => {
                setProviderAmount(event.target.value);
                setError("");
              }}
              className="form-input w-44"
            />
          </label>
          <p className="mt-3 rounded-xl bg-white/5 p-3 text-sm text-white/70">
            Of {formatTaka(held)} held: the provider gets{" "}
            <span className="font-semibold text-white tabular-nums">{formatTaka(validAmount ? provider : 0)}</span> (less
            CivilHub's fee), and the client is refunded{" "}
            <span className="font-semibold text-white tabular-nums">{formatTaka(validAmount ? held - provider : held)}</span>.
          </p>
        </>
      ) : null}

      <label className="mt-4 grid gap-1.5 text-sm font-semibold text-white/80">
        Note to both of them
        <textarea
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            setError("");
          }}
          rows={3}
          maxLength={500}
          className="form-input font-normal"
        />
      </label>
      <div className="mt-3">
        <ErrorNote message={error} />
      </div>
      <DialogActions
        isBusy={isBusy}
        confirmLabel={upholding ? "Uphold" : outcome === "cancelled" ? "Cancel the project" : "Save decision"}
        danger={!upholding && outcome === "cancelled"}
        onCancel={onClose}
        onConfirm={() => void submit()}
      />
    </Modal>
  );
}

/** One dispute: both sides, the work handed over, the money and the conversation. */
export function ProjectDisputeDetailPage(): ReactElement {
  const { disputeId } = useParams<{ disputeId: string }>();
  const [detail, setDetail] = useState<ProjectDisputeDetail | null>(null);
  const [error, setError] = useState<string>("");
  const [isResolving, setIsResolving] = useState<boolean>(false);

  const load = useCallback((): void => {
    adminApi<ProjectDisputeDetail>(`/project-disputes/${disputeId ?? ""}`)
      .then(setDetail)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Couldn't load this dispute."));
  }, [disputeId]);

  useEffect(load, [load]);

  const nameOf = (role: "client" | "provider"): string =>
    (role === "client" ? detail?.client?.name : detail?.provider?.name) ?? (role === "client" ? "Client" : "Provider");

  return (
    <>
      <Link to="/project-disputes" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-white/60 hover:text-white">
        <ArrowLeftIcon aria-hidden="true" className="h-4 w-4" /> Project disputes
      </Link>
      <ErrorNote message={error} />
      {!detail && !error ? <Loading /> : null}
      {detail ? (
        <>
          <PageHeader
            title={detail.projectTitle}
            intro={`${detail.reasonLabel} · opened by the ${detail.openedByRole} on ${formatDate(detail.openedAt)}`}
            action={
              detail.status === "open" && detail.stage === "review" ? (
                <button type="button" className={primaryButton} onClick={() => setIsResolving(true)}>
                  Resolve
                </button>
              ) : detail.status === "open" && detail.stage === "appealed" && detail.review?.mayReview ? (
                <button type="button" className={primaryButton} onClick={() => setIsResolving(true)}>
                  Decide the appeal
                </button>
              ) : undefined
            }
          />

          {detail.status === "open" && detail.stage !== "review" && detail.decision ? (
            <DecisionStatus
              stage={detail.stage}
              summary={describeOutcome(detail, detail.decision.outcome, detail.decision.phase, detail.decision.providerAmount)}
              note={detail.decision.note}
              decidedAt={detail.decision.decidedAt}
              appealDeadline={detail.decision.appealDeadline}
              acceptedBy={detail.decision.acceptedBy}
              appeal={detail.appeal}
              review={detail.review}
            />
          ) : null}

          {detail.resolution ? (
            <div className="mb-6 rounded-2xl border border-emerald-300/30 bg-emerald-300/5 p-5 text-sm text-white/80">
              <p className="font-semibold text-white">
                {OUTCOME_LABELS[detail.resolution.outcome]} on {formatDate(detail.resolution.decidedAt)}
              </p>
              {detail.resolution.outcome === "cancelled" ? (
                <p className="mt-1">
                  Provider {formatTaka(detail.resolution.providerAmount ?? 0)} · client refund{" "}
                  {formatTaka(detail.resolution.refundAmount ?? 0)} (see Refunds)
                </p>
              ) : null}
              <p className="mt-2 text-white/65">“{detail.resolution.note}”</p>
              {detail.appeal?.decision ? (
                <p className="mt-2 text-xs text-white/55">
                  After the {detail.appeal.role}’s appeal, which was {detail.appeal.decision === "upheld" ? "turned down" : "upheld"}.
                </p>
              ) : null}
            </div>
          ) : detail.status === "withdrawn" ? (
            <p className="mb-6 rounded-2xl border border-white/10 p-4 text-sm text-white/65">The person who opened this withdrew it.</p>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            <section className={`${panel} p-5 lg:col-span-2`} aria-labelledby="statement-heading">
              <h2 id="statement-heading" className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">
                {nameOf(detail.openedByRole)}'s statement
              </h2>
              <p className="mt-3 whitespace-pre-line text-sm text-white/80">{detail.description}</p>
              <p className="mt-4 text-xs text-white/45">
                Client:{" "}
                {detail.client ? (
                  <Link to={`/users/${detail.client.id}`} className="font-semibold text-primary hover:text-glow">
                    {detail.client.name}
                  </Link>
                ) : (
                  "—"
                )}{" "}
                · Provider:{" "}
                {detail.provider ? (
                  <Link to={`/users/${detail.provider.id}`} className="font-semibold text-primary hover:text-glow">
                    {detail.provider.name}
                  </Link>
                ) : (
                  "—"
                )}
              </p>
            </section>
            <section className={`${panel} p-5`} aria-labelledby="money-heading">
              <h2 id="money-heading" className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">
                Money
              </h2>
              <dl className="mt-3 grid gap-2 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-white/55">Agreed</dt>
                  <dd className="font-semibold tabular-nums text-white">{formatTaka(detail.project.totalAgreedValue ?? 0)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-white/55">Plan</dt>
                  <dd className="text-white/80">
                    {detail.project.paymentPlan === "full_upfront" ? "Paid upfront" : "Phase by phase"}
                    {detail.project.fundsBeforeWork ? ", funded before work" : ", paid on approval"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-white/55">CivilHub holds</dt>
                  <dd className="font-semibold tabular-nums text-primary">
                    {detail.held === null ? "—" : formatTaka(detail.held)}
                  </dd>
                </div>
              </dl>
              <ul className="mt-4 divide-y divide-white/5 text-xs">
                {detail.payments.map((payment) => (
                  <li key={payment.id} className="flex justify-between gap-2 py-1.5">
                    <span className="text-white/60">
                      {PAYMENT_TYPE_LABELS[payment.type] ?? payment.type}
                      {payment.status !== "paid" ? ` (${payment.status})` : ""}
                    </span>
                    <span className="tabular-nums text-white/80">{formatTaka(payment.amount)}</span>
                  </li>
                ))}
              </ul>
              {detail.project.proposal ? (
                <p className="mt-3 text-xs text-amber-200/80">
                  A cancellation was proposed: provider keeps {formatTaka(detail.project.proposal.providerAmount)}.
                </p>
              ) : null}
            </section>
          </div>

          <section className="mt-6" aria-labelledby="phases-heading">
            <h2 id="phases-heading" className="mb-3 font-heading text-lg font-bold text-white">
              Phases and hand-overs
            </h2>
            <ol className="grid gap-3">
              {detail.phases.map((phase) => (
                <li key={phase.id} className={`${panel} p-4`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-white">
                      {phase.order + 1}. {phase.name}
                    </p>
                    <p className="text-xs text-white/55">
                      {PHASE_STATUS_LABELS[phase.status] ?? phase.status} · {formatTaka(phase.price)} ·{" "}
                      {phase.paymentStatus === "paid"
                        ? detail.project.fundsBeforeWork && phase.status !== "completed"
                          ? "funded, held by CivilHub"
                          : "paid"
                        : "not paid"}
                      {phase.canApproveForClient ? " · can be approved for the client" : ""}
                    </p>
                  </div>
                  {phase.submissions.map((submission, index) => (
                    <div key={`${phase.id}-${index}`} className="mt-3 rounded-xl bg-void/40 p-3 text-sm">
                      <p className="text-xs text-white/45">Handed over {formatDateTime(submission.submittedAt)}</p>
                      <p className="mt-1 whitespace-pre-line text-white/80">{submission.note}</p>
                      {submission.files.length > 0 ? (
                        <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                          {submission.files.map((file) => (
                            <li key={file.url}>
                              <EvidenceFile file={{ ...file, uploadedByLabel: "provider" }} label={`Hand-over file: ${file.name}`} />
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                  {phase.changeRequest ? (
                    <p className="mt-3 rounded-xl border border-amber-300/25 p-3 text-sm text-white/75">
                      <span className="text-xs text-amber-200/80">
                        Changes requested {formatDateTime(phase.changeRequest.requestedAt)}
                      </span>
                      <span className="mt-1 block">{phase.changeRequest.note}</span>
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-6" aria-labelledby="chat-heading">
            <h2 id="chat-heading" className="mb-1 font-heading text-lg font-bold text-white">
              Their messages
            </h2>
            <p className="mb-3 text-xs text-white/45">
              The last {detail.messages.length} messages between them. Messages sent from this project are marked.
            </p>
            {detail.messages.length === 0 ? (
              <p className={`${panel} p-5 text-sm text-white/55`}>They haven't messaged each other.</p>
            ) : (
              <ol className={`${panel} max-h-[32rem] space-y-3 overflow-y-auto p-4`}>
                {detail.messages.map((message) => (
                  <li
                    key={message.id}
                    className={`max-w-[85%] rounded-xl p-3 text-sm ${
                      message.fromRole === "client" ? "bg-white/5" : "ml-auto bg-primary/10"
                    } ${message.aboutThisProject ? "ring-1 ring-primary/40" : ""}`}
                  >
                    <p className="text-xs text-white/45">
                      {nameOf(message.fromRole)} · {formatDateTime(message.at)}
                    </p>
                    {message.content ? <p className="mt-1 whitespace-pre-line text-white/85">{message.content}</p> : null}
                    {message.attachmentUrl ? (
                      <a href={message.attachmentUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:text-glow">
                        <PaperclipIcon aria-hidden="true" className="h-3.5 w-3.5" />
                        {message.attachmentName ?? message.type}
                      </a>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <CaseThreads
            threads={detail.threads}
            sides={[
              { role: "client", label: "client", name: detail.client?.name ?? null },
              { role: "provider", label: "provider", name: detail.provider?.name ?? null },
            ]}
            postPath={`/project-disputes/${detail.id}/messages`}
            isOpen={detail.status === "open"}
            onSent={load}
          />

          {detail.earlierDisputes.length > 0 ? (
            <section className="mt-6" aria-labelledby="earlier-heading">
              <h2 id="earlier-heading" className="mb-3 font-heading text-lg font-bold text-white">
                Earlier disputes on this project
              </h2>
              <ul className={`${panel} divide-y divide-white/5 text-sm`}>
                {detail.earlierDisputes.map((item) => (
                  <li key={item.openedAt} className="p-4 text-white/70">
                    {formatDate(item.openedAt)} · {item.reason} · {item.outcome ? OUTCOME_LABELS[item.outcome] : item.status}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {isResolving ? (
            <ResolveDialog
              detail={detail}
              mode={detail.stage === "appealed" ? "appeal" : "decide"}
              onClose={() => setIsResolving(false)}
              onDone={() => {
                setIsResolving(false);
                load();
              }}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

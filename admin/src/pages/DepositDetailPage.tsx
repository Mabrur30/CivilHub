import { ArrowLeftIcon } from "@phosphor-icons/react";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DialogActions, ErrorNote, Loading, Modal, PageHeader, panel, primaryButton } from "../components/ui";
import { type ConditionRecord, type DepositDisputeDetail, type DisputeDecision, adminApi } from "../lib/api";
import { DECISION_LABELS, formatDate, formatDateTime, formatTaka } from "../lib/format";

function Condition({ title, record }: { title: string; record: ConditionRecord }): ReactElement {
  return (
    <section className={`${panel} p-5`} aria-label={title}>
      <h3 className="font-heading text-lg font-bold text-white">{title}</h3>
      <p className="mt-0.5 text-xs text-white/45">{record.at ? formatDateTime(record.at) : "Not confirmed"}</p>
      <p className="mt-3 text-sm text-white/75">{record.notes || "No notes written."}</p>
      {record.photos.length > 0 ? (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {record.photos.map((url) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-white/10 hover:border-primary">
                <img src={url} alt={`${title} photo`} className="aspect-square w-full object-cover" loading="lazy" />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-white/45">No photos.</p>
      )}
    </section>
  );
}

const OPTIONS: Array<{ value: DisputeDecision; label: string; hint: string }> = [
  { value: "upheld", label: "Uphold the claim", hint: "The owner keeps the amount they claimed." },
  { value: "reduced", label: "Reduce the claim", hint: "The owner keeps a smaller amount; the rest goes back to the renter." },
  { value: "rejected", label: "Reject the claim", hint: "The whole deposit goes back to the renter." },
];

function DecideDialog({
  detail,
  onDone,
  onClose,
}: {
  detail: DepositDisputeDetail;
  onDone: () => void;
  onClose: () => void;
}): ReactElement {
  const [decision, setDecision] = useState<DisputeDecision>("upheld");
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isBusy, setIsBusy] = useState<boolean>(false);

  const claimed = detail.claimAmount;
  const reduced = Number(amount);
  const ownerGets = decision === "upheld" ? claimed : decision === "reduced" && reduced > 0 ? reduced : 0;
  const renterGets = detail.securityDeposit - ownerGets;

  const submit = async (): Promise<void> => {
    if (decision === "reduced" && !(reduced > 0 && reduced < claimed)) {
      setError(`Enter an amount more than 0 and less than ${formatTaka(claimed)}.`);
      return;
    }
    if (!note.trim()) {
      setError("Write a note. Both people see it, and it goes in the log.");
      return;
    }
    setIsBusy(true);
    setError("");
    try {
      await adminApi(`/deposits/${detail.bookingId}/decide`, {
        method: "POST",
        body: { decision, note: note.trim(), ...(decision === "reduced" ? { amount: reduced } : {}) },
      });
      onDone();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      setIsBusy(false);
    }
  };

  return (
    <Modal
      title="Decide the dispute"
      description={`${detail.owner?.name ?? "The owner"} claimed ${formatTaka(claimed)} of a ${formatTaka(detail.securityDeposit)} deposit.`}
      isBusy={isBusy}
      onClose={onClose}
    >
      <fieldset className="mt-5 grid gap-2">
        <legend className="sr-only">Decision</legend>
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${
              decision === option.value ? "border-primary bg-primary/5" : "border-white/10 hover:border-white/30"
            }`}
          >
            <input
              type="radio"
              name="decision"
              value={option.value}
              checked={decision === option.value}
              onChange={() => {
                setDecision(option.value);
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
      {decision === "reduced" ? (
        <label className="mt-4 grid gap-1.5 text-sm font-semibold text-white/80">
          The owner keeps (৳)
          <input
            type="number"
            min={1}
            max={claimed - 1}
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setError("");
            }}
            className="form-input w-40"
          />
        </label>
      ) : null}
      <p className="mt-4 rounded-xl bg-white/5 p-3 text-sm text-white/70">
        The owner is paid <span className="font-semibold text-white tabular-nums">{formatTaka(ownerGets)}</span>, and the renter is
        refunded <span className="font-semibold text-white tabular-nums">{formatTaka(renterGets)}</span>.
      </p>
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
          placeholder="For example: the pickup photos already show the dent."
          className="form-input font-normal"
        />
      </label>
      <div className="mt-3">
        <ErrorNote message={error} />
      </div>
      <DialogActions isBusy={isBusy} confirmLabel="Save decision" onCancel={onClose} onConfirm={() => void submit()} />
    </Modal>
  );
}

/** One disputed deposit: the claim, the renter's side, and the condition evidence. */
export function DepositDetailPage(): ReactElement {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [detail, setDetail] = useState<DepositDisputeDetail | null>(null);
  const [error, setError] = useState<string>("");
  const [isDeciding, setIsDeciding] = useState<boolean>(false);

  const load = useCallback((): void => {
    adminApi<DepositDisputeDetail>(`/deposits/${bookingId ?? ""}`)
      .then(setDetail)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Couldn't load this dispute."));
  }, [bookingId]);

  useEffect(load, [load]);

  const dispute = detail?.dispute;

  return (
    <>
      <Link to="/deposits" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-white/60 hover:text-white">
        <ArrowLeftIcon aria-hidden="true" className="h-4 w-4" /> Deposits
      </Link>
      <ErrorNote message={error} />
      {!detail && !error ? <Loading /> : null}
      {detail && dispute ? (
        <>
          <PageHeader
            title={detail.equipment}
            intro={`Rented ${formatDate(detail.startDate)} to ${formatDate(detail.endDate)} · ${formatTaka(detail.securityDeposit)} deposit`}
            action={
              dispute.status === "open" ? (
                <button type="button" className={primaryButton} onClick={() => setIsDeciding(true)}>
                  Decide
                </button>
              ) : undefined
            }
          />

          {dispute.status === "decided" ? (
            <div className="mb-6 rounded-2xl border border-emerald-300/30 bg-emerald-300/5 p-5 text-sm text-white/80">
              <p className="font-semibold text-white">
                {DECISION_LABELS[dispute.decision ?? ""] ?? "Decided"}
                {dispute.decidedAt ? ` on ${formatDate(dispute.decidedAt)}` : ""}
              </p>
              <p className="mt-1">
                Owner paid {formatTaka(dispute.decision === "rejected" ? 0 : detail.claimAmount)}, renter refunded{" "}
                {formatTaka(detail.securityDeposit - (dispute.decision === "rejected" ? 0 : detail.claimAmount))}.
                {detail.refund ? ` Refund ${detail.refund.status} (${detail.refund.method}).` : " Refund not sent yet; see Refunds."}
              </p>
              {dispute.decisionNote ? <p className="mt-2 text-white/65">“{dispute.decisionNote}”</p> : null}
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className={`${panel} p-5`} aria-label="The owner's claim">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">Owner’s claim</p>
              <p className="mt-2 font-heading text-3xl font-bold text-white tabular-nums">{formatTaka(dispute.originalClaimAmount)}</p>
              <p className="mt-1 text-sm text-white/60">
                {detail.owner ? (
                  <Link to={`/users/${detail.owner.id}`} className="font-semibold text-white hover:text-primary">
                    {detail.owner.name}
                  </Link>
                ) : (
                  "Owner"
                )}
                {detail.claimedAt ? ` · ${formatDateTime(detail.claimedAt)}` : ""}
              </p>
              <p className="mt-3 text-sm text-white/75">{detail.claimNotes || "No reason given."}</p>
            </section>
            <section className={`${panel} p-5`} aria-label="The renter's dispute">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">Renter’s dispute</p>
              <p className="mt-2 text-sm text-white/60">
                {detail.renter ? (
                  <Link to={`/users/${detail.renter.id}`} className="font-semibold text-white hover:text-primary">
                    {detail.renter.name}
                  </Link>
                ) : (
                  "Renter"
                )}
                {` · ${formatDateTime(dispute.openedAt)}`}
              </p>
              <p className="mt-3 whitespace-pre-line text-sm text-white/75">{dispute.reason}</p>
            </section>
            <Condition title="At pickup" record={detail.pickup} />
            <Condition title="At return" record={detail.return} />
          </div>

          {detail.payment ? (
            <p className="mt-4 text-xs text-white/45">
              Paid {formatTaka(detail.payment.amount)}, including the {formatTaka(detail.payment.depositAmount)} deposit
              {detail.payment.tranId ? ` · ${detail.payment.tranId}` : ""}
            </p>
          ) : null}

          {isDeciding ? (
            <DecideDialog
              detail={detail}
              onClose={() => setIsDeciding(false)}
              onDone={() => {
                setIsDeciding(false);
                load();
              }}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

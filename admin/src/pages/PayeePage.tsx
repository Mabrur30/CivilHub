import { ArrowLeftIcon } from "@phosphor-icons/react";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  DialogActions,
  ErrorNote,
  Loading,
  Modal,
  PageHeader,
  panel,
  primaryButton,
} from "../components/ui";
import { type PayeeDetail, type PayoutAccountView, adminApi } from "../lib/api";
import {
  PAYMENT_TYPE_LABELS,
  PAYOUT_METHOD_LABELS,
  ROLE_LABELS,
  formatDate,
  formatDateTime,
  formatTaka,
} from "../lib/format";

function AccountCard({ account }: { account: PayoutAccountView | null }): ReactElement {
  if (!account) {
    return (
      <p className="text-sm text-white/60">
        They haven't added a payout account yet. They can add one under Settings → Getting paid.
      </p>
    );
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      <dt className="text-white/45">Method</dt>
      <dd className="font-semibold text-white">{PAYOUT_METHOD_LABELS[account.method]}</dd>
      <dt className="text-white/45">Name</dt>
      <dd className="text-white">{account.accountName}</dd>
      <dt className="text-white/45">{account.method === "bank" ? "Account no." : "Number"}</dt>
      <dd className="font-mono text-white">{account.accountNumber}</dd>
      {account.bankName ? (
        <>
          <dt className="text-white/45">Bank</dt>
          <dd className="text-white">
            {account.bankName}
            {account.branch ? `, ${account.branch}` : ""}
          </dd>
        </>
      ) : null}
      {account.routingNumber ? (
        <>
          <dt className="text-white/45">Routing</dt>
          <dd className="font-mono text-white">{account.routingNumber}</dd>
        </>
      ) : null}
      <dt className="text-white/45">Updated</dt>
      <dd className="text-white/60">{formatDate(account.updatedAt)}</dd>
    </dl>
  );
}

function PayoutDialog({
  detail,
  onDone,
  onClose,
}: {
  detail: PayeeDetail;
  onDone: () => void;
  onClose: () => void;
}): ReactElement {
  const [amount, setAmount] = useState<string>(String(detail.earnings.owed));
  const [reference, setReference] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const account = detail.account as PayoutAccountView;

  const submit = async (): Promise<void> => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter the amount you sent.");
      return;
    }
    if (!reference.trim()) {
      setError("Enter the transaction reference from bKash or the bank.");
      return;
    }
    setIsBusy(true);
    setError("");
    try {
      await adminApi(`/money/payees/${detail.payee.id}/payouts`, {
        method: "POST",
        body: { amount: value, reference: reference.trim(), note: note.trim() || undefined },
      });
      onDone();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Couldn't record the payout.");
      setIsBusy(false);
    }
  };

  return (
    <Modal
      title="Record a payout"
      description={
        <>
          First send the money to{" "}
          <strong className="text-white">
            {PAYOUT_METHOD_LABELS[account.method]} {account.accountNumber}
          </strong>{" "}
          ({account.accountName}) from CivilHub's account. Then record it here; {detail.payee.name} is notified.
        </>
      }
      isBusy={isBusy}
      onClose={onClose}
    >
      <div className="mt-5 grid gap-4">
        <label className="grid gap-1.5 text-sm font-semibold text-white/80">
          Amount sent (up to {formatTaka(detail.earnings.owed)})
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="form-input w-48 font-normal"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-white/80">
          Transaction reference
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            maxLength={120}
            placeholder="e.g. bKash TrxID 9A7B6C5D"
            className="form-input font-normal"
            autoFocus
          />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-white/80">
          Note <span className="font-normal text-white/45">(optional, for the log)</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className="form-input font-normal" />
        </label>
        <ErrorNote message={error} />
      </div>
      <DialogActions isBusy={isBusy} confirmLabel="Record payout" onCancel={onClose} onConfirm={() => void submit()} />
    </Modal>
  );
}

export function PayeePage(): ReactElement {
  const { userId } = useParams<{ userId: string }>();
  const [detail, setDetail] = useState<PayeeDetail | null>(null);
  const [error, setError] = useState<string>("");
  const [isPaying, setIsPaying] = useState<boolean>(false);
  const [notice, setNotice] = useState<string>("");

  const load = useCallback(() => {
    adminApi<PayeeDetail>(`/money/payees/${userId}`)
      .then(setDetail)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Couldn't load this payee."));
  }, [userId]);

  useEffect(load, [load]);

  return (
    <>
      <Link to="/payouts" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-white/60 hover:text-white">
        <ArrowLeftIcon aria-hidden="true" className="h-4 w-4" /> Payouts
      </Link>
      <ErrorNote message={error} />
      {!detail && !error ? <Loading /> : null}
      {detail ? (
        <>
          <PageHeader
            title={detail.payee.name}
            intro={`${ROLE_LABELS[detail.payee.role]} · ${detail.payee.email}`}
            action={
              <button
                type="button"
                className={primaryButton}
                disabled={detail.earnings.owed <= 0 || !detail.account}
                onClick={() => {
                  setNotice("");
                  setIsPaying(true);
                }}
              >
                Record a payout
              </button>
            }
          />
          {notice ? (
            <p role="status" className="mb-4 rounded-xl border border-emerald-300/30 px-4 py-3 text-sm text-emerald-300">
              {notice}
            </p>
          ) : null}

          <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
            <section className={`${panel} grid grid-cols-2 gap-4 p-5 sm:grid-cols-4`}>
              {(
                [
                  ["Owed now", detail.earnings.owed],
                  ["On hold", detail.earnings.onHold],
                  ["Released", detail.earnings.released],
                  ["Paid out", detail.earnings.paidOut],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-white/45">{label}</p>
                  <p className="mt-1 font-heading text-2xl font-bold text-white tabular-nums">{formatTaka(value)}</p>
                </div>
              ))}
            </section>
            <section aria-labelledby="account-heading" className={`${panel} p-5`}>
              <h2 id="account-heading" className="mb-3 font-heading text-lg font-bold text-white">
                Payout account
              </h2>
              <AccountCard account={detail.account} />
            </section>
          </div>

          <section aria-labelledby="earnings-heading" className={`${panel} mb-6 overflow-x-auto`}>
            <h2 id="earnings-heading" className="px-5 pt-5 font-heading text-lg font-bold text-white">
              What they've earned
            </h2>
            <table className="mt-3 w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-[0.1em] text-white/45">
                <tr>
                  <th scope="col" className="px-5 py-2 font-semibold">Payment</th>
                  <th scope="col" className="px-5 py-2 text-right font-semibold">Their share</th>
                  <th scope="col" className="px-5 py-2 text-right font-semibold">Released</th>
                  <th scope="col" className="px-5 py-2 text-right font-semibold">On hold</th>
                </tr>
              </thead>
              <tbody>
                {detail.earnings.lines.map((line, index) => (
                  <tr key={`${line.paymentId}-${line.kind}-${index}`} className="border-b border-white/5 last:border-0">
                    <td className="px-5 py-2.5">
                      <span className="text-white/85">{line.description}</span>
                      <span className="block text-xs text-white/45">
                        {PAYMENT_TYPE_LABELS[line.kind]}
                        {line.paidAt ? ` · paid ${formatDate(line.paidAt)}` : ""}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-white/70">{formatTaka(line.amount)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-white">{formatTaka(line.released)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-white/60">{formatTaka(line.onHold)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section aria-labelledby="payouts-heading" className={`${panel} p-5`}>
            <h2 id="payouts-heading" className="font-heading text-lg font-bold text-white">
              Payouts sent
            </h2>
            {detail.payouts.length === 0 ? (
              <p className="mt-2 text-sm text-white/50">None yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-white/5">
                {detail.payouts.map((payout) => (
                  <li key={payout.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm">
                    <span className="text-white/85">
                      <span className="font-semibold tabular-nums">{formatTaka(payout.amount)}</span> to{" "}
                      {PAYOUT_METHOD_LABELS[payout.account.method]} {payout.account.accountNumber} · ref{" "}
                      <span className="font-mono">{payout.reference}</span>
                      {payout.note ? <span className="block text-white/55">{payout.note}</span> : null}
                    </span>
                    <span className="text-xs text-white/45">
                      {formatDateTime(payout.paidAt)} by {payout.adminName}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isPaying && detail.account ? (
            <PayoutDialog
              detail={detail}
              onClose={() => setIsPaying(false)}
              onDone={() => {
                setIsPaying(false);
                setNotice(`Payout recorded. ${detail.payee.name} has been notified.`);
                load();
              }}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

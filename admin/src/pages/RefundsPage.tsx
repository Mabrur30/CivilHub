import { type ReactElement, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  DialogActions,
  ErrorNote,
  Loading,
  Modal,
  PageHeader,
  panel,
  primaryButton,
  secondaryButton,
} from "../components/ui";
import { type RefundDue, type RefundRecord, adminApi } from "../lib/api";
import { formatDate, formatDateTime, formatTaka } from "../lib/format";

interface RefundQueue {
  due: RefundDue[];
  processing: RefundRecord[];
  recent: RefundRecord[];
}

type Pending = { item: RefundDue; method: "sslcommerz" | "manual" };

const KIND_LABELS = {
  overpayment: "Duplicate payment",
  deposit: "Rental deposit",
  cancellation: "Cancelled project",
} as const;

function RefundDialog({
  pending,
  onDone,
  onClose,
}: {
  pending: Pending;
  onDone: (message: string) => void;
  onClose: () => void;
}): ReactElement {
  const { item, method } = pending;
  const [reference, setReference] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const payer = item.payer?.name ?? "the payer";

  const submit = async (): Promise<void> => {
    if (method === "manual" && !reference.trim()) {
      setError("Enter the transaction reference of the refund you sent.");
      return;
    }
    setIsBusy(true);
    setError("");
    try {
      const refund = await adminApi<RefundRecord>("/money/refunds", {
        method: "POST",
        body: {
          paymentId: item.paymentId,
          kind: item.kind,
          method,
          reference: method === "manual" ? reference.trim() : undefined,
          note: note.trim() || undefined,
        },
      });
      onDone(
        refund.status === "processing"
          ? `SSLCommerz accepted the refund and is processing it. Check back with "Check status".`
          : `Refunded ${formatTaka(refund.amount)} to ${payer}. They've been notified.`,
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Couldn't refund this.");
      setIsBusy(false);
    }
  };

  return (
    <Modal
      title={method === "sslcommerz" ? "Refund through SSLCommerz?" : "Record a manual refund"}
      description={
        method === "sslcommerz" ? (
          <>
            SSLCommerz returns <strong className="text-white">{formatTaka(item.amount)}</strong> to the {item.paidWith} account{" "}
            {payer} paid with. It can take a few working days to reach them.
          </>
        ) : (
          <>
            Send <strong className="text-white">{formatTaka(item.amount)}</strong> to {payer} from CivilHub's account first
            {item.payer?.email ? ` (contact them at ${item.payer.email} for their account)` : ""}, then record the reference here.
          </>
        )
      }
      isBusy={isBusy}
      onClose={onClose}
    >
      <div className="mt-5 grid gap-4">
        {method === "manual" ? (
          <label className="grid gap-1.5 text-sm font-semibold text-white/80">
            Transaction reference
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              maxLength={120}
              className="form-input font-normal"
              autoFocus
            />
          </label>
        ) : null}
        <label className="grid gap-1.5 text-sm font-semibold text-white/80">
          Note <span className="font-normal text-white/45">(optional, for the log)</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className="form-input font-normal" />
        </label>
        <ErrorNote message={error} />
      </div>
      <DialogActions
        isBusy={isBusy}
        confirmLabel={method === "sslcommerz" ? `Refund ${formatTaka(item.amount)}` : "Record refund"}
        onCancel={onClose}
        onConfirm={() => void submit()}
      />
    </Modal>
  );
}

function RecordRow({ refund, onCheck }: { refund: RefundRecord; onCheck?: () => void }): ReactElement {
  const tone =
    refund.status === "completed" ? "text-emerald-300" : refund.status === "failed" ? "text-rose-300" : "text-amber-300";
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
      <span className="text-white/85">
        <span className="font-semibold tabular-nums">{formatTaka(refund.amount)}</span> to {refund.payer?.name ?? "a deleted account"} ·{" "}
        {KIND_LABELS[refund.kind]} · {refund.method === "sslcommerz" ? "SSLCommerz" : "manual"}
        {refund.reference ? <span className="font-mono text-white/55"> · {refund.reference}</span> : null}
        {refund.failureReason ? <span className="block text-rose-300">{refund.failureReason}</span> : null}
      </span>
      <span className="flex items-center gap-3 text-xs">
        <span className={`font-semibold ${tone}`}>{refund.status}</span>
        <span className="text-white/45">{formatDateTime(refund.completedAt ?? refund.createdAt)}</span>
        {onCheck ? (
          <button type="button" className={secondaryButton} onClick={onCheck}>
            Check status
          </button>
        ) : null}
      </span>
    </li>
  );
}

export function RefundsPage(): ReactElement {
  const [data, setData] = useState<RefundQueue | null>(null);
  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");
  const [pending, setPending] = useState<Pending | null>(null);

  const load = useCallback(() => {
    adminApi<RefundQueue>("/money/refunds")
      .then(setData)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Couldn't load refunds."));
  }, []);

  useEffect(load, [load]);

  const check = async (refund: RefundRecord): Promise<void> => {
    setError("");
    try {
      const updated = await adminApi<RefundRecord>(`/money/refunds/${refund.id}/check`, { method: "POST" });
      setNotice(updated.status === "processing" ? "SSLCommerz is still processing it." : `The refund is ${updated.status}.`);
      load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Couldn't check the refund.");
    }
  };

  return (
    <>
      <PageHeader
        title="Refunds"
        intro="Money CivilHub owes back: payments that arrived twice or too late, rental deposits the owner has released, and the client's share of cancelled projects."
      />
      <ErrorNote message={error} />
      {notice ? (
        <p role="status" className="mb-4 rounded-xl border border-emerald-300/30 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </p>
      ) : null}
      {!data && !error ? <Loading /> : null}
      {data ? (
        <div className="grid gap-6">
          <section aria-labelledby="due-heading">
            <h2 id="due-heading" className="mb-3 font-heading text-xl font-bold text-white">
              To refund ({data.due.length})
            </h2>
            {data.due.length === 0 ? (
              <div className={`${panel} p-8 text-center text-sm text-white/55`}>Nothing to refund.</div>
            ) : (
              <div className="grid gap-3">
                {data.due.map((item) => (
                  <article key={`${item.kind}-${item.paymentId}`} className={`${panel} flex flex-wrap items-center justify-between gap-4 p-5`}>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">
                        {KIND_LABELS[item.kind]} · since {formatDate(item.since)}
                      </p>
                      <p className="mt-1 font-heading text-2xl font-bold text-white tabular-nums">{formatTaka(item.amount)}</p>
                      <p className="text-sm text-white/70">
                        {item.payer ? (
                          <Link to={`/users/${item.payer.id}`} className="font-semibold underline decoration-white/25 underline-offset-4 hover:decoration-white">
                            {item.payer.name}
                          </Link>
                        ) : (
                          "Deleted account"
                        )}{" "}
                        · paid with {item.paidWith}
                        {item.tranId ? <span className="font-mono text-white/50"> · {item.tranId}</span> : null}
                      </p>
                      <p className="text-sm text-white/55">{item.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.canUseGateway ? (
                        <button type="button" className={primaryButton} onClick={() => setPending({ item, method: "sslcommerz" })}>
                          Refund via SSLCommerz
                        </button>
                      ) : null}
                      <button type="button" className={secondaryButton} onClick={() => setPending({ item, method: "manual" })}>
                        Record manual refund
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {data.processing.length > 0 ? (
            <section aria-labelledby="processing-heading" className={`${panel} p-5`}>
              <h2 id="processing-heading" className="font-heading text-lg font-bold text-white">
                Processing at SSLCommerz
              </h2>
              <ul className="mt-2 divide-y divide-white/5">
                {data.processing.map((refund) => (
                  <RecordRow key={refund.id} refund={refund} onCheck={() => void check(refund)} />
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="recent-heading" className={`${panel} p-5`}>
            <h2 id="recent-heading" className="font-heading text-lg font-bold text-white">
              Recent refunds
            </h2>
            {data.recent.length === 0 ? (
              <p className="mt-2 text-sm text-white/50">None yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-white/5">
                {data.recent.map((refund) => (
                  <RecordRow key={refund.id} refund={refund} />
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {pending ? (
        <RefundDialog
          pending={pending}
          onClose={() => setPending(null)}
          onDone={(message) => {
            setPending(null);
            setNotice(message);
            load();
          }}
        />
      ) : null}
    </>
  );
}

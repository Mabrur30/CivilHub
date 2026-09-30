import { type ReactElement, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorNote, Loading, PageHeader, Pager, panel } from "../components/ui";
import { type Paged, type PaymentRow, adminApi } from "../lib/api";
import { PAYMENT_TYPE_LABELS, formatDateTime, formatTaka } from "../lib/format";

const STATUS_OPTIONS = ["", "paid", "initiated", "failed", "cancelled", "expired"];
const TYPE_OPTIONS = ["", "advance", "phase", "full_remaining", "equipment_booking"];

const statusTone = (row: PaymentRow): string =>
  row.refundDue
    ? "text-amber-300"
    : row.status === "paid"
      ? "text-emerald-300"
      : row.status === "initiated"
        ? "text-white/60"
        : "text-rose-300";

/** Every payment through CivilHub, newest first. */
export function PaymentsPage(): ReactElement {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const type = params.get("type") ?? "";
  const page = Number(params.get("page") ?? "1") || 1;
  const [draft, setDraft] = useState<string>(q);
  const [data, setData] = useState<Paged<PaymentRow> | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let isActive = true;
    const query = new URLSearchParams({ q, status, type, page: String(page) });
    adminApi<Paged<PaymentRow>>(`/money/payments?${query.toString()}`)
      .then((body) => {
        if (isActive) setData(body);
      })
      .catch((caught: unknown) => {
        if (isActive) setError(caught instanceof Error ? caught.message : "Couldn't load payments.");
      });
    return () => {
      isActive = false;
    };
  }, [q, status, type, page]);

  const update = (changes: Record<string, string>): void => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!("page" in changes)) next.delete("page");
    setParams(next);
  };

  return (
    <>
      <PageHeader title="Payments" intro="Every payment through CivilHub. Search by name, email, transaction id or description." />
      <form
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          update({ q: draft.trim() });
        }}
      >
        <label htmlFor="payment-search" className="sr-only">
          Search payments
        </label>
        <input
          id="payment-search"
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Name, email or transaction id"
          className="form-input max-w-xs"
        />
        <label htmlFor="payment-status" className="sr-only">
          Status
        </label>
        <select id="payment-status" value={status} onChange={(event) => update({ status: event.target.value })} className="form-input w-auto">
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option ? option[0].toUpperCase() + option.slice(1) : "Any status"}
            </option>
          ))}
        </select>
        <label htmlFor="payment-type" className="sr-only">
          Type
        </label>
        <select id="payment-type" value={type} onChange={(event) => update({ type: event.target.value })} className="form-input w-auto">
          {TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option ? PAYMENT_TYPE_LABELS[option] : "Any type"}
            </option>
          ))}
        </select>
      </form>

      <ErrorNote message={error} />
      {!data && !error ? <Loading /> : null}
      {data ? (
        <div className={`${panel} overflow-x-auto`}>
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-[0.1em] text-white/45">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Payment</th>
                <th scope="col" className="px-4 py-3 font-semibold">From → to</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Amount</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Fee</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 font-semibold">When</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-white/50">
                    No payments match.
                  </td>
                </tr>
              ) : (
                data.items.map((row) => (
                  <tr key={row.id} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-3">
                      <span className="text-white/85">{row.description ?? PAYMENT_TYPE_LABELS[row.type]}</span>
                      <span className="block text-xs text-white/45">
                        {PAYMENT_TYPE_LABELS[row.type]}
                        {row.paidWith ? ` · ${row.paidWith}` : ""}
                        {row.tranId ? <span className="font-mono"> · {row.tranId}</span> : null}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/70">
                      {row.payer ? (
                        <Link to={`/users/${row.payer.id}`} className="hover:text-white">
                          {row.payer.name}
                        </Link>
                      ) : (
                        "—"
                      )}{" "}
                      →{" "}
                      {row.payee ? (
                        <Link to={`/payouts/${row.payee.id}`} className="hover:text-white">
                          {row.payee.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-white">
                      {formatTaka(row.amount)}
                      {row.depositAmount > 0 ? (
                        <span className="block text-xs text-white/45">incl. {formatTaka(row.depositAmount)} deposit</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-white/60">{formatTaka(row.platformFee)}</td>
                    <td className={`px-4 py-3 font-semibold ${statusTone(row)}`}>{row.refundDue ? "refund due" : row.status}</td>
                    <td className="px-4 py-3 text-white/60">{formatDateTime(row.paidAt ?? row.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
      {data ? (
        <Pager page={data.page} pageSize={data.pageSize} total={data.total} onChange={(next) => update({ page: String(next) })} />
      ) : null}
    </>
  );
}

import { type ReactElement, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorNote, Loading, PageHeader, panel } from "../components/ui";
import { type PayeeRow, adminApi } from "../lib/api";
import { ROLE_LABELS, formatDate, formatTaka } from "../lib/format";

interface PayeeList {
  items: PayeeRow[];
  totals: { owed: number; onHold: number; paidOut: number };
}

function Total({ label, value, note }: { label: string; value: number; note: string }): ReactElement {
  return (
    <div className={`${panel} p-5`}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">{label}</p>
      <p className="mt-2 font-heading text-3xl font-bold text-white tabular-nums">{formatTaka(value)}</p>
      <p className="mt-1 text-xs text-white/50">{note}</p>
    </div>
  );
}

/** Who CivilHub owes money to, most owed first. */
export function PayoutsPage(): ReactElement {
  const [data, setData] = useState<PayeeList | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    adminApi<PayeeList>("/money/payees")
      .then(setData)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Couldn't load payouts."));
  }, []);

  return (
    <>
      <PageHeader
        title="Payouts"
        intro="What engineers and owners have earned. Money is released once the client accepts the work; send it from CivilHub's account, then record it here."
      />
      <ErrorNote message={error} />
      {!data && !error ? <Loading /> : null}
      {data ? (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Total label="Owed now" value={data.totals.owed} note="Released and not yet sent" />
            <Total label="On hold" value={data.totals.onHold} note="Paid by clients, work not yet accepted" />
            <Total label="Paid out" value={data.totals.paidOut} note="Sent so far" />
          </div>
          <div className={`${panel} overflow-x-auto`}>
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-[0.1em] text-white/45">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Payee</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Owed</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">On hold</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Paid out</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Last payout</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-white/50">
                      Nobody has been paid through CivilHub yet.
                    </td>
                  </tr>
                ) : (
                  data.items.map((row) => (
                    <tr key={row.payee.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                      <td className="px-4 py-3">
                        <Link to={`/payouts/${row.payee.id}`} className="font-semibold text-white hover:text-primary">
                          {row.payee.name}
                        </Link>
                        <span className="block text-xs text-white/45">
                          {row.payee.role ? ROLE_LABELS[row.payee.role] : ""}
                          {row.owed > 0 && !row.hasAccount ? " · no payout account yet" : ""}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${row.owed > 0 ? "font-semibold text-primary" : "text-white/50"}`}>
                        {formatTaka(row.owed)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-white/70">{formatTaka(row.onHold)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-white/70">{formatTaka(row.paidOut)}</td>
                      <td className="px-4 py-3 text-white/60">{row.lastPayoutAt ? formatDate(row.lastPayoutAt) : "Never"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}

import { type ReactElement, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorNote, Loading, PageHeader, Pager, panel } from "../components/ui";
import { type DepositDisputeRow, type Paged, adminApi } from "../lib/api";
import { DECISION_LABELS, formatDate, formatTaka } from "../lib/format";

const TABS = [
  { value: "open", label: "Waiting for a decision" },
  { value: "decided", label: "Decided" },
] as const;

/** Deposit claims renters have disputed, oldest open one first. */
export function DepositsPage(): ReactElement {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") === "decided" ? "decided" : "open";
  const page = Number(params.get("page") ?? "1") || 1;
  const [data, setData] = useState<Paged<DepositDisputeRow> | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let isActive = true;
    setData(null);
    adminApi<Paged<DepositDisputeRow>>(`/deposits?status=${status}&page=${page}`)
      .then((body) => {
        if (isActive) setData(body);
      })
      .catch((caught: unknown) => {
        if (isActive) setError(caught instanceof Error ? caught.message : "Couldn't load deposit disputes.");
      });
    return () => {
      isActive = false;
    };
  }, [status, page]);

  return (
    <>
      <PageHeader
        title="Deposits"
        intro="Renters can dispute an owner's damage claim within 3 days. The claimed amount stays on hold until you decide."
      />
      <div role="tablist" aria-label="Dispute status" className="mb-4 flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={status === tab.value}
            onClick={() => setParams(tab.value === "open" ? {} : { status: tab.value })}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              status === tab.value ? "bg-primary/15 text-primary" : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ErrorNote message={error} />
      {!data && !error ? <Loading /> : null}
      {data && data.items.length === 0 ? (
        <p className={`${panel} p-6 text-sm text-white/60`}>
          {status === "open" ? "No disputes waiting." : "Nothing decided yet."}
        </p>
      ) : null}
      {data && data.items.length > 0 ? (
        <ul className="grid gap-3">
          {data.items.map((row) => (
            <li key={row.bookingId}>
              <Link
                to={`/deposits/${row.bookingId}`}
                className={`${panel} block p-5 transition-colors hover:border-primary`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-white">{row.equipment}</p>
                  <p className="text-xs text-white/50">
                    {row.dispute.status === "open"
                      ? `Disputed ${formatDate(row.dispute.openedAt)}`
                      : `${DECISION_LABELS[row.dispute.decision ?? ""] ?? "Decided"} ${row.dispute.decidedAt ? formatDate(row.dispute.decidedAt) : ""}`}
                  </p>
                </div>
                <p className="mt-1 text-sm text-white/65">
                  {row.owner?.name ?? "Owner"} claimed{" "}
                  <span className="font-semibold text-white tabular-nums">{formatTaka(row.dispute.originalClaimAmount)}</span> of{" "}
                  {row.renter?.name ?? "the renter"}’s {formatTaka(row.securityDeposit)} deposit
                  {row.dispute.decision === "reduced" ? `, reduced to ${formatTaka(row.claimAmount)}` : ""}
                </p>
                <p className="mt-2 line-clamp-2 text-sm text-white/50">“{row.dispute.reason}”</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {data ? (
        <Pager
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onChange={(next) => setParams({ ...(status === "decided" ? { status } : {}), page: String(next) })}
        />
      ) : null}
    </>
  );
}

import { type ReactElement, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorNote, Loading, PageHeader, Pager, panel } from "../components/ui";
import { type Paged, type VerificationRow, type VerificationStatus, adminApi } from "../lib/api";
import { ROLE_LABELS, formatDate } from "../lib/format";

const TABS: Array<{ value: VerificationStatus; label: string }> = [
  { value: "pending", label: "Waiting for review" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
  { value: "lapsed", label: "Lapsed" },
];

const EMPTY: Record<VerificationStatus, string> = {
  pending: "Nobody is waiting to be verified.",
  verified: "No one is verified yet.",
  rejected: "No rejected requests.",
  lapsed: "No lapsed badges.",
};

/** Engineers' and companies' verification requests, oldest waiting first. */
export function VerificationsPage(): ReactElement {
  const [params, setParams] = useSearchParams();
  const status = TABS.find((tab) => tab.value === params.get("status"))?.value ?? "pending";
  const page = Number(params.get("page") ?? "1") || 1;
  const [data, setData] = useState<Paged<VerificationRow> | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let isActive = true;
    setData(null);
    setError("");
    adminApi<Paged<VerificationRow>>(`/verifications?status=${status}&page=${page}`)
      .then((body) => {
        if (isActive) setData(body);
      })
      .catch((caught: unknown) => {
        if (isActive) setError(caught instanceof Error ? caught.message : "Couldn't load verification requests.");
      });
    return () => {
      isActive = false;
    };
  }, [status, page]);

  const setTab = (value: VerificationStatus): void => setParams(value === "pending" ? {} : { status: value });

  return (
    <>
      <PageHeader
        title="Verification"
        intro="Engineers send their IEB membership number and certificate with their NID. Companies send their trade licence with the account holder's NID."
      />
      <div role="tablist" aria-label="Request status" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={status === tab.value}
            onClick={() => setTab(tab.value)}
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
      {data && data.items.length === 0 ? <p className={`${panel} p-6 text-sm text-white/60`}>{EMPTY[status]}</p> : null}
      {data && data.items.length > 0 ? (
        <ul className={`${panel} divide-y divide-white/5`}>
          {data.items.map((row) => (
            <li key={row.userId}>
              <Link
                to={`/verifications/${row.userId}`}
                className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-white/5"
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-white">{row.name}</span>
                  <span className="block text-xs text-white/50">
                    {ROLE_LABELS[row.role as keyof typeof ROLE_LABELS] ?? row.role} ·{" "}
                    {row.kind === "engineer" ? `IEB ${row.iebNumber ?? "—"}` : `Licence ${row.tradeLicenceNo ?? "—"}`}
                  </span>
                  {row.note && status !== "verified" ? (
                    <span className="mt-1 block text-xs text-amber-200/80">{row.note}</span>
                  ) : null}
                </span>
                <span className="text-right text-xs text-white/50">
                  {status === "pending" ? `Sent ${formatDate(row.submittedAt)}` : row.reviewedAt ? formatDate(row.reviewedAt) : ""}
                  {row.licenceExpiresAt ? <span className="block">Licence until {formatDate(row.licenceExpiresAt)}</span> : null}
                </span>
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
          onChange={(next) => setParams({ ...(status === "pending" ? {} : { status }), page: String(next) })}
        />
      ) : null}
    </>
  );
}

import { type ReactElement, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorNote, Loading, PageHeader, panel } from "../components/ui";
import { type Overview, adminApi } from "../lib/api";
import { formatTaka } from "../lib/format";

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }): ReactElement {
  return (
    <div className={`${panel} p-5`}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">{label}</p>
      <p className="mt-2 font-heading text-3xl font-bold text-white tabular-nums">{value}</p>
      {note ? <p className="mt-1 text-xs text-white/50">{note}</p> : null}
    </div>
  );
}

function Attention({
  count,
  label,
  to,
  note,
}: {
  count: number;
  label: string;
  to?: string;
  /** Replaces the "open the queue" hint when there's nothing to click through to. */
  note?: string;
}): ReactElement {
  const tone = count > 0 ? "border-primary/40 bg-primary/5" : "border-white/10";
  const body = (
    <>
      <p className="font-heading text-3xl font-bold text-white tabular-nums">{count}</p>
      <p className="mt-1 text-sm font-semibold text-white/80">{label}</p>
      <p className="mt-2 text-xs text-white/45">{note ?? (count > 0 ? "Open the queue →" : "Nothing waiting")}</p>
    </>
  );
  return to ? (
    <Link to={to} className={`rounded-2xl border p-5 transition-colors hover:border-primary ${tone}`}>
      {body}
    </Link>
  ) : (
    <div className={`rounded-2xl border p-5 ${tone}`}>{body}</div>
  );
}

export function OverviewPage(): ReactElement {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    adminApi<Overview>("/overview")
      .then(setData)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Couldn't load the overview."));
  }, []);

  return (
    <>
      <PageHeader title="Overview" intro="What needs a person's attention, and how CivilHub is doing." />
      <ErrorNote message={error} />
      {!data && !error ? <Loading /> : null}
      {data ? (
        <div className="grid gap-8">
          <section aria-labelledby="attention-heading">
            <h2 id="attention-heading" className="mb-3 font-heading text-xl font-bold text-white">
              Needs attention
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
              <Attention count={data.openReports} label="Reported posts, comments or people" to="/reports" />
              <Attention count={data.users.restricted} label="Suspended or banned accounts" to="/users?status=restricted" />
              <Attention
                count={data.money.payeesOwed}
                label={`Payees owed ${formatTaka(data.money.owedToPayees)}`}
                to="/payouts"
              />
              <Attention
                count={data.money.refundsDue}
                label={`Refunds to send, ${formatTaka(data.money.refundsDueAmount)}`}
                to="/refunds"
              />
              <Attention count={data.money.depositDisputes} label="Deposit claims disputed by renters" to="/deposits" />
              <Attention
                count={data.money.depositsPending}
                label="Rentals whose owner hasn't settled the deposit"
                note="Released to the renter automatically after 7 days"
              />
            </div>
          </section>

          <section aria-labelledby="platform-heading">
            <h2 id="platform-heading" className="mb-3 font-heading text-xl font-bold text-white">
              Platform
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Accounts"
                value={data.users.total}
                note={`${data.users.byRole.client} clients · ${data.users.byRole.engineer} engineers · ${data.users.byRole.organisation} companies`}
              />
              <Stat label="New this week" value={data.users.newThisWeek} />
              <Stat label="Projects" value={data.projects.active} note={`in progress · ${data.projects.openBriefs} open briefs`} />
              <Stat label="Rentals" value={data.activeBookings} note="approved or out on hire" />
              <Stat label="Paid through CivilHub" value={formatTaka(data.money.paymentVolume)} />
              <Stat label="Commission earned" value={formatTaka(data.money.commissionEarned)} />
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

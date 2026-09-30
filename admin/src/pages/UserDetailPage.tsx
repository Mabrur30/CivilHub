import { ArrowLeftIcon } from "@phosphor-icons/react";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ErrorNote,
  Loading,
  PageHeader,
  ReasonDialog,
  StatusBadge,
  dangerButton,
  panel,
  primaryButton,
  secondaryButton,
} from "../components/ui";
import { type AccountStatus, type UserDetail, adminApi } from "../lib/api";
import { ACTION_LABELS, REASON_LABELS, ROLE_LABELS, formatDate, formatDateTime } from "../lib/format";

const ACTIVITY_LABELS: Record<keyof UserDetail["activity"], string> = {
  posts: "Posts",
  comments: "Comments",
  projectsPosted: "Projects posted",
  projectsHired: "Projects hired for",
  bids: "Bids",
  listings: "Equipment listed",
  bookings: "Rentals",
};

const STATUS_CHANGES: Record<
  AccountStatus,
  { title: string; confirm: string; describe: (name: string) => string }
> = {
  suspended: {
    title: "Suspend this account?",
    confirm: "Suspend",
    describe: (name) =>
      `${name} can't sign in or use CivilHub until the suspension ends, and disappears from search, feeds and profiles. They see your reason when they try to sign in.`,
  },
  banned: {
    title: "Ban this account?",
    confirm: "Ban",
    describe: (name) => `${name} loses access until an admin reinstates them. They see your reason when they try to sign in.`,
  },
  active: {
    title: "Reinstate this account?",
    confirm: "Reinstate",
    describe: (name) => `${name} can sign in again straight away and gets a notification saying so.`,
  },
};

export function UserDetailPage(): ReactElement {
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string>("");
  const [change, setChange] = useState<AccountStatus | null>(null);

  const load = useCallback(() => {
    if (!userId) return;
    adminApi<UserDetail>(`/users/${userId}`)
      .then(setUser)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Couldn't load this account."));
  }, [userId]);

  useEffect(load, [load]);

  const applyChange = async (status: AccountStatus, input: { reason: string; days?: number }): Promise<void> => {
    await adminApi(`/users/${userId}/status`, { method: "POST", body: { status, ...input } });
    setChange(null);
    load();
  };

  return (
    <>
      <Link to="/users" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-white/60 hover:text-white">
        <ArrowLeftIcon aria-hidden="true" className="h-4 w-4" /> Accounts
      </Link>
      <ErrorNote message={error} />
      {!user && !error ? <Loading /> : null}
      {user ? (
        <>
          <PageHeader
            title={user.name}
            intro={`${ROLE_LABELS[user.role]} · ${user.email} · joined ${formatDate(user.createdAt)}`}
            action={
              <div className="flex flex-wrap gap-2">
                {user.status === "active" ? (
                  <>
                    <button type="button" className={secondaryButton} onClick={() => setChange("suspended")}>
                      Suspend
                    </button>
                    <button type="button" className={dangerButton} onClick={() => setChange("banned")}>
                      Ban
                    </button>
                  </>
                ) : (
                  <button type="button" className={primaryButton} onClick={() => setChange("active")}>
                    Reinstate
                  </button>
                )}
              </div>
            }
          />

          <section className={`${panel} mb-6 p-5`}>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={user.status} until={user.suspendedUntil} />
              {user.statusReason ? <p className="text-sm text-white/65">Reason: {user.statusReason}</p> : null}
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
              {(Object.keys(ACTIVITY_LABELS) as Array<keyof UserDetail["activity"]>).map((key) => (
                <div key={key}>
                  <dt className="text-xs text-white/45">{ACTIVITY_LABELS[key]}</dt>
                  <dd className="mt-1 font-heading text-2xl font-bold text-white tabular-nums">{user.activity[key]}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="reports-heading" className={`${panel} p-5`}>
              <h2 id="reports-heading" className="font-heading text-xl font-bold text-white">
                Reports about them or their content
              </h2>
              {user.reports.length === 0 ? (
                <p className="mt-3 text-sm text-white/50">None.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {user.reports.map((report) => (
                    <li key={report.id} className="border-b border-white/5 pb-3 text-sm last:border-0">
                      <p className="text-white/80">
                        <span className="font-semibold">{REASON_LABELS[report.reason] ?? report.reason}</span> on their{" "}
                        {report.targetType === "user" ? "account" : report.targetType} · {report.reporterName}
                      </p>
                      {report.note ? <p className="text-white/55">“{report.note}”</p> : null}
                      <p className="text-xs text-white/45">
                        {formatDateTime(report.createdAt)} · {report.status}
                        {report.resolution ? ` · ${report.resolution}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="history-heading" className={`${panel} p-5`}>
              <h2 id="history-heading" className="font-heading text-xl font-bold text-white">
                Admin history
              </h2>
              {user.actions.length === 0 ? (
                <p className="mt-3 text-sm text-white/50">No admin has acted on this account.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {user.actions.map((entry) => (
                    <li key={entry.id} className="border-b border-white/5 pb-3 text-sm last:border-0">
                      <p className="text-white/80">
                        <span className="font-semibold">{ACTION_LABELS[entry.action] ?? entry.action}</span> by {entry.adminName}
                      </p>
                      {entry.reason ? <p className="text-white/55">{entry.reason}</p> : null}
                      <p className="text-xs text-white/45">{formatDateTime(entry.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {change ? (
            <ReasonDialog
              title={STATUS_CHANGES[change].title}
              description={STATUS_CHANGES[change].describe(user.name)}
              confirmLabel={STATUS_CHANGES[change].confirm}
              danger={change !== "active"}
              askDays={change === "suspended"}
              onConfirm={(input) => applyChange(change, input)}
              onClose={() => setChange(null)}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

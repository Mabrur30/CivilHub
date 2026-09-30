import { type ReactElement, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ErrorNote,
  Loading,
  PageHeader,
  ReasonDialog,
  StatusBadge,
  dangerButton,
  panel,
  secondaryButton,
} from "../components/ui";
import { type ReportGroup, adminApi } from "../lib/api";
import { REASON_LABELS, ROLE_LABELS, formatDateTime } from "../lib/format";

type Decision = "dismiss" | "remove_content" | "suspend_user" | "ban_user";

const DECISIONS: Record<Decision, { title: string; confirm: string; danger: boolean; describe: (group: ReportGroup) => string }> = {
  dismiss: {
    title: "Dismiss these reports?",
    confirm: "Dismiss",
    danger: false,
    describe: () => "Nothing changes for the person reported. The reports close and the reason is logged.",
  },
  remove_content: {
    title: "Remove this content?",
    confirm: "Remove",
    danger: true,
    describe: (group) =>
      group.targetType === "post"
        ? "The post, its comments and its image are deleted. The author is told it broke the community rules."
        : "The comment's text is replaced with “[removed by CivilHub]” so replies still make sense. The author is told why.",
  },
  suspend_user: {
    title: "Suspend this account?",
    confirm: "Suspend",
    danger: true,
    describe: (group) =>
      `${group.target.user?.name ?? "They"} can't sign in or use CivilHub until the suspension ends, and disappear from search, feeds and profiles. They see your reason when they try to sign in.`,
  },
  ban_user: {
    title: "Ban this account?",
    confirm: "Ban",
    danger: true,
    describe: (group) =>
      `${group.target.user?.name ?? "They"} lose access for good, until an admin reinstates them. They see your reason when they try to sign in.`,
  },
};

function ReportCard({ group, onDecide }: { group: ReportGroup; onDecide: (decision: Decision) => void }): ReactElement {
  const { target } = group;
  const label = group.targetType === "user" ? "Account" : group.targetType === "post" ? "Post" : "Comment";
  const account = target.user;
  return (
    <article className={`${panel} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">
            {label} · reported {group.count} {group.count === 1 ? "time" : "times"}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {group.reasons.map((reason) => (
              <span key={reason} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {REASON_LABELS[reason] ?? reason}
              </span>
            ))}
          </div>
        </div>
        <p className="text-xs text-white/45">Latest {formatDateTime(group.latest)}</p>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-void/50 p-4">
        {!target.exists ? (
          <p className="text-sm text-white/50">This {label.toLowerCase()} has already been deleted.</p>
        ) : (
          <>
            {account ? (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <Link to={`/users/${account.id}`} className="font-semibold text-white underline decoration-white/25 underline-offset-4 hover:decoration-white">
                  {account.name}
                </Link>
                <span className="text-white/45">{ROLE_LABELS[account.role]}</span>
                <StatusBadge status={account.status} until={null} />
              </p>
            ) : null}
            {target.content ? (
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-white/80">{target.content}</p>
            ) : null}
            {target.imageUrl ? (
              <a href={target.imageUrl} target="_blank" rel="noreferrer">
                <img src={target.imageUrl} alt="Attached to the reported post" className="mt-3 max-h-56 rounded-lg object-cover" />
              </a>
            ) : null}
          </>
        )}
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-white/60 hover:text-white">What reporters said</summary>
        <ul className="mt-2 space-y-2">
          {group.reports.map((report, index) => (
            <li key={`${report.reporterName}-${index}`} className="text-white/70">
              <span className="font-semibold text-white/85">{report.reporterName}</span> ·{" "}
              {REASON_LABELS[report.reason] ?? report.reason} · {formatDateTime(report.createdAt)}
              {report.note ? <span className="block text-white/55">“{report.note}”</span> : null}
            </li>
          ))}
        </ul>
      </details>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={secondaryButton} onClick={() => onDecide("dismiss")}>
          Dismiss
        </button>
        {target.exists && group.targetType !== "user" ? (
          <button type="button" className={dangerButton} onClick={() => onDecide("remove_content")}>
            Remove {label.toLowerCase()}
          </button>
        ) : null}
        {account && account.status !== "banned" ? (
          <>
            <button type="button" className={secondaryButton} onClick={() => onDecide("suspend_user")}>
              Suspend account
            </button>
            <button type="button" className={secondaryButton} onClick={() => onDecide("ban_user")}>
              Ban account
            </button>
          </>
        ) : null}
      </div>
    </article>
  );
}

export function ReportsPage(): ReactElement {
  const [groups, setGroups] = useState<ReportGroup[] | null>(null);
  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");
  const [pending, setPending] = useState<{ group: ReportGroup; decision: Decision } | null>(null);

  const load = useCallback(() => {
    adminApi<{ items: ReportGroup[] }>("/reports")
      .then((body) => setGroups(body.items))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Couldn't load reports."));
  }, []);

  useEffect(load, [load]);

  const decide = async (group: ReportGroup, decision: Decision, input: { reason: string; days?: number }): Promise<void> => {
    const base = `/reports/${group.targetType}/${group.targetId}`;
    const result =
      decision === "dismiss"
        ? await adminApi<{ closed: number }>(`${base}/dismiss`, { method: "POST", body: { reason: input.reason } })
        : await adminApi<{ closed: number; resolution: string }>(`${base}/action`, {
            method: "POST",
            body: { action: decision, reason: input.reason, days: input.days },
          });
    setPending(null);
    setNotice(`Done. ${result.closed} ${result.closed === 1 ? "report" : "reports"} closed.`);
    load();
  };

  return (
    <>
      <PageHeader
        title="Reports"
        intro="Everything people have flagged, most-reported first. Each card is one post, comment or account."
      />
      <ErrorNote message={error} />
      {notice ? (
        <p role="status" className="mb-4 rounded-xl border border-emerald-300/30 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </p>
      ) : null}
      {!groups && !error ? <Loading /> : null}
      {groups && groups.length === 0 ? (
        <div className={`${panel} p-10 text-center text-sm text-white/55`}>No open reports. Nice.</div>
      ) : null}
      <div className="grid gap-4">
        {groups?.map((group) => (
          <ReportCard
            key={`${group.targetType}-${group.targetId}`}
            group={group}
            onDecide={(decision) => {
              setNotice("");
              setPending({ group, decision });
            }}
          />
        ))}
      </div>

      {pending ? (
        <ReasonDialog
          title={DECISIONS[pending.decision].title}
          description={DECISIONS[pending.decision].describe(pending.group)}
          confirmLabel={DECISIONS[pending.decision].confirm}
          danger={DECISIONS[pending.decision].danger}
          askDays={pending.decision === "suspend_user"}
          onConfirm={(input) => decide(pending.group, pending.decision, input)}
          onClose={() => setPending(null)}
        />
      ) : null}
    </>
  );
}

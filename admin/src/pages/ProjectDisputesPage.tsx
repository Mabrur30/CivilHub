import { type ReactElement, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorNote, Loading, PageHeader, Pager, panel } from "../components/ui";
import { type Paged, type ProjectDisputeRow, adminApi } from "../lib/api";
import { OUTCOME_LABELS, formatDate } from "../lib/format";

const TABS = [
  { value: "open", label: "Open" },
  { value: "appealed", label: "Appeals" },
  { value: "resolved", label: "Resolved" },
  { value: "withdrawn", label: "Withdrawn" },
] as const;
type Tab = (typeof TABS)[number]["value"];

/** Projects paused because a client or provider asked CivilHub to step in. */
export function ProjectDisputesPage(): ReactElement {
  const [params, setParams] = useSearchParams();
  const status: Tab = TABS.find((tab) => tab.value === params.get("status"))?.value ?? "open";
  const page = Number(params.get("page") ?? "1") || 1;
  const [data, setData] = useState<Paged<ProjectDisputeRow> | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let isActive = true;
    setData(null);
    setError("");
    adminApi<Paged<ProjectDisputeRow>>(`/project-disputes?status=${status}&page=${page}`)
      .then((body) => {
        if (isActive) setData(body);
      })
      .catch((caught: unknown) => {
        if (isActive) setError(caught instanceof Error ? caught.message : "Couldn't load project disputes.");
      });
    return () => {
      isActive = false;
    };
  }, [status, page]);

  return (
    <>
      <PageHeader
        title="Project disputes"
        intro="While a dispute is open the project is paused: nobody can approve, pay for or change phases. Resume it, approve a waiting phase for the client, or cancel it and split the money CivilHub holds."
      />
      <div role="tablist" aria-label="Dispute status" className="mb-4 flex flex-wrap gap-2">
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
          {status === "open" ? "No projects are waiting on CivilHub." : "Nothing here yet."}
        </p>
      ) : null}
      {data && data.items.length > 0 ? (
        <ul className="grid gap-3">
          {data.items.map((row) => (
            <li key={row.id}>
              <Link to={`/project-disputes/${row.id}`} className={`${panel} block p-5 transition-colors hover:border-primary`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-white">
                    {row.projectTitle}
                    {row.newReply ? <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">New reply</span> : null}
                  </p>
                  <p className="text-xs text-white/50">
                    {row.resolution
                      ? `${OUTCOME_LABELS[row.resolution.outcome]} ${formatDate(row.resolution.decidedAt)}`
                      : row.stage === "appealed" && row.appeal
                        ? `Appealed by the ${row.appeal.role} ${formatDate(row.appeal.openedAt)}`
                        : row.stage === "awaiting_final" && row.decision
                          ? `Decided; takes effect ${formatDate(row.decision.appealDeadline)}`
                          : `Opened ${formatDate(row.openedAt)}`}
                  </p>
                </div>
                <p className="mt-1 text-sm text-white/65">
                  {row.openedByRole === "client" ? row.client?.name ?? "The client" : row.provider?.name ?? "The provider"} (
                  {row.openedByRole}): {row.reasonLabel.toLowerCase()}
                </p>
                <p className="mt-2 line-clamp-2 text-sm text-white/50">“{row.description}”</p>
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
          onChange={(next) => setParams({ ...(status === "open" ? {} : { status }), page: String(next) })}
        />
      ) : null}
    </>
  );
}

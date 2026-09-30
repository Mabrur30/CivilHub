import { type ReactElement, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorNote, Loading, PageHeader, Pager, panel } from "../components/ui";
import { type ActionEntry, type Paged, adminApi } from "../lib/api";
import { ACTION_LABELS, formatDateTime } from "../lib/format";

/** Every admin action, newest first. Nothing here can be edited or deleted. */
export function ActionLogPage(): ReactElement {
  const [page, setPage] = useState<number>(1);
  const [data, setData] = useState<Paged<ActionEntry> | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let isActive = true;
    adminApi<Paged<ActionEntry>>(`/actions?page=${page}`)
      .then((body) => {
        if (isActive) setData(body);
      })
      .catch((caught: unknown) => {
        if (isActive) setError(caught instanceof Error ? caught.message : "Couldn't load the log.");
      });
    return () => {
      isActive = false;
    };
  }, [page]);

  return (
    <>
      <PageHeader title="Action log" intro="Who did what, when and why. Entries can't be changed or removed." />
      <ErrorNote message={error} />
      {!data && !error ? <Loading /> : null}
      {data ? (
        <div className={`${panel} divide-y divide-white/5`}>
          {data.items.length === 0 ? <p className="p-8 text-center text-sm text-white/50">Nothing yet.</p> : null}
          {data.items.map((entry) => (
            <div key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-sm">
              <div className="min-w-0">
                <p className="text-white/85">
                  <span className="font-semibold">{entry.adminName}</span>{" "}
                  {(ACTION_LABELS[entry.action] ?? entry.action).toLowerCase()}
                  {entry.subject ? (
                    <>
                      {" · "}
                      <Link to={`/users/${entry.subject.id}`} className="underline decoration-white/25 underline-offset-4 hover:decoration-white">
                        {entry.subject.name}
                      </Link>
                    </>
                  ) : null}
                </p>
                {entry.reason ? <p className="text-white/55">{entry.reason}</p> : null}
              </div>
              <time dateTime={entry.createdAt} className="shrink-0 text-xs text-white/45">
                {formatDateTime(entry.createdAt)}
              </time>
            </div>
          ))}
        </div>
      ) : null}
      {data ? <Pager page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} /> : null}
    </>
  );
}

import { type ReactElement, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorNote, Loading, PageHeader, Pager, StatusBadge, panel } from "../components/ui";
import { type Paged, type UserRow, adminApi } from "../lib/api";
import { ROLE_LABELS, formatDate } from "../lib/format";

const ROLE_OPTIONS = [
  { value: "", label: "Every role" },
  { value: "client", label: "Clients" },
  { value: "engineer", label: "Engineers" },
  { value: "organisation", label: "Companies" },
];

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "active", label: "Active" },
  { value: "restricted", label: "Suspended or banned" },
  { value: "suspended", label: "Suspended" },
  { value: "banned", label: "Banned" },
];

export function UsersPage(): ReactElement {
  // Filters live in the URL, so the overview can link straight to a view.
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const role = params.get("role") ?? "";
  const status = params.get("status") ?? "";
  const page = Number(params.get("page") ?? "1") || 1;

  const [draft, setDraft] = useState<string>(q);
  const [data, setData] = useState<Paged<UserRow> | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let isActive = true;
    const query = new URLSearchParams({ q, role, status, page: String(page) });
    setError("");
    adminApi<Paged<UserRow>>(`/users?${query.toString()}`)
      .then((body) => {
        if (isActive) setData(body);
      })
      .catch((caught: unknown) => {
        if (isActive) setError(caught instanceof Error ? caught.message : "Couldn't load accounts.");
      });
    return () => {
      isActive = false;
    };
  }, [q, role, status, page]);

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
      <PageHeader title="Accounts" intro="Find anyone on CivilHub by name or email." />

      <form
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          update({ q: draft.trim() });
        }}
      >
        <label className="sr-only" htmlFor="user-search">
          Search accounts
        </label>
        <input
          id="user-search"
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Name or email"
          className="form-input max-w-xs"
        />
        <label className="sr-only" htmlFor="role-filter">
          Role
        </label>
        <select id="role-filter" value={role} onChange={(event) => update({ role: event.target.value })} className="form-input w-auto">
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="status-filter">
          Status
        </label>
        <select id="status-filter" value={status} onChange={(event) => update({ status: event.target.value })} className="form-input w-auto">
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </form>

      <ErrorNote message={error} />
      {!data && !error ? <Loading /> : null}
      {data ? (
        <div className={`${panel} overflow-x-auto`}>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-[0.1em] text-white/45">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Name</th>
                <th scope="col" className="px-4 py-3 font-semibold">Role</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 font-semibold">Open reports</th>
                <th scope="col" className="px-4 py-3 font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-white/50">
                    No accounts match.
                  </td>
                </tr>
              ) : (
                data.items.map((user) => (
                  <tr key={user.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <Link to={`/users/${user.id}`} className="font-semibold text-white hover:text-primary">
                        {user.name}
                      </Link>
                      <span className="block text-xs text-white/45">{user.email}</span>
                    </td>
                    <td className="px-4 py-3 text-white/70">{ROLE_LABELS[user.role]}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={user.status} until={user.suspendedUntil} />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-white/70">{user.openReports || "–"}</td>
                    <td className="px-4 py-3 text-white/60">{formatDate(user.createdAt)}</td>
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

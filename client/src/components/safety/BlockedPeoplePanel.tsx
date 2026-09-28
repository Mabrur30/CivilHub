import { type ReactElement, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../Avatar";
import { panelClassName, rowButtonClassName } from "../dashboard/ui/buttonStyles";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

interface BlockedPerson {
  userId: string;
  name: string;
  role: string;
  profilePhotoUrl: string | null;
  blockedAt: string;
}

const isBlockedPerson = (value: unknown): value is BlockedPerson =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as BlockedPerson).userId === "string" &&
  typeof (value as BlockedPerson).name === "string";

/** Account settings: everyone you've blocked, with Unblock. */
export function BlockedPeoplePanel(): ReactElement {
  const [people, setPeople] = useState<BlockedPerson[] | null>(null);
  const [error, setError] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE_URL}/api/blocks`, { credentials: "include" })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!active) return;
        if (!response.ok || !Array.isArray(body)) {
          setError("Unable to load the people you've blocked.");
          setPeople([]);
          return;
        }
        setPeople(body.filter(isBlockedPerson));
      })
      .catch(() => {
        if (!active) return;
        setError("Unable to connect to CivilHub. Please try again.");
        setPeople([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const unblock = async (person: BlockedPerson): Promise<void> => {
    setBusyId(person.userId);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/blocks/${person.userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        setError(`Unable to unblock ${person.name}.`);
        return;
      }
      setPeople((current) => (current ?? []).filter((item) => item.userId !== person.userId));
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className={`${panelClassName} p-6 sm:p-8`} aria-labelledby="settings-blocked">
      <h2 id="settings-blocked" className="font-heading text-2xl font-bold text-white">
        Blocked people
      </h2>
      <p className="mt-1 text-sm text-white/55">
        People you've blocked can't send you connection requests, messages or
        comments, and you can't send them any either.
      </p>
      {people === null ? (
        <p className="mt-5 text-sm text-white/50">Loading…</p>
      ) : people.length === 0 ? (
        <p className="mt-5 text-sm text-white/50">You haven't blocked anyone.</p>
      ) : (
        <ul className="mt-5 divide-y divide-white/10">
          {people.map((person) => (
            <li key={person.userId} className="flex items-center justify-between gap-3 py-3">
              <Link to={`/profile/${person.userId}`} className="flex min-w-0 items-center gap-3">
                <Avatar name={person.name} photoUrl={person.profilePhotoUrl} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white">{person.name}</span>
                  <span className="block text-xs capitalize text-white/45">{person.role}</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => void unblock(person)}
                disabled={busyId === person.userId}
                className={rowButtonClassName}
              >
                {busyId === person.userId ? "Unblocking…" : "Unblock"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-rose-300">
          {error}
        </p>
      ) : null}
    </section>
  );
}

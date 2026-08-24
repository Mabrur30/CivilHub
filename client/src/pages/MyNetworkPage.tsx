import { type ReactElement, useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface NetworkUser {
  id: string;
  userId: string;
  name: string;
  role: "client" | "engineer";
  status: "pending";
  profilePhotoUrl: string | null;
}

interface ConnectionUser {
  userId: string;
  name: string;
  role: "client" | "engineer";
  profilePhotoUrl: string | null;
}

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const isRole = (value: unknown): value is "client" | "engineer" =>
  value === "client" || value === "engineer";

const isNetworkUser = (value: unknown): value is NetworkUser => {
  if (typeof value !== "object" || value === null) return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user.id === "string" &&
    typeof user.userId === "string" &&
    typeof user.name === "string" &&
    isRole(user.role) &&
    user.status === "pending" &&
    (typeof user.profilePhotoUrl === "string" || user.profilePhotoUrl === null)
  );
};

const isConnectionUser = (value: unknown): value is ConnectionUser => {
  if (typeof value !== "object" || value === null) return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user.userId === "string" &&
    typeof user.name === "string" &&
    isRole(user.role) &&
    (typeof user.profilePhotoUrl === "string" || user.profilePhotoUrl === null)
  );
};

const getErrorMessage = (value: unknown, fallback: string): string => {
  if (typeof value === "object" && value !== null) {
    const body = value as ErrorResponse;
    if (typeof body.message === "string") return body.message;
  }
  return fallback;
};

const ProfileThumb = ({
  name,
  profilePhotoUrl,
}: {
  name: string;
  profilePhotoUrl: string | null;
}): ReactElement => {
  if (profilePhotoUrl) {
    return (
      <img
        src={profilePhotoUrl}
        alt={`${name} profile`}
        className="h-10 w-10 rounded-full border border-white/15 object-cover"
      />
    );
  }

  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-sm font-bold text-primary">
      {name.charAt(0).toUpperCase()}
    </span>
  );
};

export function MyNetworkPage(): ReactElement {
  const [incoming, setIncoming] = useState<NetworkUser[]>([]);
  const [sent, setSent] = useState<NetworkUser[]>([]);
  const [connections, setConnections] = useState<ConnectionUser[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [actionError, setActionError] = useState<string>("");
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(
    null,
  );
  const [reloadKey, setReloadKey] = useState<number>(0);

  useEffect(() => {
    const loadNetwork = async (): Promise<void> => {
      setIsLoading(true);
      setError("");
      setActionError("");

      try {
        const [incomingResponse, sentResponse, connectionsResponse] =
          await Promise.all([
            fetch(`${API_BASE_URL}/api/network/incoming`, {
              credentials: "include",
            }),
            fetch(`${API_BASE_URL}/api/network/sent`, {
              credentials: "include",
            }),
            fetch(`${API_BASE_URL}/api/network/connections`, {
              credentials: "include",
            }),
          ]);

        const [incomingBody, sentBody, connectionsBody]: [
          unknown,
          unknown,
          unknown,
        ] = await Promise.all([
          incomingResponse.json(),
          sentResponse.json(),
          connectionsResponse.json(),
        ]);

        if (
          !incomingResponse.ok ||
          !Array.isArray(incomingBody) ||
          !incomingBody.every(isNetworkUser)
        ) {
          setError(
            getErrorMessage(incomingBody, "Unable to load incoming requests."),
          );
          return;
        }

        if (
          !sentResponse.ok ||
          !Array.isArray(sentBody) ||
          !sentBody.every(isNetworkUser)
        ) {
          setError(getErrorMessage(sentBody, "Unable to load sent requests."));
          return;
        }

        if (
          !connectionsResponse.ok ||
          !Array.isArray(connectionsBody) ||
          !connectionsBody.every(isConnectionUser)
        ) {
          setError(
            getErrorMessage(
              connectionsBody,
              "Unable to load your connections.",
            ),
          );
          return;
        }

        setIncoming(incomingBody);
        setSent(sentBody);
        setConnections(connectionsBody);
      } catch {
        setError("Unable to connect to CivilHub. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadNetwork();
  }, [reloadKey]);

  const refresh = (): void => setReloadKey((key) => key + 1);

  const respond = async (
    connectionId: string,
    decision: "accept" | "decline",
  ): Promise<void> => {
    setActiveConnectionId(connectionId);
    setActionError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/network/${connectionId}/${decision}`,
        {
          method: "PATCH",
          credentials: "include",
        },
      );
      const body: unknown = await response.json();

      if (!response.ok) {
        setActionError(getErrorMessage(body, "Unable to update this request."));
        return;
      }

      refresh();
    } catch {
      setActionError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setActiveConnectionId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
          Relationships
        </p>
        <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
          My Network
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Manage connection requests and collaborate only with accepted
          contacts.
        </p>
      </div>

      {isLoading ? (
        <section className="space-y-4" aria-label="Loading network">
          <div className="animate-pulse rounded-2xl border border-white/10 bg-surface p-6">
            <div className="h-6 w-1/3 rounded bg-white/10" />
            <div className="mt-4 h-12 rounded bg-white/10" />
          </div>
          <div className="animate-pulse rounded-2xl border border-white/10 bg-surface p-6">
            <div className="h-6 w-1/3 rounded bg-white/10" />
            <div className="mt-4 h-12 rounded bg-white/10" />
          </div>
        </section>
      ) : error ? (
        <section
          className="rounded-2xl border border-red-400/20 bg-red-400/5 p-8 text-center"
          role="alert"
        >
          <p className="text-sm text-red-200">{error}</p>
          <button
            type="button"
            onClick={() => refresh()}
            className="mt-5 rounded-full border border-primary px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary hover:text-white"
          >
            Try again
          </button>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-white/10 bg-surface p-6">
            <h2 className="font-heading text-2xl font-bold text-white">
              Incoming Requests
            </h2>
            {incoming.length === 0 ? (
              <p className="mt-3 text-sm text-white/55">
                No incoming requests right now.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {incoming.map((request) => {
                  const isActing = activeConnectionId === request.id;
                  return (
                    <article
                      key={request.id}
                      className="rounded-xl border border-white/10 bg-void/40 p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <ProfileThumb
                            name={request.name}
                            profilePhotoUrl={request.profilePhotoUrl}
                          />
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {request.name}
                            </p>
                            <p className="text-xs capitalize text-white/50">
                              {request.role}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/users/${request.userId}`}
                            className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/70 hover:border-primary hover:text-white"
                          >
                            View profile
                          </Link>
                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() => void respond(request.id, "accept")}
                            className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-glow disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isActing ? "Updating..." : "Accept"}
                          </button>
                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() => void respond(request.id, "decline")}
                            className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/70 hover:border-red-300 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isActing ? "Updating..." : "Decline"}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-surface p-6">
            <h2 className="font-heading text-2xl font-bold text-white">
              Sent Requests
            </h2>
            {sent.length === 0 ? (
              <p className="mt-3 text-sm text-white/55">
                No pending sent requests.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {sent.map((request) => (
                  <article
                    key={request.id}
                    className="rounded-xl border border-white/10 bg-void/40 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <ProfileThumb
                          name={request.name}
                          profilePhotoUrl={request.profilePhotoUrl}
                        />
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {request.name}
                          </p>
                          <p className="text-xs capitalize text-white/50">
                            {request.role}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/users/${request.userId}`}
                          className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/70 hover:border-primary hover:text-white"
                        >
                          View profile
                        </Link>
                        <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-200">
                          Pending
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-surface p-6">
            <h2 className="font-heading text-2xl font-bold text-white">
              Connections
            </h2>
            {connections.length === 0 ? (
              <p className="mt-3 text-sm text-white/55">
                No accepted connections yet.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {connections.map((connection) => (
                  <article
                    key={connection.userId}
                    className="rounded-xl border border-white/10 bg-void/40 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <ProfileThumb
                          name={connection.name}
                          profilePhotoUrl={connection.profilePhotoUrl}
                        />
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {connection.name}
                          </p>
                          <p className="text-xs capitalize text-white/50">
                            {connection.role}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/users/${connection.userId}`}
                          className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/70 hover:border-primary hover:text-white"
                        >
                          View profile
                        </Link>
                        <Link
                          to={`/messages/${connection.userId}`}
                          className="rounded-full border border-emerald-300/40 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-300/20"
                        >
                          Message
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {actionError ? (
            <p className="text-xs text-red-300" role="alert">
              {actionError}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

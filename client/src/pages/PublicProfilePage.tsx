import { type ReactElement, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { useAuth } from "../context/AuthContext";

interface EngineerPortfolioItem {
  title: string;
  description: string;
  imageUrl: string;
  uploadedAt: string;
}

interface EngineerCertificateItem {
  title: string;
  uploadedAt: string;
}

type ConnectionStatus =
  | "not_connected"
  | "pending_sent"
  | "pending_received"
  | "connected";

interface BasePublicProfile {
  userId: string;
  name: string;
  role: "client" | "engineer";
  profilePhotoUrl: string | null;
  bio: string;
  connectionStatus: ConnectionStatus;
  connectionId: string | null;
}

interface EngineerPublicProfile extends BasePublicProfile {
  role: "engineer";
  portfolio: EngineerPortfolioItem[];
  certificates: EngineerCertificateItem[];
}

interface ClientPublicProfile extends BasePublicProfile {
  role: "client";
  companyName: string;
  completedProjects: number;
}

type PublicProfile = EngineerPublicProfile | ClientPublicProfile;

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const isConnectionStatus = (value: unknown): value is ConnectionStatus =>
  value === "not_connected" ||
  value === "pending_sent" ||
  value === "pending_received" ||
  value === "connected";

const isBaseProfile = (value: unknown): value is BasePublicProfile => {
  if (typeof value !== "object" || value === null) return false;
  const profile = value as Record<string, unknown>;
  return (
    typeof profile.userId === "string" &&
    typeof profile.name === "string" &&
    (profile.role === "client" || profile.role === "engineer") &&
    (typeof profile.profilePhotoUrl === "string" ||
      profile.profilePhotoUrl === null) &&
    typeof profile.bio === "string" &&
    isConnectionStatus(profile.connectionStatus) &&
    (typeof profile.connectionId === "string" || profile.connectionId === null)
  );
};

const isEngineerPortfolioItem = (
  value: unknown,
): value is EngineerPortfolioItem => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.title === "string" &&
    typeof item.description === "string" &&
    typeof item.imageUrl === "string" &&
    typeof item.uploadedAt === "string"
  );
};

const isEngineerCertificateItem = (
  value: unknown,
): value is EngineerCertificateItem => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.title === "string" && typeof item.uploadedAt === "string";
};

const isPublicProfile = (value: unknown): value is PublicProfile => {
  if (!isBaseProfile(value)) return false;
  const profile = value as Record<string, unknown>;

  if (profile.role === "engineer") {
    return (
      Array.isArray(profile.portfolio) &&
      profile.portfolio.every(isEngineerPortfolioItem) &&
      Array.isArray(profile.certificates) &&
      profile.certificates.every(isEngineerCertificateItem)
    );
  }

  return (
    typeof profile.companyName === "string" &&
    typeof profile.completedProjects === "number"
  );
};

const getErrorMessage = (value: unknown): string => {
  if (typeof value === "object" && value !== null) {
    const body = value as ErrorResponse;
    if (typeof body.message === "string") return body.message;
  }
  return "Unable to load this profile.";
};

const formatDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};

const statusLabel = (status: ConnectionStatus): string => {
  if (status === "connected") return "Connected";
  if (status === "pending_sent") return "Request sent";
  if (status === "pending_received") return "Request received";
  return "Not connected";
};

export function PublicProfilePage(): ReactElement {
  const { userId } = useParams<{ userId: string }>();
  const { currentUser } = useAuth();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [actionError, setActionError] = useState<string>("");
  const [isActioning, setIsActioning] = useState<boolean>(false);
  const [reloadKey, setReloadKey] = useState<number>(0);

  useEffect(() => {
    const loadProfile = async (): Promise<void> => {
      if (!userId) {
        setError("User ID is required.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError("");
      setActionError("");

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/users/${userId}/public-profile`,
          {
            credentials: "include",
          },
        );
        const body: unknown = await response.json();

        if (!response.ok || !isPublicProfile(body)) {
          setError(getErrorMessage(body));
          return;
        }

        setProfile(body);
      } catch {
        setError("Unable to connect to CivilHub. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadProfile();
  }, [reloadKey, userId]);

  const refreshProfile = (): void => {
    setReloadKey((key) => key + 1);
  };

  const sendRequest = async (): Promise<void> => {
    if (!profile) return;

    setIsActioning(true);
    setActionError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/network/${profile.userId}/request`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      const body: unknown = await response.json();

      if (!response.ok) {
        setActionError(getErrorMessage(body));
        return;
      }

      refreshProfile();
    } catch {
      setActionError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsActioning(false);
    }
  };

  const respondRequest = async (
    decision: "accept" | "decline",
  ): Promise<void> => {
    if (!profile?.connectionId) {
      setActionError("This request could not be found. Please refresh.");
      return;
    }

    setIsActioning(true);
    setActionError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/network/${profile.connectionId}/${decision}`,
        {
          method: "PATCH",
          credentials: "include",
        },
      );
      const body: unknown = await response.json();

      if (!response.ok) {
        setActionError(getErrorMessage(body));
        return;
      }

      refreshProfile();
    } catch {
      setActionError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsActioning(false);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-void px-4 py-12 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl animate-pulse rounded-2xl border border-white/10 bg-surface p-8">
          <div className="h-6 w-1/3 rounded bg-white/10" />
          <div className="mt-4 h-4 w-1/4 rounded bg-white/10" />
          <div className="mt-8 h-40 rounded bg-white/10" />
        </div>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="min-h-screen bg-void px-4 py-12 text-white sm:px-6 lg:px-8">
        <section className="mx-auto max-w-3xl rounded-2xl border border-red-400/20 bg-red-400/5 p-8 text-center">
          <p className="text-sm text-red-200">
            {error || "Profile not found."}
          </p>
          <button
            type="button"
            onClick={() => refreshProfile()}
            className="mt-5 rounded-full border border-primary px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary hover:text-white"
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  const isSelf = currentUser?.id === profile.userId;

  return (
    <main className="min-h-screen bg-void px-4 py-12 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="rounded-2xl border border-white/10 bg-surface p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar
                name={profile.name}
                photoUrl={profile.profilePhotoUrl}
                size="md"
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  {profile.role}
                </p>
                <h1 className="mt-1 font-heading text-3xl font-bold text-white">
                  {profile.name}
                </h1>
                <p className="mt-2 text-sm font-semibold text-white/60">
                  {statusLabel(profile.connectionStatus)}
                </p>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
                  {profile.bio.trim() || "This user has not added a bio yet."}
                </p>
              </div>
            </div>

            {isSelf ? (
              <Link
                to={
                  currentUser?.role === "engineer"
                    ? "/dashboard/engineer/profile"
                    : "/dashboard/client/profile"
                }
                className="inline-flex w-fit items-center rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/70 hover:border-primary hover:text-white"
              >
                Edit my profile
              </Link>
            ) : (
              <div className="flex flex-wrap gap-3">
                {profile.connectionStatus === "not_connected" ? (
                  <button
                    type="button"
                    onClick={() => void sendRequest()}
                    disabled={isActioning}
                    className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-glow disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isActioning ? "Sending..." : "Connect"}
                  </button>
                ) : null}

                {profile.connectionStatus === "pending_received" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void respondRequest("accept")}
                      disabled={isActioning}
                      className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-glow disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isActioning ? "Updating..." : "Accept"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void respondRequest("decline")}
                      disabled={isActioning}
                      className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 hover:border-red-300 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isActioning ? "Updating..." : "Decline"}
                    </button>
                  </>
                ) : null}

                {profile.connectionStatus === "pending_sent" ? (
                  <span className="inline-flex items-center rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-xs font-semibold text-amber-200">
                    Request sent
                  </span>
                ) : null}

                {profile.connectionStatus === "connected" ? (
                  <Link
                    to={`/messages/${profile.userId}`}
                    className="inline-flex items-center rounded-full border border-emerald-300/40 bg-emerald-300/10 px-4 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-300/20"
                  >
                    Message
                  </Link>
                ) : null}
              </div>
            )}
          </div>

          {actionError ? (
            <p className="mt-4 text-xs text-red-300" role="alert">
              {actionError}
            </p>
          ) : null}
        </section>

        {profile.role === "engineer" ? (
          <section className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-2xl border border-white/10 bg-surface p-6">
              <h2 className="font-heading text-2xl font-bold text-white">
                Portfolio
              </h2>
              {profile.portfolio.length === 0 ? (
                <p className="mt-4 text-sm text-white/55">
                  No portfolio items yet.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {profile.portfolio.map((item, index) => (
                    <div
                      key={`${item.title}-${index}`}
                      className="rounded-xl border border-white/10 bg-void/40 p-4"
                    >
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="h-36 w-full rounded-lg object-cover"
                      />
                      <h3 className="mt-3 text-sm font-semibold text-white">
                        {item.title}
                      </h3>
                      <p className="mt-2 text-xs leading-5 text-white/60">
                        {item.description}
                      </p>
                      <p className="mt-2 text-[11px] text-white/40">
                        Added {formatDate(item.uploadedAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="rounded-2xl border border-white/10 bg-surface p-6">
              <h2 className="font-heading text-2xl font-bold text-white">
                Certificates
              </h2>
              {profile.certificates.length === 0 ? (
                <p className="mt-4 text-sm text-white/55">
                  No certificates uploaded yet.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {profile.certificates.map((certificate, index) => (
                    <li
                      key={`${certificate.title}-${index}`}
                      className="rounded-xl border border-white/10 bg-void/40 p-4"
                    >
                      <p className="text-sm font-semibold text-white">
                        {certificate.title}
                      </p>
                      <p className="mt-1 text-xs text-white/50">
                        Uploaded {formatDate(certificate.uploadedAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        ) : (
          <section className="rounded-2xl border border-white/10 bg-surface p-6">
            <h2 className="font-heading text-2xl font-bold text-white">
              Client Summary
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-void/40 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-white/40">
                  Company
                </p>
                <p className="mt-2 text-sm font-semibold text-white/85">
                  {profile.companyName || "Not specified"}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-void/40 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-white/40">
                  Completed projects
                </p>
                <p className="mt-2 text-sm font-semibold text-white/85">
                  {profile.completedProjects}
                </p>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

import { type ReactElement, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

interface StatusResponse {
  status: "not_connected" | "pending_sent" | "pending_received" | "connected";
  connectionId: string | null;
}

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const isStatusResponse = (value: unknown): value is StatusResponse => {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    (body.status === "not_connected" ||
      body.status === "pending_sent" ||
      body.status === "pending_received" ||
      body.status === "connected") &&
    (typeof body.connectionId === "string" || body.connectionId === null)
  );
};

const getErrorMessage = (value: unknown): string => {
  if (typeof value === "object" && value !== null) {
    const body = value as ErrorResponse;
    if (typeof body.message === "string") return body.message;
  }
  return "Unable to validate your connection status.";
};

export function MessagesPlaceholderPage(): ReactElement {
  const { userId } = useParams<{ userId: string }>();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const loadStatus = async (): Promise<void> => {
      if (!userId) {
        setError("User ID is required.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/network/status/${userId}`,
          {
            credentials: "include",
          },
        );
        const body: unknown = await response.json();

        if (!response.ok || !isStatusResponse(body)) {
          setError(getErrorMessage(body));
          return;
        }

        setStatus(body);
      } catch {
        setError("Unable to connect to CivilHub. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadStatus();
  }, [userId]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-void px-4 py-12 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl animate-pulse rounded-2xl border border-white/10 bg-surface p-8">
          <div className="h-6 w-1/3 rounded bg-white/10" />
          <div className="mt-4 h-12 rounded bg-white/10" />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-void px-4 py-12 text-white sm:px-6 lg:px-8">
        <section className="mx-auto max-w-3xl rounded-2xl border border-red-400/20 bg-red-400/5 p-8 text-center">
          <p className="text-sm text-red-200">{error}</p>
        </section>
      </main>
    );
  }

  const isConnected = status?.status === "connected";

  return (
    <main className="min-h-screen bg-void px-4 py-12 text-white sm:px-6 lg:px-8">
      <section className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-surface p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
          Messaging
        </p>
        <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Messages
        </h1>
        {isConnected ? (
          <>
            <p className="mt-4 text-sm text-white/70">
              You are connected. Full messaging UI is the next implementation
              slice.
            </p>
            <p className="mt-3 text-xs text-white/50">
              Connection verified. This placeholder confirms gating is enforced
              before messaging access.
            </p>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm text-white/70">
              Messaging is only available between accepted connections.
            </p>
            <Link
              to={userId ? `/users/${userId}` : "/"}
              className="mt-6 inline-flex rounded-full border border-primary px-5 py-2.5 text-xs font-semibold text-primary hover:bg-primary hover:text-white"
            >
              Back to profile
            </Link>
          </>
        )}
      </section>
    </main>
  );
}

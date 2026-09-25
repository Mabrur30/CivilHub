import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import {
  type ClientOverview,
  getErrorMessage,
  parseClientOverview,
} from "./clientData";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

interface ClientWorkspaceValue {
  overview: ClientOverview | null;
  isLoading: boolean;
  error: string;
  /** Re-reads the overview after the client decides something. */
  refresh: () => Promise<void>;
}

const ClientWorkspaceContext = createContext<ClientWorkspaceValue | null>(null);

// The overview feeds both the Overview page and the counts on the tabs,
// so it is loaded once for the whole client workspace instead of per page.
export function ClientWorkspaceProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const [overview, setOverview] = useState<ClientOverview | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/dashboard/client/overview`,
        { credentials: "include" },
      );
      const body: unknown = await response.json();
      const parsed = response.ok ? parseClientOverview(body) : null;
      if (!parsed) {
        setError(getErrorMessage(body, "Unable to load your dashboard."));
        return;
      }
      setOverview(parsed);
      setError("");
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Re-read on every navigation so counts and the decision queue reflect
  // anything the client just did on another page.
  const { pathname } = useLocation();
  useEffect(() => {
    void refresh();
  }, [refresh, pathname]);

  return (
    <ClientWorkspaceContext.Provider
      value={{ overview, isLoading, error, refresh }}
    >
      {children}
    </ClientWorkspaceContext.Provider>
  );
}

/** Null outside the client dashboard, e.g. on pages shared with engineers. */
export const useClientWorkspace = (): ClientWorkspaceValue | null =>
  useContext(ClientWorkspaceContext);

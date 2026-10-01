import {
  createContext,
  type ReactNode,
  type ReactElement,
  useContext,
  useEffect,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../lib/apiBase";

/** Clients hire; engineers and organisations (companies) provide services. */
export type UserRole = "client" | "engineer" | "organisation";

/** What a company offers; decides which tools its dashboard shows. */
export type CompanyService = "equipment" | "projects";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  profilePhotoUrl: string | null;
  /** Companies only. */
  services?: CompanyService[];
  /**
   * Engineers and companies: their chosen specialities, main one first. Empty
   * means they haven't chosen yet and should be asked.
   */
  disciplines?: string[];
}

interface AuthContextValue {
  currentUser: CurrentUser | null;
  isLoading: boolean;
  refetchUser: () => Promise<void>;
  logout: () => Promise<void>;
}

interface AuthProviderProps {
  children: ReactNode;
}

const authEndpoint = `${API_BASE_URL}/api/auth`;

const isCurrentUser = (value: unknown): value is CurrentUser => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const user = value as Record<string, unknown>;
  return (
    typeof user.id === "string" &&
    typeof user.name === "string" &&
    typeof user.email === "string" &&
    (typeof user.profilePhotoUrl === "string" ||
      user.profilePhotoUrl === null) &&
    (user.role === "client" ||
      user.role === "engineer" ||
      user.role === "organisation") &&
    (user.services === undefined ||
      (Array.isArray(user.services) &&
        user.services.every(
          (service) => service === "equipment" || service === "projects",
        ))) &&
    (user.disciplines === undefined ||
      (Array.isArray(user.disciplines) &&
        user.disciplines.every((item) => typeof item === "string")))
  );
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const requestUrl = (input: RequestInfo | URL): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

/**
 * A 401 from the API means the session is gone (expired, or ended by a
 * password change elsewhere). The sign-in endpoints answer 401 for a wrong
 * password too, so they don't count.
 */
const isSessionLost = (input: RequestInfo | URL, response: Response): boolean => {
  if (response.status !== 401) return false;
  const url = requestUrl(input);
  return url.startsWith(`${API_BASE_URL}/`) && !url.startsWith(`${authEndpoint}/`);
};

export function AuthProvider({ children }: AuthProviderProps): ReactElement {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const navigate = useNavigate();

  const refetchUser = async (): Promise<void> => {
    try {
      const response = await fetch(`${authEndpoint}/me`, {
        credentials: "include",
      });

      if (!response.ok) {
        setCurrentUser(null);
        return;
      }

      const user: unknown = await response.json();
      setCurrentUser(isCurrentUser(user) ? user : null);
    } catch {
      setCurrentUser(null);
    }
  };

  useEffect(() => {
    const loadCurrentUser = async (): Promise<void> => {
      try {
        await refetchUser();
      } finally {
        setIsLoading(false);
      }
    };

    void loadCurrentUser();
  }, []);

  // Every page calls fetch directly, so the check sits on fetch itself. Once
  // signed out here, protected pages send the person to sign in, and their
  // polling stops as those pages unmount.
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      if (isSessionLost(input, response)) setCurrentUser(null);
      return response;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const logout = async (): Promise<void> => {
    try {
      await fetch(`${authEndpoint}/logout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setCurrentUser(null);
      navigate("/");
    }
  };

  return (
    <AuthContext.Provider
      value={{ currentUser, isLoading, refetchUser, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }

  return context;
}

import {
  createContext,
  type ReactNode,
  type ReactElement,
  useContext,
  useEffect,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: "client" | "engineer";
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

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
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
    (user.role === "client" || user.role === "engineer")
  );
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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

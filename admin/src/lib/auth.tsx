import {
  type ReactElement,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type AdminIdentity, adminApi, setSignedOutHandler } from "./api";

interface AuthState {
  admin: AdminIdentity | null;
  isChecking: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(true);

  useEffect(() => {
    let isActive = true;
    adminApi<AdminIdentity>("/auth/me")
      .then((me) => {
        if (isActive) setAdmin(me);
      })
      .catch(() => undefined)
      .finally(() => {
        if (isActive) setIsChecking(false);
      });
    // A 401 anywhere (session ended, admin disabled) signs the dashboard out.
    setSignedOutHandler(() => setAdmin(null));
    return () => {
      isActive = false;
      setSignedOutHandler(null);
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setAdmin(await adminApi<AdminIdentity>("/auth/login", { method: "POST", body: { email, password } }));
  }, []);

  const signOut = useCallback(async () => {
    await adminApi("/auth/logout", { method: "POST" }).catch(() => undefined);
    setAdmin(null);
  }, []);

  const value = useMemo(() => ({ admin, isChecking, signIn, signOut }), [admin, isChecking, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthState => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth needs an AuthProvider");
  return context;
};

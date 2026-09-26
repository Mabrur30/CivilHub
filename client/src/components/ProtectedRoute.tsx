import { type ReactElement, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, type UserRole } from "../context/AuthContext";
import { dashboardBase } from "../lib/dashboardPaths";

interface ProtectedRouteProps {
  /** One role or several; anyone else is sent to their own dashboard. */
  allowedRole?: UserRole | UserRole[];
  children: ReactNode;
}

export function ProtectedRoute({
  allowedRole,
  children,
}: ProtectedRouteProps): ReactElement {
  const { currentUser, isLoading } = useAuth();

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-void text-white">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
          Checking session...
        </p>
      </main>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  const allowed =
    allowedRole === undefined
      ? true
      : Array.isArray(allowedRole)
        ? allowedRole.includes(currentUser.role)
        : currentUser.role === allowedRole;

  if (!allowed) {
    return <Navigate to={dashboardBase(currentUser.role)} replace />;
  }

  return <>{children}</>;
}

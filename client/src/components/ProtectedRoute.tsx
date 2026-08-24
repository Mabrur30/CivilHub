import { type ReactElement, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

interface ProtectedRouteProps {
  allowedRole?: "client" | "engineer";
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

  if (allowedRole && currentUser.role !== allowedRole) {
    return (
      <Navigate
        to={
          currentUser.role === "engineer"
            ? "/dashboard/engineer"
            : "/dashboard/client"
        }
        replace
      />
    );
  }

  return <>{children}</>;
}

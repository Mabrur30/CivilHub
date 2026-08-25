import { type ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function SearchEngineersPage(): ReactElement {
  const { currentUser } = useAuth();

  const networkPath =
    currentUser?.role === "engineer"
      ? "/dashboard/engineer/network?section=search"
      : "/dashboard/client/network?section=search";

  return <Navigate to={networkPath} replace />;
}

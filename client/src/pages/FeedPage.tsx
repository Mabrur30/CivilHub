import { type ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function FeedPage(): ReactElement {
  const { currentUser } = useAuth();

  const networkPath =
    currentUser?.role === "engineer"
      ? "/dashboard/engineer/network"
      : "/dashboard/client/network";

  return <Navigate to={networkPath} replace />;
}

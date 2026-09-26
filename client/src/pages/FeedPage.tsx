import { type ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { dashboardBase } from "../lib/dashboardPaths";

export function FeedPage(): ReactElement {
  const { currentUser } = useAuth();

  const networkPath = `${dashboardBase(currentUser?.role)}/network`;

  return <Navigate to={networkPath} replace />;
}

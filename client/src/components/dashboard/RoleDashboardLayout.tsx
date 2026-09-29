import { type ReactElement } from "react";
import { useAuth } from "../../context/AuthContext";
import { ClientDashboardLayout } from "./ClientDashboardLayout";
import { EngineerDashboardLayout } from "./EngineerDashboardLayout";

// Shared pages such as the inbox live at role-neutral URLs but should still
// sit inside the signed-in user's own dashboard shell.
export function RoleDashboardLayout(): ReactElement {
  const { currentUser } = useAuth();
  // Engineers and companies share the provider shell.
  return currentUser?.role === "engineer" ||
    currentUser?.role === "developer" ||
    currentUser?.role === "organisation" ? (
    <EngineerDashboardLayout />
  ) : (
    <ClientDashboardLayout />
  );
}

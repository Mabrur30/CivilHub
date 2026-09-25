import { type ReactElement } from "react";
import { useAuth } from "../../context/AuthContext";
import { ClientDashboardLayout } from "./ClientDashboardLayout";
import { EngineerDashboardLayout } from "./EngineerDashboardLayout";

// Shared pages such as the inbox live at role-neutral URLs but should still
// sit inside the signed-in user's own dashboard shell.
export function RoleDashboardLayout(): ReactElement {
  const { currentUser } = useAuth();
  return currentUser?.role === "engineer" ? (
    <EngineerDashboardLayout />
  ) : (
    <ClientDashboardLayout />
  );
}

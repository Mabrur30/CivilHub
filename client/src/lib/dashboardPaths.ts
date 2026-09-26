import {
  useAuth,
  type CurrentUser,
  type UserRole,
} from "../context/AuthContext";

/** Each role has its own dashboard; companies get the provider one. */
export const dashboardBase = (role: UserRole | undefined): string =>
  role === "client"
    ? "/dashboard/client"
    : role === "organisation"
      ? "/dashboard/organisation"
      : "/dashboard/engineer";

/** The signed-in user's dashboard root, e.g. "/dashboard/organisation". */
export function useDashboardBase(): string {
  const { currentUser } = useAuth();
  return dashboardBase(currentUser?.role);
}

/** Engineers and companies offer services; clients hire them. */
export const isProviderRole = (role: unknown): boolean =>
  role === "engineer" || role === "organisation";

/** Engineers always take on projects; a company only if its profile says so. */
export const canTakeProjects = (user: CurrentUser | null): boolean =>
  user?.role === "engineer" ||
  (user?.role === "organisation" &&
    (user.services ?? []).includes("projects"));

/** Engineers always list equipment; a company only if it rents machines out. */
export const canListEquipment = (user: CurrentUser | null): boolean =>
  user?.role === "engineer" ||
  (user?.role === "organisation" &&
    (user.services ?? []).includes("equipment"));

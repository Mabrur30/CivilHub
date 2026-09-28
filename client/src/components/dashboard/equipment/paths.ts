import { useAuth, type UserRole } from "../../../context/AuthContext";
import { dashboardBase } from "../../../lib/dashboardPaths";

export interface EquipmentPaths {
  base: string;
  browse: string;
  bookings: string;
  /** Owner listings: engineers, and companies that rent out equipment. */
  mine: string;
  listing: (equipmentId: string) => string;
  booking: (bookingId: string) => string;
}

export const equipmentPathsFor = (role: UserRole): EquipmentPaths => {
  const base = `${dashboardBase(role)}/equipment`;
  return {
    base,
    browse: `${base}/browse`,
    bookings: `${base}/bookings`,
    mine: `${base}/mine`,
    listing: (equipmentId) => `${base}/${equipmentId}`,
    booking: (bookingId) => `${base}/bookings/${bookingId}`,
  };
};

/** Equipment pages are shared by both dashboards; links stay inside the viewer's own. */
export function useEquipmentPaths(): EquipmentPaths {
  const { currentUser } = useAuth();
  return equipmentPathsFor(currentUser?.role ?? "engineer");
}

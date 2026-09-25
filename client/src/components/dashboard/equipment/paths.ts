import { useAuth } from "../../../context/AuthContext";

export interface EquipmentPaths {
  base: string;
  browse: string;
  bookings: string;
  /** Owner listings; only engineers list equipment. */
  mine: string;
  listing: (equipmentId: string) => string;
  booking: (bookingId: string) => string;
}

export const equipmentPathsFor = (
  role: "client" | "engineer",
): EquipmentPaths => {
  const base = `/dashboard/${role}/equipment`;
  return {
    base,
    browse: `${base}/browse`,
    bookings: `${base}/bookings`,
    mine: "/dashboard/engineer/equipment/mine",
    listing: (equipmentId) => `${base}/${equipmentId}`,
    booking: (bookingId) => `${base}/bookings/${bookingId}`,
  };
};

/** Equipment pages are shared by both dashboards; links stay inside the viewer's own. */
export function useEquipmentPaths(): EquipmentPaths {
  const { currentUser } = useAuth();
  return equipmentPathsFor(
    currentUser?.role === "client" ? "client" : "engineer",
  );
}

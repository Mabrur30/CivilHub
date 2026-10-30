import { realtimeHub } from "./realtime.hub";

export interface BookingRealtimeRecord {
  _id: { toString(): string };
  equipment: { toString(): string };
  owner: { toString(): string };
  renter: { toString(): string };
}

export const emitBookingRealtime = (booking: BookingRealtimeRecord): void => {
  const scope = { bookingId: booking._id.toString() };
  realtimeHub.emitToUsers(
    [...new Set([booking.owner.toString(), booking.renter.toString()])],
    ["bookings", "equipment-availability"],
    scope,
  );
  realtimeHub.emitToRole(
    ["engineer", "organisation", "client"],
    ["equipment-availability"],
    { equipmentId: booking.equipment.toString() },
  );
};

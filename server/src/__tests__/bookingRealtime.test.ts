import { emitBookingRealtime } from "../realtime/bookingRealtime";
import { realtimeHub } from "../realtime/realtime.hub";

test("booking realtime helper updates both parties and availability", () => {
  const users = jest.spyOn(realtimeHub, "emitToUsers");
  const roles = jest.spyOn(realtimeHub, "emitToRole");
  const booking = {
    _id: { toString: () => "booking-1" },
    equipment: { toString: () => "equipment-1" },
    owner: { toString: () => "owner-1" },
    renter: { toString: () => "renter-1" },
  };

  emitBookingRealtime(booking);

  expect(users).toHaveBeenCalledWith(
    ["owner-1", "renter-1"],
    ["bookings", "equipment-availability"],
    { bookingId: "booking-1" },
  );
  expect(roles).toHaveBeenCalledWith(
    ["engineer", "organisation", "client"],
    ["equipment-availability"],
    { equipmentId: "equipment-1" },
  );
});

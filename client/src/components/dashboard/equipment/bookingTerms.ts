import { type EquipmentBookingBase } from "../../../pages/equipment.api";

/** "2 units · With operator · Delivery", or "" for a single bare unit collected by the renter. */
export const describeBookingExtras = (booking: EquipmentBookingBase): string =>
  [
    booking.units > 1 ? `${booking.units} units` : null,
    booking.withOperator ? "With operator" : null,
    booking.fulfilment === "delivery" ? "Delivery" : null,
  ]
    .filter(Boolean)
    .join(" · ");

/** What the renter pays up front: rental, operator and delivery, plus the deposit. */
export const bookingTotalDue = (booking: EquipmentBookingBase): number =>
  booking.totalRentalFee + booking.securityDeposit;

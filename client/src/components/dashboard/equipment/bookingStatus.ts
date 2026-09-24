import { type EquipmentBookingBase } from "../../../pages/equipment.api";

type BookingStatus = EquipmentBookingBase["status"];

export const bookingStatusLabel: Record<BookingStatus, string> = {
  pending: "Awaiting approval",
  approved: "Approved",
  in_progress: "In progress",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
};

// Live rentals get the one semantic colour; finished or refused ones fade back.
export const bookingStatusClassName: Record<BookingStatus, string> = {
  pending: "bg-white/10 text-white/80",
  approved: "bg-white/10 text-white",
  in_progress: "bg-emerald-400/10 text-emerald-300",
  completed: "bg-white/5 text-white/50",
  declined: "bg-white/5 text-white/40",
  cancelled: "bg-white/5 text-white/40",
};

export const needsPayment = (booking: EquipmentBookingBase): boolean =>
  booking.status === "approved" && booking.paymentStatus === "unpaid";

/** One plain phrase about the money on a booking, e.g. "Paid, deposit held". */
export const getPaymentSummary = (booking: EquipmentBookingBase): string => {
  if (booking.paymentStatus === "unpaid") {
    return booking.status === "approved" ? "Payment due" : "Not paid yet";
  }
  if (booking.depositResolution === "released") return "Paid, deposit released";
  if (booking.depositResolution === "claimed") return "Paid, deposit claimed";
  return "Paid, deposit held";
};

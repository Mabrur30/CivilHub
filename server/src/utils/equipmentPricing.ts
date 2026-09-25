import {
  type EquipmentOperatorOption,
  type EquipmentTransportOption,
} from "../models/Equipment.model";
import { type EquipmentFulfilment } from "../models/EquipmentBooking.model";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ListingPricing {
  dailyRate: number;
  weeklyRate: number | null;
  monthlyRate: number | null;
  minRentalDays: number;
  securityDeposit: number;
  quantity: number;
  operator: EquipmentOperatorOption;
  operatorDailyRate: number | null;
  transport: EquipmentTransportOption;
  deliveryFee: number | null;
}

export interface QuoteRequest {
  startDate: Date;
  endDate: Date;
  units: number;
  withOperator: boolean;
  fulfilment: EquipmentFulfilment;
}

export interface RentalQuote {
  rentalDays: number;
  units: number;
  /** Price of one unit for the whole period, after weekly/monthly rates. */
  unitRentalFee: number;
  rentalFee: number;
  operatorFee: number;
  deliveryFee: number;
  securityDeposit: number;
  totalRentalFee: number;
  totalDue: number;
  /** Which rate tiers were used, for the "weekly rate applied" note. */
  appliedRates: Array<"daily" | "weekly" | "monthly">;
}

export class PricingError extends Error {
  statusCode = 400;
}

/** The rental terms of a stored listing, with defaults for listings saved before these fields existed. */
export const listingPricingOf = (equipment: {
  dailyRate: number;
  weeklyRate?: number | null;
  monthlyRate?: number | null;
  minRentalDays?: number | null;
  securityDeposit: number;
  quantity?: number | null;
  operator?: EquipmentOperatorOption | null;
  operatorDailyRate?: number | null;
  transport?: EquipmentTransportOption | null;
  deliveryFee?: number | null;
}): ListingPricing => ({
  dailyRate: equipment.dailyRate,
  weeklyRate: equipment.weeklyRate ?? null,
  monthlyRate: equipment.monthlyRate ?? null,
  minRentalDays: equipment.minRentalDays ?? 1,
  securityDeposit: equipment.securityDeposit,
  quantity: equipment.quantity ?? 1,
  operator: equipment.operator ?? "none",
  operatorDailyRate: equipment.operatorDailyRate ?? null,
  transport: equipment.transport ?? "pickup",
  deliveryFee: equipment.deliveryFee ?? null,
});

/** Days held, counting both ends: Mon to Wed is 3, a same-day rental is 1. */
export const rentalDays = (startDate: Date, endDate: Date): number =>
  Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1;

/**
 * One unit's price for `days`. Whole months and weeks use their rates, and the
 * leftover days are charged daily but never above the next rate up, so a
 * six-day hire never costs more than a week.
 */
export const unitRentalPrice = (
  days: number,
  rates: Pick<ListingPricing, "dailyRate" | "weeklyRate" | "monthlyRate">,
): { price: number; applied: Set<"daily" | "weekly" | "monthly"> } => {
  const applied = new Set<"daily" | "weekly" | "monthly">();
  const { dailyRate, weeklyRate, monthlyRate } = rates;

  const weekPart = (remaining: number): number => {
    if (!weeklyRate) {
      if (remaining > 0) applied.add("daily");
      return remaining * dailyRate;
    }
    const weeks = Math.floor(remaining / 7);
    const extraDays = remaining % 7;
    if (weeks > 0) applied.add("weekly");
    const extra = extraDays * dailyRate;
    if (extraDays > 0) applied.add(extra > weeklyRate ? "weekly" : "daily");
    return weeks * weeklyRate + Math.min(weeklyRate, extra);
  };

  if (!monthlyRate) {
    return { price: weekPart(days), applied };
  }

  const months = Math.floor(days / 30);
  if (months > 0) applied.add("monthly");
  const rest = weekPart(days % 30);
  if (rest > monthlyRate) {
    applied.delete("daily");
    applied.delete("weekly");
    applied.add("monthly");
  }
  return { price: months * monthlyRate + Math.min(monthlyRate, rest), applied };
};

export const offersDelivery = (transport: EquipmentTransportOption): boolean =>
  transport === "delivery" || transport === "both";

export const offersPickup = (transport: EquipmentTransportOption): boolean =>
  transport === "pickup" || transport === "both";

/**
 * The full price of a request against a listing, or a PricingError saying why
 * the request doesn't fit the listing's terms. Capacity on the chosen dates is
 * checked separately, against other bookings.
 */
export const quoteBooking = (
  listing: ListingPricing,
  request: QuoteRequest,
): RentalQuote => {
  const { startDate, endDate, units, withOperator, fulfilment } = request;

  if (endDate < startDate) {
    throw new PricingError("End date can't be before the start date");
  }
  const days = rentalDays(startDate, endDate);
  if (days < listing.minRentalDays) {
    throw new PricingError(
      `This equipment is rented for at least ${listing.minRentalDays} days`,
    );
  }
  if (!Number.isInteger(units) || units < 1) {
    throw new PricingError("Choose at least one unit");
  }
  if (units > listing.quantity) {
    throw new PricingError(
      listing.quantity === 1
        ? "Only one unit of this equipment is listed"
        : `Only ${listing.quantity} units of this equipment are listed`,
    );
  }
  if (withOperator && listing.operator !== "optional") {
    throw new PricingError(
      listing.operator === "included"
        ? "An operator is already included in the rate"
        : "This equipment is rented without an operator",
    );
  }
  if (fulfilment === "delivery" && !offersDelivery(listing.transport)) {
    throw new PricingError("The owner doesn't deliver this equipment");
  }
  if (fulfilment === "pickup" && !offersPickup(listing.transport)) {
    throw new PricingError("This equipment is delivered by the owner only");
  }

  const { price, applied } = unitRentalPrice(days, listing);
  const rentalFee = price * units;
  const operatorFee =
    withOperator && listing.operatorDailyRate
      ? listing.operatorDailyRate * days * units
      : 0;
  const deliveryFee =
    fulfilment === "delivery" ? (listing.deliveryFee ?? 0) : 0;
  const securityDeposit = listing.securityDeposit * units;
  const totalRentalFee = rentalFee + operatorFee + deliveryFee;

  return {
    rentalDays: days,
    units,
    unitRentalFee: price,
    rentalFee,
    operatorFee,
    deliveryFee,
    securityDeposit,
    totalRentalFee,
    totalDue: totalRentalFee + securityDeposit,
    appliedRates: (["monthly", "weekly", "daily"] as const).filter((rate) =>
      applied.has(rate),
    ),
  };
};

/**
 * Checks a listing's terms hang together; returns an error message or "".
 * Discounted rates must actually be cheaper than paying daily.
 */
export const validateListingPricing = (listing: ListingPricing): string => {
  if (!(listing.dailyRate > 0)) return "Daily rate must be a positive number";
  if (listing.weeklyRate !== null) {
    if (!(listing.weeklyRate > 0)) return "Weekly rate must be a positive number";
    if (listing.weeklyRate >= listing.dailyRate * 7) {
      return "The weekly rate should be less than 7 days at the daily rate";
    }
  }
  if (listing.monthlyRate !== null) {
    if (!(listing.monthlyRate > 0)) return "Monthly rate must be a positive number";
    if (listing.monthlyRate >= listing.dailyRate * 30) {
      return "The monthly rate should be less than 30 days at the daily rate";
    }
    if (listing.weeklyRate !== null && listing.monthlyRate <= listing.weeklyRate) {
      return "The monthly rate should be more than the weekly rate";
    }
  }
  if (!Number.isInteger(listing.minRentalDays) || listing.minRentalDays < 1) {
    return "Minimum rental must be at least 1 day";
  }
  if (!Number.isInteger(listing.quantity) || listing.quantity < 1) {
    return "Number of units must be at least 1";
  }
  if (listing.operator === "optional" && (listing.operatorDailyRate ?? 0) <= 0) {
    return "Add the operator's daily rate";
  }
  // A delivery fee of 0 is allowed: free delivery.
  if (
    offersDelivery(listing.transport) &&
    (listing.deliveryFee === null || listing.deliveryFee < 0)
  ) {
    return "Add the delivery fee";
  }
  return "";
};

import {
  EQUIPMENT_MAX_UNITS,
  type EquipmentCategory,
  type EquipmentListing,
  type EquipmentTermsInput,
} from "../../../pages/equipment.api";
import { moneyValue } from "../../../lib/money";

export interface ListingDetails extends EquipmentTermsInput {
  title: string;
  description: string;
  category: EquipmentCategory;
  dailyRate: string;
  securityDeposit: string;
  location: string;
}

export const DESCRIPTION_LIMIT = 1000;

export const emptyListingDetails: ListingDetails = {
  title: "",
  description: "",
  category: "Excavator",
  dailyRate: "",
  weeklyRate: "",
  monthlyRate: "",
  minRentalDays: "1",
  securityDeposit: "",
  quantity: "1",
  operator: "none",
  operatorDailyRate: "",
  transport: "pickup",
  deliveryFee: "",
  location: "",
};

const amountText = (value: number | null): string =>
  value === null ? "" : String(value);

export const listingToDetails = (item: EquipmentListing): ListingDetails => ({
  title: item.title,
  description: item.description,
  category: item.category,
  dailyRate: String(item.dailyRate),
  weeklyRate: amountText(item.weeklyRate),
  monthlyRate: amountText(item.monthlyRate),
  minRentalDays: String(item.minRentalDays),
  securityDeposit: String(item.securityDeposit),
  quantity: String(item.quantity),
  operator: item.operator,
  operatorDailyRate: amountText(item.operatorDailyRate),
  transport: item.transport,
  deliveryFee: amountText(item.deliveryFee),
  location: item.location,
});

const wholeNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
};

/** Returns the first problem with the details, or "" when they are valid. Mirrors the server's checks. */
export const validateListingDetails = (details: ListingDetails): string => {
  if (!details.title.trim()) return "Add a title.";
  if (!details.description.trim()) return "Add a description.";
  if (details.description.trim().length > DESCRIPTION_LIMIT) {
    return `Keep the description to ${DESCRIPTION_LIMIT} characters or fewer.`;
  }
  if (!details.location.trim()) return "Add a location.";

  const dailyRate = moneyValue(details.dailyRate) ?? Number.NaN;
  if (!Number.isFinite(dailyRate) || dailyRate <= 0) {
    return "Enter a daily rate greater than zero.";
  }

  const weeklyRate = details.weeklyRate.trim()
    ? moneyValue(details.weeklyRate)
    : null;
  if (details.weeklyRate.trim()) {
    if (weeklyRate === null || weeklyRate <= 0) return "Check the weekly rate.";
    if (weeklyRate >= dailyRate * 7) {
      return "The weekly rate should be less than 7 days at the daily rate.";
    }
  }

  if (details.monthlyRate.trim()) {
    const monthlyRate = moneyValue(details.monthlyRate);
    if (monthlyRate === null || monthlyRate <= 0)
      return "Check the monthly rate.";
    if (monthlyRate >= dailyRate * 30) {
      return "The monthly rate should be less than 30 days at the daily rate.";
    }
    if (weeklyRate !== null && monthlyRate <= weeklyRate) {
      return "The monthly rate should be more than the weekly rate.";
    }
  }

  const minDays = wholeNumber(details.minRentalDays);
  if (minDays === null || minDays < 1 || minDays > 365) {
    return "Set a minimum rental between 1 and 365 days.";
  }

  const quantity = wholeNumber(details.quantity);
  if (quantity === null || quantity < 1 || quantity > EQUIPMENT_MAX_UNITS) {
    return `Set how many units you have, from 1 to ${EQUIPMENT_MAX_UNITS}.`;
  }

  const securityDeposit = moneyValue(details.securityDeposit) ?? Number.NaN;
  if (!Number.isFinite(securityDeposit) || securityDeposit <= 0) {
    return "Enter a security deposit greater than zero.";
  }

  if (details.operator === "optional") {
    const operatorRate = moneyValue(details.operatorDailyRate);
    if (operatorRate === null || operatorRate <= 0) {
      return "Add the operator's daily rate.";
    }
  }

  if (details.transport !== "pickup") {
    const deliveryFee = moneyValue(details.deliveryFee);
    if (deliveryFee === null || deliveryFee < 0) {
      return "Add the delivery fee (0 for free delivery).";
    }
  }

  return "";
};

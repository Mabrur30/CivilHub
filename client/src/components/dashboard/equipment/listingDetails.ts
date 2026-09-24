import { type EquipmentCategory } from "../../../pages/equipment.api";

export interface ListingDetails {
  title: string;
  description: string;
  category: EquipmentCategory;
  dailyRate: string;
  securityDeposit: string;
  location: string;
}

export const DESCRIPTION_LIMIT = 1000;

/** Returns the first problem with the details, or "" when they are valid. */
export const validateListingDetails = (details: ListingDetails): string => {
  if (!details.title.trim()) return "Add a title.";
  if (!details.description.trim()) return "Add a description.";
  if (details.description.trim().length > DESCRIPTION_LIMIT) {
    return `Keep the description to ${DESCRIPTION_LIMIT} characters or fewer.`;
  }
  if (!details.location.trim()) return "Add a location.";

  const dailyRate = Number.parseFloat(details.dailyRate);
  if (!Number.isFinite(dailyRate) || dailyRate <= 0) {
    return "Enter a daily rate greater than zero.";
  }

  const securityDeposit = Number.parseFloat(details.securityDeposit);
  if (!Number.isFinite(securityDeposit) || securityDeposit <= 0) {
    return "Enter a security deposit greater than zero.";
  }

  return "";
};

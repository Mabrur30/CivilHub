import { formatCurrency } from "../../../lib/format";
import { type EquipmentRentalTerms } from "../../../pages/equipment.api";

export const operatorLabel = (terms: EquipmentRentalTerms): string | null => {
  if (terms.operator === "included") return "Operator included";
  if (terms.operator === "optional") return "Operator available";
  return null;
};

export const transportLabel = (terms: EquipmentRentalTerms): string => {
  if (terms.transport === "pickup") return "Renter collects";
  const fee =
    terms.deliveryFee === 0 || terms.deliveryFee === null
      ? "free delivery"
      : `delivery ${formatCurrency(terms.deliveryFee)}`;
  return terms.transport === "delivery"
    ? `Delivered, ${fee}`
    : `Collect or ${fee}`;
};

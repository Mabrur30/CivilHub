import { StackIcon, TruckIcon, UserGearIcon } from "@phosphor-icons/react";
import { type ReactElement } from "react";
import { type EquipmentRentalTerms } from "../../../pages/equipment.api";
import { operatorLabel } from "./termLabels";

const chip =
  "inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs font-semibold text-white/70";

/** The terms a renter scans for first: how many, operator, transport. */
export function ListingTermChips({
  terms,
  className = "",
}: {
  terms: EquipmentRentalTerms;
  className?: string;
}): ReactElement {
  const operator = operatorLabel(terms);
  return (
    <ul
      className={`flex flex-wrap gap-1.5 ${className}`}
      aria-label="Rental terms"
    >
      {terms.quantity > 1 ? (
        <li className={chip}>
          <StackIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {terms.quantity} units
        </li>
      ) : null}
      {operator ? (
        <li className={chip}>
          <UserGearIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {operator}
        </li>
      ) : null}
      {terms.transport !== "pickup" ? (
        <li className={chip}>
          <TruckIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {terms.transport === "delivery" ? "Delivered" : "Delivery available"}
        </li>
      ) : null}
    </ul>
  );
}

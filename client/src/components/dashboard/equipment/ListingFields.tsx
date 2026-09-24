import { type ReactElement } from "react";
import {
  EQUIPMENT_CATEGORIES,
  type EquipmentCategory,
} from "../../../pages/equipment.api";
import { inputClassName } from "../ui/buttonStyles";
import { FormField } from "../ui/FormField";
import { DESCRIPTION_LIMIT, type ListingDetails } from "./listingDetails";

interface ListingFieldsProps {
  idPrefix: string;
  values: ListingDetails;
  onChange: (patch: Partial<ListingDetails>) => void;
}

// The same fields back both "Add equipment" and "Edit listing", so the two
// forms can never drift apart in labels, order or validation.
export function ListingFields({
  idPrefix,
  values,
  onChange,
}: ListingFieldsProps): ReactElement {
  const id = (name: string): string => `${idPrefix}-${name}`;
  const descriptionLength = values.description.trim().length;

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <FormField id={id("title")} label="Title">
        <input
          id={id("title")}
          value={values.title}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="CAT 320 excavator"
          className={inputClassName}
        />
      </FormField>

      <FormField id={id("category")} label="Type">
        <select
          id={id("category")}
          value={values.category}
          onChange={(event) =>
            onChange({ category: event.target.value as EquipmentCategory })
          }
          className={inputClassName}
        >
          {EQUIPMENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        id={id("description")}
        label="Description"
        hint={`Condition, specs, delivery and whether an operator is available. ${descriptionLength}/${DESCRIPTION_LIMIT}`}
        className="sm:col-span-2"
      >
        <textarea
          id={id("description")}
          value={values.description}
          onChange={(event) => onChange({ description: event.target.value })}
          rows={4}
          className={`${inputClassName} resize-none`}
        />
      </FormField>

      <FormField id={id("rate")} label="Daily rate ($)">
        <input
          id={id("rate")}
          inputMode="decimal"
          value={values.dailyRate}
          onChange={(event) => onChange({ dailyRate: event.target.value })}
          className={inputClassName}
        />
      </FormField>

      <FormField
        id={id("deposit")}
        label="Security deposit ($)"
        hint="Held while the equipment is out, then released or claimed."
      >
        <input
          id={id("deposit")}
          inputMode="decimal"
          value={values.securityDeposit}
          onChange={(event) =>
            onChange({ securityDeposit: event.target.value })
          }
          className={inputClassName}
        />
      </FormField>

      <FormField
        id={id("location")}
        label="Location"
        hint="City or district where renters collect it."
        className="sm:col-span-2"
      >
        <input
          id={id("location")}
          value={values.location}
          onChange={(event) => onChange({ location: event.target.value })}
          placeholder="Dhaka"
          className={inputClassName}
        />
      </FormField>
    </div>
  );
}

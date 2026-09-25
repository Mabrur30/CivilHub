import { type ReactElement } from "react";
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_MAX_UNITS,
  type EquipmentCategory,
  type EquipmentOperatorOption,
  type EquipmentTransportOption,
} from "../../../pages/equipment.api";
import { inputClassName } from "../ui/buttonStyles";
import { FormField } from "../ui/FormField";
import { DESCRIPTION_LIMIT, type ListingDetails } from "./listingDetails";
import { MoneyInput } from "../ui/MoneyInput";

interface ListingFieldsProps {
  idPrefix: string;
  values: ListingDetails;
  onChange: (patch: Partial<ListingDetails>) => void;
}

interface Choice<Value extends string> {
  value: Value;
  label: string;
  hint: string;
}

const operatorChoices: Choice<EquipmentOperatorOption>[] = [
  { value: "none", label: "No operator", hint: "Renters bring their own." },
  {
    value: "included",
    label: "Included",
    hint: "An operator comes with it, in the daily rate.",
  },
  {
    value: "optional",
    label: "Optional",
    hint: "Renters can add one for a daily fee.",
  },
];

const transportChoices: Choice<EquipmentTransportOption>[] = [
  {
    value: "pickup",
    label: "Renter collects",
    hint: "From your yard or site.",
  },
  {
    value: "delivery",
    label: "I deliver",
    hint: "You drop it off and collect it.",
  },
  { value: "both", label: "Either", hint: "Renters choose when they book." },
];

function SectionTitle({
  title,
  body,
}: {
  title: string;
  body: string;
}): ReactElement {
  return (
    <div className="border-t border-white/10 pt-5 sm:col-span-2">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-0.5 text-xs text-white/50">{body}</p>
    </div>
  );
}

function ChoiceGroup<Value extends string>({
  name,
  legend,
  choices,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  choices: Choice<Value>[];
  value: Value;
  onChange: (value: Value) => void;
}): ReactElement {
  return (
    <fieldset className="sm:col-span-2">
      <legend className="sr-only">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {choices.map((choice) => {
          const isSelected = choice.value === value;
          return (
            <label
              key={choice.value}
              className={`flex cursor-pointer flex-col rounded-xl border px-3.5 py-3 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-glow ${
                isSelected
                  ? "border-primary/60 bg-primary/10"
                  : "border-white/15 hover:border-white/30"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={choice.value}
                checked={isSelected}
                onChange={() => onChange(choice.value)}
                className="sr-only"
              />
              <span className="text-sm font-semibold text-white">
                {choice.label}
              </span>
              <span className="mt-0.5 text-xs text-white/55">
                {choice.hint}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
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
        hint={`Model, capacity, condition and anything renters should know. ${descriptionLength}/${DESCRIPTION_LIMIT}`}
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

      <FormField
        id={id("location")}
        label="Location"
        hint="City or district where the equipment is kept."
      >
        <input
          id={id("location")}
          value={values.location}
          onChange={(event) => onChange({ location: event.target.value })}
          placeholder="Dhaka"
          className={inputClassName}
        />
      </FormField>

      <FormField
        id={id("quantity")}
        label="Units available"
        hint="Identical machines you can rent out at the same time."
      >
        <input
          id={id("quantity")}
          type="number"
          inputMode="numeric"
          min={1}
          max={EQUIPMENT_MAX_UNITS}
          value={values.quantity}
          onChange={(event) => onChange({ quantity: event.target.value })}
          className={`${inputClassName} tabular-nums`}
        />
      </FormField>

      <SectionTitle
        title="Pricing"
        body="Weekly and monthly rates are optional. Renters are never charged more than the next rate up, so six days never costs more than a week."
      />

      <FormField id={id("rate")} label="Daily rate (per unit)">
        <MoneyInput
          id={id("rate")}
          value={values.dailyRate}
          onChange={(value) => onChange({ dailyRate: value })}
        />
      </FormField>

      <FormField
        id={id("weekly")}
        label="Weekly rate (optional)"
        hint="For 7 days. Must be less than 7 days at the daily rate."
      >
        <MoneyInput
          id={id("weekly")}
          value={values.weeklyRate}
          onChange={(value) => onChange({ weeklyRate: value })}
        />
      </FormField>

      <FormField
        id={id("monthly")}
        label="Monthly rate (optional)"
        hint="For 30 days. Must be less than 30 days at the daily rate."
      >
        <MoneyInput
          id={id("monthly")}
          value={values.monthlyRate}
          onChange={(value) => onChange({ monthlyRate: value })}
        />
      </FormField>

      <FormField
        id={id("min-days")}
        label="Minimum rental (days)"
        hint="1 lets renters book a single day."
      >
        <input
          id={id("min-days")}
          type="number"
          inputMode="numeric"
          min={1}
          max={365}
          value={values.minRentalDays}
          onChange={(event) => onChange({ minRentalDays: event.target.value })}
          className={`${inputClassName} tabular-nums`}
        />
      </FormField>

      <FormField
        id={id("deposit")}
        label="Security deposit (per unit)"
        hint="Held while the equipment is out, then released or claimed."
        className="sm:col-span-2"
      >
        <MoneyInput
          id={id("deposit")}
          value={values.securityDeposit}
          onChange={(value) => onChange({ securityDeposit: value })}
        />
      </FormField>

      <SectionTitle
        title="Operator"
        body="Does someone come with the machine to run it?"
      />
      <ChoiceGroup
        name={id("operator")}
        legend="Operator"
        choices={operatorChoices}
        value={values.operator}
        onChange={(operator) => onChange({ operator })}
      />
      {values.operator === "optional" ? (
        <FormField
          id={id("operator-rate")}
          label="Operator daily rate (per unit)"
          hint="Added for each day and each unit when a renter asks for an operator."
          className="sm:col-span-2"
        >
          <MoneyInput
            id={id("operator-rate")}
            value={values.operatorDailyRate}
            onChange={(value) => onChange({ operatorDailyRate: value })}
          />
        </FormField>
      ) : null}

      <SectionTitle
        title="Transport"
        body="How does the equipment get to the site?"
      />
      <ChoiceGroup
        name={id("transport")}
        legend="Transport"
        choices={transportChoices}
        value={values.transport}
        onChange={(transport) => onChange({ transport })}
      />
      {values.transport !== "pickup" ? (
        <FormField
          id={id("delivery-fee")}
          label="Delivery fee"
          hint="One flat fee for drop-off and collection, per booking. Enter 0 for free delivery."
          className="sm:col-span-2"
        >
          <MoneyInput
            id={id("delivery-fee")}
            value={values.deliveryFee}
            onChange={(value) => onChange({ deliveryFee: value })}
          />
        </FormField>
      ) : null}
    </div>
  );
}

import { type ReactElement } from "react";
import {
  type CriteriaField,
  type ProjectCategoryCriteria,
  groupFields,
  isFieldVisible,
} from "../../lib/projectCriteria";
import {
  type CriteriaFormValue,
  type CriteriaFormValues,
  criteriaFieldId,
} from "../../lib/projectForm";
import { inputClassName } from "../dashboard/ui/buttonStyles";
import { ChoiceChips } from "./ChoiceChips";


// Up to this many options show as chips; longer lists use a select.
const CHIP_LIMIT = 4;

interface CriteriaFieldsProps {
  criteria: ProjectCategoryCriteria;
  values: CriteriaFormValues;
  errors: Record<string, string | undefined>;
  onChange: (key: string, value: CriteriaFormValue) => void;
}

function FieldShell({
  field,
  error,
  children,
}: {
  field: CriteriaField;
  error?: string;
  children: (describedBy: string | undefined) => ReactElement;
}): ReactElement {
  const id = criteriaFieldId(field.key);
  const hintId = field.hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid content-start gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-white/80">
        {field.label}
        {field.required ? null : (
          <span className="font-normal text-white/40"> (if known)</span>
        )}
      </label>
      {children(describedBy)}
      {field.hint ? (
        <p id={hintId} className="text-xs leading-5 text-white/45">
          {field.hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function NumberInput({
  field,
  value,
  error,
  describedBy,
  onChange,
}: {
  field: CriteriaField;
  value: string;
  error?: string;
  describedBy?: string;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <div className="relative">
      <input
        id={criteriaFieldId(field.key)}
        type="number"
        inputMode={field.integer ? "numeric" : "decimal"}
        min={field.min}
        max={field.max}
        step={field.integer ? 1 : "any"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`${inputClassName} tabular-nums ${field.unit ? "pr-16" : ""} ${error ? "border-rose-400/60" : ""}`}
      />
      {field.unit ? (
        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-white/45">
          {field.unit}
        </span>
      ) : null}
    </div>
  );
}

function CriteriaControl({
  field,
  value,
  error,
  onChange,
}: {
  field: CriteriaField;
  value: CriteriaFormValue | undefined;
  error?: string;
  onChange: (value: CriteriaFormValue) => void;
}): ReactElement {
  const id = criteriaFieldId(field.key);
  const options = field.options ?? [];

  if (field.type === "multi" || (field.type === "select" && options.length <= CHIP_LIMIT)) {
    const note = field.required ? undefined : "(if known)";
    return field.type === "multi" ? (
      <ChoiceChips
        multiple
        id={id}
        name={id}
        legend={field.label}
        hint={field.hint}
        note={note}
        error={error}
        options={options}
        value={Array.isArray(value) ? value : []}
        onChange={onChange}
      />
    ) : (
      <ChoiceChips
        id={id}
        name={id}
        legend={field.label}
        hint={field.hint}
        note={note}
        error={error}
        options={options}
        value={typeof value === "string" ? value : ""}
        onChange={onChange}
      />
    );
  }

  if (field.type === "select") {
    return (
      <FieldShell field={field} error={error}>
        {(describedBy) => (
          <select
            id={id}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            className={`${inputClassName} ${error ? "border-rose-400/60" : ""}`}
          >
            <option value="">Choose…</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </FieldShell>
    );
  }

  if (field.type === "area") {
    const area =
      typeof value === "object" && !Array.isArray(value)
        ? value
        : { value: "", unit: field.units?.[0]?.value ?? "" };
    return (
      <FieldShell field={field} error={error}>
        {(describedBy) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <input
              id={id}
              type="number"
              inputMode="decimal"
              min={field.min}
              step="any"
              value={area.value}
              onChange={(event) => onChange({ ...area, value: event.target.value })}
              aria-invalid={Boolean(error)}
              aria-describedby={describedBy}
              className={`${inputClassName} tabular-nums ${error ? "border-rose-400/60" : ""}`}
            />
            <select
              aria-label={`${field.label} unit`}
              value={area.unit}
              onChange={(event) => onChange({ ...area, unit: event.target.value })}
              className={`${inputClassName} w-auto`}
            >
              {(field.units ?? []).map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </FieldShell>
    );
  }

  if (field.type === "text") {
    return (
      <FieldShell field={field} error={error}>
        {(describedBy) => (
          <input
            id={id}
            value={typeof value === "string" ? value : ""}
            maxLength={field.maxLength}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            className={`${inputClassName} ${error ? "border-rose-400/60" : ""}`}
          />
        )}
      </FieldShell>
    );
  }

  return (
    <FieldShell field={field} error={error}>
      {(describedBy) => (
        <NumberInput
          field={field}
          value={typeof value === "string" ? value : ""}
          error={error}
          describedBy={describedBy}
          onChange={onChange}
        />
      )}
    </FieldShell>
  );
}

/** The questions for one project type, grouped under their headings. */
export function CriteriaFields({
  criteria,
  values,
  errors,
  onChange,
}: CriteriaFieldsProps): ReactElement {
  return (
    <div className="grid gap-8">
      {groupFields(criteria.fields).map(({ group, fields }) => {
        const visible = fields.filter((field) => isFieldVisible(field, values));
        if (visible.length === 0) return null;
        return (
          <section key={group} aria-label={group} className="grid gap-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/45">
              {group}
            </h3>
            <div className="grid gap-5 sm:grid-cols-2">
              {visible.map((field) => (
                <div
                  key={field.key}
                  className={
                    field.type === "multi" || (field.options?.length ?? 0) > 3
                      ? "sm:col-span-2"
                      : undefined
                  }
                >
                  <CriteriaControl
                    field={field}
                    value={values[field.key]}
                    error={errors[field.key]}
                    onChange={(value) => onChange(field.key, value)}
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

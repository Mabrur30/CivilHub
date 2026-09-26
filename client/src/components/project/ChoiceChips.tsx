import { type ReactElement } from "react";
import { type CriteriaOption } from "../../lib/projectCriteria";

type ChoiceChipsProps = {
  /** Given to the first input, so a form can focus the group on an error. */
  id: string;
  name: string;
  legend: string;
  hint?: string;
  error?: string;
  options: CriteriaOption[];
  /** Quiet note after the legend, such as "(if known)". */
  note?: string;
} & (
  | { multiple: true; value: string[]; onChange: (value: string[]) => void }
  | { multiple?: false; value: string; onChange: (value: string) => void }
);

/**
 * Options as chips over real radio buttons or checkboxes, so arrow keys,
 * space and screen readers behave as they do for any native choice.
 */
export function ChoiceChips(props: ChoiceChipsProps): ReactElement {
  const { id, name, legend, hint, error, options, note } = props;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const isChecked = (value: string): boolean =>
    props.multiple ? props.value.includes(value) : props.value === value;

  const toggle = (value: string): void => {
    if (props.multiple) {
      props.onChange(
        props.value.includes(value)
          ? props.value.filter((entry) => entry !== value)
          : [...props.value, value],
      );
    } else {
      props.onChange(value);
    }
  };

  return (
    <fieldset className="grid content-start gap-2" aria-describedby={describedBy}>
      <legend className="mb-2 text-sm font-semibold text-white/80">
        {legend}
        {note ? <span className="font-normal text-white/40"> {note}</span> : null}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option, index) => (
          <label
            key={option.value}
            className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-glow ${
              isChecked(option.value)
                ? "border-primary bg-primary/15 text-primary"
                : `${error ? "border-rose-400/60" : "border-white/15"} text-white/65 hover:border-white/35 hover:text-white`
            }`}
          >
            <input
              id={index === 0 ? id : undefined}
              type={props.multiple ? "checkbox" : "radio"}
              name={name}
              value={option.value}
              checked={isChecked(option.value)}
              onChange={() => toggle(option.value)}
              // A second click on the chosen chip clears an optional answer.
              onClick={() => {
                if (!props.multiple && note && props.value === option.value) {
                  props.onChange("");
                }
              }}
              aria-invalid={Boolean(error)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
      {hint ? (
        <p id={hintId} className="text-xs leading-5 text-white/45">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-rose-300">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

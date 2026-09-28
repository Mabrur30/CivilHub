import { CheckIcon } from "@phosphor-icons/react";
import { type ReactElement } from "react";
import { DISCIPLINE_LIMIT, ENGINEER_DISCIPLINES } from "../../../lib/disciplines";

/**
 * Picks a main speciality and up to two more from the discipline list. The
 * first one chosen is the main speciality, shown first on cards and in
 * search; unticking it promotes the next. Controlled: saving is the caller's.
 */
export function SpecialityChooser({
  value,
  onChange,
  legend = "Your speciality",
  hint,
  error,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  legend?: string;
  hint?: string;
  error?: string;
}): ReactElement {
  const isFull = value.length >= DISCIPLINE_LIMIT;

  const toggle = (discipline: string): void => {
    if (value.includes(discipline)) {
      onChange(value.filter((item) => item !== discipline));
    } else if (!isFull) {
      onChange([...value, discipline]);
    }
  };

  return (
    <fieldset className="grid gap-3" aria-describedby={error ? "speciality-error" : undefined}>
      <legend className="mb-1 text-sm font-semibold text-white/80">{legend}</legend>
      <p className="-mt-1 text-xs leading-5 text-white/50">
        {hint ??
          `Pick your main speciality first, then up to ${DISCIPLINE_LIMIT - 1} more. Clients search and filter by these.`}
      </p>
      <div className="flex flex-wrap gap-2">
        {ENGINEER_DISCIPLINES.map((discipline) => {
          const position = value.indexOf(discipline);
          const isChosen = position >= 0;
          return (
            <label
              key={discipline}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-glow ${
                isChosen
                  ? "border-primary bg-primary/15 text-primary"
                  : isFull
                    ? "cursor-not-allowed border-white/10 text-white/35"
                    : "border-white/15 text-white/70 hover:border-white/35 hover:text-white"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={isChosen}
                disabled={!isChosen && isFull}
                onChange={() => toggle(discipline)}
              />
              {isChosen ? <CheckIcon aria-hidden="true" weight="bold" className="h-3.5 w-3.5" /> : null}
              {discipline}
              {position === 0 ? (
                <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-on-primary">
                  Main
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
      {error ? (
        <p id="speciality-error" className="text-xs text-rose-300">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

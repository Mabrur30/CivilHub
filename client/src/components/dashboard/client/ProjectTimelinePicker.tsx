import { CalendarBlankIcon } from "@phosphor-icons/react";
import { type ReactElement, useState } from "react";
import { inputClassName } from "../ui/buttonStyles";
import {
  addDays,
  addMonths,
  describeTimeline,
  formatLongDate,
  parseIsoDate,
  todayIsoDate,
  toIsoDate,
} from "../../../lib/timeline";

type StartChoice = "asap" | "month" | "later" | "custom";
type LengthChoice = "1" | "3" | "6" | "12" | "custom";

const startChoices: { key: StartChoice; label: string; daysFromToday: number }[] = [
  { key: "asap", label: "As soon as possible", daysFromToday: 7 },
  { key: "month", label: "Within a month", daysFromToday: 30 },
  { key: "later", label: "In 2-3 months", daysFromToday: 60 },
  { key: "custom", label: "Pick a date", daysFromToday: 0 },
];

const lengthChoices: { key: LengthChoice; label: string }[] = [
  { key: "1", label: "About 1 month" },
  { key: "3", label: "3 months" },
  { key: "6", label: "6 months" },
  { key: "12", label: "A year" },
  { key: "custom", label: "Pick a finish date" },
];

const pillClassName =
  "cursor-pointer rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/70 transition-colors hover:border-white/35 hover:text-white has-checked:border-primary has-checked:bg-primary/10 has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-glow";

interface DateFieldProps {
  id: string;
  label: string;
  value: string;
  min: string;
  describedBy?: string;
  onChange: (value: string) => void;
}

// The native date input, made friendlier: the calendar opens from anywhere in
// the box, past dates can't be picked, and the chosen day is echoed in words.
function DateField({ id, label, value, min, describedBy, onChange }: DateFieldProps): ReactElement {
  const readableId = `${id}-readable`;
  return (
    <div className="mt-3 grid max-w-xs gap-1.5">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
          id={id}
          type="date"
          value={value}
          min={min}
          onChange={(event) => onChange(event.target.value)}
          onClick={(event) => {
            try {
              event.currentTarget.showPicker();
            } catch {
              // Older browsers open the picker from the icon instead.
            }
          }}
          aria-describedby={[readableId, describedBy].filter(Boolean).join(" ")}
          className={`${inputClassName} cursor-pointer`}
        />
      <p id={readableId} className="text-xs text-white/55" aria-live="polite">
        {value ? formatLongDate(value) : "Choose a day on the calendar"}
      </p>
    </div>
  );
}

interface ProjectTimelinePickerProps {
  start: string;
  finish: string;
  startError?: string;
  finishError?: string;
  onChange: (dates: { start: string; finish: string }) => void;
}

/**
 * Asks when work should start and how long it should take, the way clients
 * think about a project, and turns the answers into the two dates the brief
 * needs. Exact dates are still one tap away under "Pick a date".
 */
export function ProjectTimelinePicker({
  start,
  finish,
  startError,
  finishError,
  onChange,
}: ProjectTimelinePickerProps): ReactElement {
  // Dates that arrive already filled (e.g. restored drafts) are shown as picked dates.
  const [startChoice, setStartChoice] = useState<StartChoice | null>(start ? "custom" : null);
  const [lengthChoice, setLengthChoice] = useState<LengthChoice | null>(finish ? "custom" : null);
  const today = todayIsoDate();

  const finishFor = (startDate: string, choice: LengthChoice | null, current: string): string => {
    const from = parseIsoDate(startDate);
    if (!from || !choice || choice === "custom") return current;
    return toIsoDate(addMonths(from, Number(choice)));
  };

  const chooseStart = (choice: StartChoice): void => {
    setStartChoice(choice);
    if (choice === "custom") return;
    const option = startChoices.find((item) => item.key === choice);
    const nextStart = toIsoDate(addDays(new Date(), option?.daysFromToday ?? 0));
    onChange({ start: nextStart, finish: finishFor(nextStart, lengthChoice, finish) });
  };

  const chooseLength = (choice: LengthChoice): void => {
    setLengthChoice(choice);
    if (choice === "custom") return;
    onChange({ start, finish: finishFor(start, choice, finish) });
  };

  const setCustomStart = (value: string): void =>
    onChange({ start: value, finish: finishFor(value, lengthChoice, finish) });

  const summary = describeTimeline(start, finish);
  const startFrom = parseIsoDate(start);
  const finishMin = startFrom ? toIsoDate(addDays(startFrom, 1)) : today;

  return (
    <div className="grid gap-6">
      <fieldset
        id="targetStartDate"
        tabIndex={-1}
        aria-describedby={startError ? "targetStartDate-error" : undefined}
        className="rounded-xl outline-none"
      >
        <legend className="text-sm font-semibold text-white/80">When should work start?</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {startChoices.map((option) => (
            <label key={option.key} className={pillClassName}>
              <input
                type="radio"
                name="start-choice"
                value={option.key}
                checked={startChoice === option.key}
                onChange={() => chooseStart(option.key)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
        {startChoice === "custom" ? (
          <DateField
            id="targetStartDate-date"
            label="Start date"
            value={start}
            min={today}
            describedBy={startError ? "targetStartDate-error" : undefined}
            onChange={setCustomStart}
          />
        ) : start ? (
          <p className="mt-2 text-xs text-white/55">Starts around {formatLongDate(start)}</p>
        ) : null}
        {startError ? (
          <p id="targetStartDate-error" className="mt-2 text-xs text-red-300">
            {startError}
          </p>
        ) : null}
      </fieldset>

      <fieldset
        id="targetCompletionDate"
        tabIndex={-1}
        aria-describedby={finishError ? "targetCompletionDate-error" : undefined}
        className="rounded-xl outline-none"
      >
        <legend className="text-sm font-semibold text-white/80">How long should it take?</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {lengthChoices.map((option) => (
            <label key={option.key} className={pillClassName}>
              <input
                type="radio"
                name="length-choice"
                value={option.key}
                checked={lengthChoice === option.key}
                onChange={() => chooseLength(option.key)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
        {lengthChoice === "custom" ? (
          <DateField
            id="targetCompletionDate-date"
            label="Finish date"
            value={finish}
            min={finishMin}
            describedBy={finishError ? "targetCompletionDate-error" : undefined}
            onChange={(value) => onChange({ start, finish: value })}
          />
        ) : finish ? (
          <p className="mt-2 text-xs text-white/55">Finishes around {formatLongDate(finish)}</p>
        ) : lengthChoice && !start ? (
          <p className="mt-2 text-xs text-white/55">Choose a start first, and the finish date follows.</p>
        ) : null}
        {finishError ? (
          <p id="targetCompletionDate-error" className="mt-2 text-xs text-red-300">
            {finishError}
          </p>
        ) : null}
      </fieldset>

      {summary ? (
        <p className="flex items-center gap-2 rounded-xl border border-white/10 bg-void/60 px-4 py-3 text-sm text-white/80">
          <CalendarBlankIcon className="h-4 w-4 shrink-0 text-white/50" aria-hidden="true" />
          {summary}
        </p>
      ) : null}
    </div>
  );
}

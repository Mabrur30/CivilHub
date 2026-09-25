import { type ReactElement } from "react";
import {
  describeTakaInWords,
  formatTaka,
  MONEY_EXAMPLES,
  parseMoney,
} from "../../../lib/money";
import { inputClassName } from "./buttonStyles";

interface MoneyInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Extra ids for aria-describedby, e.g. a field error. */
  describedBy?: string;
  invalid?: boolean;
  autoFocus?: boolean;
  className?: string;
}

// A text box that accepts "50k", "25 lakh" or "1.5 crore" as well as plain
// digits, and repeats back what it understood so nobody miscounts zeros.
export function MoneyInput({
  id,
  value,
  onChange,
  describedBy,
  invalid = false,
  autoFocus = false,
  className = "",
}: MoneyInputProps): ReactElement {
  const readbackId = `${id}-readback`;
  const parsed = parseMoney(value);
  const words = parsed.value !== null ? describeTakaInWords(parsed.value) : null;

  return (
    <>
      <div className="relative">
        <span
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-white/45"
          aria-hidden="true"
        >
          ৳
        </span>
        <input
          id={id}
          type="text"
          inputMode="text"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoFocus={autoFocus}
          aria-invalid={invalid || Boolean(parsed.error)}
          aria-describedby={[readbackId, describedBy].filter(Boolean).join(" ")}
          className={`${inputClassName} pl-9 tabular-nums ${
            invalid || parsed.error ? "border-rose-400/60!" : ""
          } ${className}`}
        />
      </div>
      <p
        id={readbackId}
        aria-live="polite"
        className={`text-xs ${parsed.error ? "text-rose-300" : "text-white/50"}`}
      >
        {parsed.error
          ? parsed.error
          : parsed.value !== null
            ? `${formatTaka(parsed.value)}${words ? `, that's ${words}` : ""}`
            : `You can type ${MONEY_EXAMPLES}`}
      </p>
    </>
  );
}

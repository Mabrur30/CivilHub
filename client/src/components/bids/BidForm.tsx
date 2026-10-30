import { type FormEvent, type ReactElement, useState } from "react";
import {
  inputClassName,
  primaryButtonBaseClassName,
} from "../dashboard/ui/buttonStyles";
import { MoneyInput } from "../dashboard/ui/MoneyInput";
import { RequiredMark } from "../dashboard/ui/RequiredMark";
import { moneyValue } from "../../lib/money";

export interface BidFormValues {
  amount: string;
  message: string;
}

interface BidFormProps {
  initialValues: BidFormValues;
  clientName: string;
  submitLabel: string;
  busyLabel: string;
  error: string;
  isBusy: boolean;
  onSubmit: (values: { amount: number; message: string }) => void;
}

export function BidForm({
  initialValues,
  clientName,
  submitLabel,
  busyLabel,
  error,
  isBusy,
  onSubmit,
}: BidFormProps): ReactElement {
  const [values, setValues] = useState<BidFormValues>(initialValues);
  const [validationError, setValidationError] = useState<string>("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const amount = moneyValue(values.amount) ?? Number.NaN;
    if (!Number.isFinite(amount) || amount <= 0) {
      setValidationError("Enter a price greater than zero.");
      return;
    }
    if (!values.message.trim()) {
      setValidationError("Add a short message for the client.");
      return;
    }
    setValidationError("");
    onSubmit({ amount, message: values.message.trim() });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
      <div className="grid gap-2">
        <label htmlFor="bid-amount" className="text-sm font-semibold text-white/80">
          Your price
          <RequiredMark />
        </label>
        <MoneyInput
          id="bid-amount"
          value={values.amount}
          onChange={(amount) => setValues({ ...values, amount })}
          describedBy={error || validationError ? "bid-error" : undefined}
          autoFocus
        />
      </div>
      <div className="grid gap-2">
        <label htmlFor="bid-message" className="text-sm font-semibold text-white/80">
          Message to {clientName}
          <RequiredMark />
        </label>
        <textarea
          id="bid-message"
          rows={4}
          value={values.message}
          onChange={(event) => setValues({ ...values, message: event.target.value })}
          aria-describedby={error || validationError ? "bid-message-help bid-error" : "bid-message-help"}
          className={`${inputClassName} resize-none`}
        />
        <p id="bid-message-help" className="text-xs text-white/45">
          Why your team fits, your approach and a rough timeline.
        </p>
      </div>
      {error || validationError ? (
        <p id="bid-error" role="alert" className="text-sm text-rose-300">
          {error || validationError}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isBusy}
        className={`${primaryButtonBaseClassName} w-full`}
      >
        {isBusy ? busyLabel : submitLabel}
      </button>
    </form>
  );
}

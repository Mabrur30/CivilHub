import { type ReactElement, type ReactNode } from "react";
import {
  dangerButtonClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "./buttonStyles";
import { Dialog } from "./Dialog";

/**
 * Asks before an action, in place of window.confirm. Stays open while
 * `isBusy` so the caller can show an error without losing the dialog.
 */
export function ConfirmDialog({
  title,
  description,
  children,
  confirmLabel,
  busyLabel,
  tone = "default",
  isBusy = false,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  description?: ReactNode;
  /** Extra detail under the description, such as a list of consequences. */
  children?: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  tone?: "danger" | "default";
  isBusy?: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}): ReactElement {
  return (
    <Dialog title={title} description={description} onClose={onClose} isBusy={isBusy}>
      {children ? <div className="text-sm leading-6 text-white/70">{children}</div> : null}
      {error ? (
        <p role="alert" className="mt-4 text-sm text-rose-300">
          {error}
        </p>
      ) : null}
      <div className={`flex flex-wrap justify-end gap-2 ${children || error ? "mt-6" : ""}`}>
        <button
          type="button"
          onClick={onClose}
          disabled={isBusy}
          className={secondaryButtonClassName}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isBusy}
          className={tone === "danger" ? dangerButtonClassName : primaryButtonClassName}
        >
          {isBusy ? (busyLabel ?? `${confirmLabel}...`) : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

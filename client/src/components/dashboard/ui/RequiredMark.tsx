import { type ReactElement } from "react";

/**
 * Orange asterisk after a required field's label. Screen readers hear
 * "required" instead of "star"; pass `announce={false}` when the control
 * already carries a native `required`, which they announce on their own.
 */
export function RequiredMark({
  announce = true,
}: {
  announce?: boolean;
}): ReactElement {
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 text-primary">
        *
      </span>
      {announce ? <span className="sr-only"> (required)</span> : null}
    </>
  );
}

/** One line at the top of a form that says what the asterisk means. */
export function RequiredLegend({
  className = "",
}: {
  className?: string;
}): ReactElement {
  return (
    <p className={`text-xs text-white/50 ${className}`}>
      Fields marked <span className="font-semibold text-primary">*</span> are
      required.
    </p>
  );
}

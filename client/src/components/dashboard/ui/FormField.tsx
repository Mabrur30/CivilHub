import { type ReactElement, type ReactNode } from "react";

interface FormFieldProps {
  id: string;
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}

// Label above, optional hint below, so no field ever relies on its placeholder
// to say what it is.
export function FormField({
  id,
  label,
  hint,
  className = "",
  children,
}: FormFieldProps): ReactElement {
  return (
    <div className={`grid content-start gap-2 ${className}`}>
      <label htmlFor={id} className="text-sm font-semibold text-white/80">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-white/45">{hint}</p> : null}
    </div>
  );
}

import { type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

interface BackButtonProps {
  to: string;
  label: string;
  className?: string;
  replace?: boolean;
}

export function BackButton({
  to,
  label,
  className = "",
  replace = false,
}: BackButtonProps): ReactElement {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate(to, { replace })}
      className={`inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors duration-200 hover:text-glow focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-glow ${className}`}
    >
      <span aria-hidden="true">&larr;</span>
      <span>{label}</span>
    </button>
  );
}

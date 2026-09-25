import { type ReactElement } from "react";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { setTheme, useTheme } from "../lib/theme";

interface ThemeToggleProps {
  className?: string;
}

// Sized and styled to sit beside the header's alert buttons. The icon shows the
// theme you'd switch to, and the label says so for screen readers.
export function ThemeToggle({
  className = "",
}: ThemeToggleProps): ReactElement {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-primary hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow ${className}`}
    >
      {next === "light" ? (
        <SunIcon className="h-5 w-5" aria-hidden="true" />
      ) : (
        <MoonIcon className="h-5 w-5" aria-hidden="true" />
      )}
    </button>
  );
}

import { type ReactElement } from "react";

export interface FilterTabOption<Key extends string> {
  key: Key;
  label: string;
  count?: number;
}

interface FilterTabsProps<Key extends string> {
  options: FilterTabOption<Key>[];
  value: Key;
  onChange: (key: Key) => void;
  label: string;
  className?: string;
}

// Quiet toggle buttons for narrowing a list in place. The selected option gets a
// soft fill rather than the orange accent, which stays reserved for actions.
export function FilterTabs<Key extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
}: FilterTabsProps<Key>): ReactElement {
  return (
    <div
      className={`flex flex-wrap gap-1 ${className}`}
      role="group"
      aria-label={label}
    >
      {options.map((option) => {
        const isActive = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow ${
              isActive
                ? "bg-white/10 text-white"
                : "text-white/55 hover:text-white"
            }`}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="ml-1.5 tabular-nums text-white/40">
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

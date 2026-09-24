import { type ReactElement } from "react";
import { clampPercentage } from "../../../lib/projectProgress";

interface ProgressBarProps {
  value: number;
  label: string;
}

export function ProgressBar({ value, label }: ProgressBarProps): ReactElement {
  const progress = clampPercentage(value);

  return (
    <div className="flex items-center gap-3">
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label={label}
      >
        <div
          className="progress-grow h-full rounded-full bg-primary"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="w-10 text-right text-xs font-semibold tabular-nums text-white/60">
        {progress}%
      </span>
    </div>
  );
}

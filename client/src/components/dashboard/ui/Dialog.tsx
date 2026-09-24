import { XIcon } from "@phosphor-icons/react";
import { type ReactElement, type ReactNode, useEffect, useId } from "react";

interface DialogProps {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  /** While true, Escape, the backdrop and the close button do nothing. */
  isBusy?: boolean;
  size?: "md" | "lg";
  children: ReactNode;
}

export function Dialog({
  title,
  description,
  onClose,
  isBusy = false,
  size = "md",
  children,
}: DialogProps): ReactElement {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !isBusy) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isBusy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy) onClose();
      }}
    >
      <div
        className={`max-h-[94dvh] w-full overflow-y-auto rounded-2xl border border-white/10 bg-surface p-6 sm:p-8 ${
          size === "lg" ? "max-w-2xl" : "max-w-lg"
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="font-heading text-2xl font-bold text-white"
            >
              {title}
            </h2>
            {description ? (
              <div id={descriptionId} className="mt-1 text-sm text-white/55">
                {description}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            disabled={isBusy}
            onClick={onClose}
            className="-mr-2 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow disabled:opacity-40"
          >
            <XIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

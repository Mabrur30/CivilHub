import { XIcon } from "@phosphor-icons/react";
import { type ReactElement, type ReactNode, useEffect, useId, useRef } from "react";

const FOCUSABLE =
  "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";

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
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus moves into the dialog when it opens (its first field, else the
  // dialog itself) and back to what opened it when it closes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const firstField = panel?.querySelector<HTMLElement>("input:not([disabled]), textarea:not([disabled]), select:not([disabled])");
    (firstField ?? panel)?.focus();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    const handleKeys = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !isBusy) onClose();
      // Tab stays inside the dialog, so keyboard users can't wander into the page behind it.
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panelRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeys);
    return () => document.removeEventListener("keydown", handleKeys);
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
        className={`max-h-[94dvh] w-full overflow-y-auto rounded-2xl border border-white/10 bg-surface p-6 outline-none sm:p-8 ${
          size === "lg" ? "max-w-2xl" : "max-w-lg"
        }`}
        ref={panelRef}
        tabIndex={-1}
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

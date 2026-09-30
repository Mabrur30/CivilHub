import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
} from "react";
import { type EngineerTask, type OpenRequest } from "./engineerProfile";

/** One card on the engineer profile: heading, optional action, body. */
export function SectionCard({
  id,
  title,
  action,
  sectionRef,
  className = "",
  style,
  children,
}: {
  id: string;
  title: string;
  action?: ReactNode;
  sectionRef?: RefObject<HTMLElement | null>;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}): ReactElement {
  return (
    <section
      ref={sectionRef}
      aria-labelledby={`${id}-heading`}
      className={`scroll-mt-24 rounded-2xl border border-white/10 bg-surface p-6 ${className}`}
      style={style}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${id}-heading`} className="font-heading text-2xl font-bold text-white">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export const textActionClassName =
  "rounded text-xs font-semibold text-primary transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow disabled:opacity-50";

export const quietActionClassName =
  "rounded text-xs font-semibold text-white/50 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow disabled:opacity-50";

export const removeActionClassName =
  "rounded text-xs font-semibold text-white/50 transition-colors hover:text-rose-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow disabled:opacity-50";

export const emptyAddClassName =
  "mt-4 rounded-xl border border-dashed border-white/20 px-4 py-3 text-sm font-semibold text-white/70 transition-colors hover:border-primary hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow";

export const saveButtonClassName =
  "rounded-full bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-glow disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow";

export const fieldLabelClassName = "text-xs font-semibold text-white/60";

export function FormError({ message }: { message: string }): ReactElement | null {
  if (!message) return null;
  return (
    <p className="text-xs text-rose-300" role="alert">
      {message}
    </p>
  );
}

/**
 * Opens a section when the profile checklist asks for one of its tasks, and
 * scrolls it into view. Returns the ref to put on the section.
 */
export function useOpenRequest(
  openRequest: OpenRequest | null,
  tasks: EngineerTask[],
  onOpen: (task: EngineerTask) => void,
): RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement | null>(null);
  // Each request is handled once, however often the effect re-runs.
  const handledNonce = useRef<number | null>(null);

  useEffect(() => {
    if (!openRequest || handledNonce.current === openRequest.nonce) return;
    if (!tasks.includes(openRequest.task)) return;
    handledNonce.current = openRequest.nonce;
    onOpen(openRequest.task);
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [openRequest, tasks, onOpen]);

  return ref;
}

import { type ReactElement, type ReactNode } from "react";
import { panelClassName, retryButtonClassName } from "./buttonStyles";

interface ErrorPanelProps {
  message: string;
  onRetry: () => void;
}

export function ErrorPanel({
  message,
  onRetry,
}: ErrorPanelProps): ReactElement {
  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border border-red-400/20 bg-red-400/5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
      role="alert"
    >
      <p className="text-sm text-red-200">{message}</p>
      <button type="button" onClick={onRetry} className={retryButtonClassName}>
        Try again
      </button>
    </section>
  );
}

interface EmptyPanelProps {
  title: string;
  body: string;
  action?: ReactNode;
}

export function EmptyPanel({
  title,
  body,
  action,
}: EmptyPanelProps): ReactElement {
  return (
    <section className={`${panelClassName} px-6 py-12 sm:px-10`}>
      <h2 className="font-heading text-2xl font-bold text-white">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-white/55">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  );
}

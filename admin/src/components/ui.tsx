import { XIcon } from "@phosphor-icons/react";
import { type ReactElement, type ReactNode, useEffect, useId, useState } from "react";
import { type AccountStatus } from "../lib/api";
import { statusLabel } from "../lib/format";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow";

export const primaryButton = `inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-glow disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;
export const secondaryButton = `inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:border-white/40 hover:text-white disabled:opacity-50 ${focusRing}`;
export const dangerButton = `inline-flex items-center justify-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-[#fff] transition-colors hover:bg-rose-700 disabled:opacity-60 ${focusRing}`;
export const panel = "rounded-2xl border border-white/10 bg-surface";

export function PageHeader({ title, intro, action }: { title: string; intro?: string; action?: ReactNode }): ReactElement {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-heading text-3xl font-bold text-white">{title}</h1>
        {intro ? <p className="mt-1 max-w-[70ch] text-sm text-white/60">{intro}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function StatusBadge({ status, until }: { status: AccountStatus; until: string | null }): ReactElement {
  const tone =
    status === "active"
      ? "border-emerald-300/30 text-emerald-300"
      : status === "banned"
        ? "border-rose-300/40 bg-rose-400/10 text-rose-300"
        : "border-amber-300/40 bg-amber-300/10 text-amber-300";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      {statusLabel(status, until)}
    </span>
  );
}

export function ErrorNote({ message }: { message: string }): ReactElement | null {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl border border-rose-400/25 bg-rose-400/5 px-4 py-3 text-sm text-rose-300">
      {message}
    </p>
  );
}

export function Loading({ label = "Loading..." }: { label?: string }): ReactElement {
  return <p className="py-10 text-center text-sm text-white/50">{label}</p>;
}

export function Pager({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}): ReactElement | null {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm text-white/60">
      <span>
        Page {page} of {pages} · {total} total
      </span>
      <div className="flex gap-2">
        <button type="button" className={secondaryButton} disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </button>
        <button type="button" className={secondaryButton} disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next
        </button>
      </div>
    </nav>
  );
}

/** The dialog frame: backdrop, title, close button, Escape to close. */
export function Modal({
  title,
  description,
  isBusy,
  onClose,
  children,
}: {
  title: string;
  description?: ReactNode;
  isBusy: boolean;
  onClose: () => void;
  children: ReactNode;
}): ReactElement {
  const titleId = useId();
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !isBusy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isBusy, onClose]);

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={`${panel} max-h-[92dvh] w-full max-w-lg overflow-y-auto p-6`}>
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-heading text-2xl font-bold text-white">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            disabled={isBusy}
            onClick={onClose}
            className={`-mr-2 rounded-full p-2 text-white/50 hover:bg-white/5 hover:text-white ${focusRing}`}
          >
            <XIcon aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        {description ? <div className="mt-2 text-sm leading-6 text-white/65">{description}</div> : null}
        {children}
      </div>
    </div>
  );
}

/**
 * Confirms an action that changes something for a real person. A reason is
 * always required, because it goes in the log (and, for suspensions, is
 * shown to them at sign-in).
 */
export function ReasonDialog({
  title,
  description,
  confirmLabel,
  danger = false,
  askDays = false,
  onConfirm,
  onClose,
}: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** Asks how many days, for suspensions. */
  askDays?: boolean;
  onConfirm: (input: { reason: string; days?: number }) => Promise<void>;
  onClose: () => void;
}): ReactElement {
  const [reason, setReason] = useState<string>("");
  const [days, setDays] = useState<string>("7");
  const [error, setError] = useState<string>("");
  const [isBusy, setIsBusy] = useState<boolean>(false);

  const submit = async (): Promise<void> => {
    if (!reason.trim()) {
      setError("Give a reason. It goes in the log.");
      return;
    }
    const dayCount = Number(days);
    if (askDays && (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 365)) {
      setError("Choose between 1 and 365 days.");
      return;
    }
    setIsBusy(true);
    setError("");
    try {
      await onConfirm({ reason: reason.trim(), days: askDays ? dayCount : undefined });
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      setIsBusy(false);
    }
  };

  return (
    <Modal title={title} description={description} isBusy={isBusy} onClose={onClose}>
      <div className="mt-5 grid gap-4">
        {askDays ? (
          <label className="grid gap-1.5 text-sm font-semibold text-white/80">
            How many days
            <input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(event) => setDays(event.target.value)}
              className="form-input w-32"
            />
          </label>
        ) : null}
        <label className="grid gap-1.5 text-sm font-semibold text-white/80">
          Reason
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={500}
            className="form-input font-normal"
            autoFocus
          />
        </label>
        <ErrorNote message={error} />
      </div>
      <DialogActions
        isBusy={isBusy}
        confirmLabel={confirmLabel}
        danger={danger}
        onCancel={onClose}
        onConfirm={() => void submit()}
      />
    </Modal>
  );
}

export function DialogActions({
  isBusy,
  confirmLabel,
  danger = false,
  onCancel,
  onConfirm,
}: {
  isBusy: boolean;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): ReactElement {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <button type="button" className={secondaryButton} disabled={isBusy} onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        className={danger ? dangerButton : primaryButton}
        disabled={isBusy}
        onClick={onConfirm}
      >
        {isBusy ? "Working..." : confirmLabel}
      </button>
    </div>
  );
}

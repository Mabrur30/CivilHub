import { type ReactElement, type ReactNode } from "react";

export interface MockFrameProps {
  eyebrow: string;
  title: string;
  status?: string;
  statusTone?: "primary" | "positive";
  children: ReactNode;
}

/**
 * The shared shell for every How It Works mockup — the same double-bordered,
 * blurred card the hero uses for the Northline project, so the illustrations on
 * the page read as the product rather than as generic marketing art.
 *
 * Mockups are decorative: every caller marks the frame aria-hidden, because the
 * adjacent copy already carries the meaning.
 */
export function MockFrame({
  eyebrow,
  title,
  status,
  statusTone = "primary",
  children,
}: MockFrameProps): ReactElement {
  const statusClass =
    statusTone === "positive"
      ? "bg-emerald-400/15 text-emerald-300"
      : "bg-primary/15 text-primary";

  return (
    <div className="relative rounded-[32px] border border-white/10 bg-white/5 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.26)] backdrop-blur-sm sm:p-5">
      <div className="rounded-[24px] border border-white/10 bg-[#101011] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-white/45">
              {eyebrow}
            </p>
            <h3 className="mt-2 font-heading text-xl text-white sm:text-2xl">
              {title}
            </h3>
          </div>
          {status ? (
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}
            >
              {status}
            </span>
          ) : null}
        </div>

        <div className="mt-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

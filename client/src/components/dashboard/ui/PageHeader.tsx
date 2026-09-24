import { type ReactElement, type ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  summary: string;
  action?: ReactNode;
}

// Every dashboard page opens the same way: the page name, one sentence built
// from the page's real numbers, and at most one action that carries its own
// weight. No eyebrow above the title; the tab bar already says where you are.
export function PageHeader({
  title,
  summary,
  action,
}: PageHeaderProps): ReactElement {
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">{summary}</p>
      </div>
      {action ?? null}
    </div>
  );
}

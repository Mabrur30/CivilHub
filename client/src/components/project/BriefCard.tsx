import { MapPinIcon } from "@phosphor-icons/react";
import { type ReactElement, type ReactNode } from "react";
import { panelClassName } from "../dashboard/ui/buttonStyles";

interface BriefCardProps {
  category: string;
  posted: string;
  title: string;
  client: ReactNode;
  description: string;
  budget: string;
  location: string;
  timeline: string;
  /** Actions under the details, such as the marketplace's bid button. */
  footer?: ReactNode;
  /** A heading in lists; a plain paragraph inside the post-project preview. */
  titleAs?: "h2" | "p";
}

/**
 * A project brief as engineers meet it. The client's "How engineers will see
 * it" preview and the marketplace both render this, so what a client previews
 * is exactly what engineers get. Every prop arrives display-ready.
 */
export function BriefCard({
  category,
  posted,
  title,
  client,
  description,
  budget,
  location,
  timeline,
  footer,
  titleAs: Title = "p",
}: BriefCardProps): ReactElement {
  return (
    <div className={`${panelClassName} flex h-full flex-col p-5 sm:p-6`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <span className="rounded-full bg-white/5 px-2.5 py-1 font-semibold text-white/70">
          {category}
        </span>
        <span className="text-white/40">{posted}</span>
      </div>
      <Title className="mt-3 font-heading text-2xl font-bold text-white">
        {title}
      </Title>
      <p className="mt-1 text-sm text-white/55">{client}</p>
      <p className="mb-5 mt-3 line-clamp-4 whitespace-pre-line text-sm leading-6 text-white/60">
        {description}
      </p>
      <dl className="mt-auto grid gap-3 border-t border-white/10 pt-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="shrink-0 text-white/45">Budget</dt>
          <dd className="text-right font-semibold tabular-nums text-white/90">
            {budget}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="shrink-0 text-white/45">Where</dt>
          <dd className="flex items-center gap-1.5 text-right text-white/80">
            <MapPinIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {location}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="shrink-0 text-white/45">When</dt>
          <dd className="text-right text-white/80">{timeline}</dd>
        </div>
      </dl>
      {footer ? <div className="mt-5">{footer}</div> : null}
    </div>
  );
}

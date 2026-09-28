import { ArrowSquareOutIcon, LockSimpleIcon, MapPinIcon } from "@phosphor-icons/react";
import { type ReactElement } from "react";
import { type ProjectCriteriaSpec } from "../../lib/projectCriteria";
import {
  type PrivateSite,
  type PublicSite,
  googleMapsUrl,
  isPrivateSite,
  siteLabel,
} from "../../lib/siteDetails";
import { panelClassName, secondaryButtonClassName } from "../dashboard/ui/buttonStyles";
import { SiteMap } from "../map/LazySiteMap";

const labelsFor = (
  options: ProjectCriteriaSpec["siteOptions"][keyof ProjectCriteriaSpec["siteOptions"]] | undefined,
  values: string[],
): string =>
  values
    .map((value) => options?.find((option) => option.value === value)?.label ?? value)
    .join(", ");

/**
 * Where the site is. Everyone sees the approximate area; the client and the
 * hired engineer see the pin, the address, directions and a Google Maps link.
 */
export function SiteDetailsPanel({
  site,
  siteOptions,
  headingId,
}: {
  site: PublicSite | PrivateSite;
  siteOptions?: ProjectCriteriaSpec["siteOptions"];
  headingId: string;
}): ReactElement {
  const exact = isPrivateSite(site);
  const facts = [
    { label: "District", value: `${site.district}, ${site.division} division` },
    {
      label: "Vehicle access",
      value: site.vehicleAccess ? labelsFor(siteOptions?.vehicleAccess, [site.vehicleAccess]) : "",
    },
    { label: "Connections at the site", value: labelsFor(siteOptions?.utilities, site.utilities) },
    {
      label: "Documents the client has",
      value: labelsFor(siteOptions?.documentsAvailable, site.documentsAvailable),
    },
  ].filter((fact) => fact.value);

  return (
    <section aria-labelledby={headingId} className={`${panelClassName} grid gap-5 p-5 sm:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={headingId} className="font-heading text-2xl font-bold text-white">
            Site
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-white/60">
            <MapPinIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
            {siteLabel(site)}
          </p>
        </div>
        {exact ? (
          <a
            href={googleMapsUrl(site.exact)}
            target="_blank"
            rel="noreferrer"
            className={secondaryButtonClassName}
          >
            Directions in Google Maps
            <ArrowSquareOutIcon aria-hidden="true" className="h-4 w-4" />
          </a>
        ) : null}
      </div>

      {exact ? (
        <SiteMap mode="exact" value={site.exact} label={`Site pin at ${siteLabel(site)}`} />
      ) : (
        <SiteMap
          mode="approx"
          value={site.approx}
          radiusM={site.radiusM}
          label={`Approximate area around ${siteLabel(site)}`}
        />
      )}

      {exact ? (
        site.addressLine || site.directions ? (
          <dl className="grid gap-3 rounded-xl border border-white/10 bg-void/40 p-4 text-sm">
            {site.addressLine ? (
              <div className="grid gap-0.5">
                <dt className="text-xs font-semibold text-white/45">Address</dt>
                <dd className="text-white/85">{site.addressLine}</dd>
              </div>
            ) : null}
            {site.directions ? (
              <div className="grid gap-0.5">
                <dt className="text-xs font-semibold text-white/45">Directions</dt>
                <dd className="whitespace-pre-line text-white/85">{site.directions}</dd>
              </div>
            ) : null}
          </dl>
        ) : null
      ) : (
        <p className="flex items-start gap-2 text-sm text-white/55">
          <LockSimpleIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          The shaded area is about {Math.round((site.radiusM * 2) / 100) / 10} km across. The
          exact location, address and directions are shared with the engineer the client hires.
        </p>
      )}

      {facts.length > 0 ? (
        <dl className="grid gap-2.5 text-sm">
          {facts.map((fact) => (
            <div key={fact.label} className="flex justify-between gap-4 border-b border-white/5 pb-2.5 last:border-b-0">
              <dt className="shrink-0 text-white/50">{fact.label}</dt>
              <dd className="text-right text-white/85">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

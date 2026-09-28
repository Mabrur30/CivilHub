import { lazy, type ReactElement, Suspense } from "react";
import type { SiteMapProps } from "./SiteMap";

// Leaflet only loads on pages that actually show a map.
const SiteMapImpl = lazy(() => import("./SiteMap"));

export function SiteMap(props: SiteMapProps): ReactElement {
  return (
    <Suspense
      fallback={
        <div
          aria-hidden="true"
          className={`animate-pulse rounded-xl border border-white/10 bg-white/5 ${props.className ?? "h-72"}`}
        />
      }
    >
      <SiteMapImpl {...props} />
    </Suspense>
  );
}

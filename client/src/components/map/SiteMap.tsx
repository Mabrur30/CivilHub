import "leaflet/dist/leaflet.css";
import L, { type LeafletMouseEvent } from "leaflet";
import { type ReactElement, useEffect, useMemo } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { useTheme } from "../../lib/theme";
import { DEFAULT_MAP_CENTER, type LatLng } from "../../lib/siteDetails";

export type SiteMapProps =
  | {
      mode: "pick";
      /** The pin, or null before the client has placed one. */
      value: LatLng | null;
      onPick: (point: LatLng) => void;
      label: string;
      className?: string;
    }
  | {
      mode: "exact";
      value: LatLng;
      label: string;
      className?: string;
    }
  | {
      mode: "approx";
      value: LatLng;
      radiusM: number;
      label: string;
      className?: string;
    };

// Standard OpenStreetMap tiles need no key. Dark mode darkens them with a CSS
// filter (.site-map[data-theme-map="dark"] in index.css) rather than a second,
// keyed tile provider.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// A CSS pin (see .site-pin in index.css) so it takes the theme's primary
// colour and needs no marker images from the bundle.
const pinIcon = L.divIcon({
  className: "site-pin",
  html: "<span></span>",
  iconSize: [28, 28],
  // The rotated square's point sits ~20px below its centre.
  iconAnchor: [14, 34],
});

/** Follows the pin when it moves from outside the map, e.g. a search result. */
function FollowPoint({ point, zoom }: { point: LatLng | null; zoom: number }): null {
  const map = useMap();
  useEffect(() => {
    if (!point) return;
    const current = map.getCenter();
    if (map.distance(current, point) > 30) {
      map.flyTo(point, Math.max(map.getZoom(), zoom), { duration: 0.6 });
    }
  }, [map, point, zoom]);
  return null;
}

/**
 * Leaflet measures its box once. Lazy loading, sticky columns and fonts
 * settling can resize it afterwards, which leaves grey, untiled strips, so
 * it is re-measured whenever the box changes.
 */
function KeepSized(): null {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

/** Frames the whole approximate area, whatever the map's size. */
function FitCircle({ center, radiusM }: { center: LatLng; radiusM: number }): null {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(L.latLng(center).toBounds(radiusM * 2.4));
  }, [map, center, radiusM]);
  return null;
}

function PickOnClick({ onPick }: { onPick: (point: LatLng) => void }): null {
  useMapEvents({
    click: (event: LeafletMouseEvent) =>
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng }),
  });
  return null;
}

/** The OpenStreetMap map used to pin a site and to show it on briefs. */
export default function SiteMap(props: SiteMapProps): ReactElement {
  const theme = useTheme();
  const center = props.value ?? DEFAULT_MAP_CENTER;
  // An approximate area is shown whole; an exact pin close enough to see the plot.
  const zoom = props.mode === "approx" ? 15 : props.value ? 17 : 12;

  const onPick = props.mode === "pick" ? props.onPick : null;
  const markerHandlers = useMemo(
    () =>
      onPick
        ? {
            dragend: (event: L.DragEndEvent) => {
              const { lat, lng } = (event.target as L.Marker).getLatLng();
              onPick({ lat, lng });
            },
          }
        : undefined,
    [onPick],
  );

  return (
    <div
      role="region"
      aria-label={props.label}
      data-theme-map={theme}
      className={`site-map overflow-hidden rounded-xl border border-white/10 ${props.className ?? "h-72"}`}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={props.mode === "pick"}
        className="h-full w-full"
      >
        <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} maxZoom={19} />
        <KeepSized />
        {props.mode === "approx" ? (
          <>
            <Circle
              center={props.value}
              radius={props.radiusM}
              pathOptions={{ className: "site-area" }}
            />
            <FitCircle center={props.value} radiusM={props.radiusM} />
          </>
        ) : props.value ? (
          <Marker
            position={props.value}
            icon={pinIcon}
            draggable={props.mode === "pick"}
            eventHandlers={markerHandlers}
            keyboard={false}
          />
        ) : null}
        {props.mode === "pick" ? (
          <>
            <PickOnClick onPick={props.onPick} />
            <FollowPoint point={props.value} zoom={17} />
          </>
        ) : null}
      </MapContainer>
    </div>
  );
}

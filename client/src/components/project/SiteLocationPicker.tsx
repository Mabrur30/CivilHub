import { CrosshairIcon, MagnifyingGlassIcon, MapPinIcon } from "@phosphor-icons/react";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { type BdDistrict } from "../../lib/projectCriteria";
import { SITE_FIELD_IDS, type SiteErrors, type SiteFormValue } from "../../lib/projectForm";
import { type LatLng } from "../../lib/siteDetails";
import { inputClassName, rowButtonClassName } from "../dashboard/ui/buttonStyles";
import { SiteMap } from "../map/LazySiteMap";
import { API_BASE_URL } from "../../lib/apiBase";

interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
  district: string | null;
  area: string | null;
}

const isGeocodeResult = (value: unknown): value is GeocodeResult =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as GeocodeResult).lat === "number" &&
  typeof (value as GeocodeResult).lng === "number" &&
  typeof (value as GeocodeResult).label === "string";

interface SiteLocationPickerProps {
  value: SiteFormValue;
  districts: BdDistrict[];
  errors: SiteErrors;
  onChange: (patch: Partial<SiteFormValue>) => void;
}

const errorClass = (error?: string): string => (error ? "border-rose-400/60" : "");

/**
 * Finds the site by address search, the device's location or a tap on the
 * map, then fills in district and area from the pin. The client can correct
 * both, and once they have, a moved pin no longer overwrites them.
 */
export function SiteLocationPicker({
  value,
  districts,
  errors,
  onChange,
}: SiteLocationPickerProps): ReactElement {
  const [query, setQuery] = useState<string>("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "searching" | "empty" | "error">("idle");
  const [locating, setLocating] = useState<boolean>(false);
  const [locateError, setLocateError] = useState<string>("");
  // Set once the client edits district or area by hand.
  const editedByHand = useRef<boolean>(Boolean(value.district || value.area));
  const lookupId = useRef<number>(0);

  const q = query.trim();
  const isSearch = q.length >= 3;
  // Short queries show nothing, whatever an earlier search left behind.
  const shownResults = isSearch ? results : [];
  const shownState = isSearch ? searchState : "idle";

  useEffect(() => {
    if (!isSearch) return;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setSearchState("searching");
      fetch(`${API_BASE_URL}/api/geo/search?q=${encodeURIComponent(q)}`, {
        credentials: "include",
        signal: controller.signal,
      })
        .then(async (response) => {
          const body: unknown = await response.json();
          if (!response.ok || !Array.isArray(body)) throw new Error("search");
          const places = body.filter(isGeocodeResult);
          setResults(places);
          setSearchState(places.length > 0 ? "idle" : "empty");
        })
        .catch((error: unknown) => {
          if ((error as Error).name !== "AbortError") setSearchState("error");
        });
    }, 400);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [isSearch, q]);

  const fillFromPlace = (place: Pick<GeocodeResult, "district" | "area">): void => {
    if (editedByHand.current) return;
    onChange({
      ...(place.district ? { district: place.district } : {}),
      ...(place.area ? { area: place.area } : {}),
    });
  };

  const pinAt = (point: LatLng): void => {
    onChange({ point });
    const id = ++lookupId.current;
    fetch(`${API_BASE_URL}/api/geo/reverse?lat=${point.lat}&lng=${point.lng}`, {
      credentials: "include",
    })
      .then(async (response) => {
        const body: unknown = await response.json();
        // Only the latest pin's answer counts when the pin moves quickly.
        if (response.ok && isGeocodeResult(body) && id === lookupId.current) {
          fillFromPlace(body);
        }
      })
      .catch(() => {
        // The pin still stands; the client fills district and area in by hand.
      });
  };

  const chooseResult = (place: GeocodeResult): void => {
    lookupId.current += 1;
    onChange({ point: { lat: place.lat, lng: place.lng } });
    fillFromPlace(place);
    setQuery("");
    setResults([]);
  };

  const useMyLocation = (): void => {
    if (!("geolocation" in navigator)) {
      setLocateError("This browser can't share its location.");
      return;
    }
    setLocating(true);
    setLocateError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        pinAt({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        setLocating(false);
        setLocateError("Couldn't get your location. Search or tap the map instead.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const statusId = "siteSearch-status";

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <label htmlFor={SITE_FIELD_IDS.point} className="text-sm font-semibold text-white/80">
          Find the site
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <MagnifyingGlassIcon
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
            />
            <input
              id={SITE_FIELD_IDS.point}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Road, area or landmark, e.g. Mirpur 10"
              autoComplete="off"
              aria-describedby={statusId}
              aria-invalid={Boolean(errors.point)}
              className={`${inputClassName} pl-10 ${errorClass(errors.point)}`}
            />
          </div>
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className={`${rowButtonClassName} justify-center py-3`}
          >
            <CrosshairIcon aria-hidden="true" className="h-4 w-4" />
            {locating ? "Locating…" : "Use my location"}
          </button>
        </div>
        <p id={statusId} role="status" className="text-xs leading-5 text-white/45">
          {shownState === "searching"
            ? "Searching…"
            : shownState === "empty"
              ? "No places found. Try a nearby road or landmark, or tap the map."
              : shownState === "error"
                ? "Search isn't available right now. Tap the map to place the pin."
                : "Search, then drag the pin onto the exact plot. You can also tap the map."}
        </p>
        {shownResults.length > 0 ? (
          <ul
            aria-label="Places found"
            className="grid overflow-hidden rounded-xl border border-white/10 bg-void"
          >
            {shownResults.map((place) => (
              <li key={`${place.lat},${place.lng}`} className="border-b border-white/5 last:border-b-0">
                <button
                  type="button"
                  onClick={() => chooseResult(place)}
                  className="flex w-full items-start gap-2 px-4 py-3 text-left text-sm text-white/75 transition-colors hover:bg-white/5 hover:text-white focus-visible:bg-white/5 focus-visible:outline-none"
                >
                  <MapPinIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="line-clamp-2">{place.label}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {locateError ? <p className="text-xs text-rose-300">{locateError}</p> : null}
      </div>

      <SiteMap
        mode="pick"
        value={value.point}
        onPick={pinAt}
        label="Site map. Tap to place the pin, or drag it to adjust."
        className="h-80"
      />
      {errors.point ? (
        <p id={`${SITE_FIELD_IDS.point}-error`} className="-mt-3 text-xs text-rose-300">
          {errors.point}
        </p>
      ) : value.point ? (
        <p className="-mt-3 text-xs tabular-nums text-white/45">
          Pinned at {value.point.lat.toFixed(5)}, {value.point.lng.toFixed(5)}. Engineers see
          only a 500 m area until you hire one.
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <label htmlFor={SITE_FIELD_IDS.district} className="text-sm font-semibold text-white/80">
            District
          </label>
          <select
            id={SITE_FIELD_IDS.district}
            value={value.district}
            onChange={(event) => {
              editedByHand.current = true;
              onChange({ district: event.target.value });
            }}
            aria-invalid={Boolean(errors.district)}
            className={`${inputClassName} ${errorClass(errors.district)}`}
          >
            <option value="">Choose a district</option>
            {districts.map((district) => (
              <option key={district.name} value={district.name}>
                {district.name}
              </option>
            ))}
          </select>
          {errors.district ? <p className="text-xs text-rose-300">{errors.district}</p> : null}
        </div>
        <div className="grid content-start gap-2">
          <label htmlFor={SITE_FIELD_IDS.area} className="text-sm font-semibold text-white/80">
            Area, thana or upazila
          </label>
          <input
            id={SITE_FIELD_IDS.area}
            value={value.area}
            maxLength={120}
            onChange={(event) => {
              editedByHand.current = true;
              onChange({ area: event.target.value });
            }}
            aria-invalid={Boolean(errors.area)}
            className={`${inputClassName} ${errorClass(errors.area)}`}
          />
          {errors.area ? <p className="text-xs text-rose-300">{errors.area}</p> : null}
        </div>
      </div>

      <div className="grid gap-5 rounded-xl border border-white/10 bg-void/40 p-4 sm:p-5">
        <p className="text-xs font-semibold text-white/60">
          Only the engineer you hire sees these.
        </p>
        <div className="grid content-start gap-2">
          <label htmlFor="siteAddressLine" className="text-sm font-semibold text-white/80">
            House, road or holding number <span className="font-normal text-white/40">(optional)</span>
          </label>
          <input
            id="siteAddressLine"
            value={value.addressLine}
            maxLength={200}
            autoComplete="street-address"
            onChange={(event) => onChange({ addressLine: event.target.value })}
            className={inputClassName}
          />
        </div>
        <div className="grid content-start gap-2">
          <label htmlFor="siteDirections" className="text-sm font-semibold text-white/80">
            Directions and landmarks <span className="font-normal text-white/40">(optional)</span>
          </label>
          <textarea
            id="siteDirections"
            rows={3}
            value={value.directions}
            maxLength={500}
            onChange={(event) => onChange({ directions: event.target.value })}
            placeholder="e.g. Lane beside the mosque, green gate, ask for the caretaker"
            className={`${inputClassName} resize-y`}
          />
        </div>
      </div>
    </div>
  );
}

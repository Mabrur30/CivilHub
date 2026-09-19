import {
  type ChangeEvent,
  type ReactElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { EquipmentSectionTabs } from "../components/dashboard/EquipmentSectionTabs";
import { RatingBadge } from "../components/RatingBadge";
import {
  EQUIPMENT_CATEGORIES,
  fetchBrowseEquipmentListings,
  type EquipmentCategory,
  type EquipmentListing,
} from "./equipment.api";

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const LocationPin = (): ReactElement => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4 text-white/50"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M12 22s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const SearchIcon = (): ReactElement => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4 text-white/45"
    fill="none"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="m20 20-3.5-3.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

const EquipmentIcon = (): ReactElement => (
  <svg
    viewBox="0 0 24 24"
    className="h-3.5 w-3.5 text-sky-200"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M4 13.5V10l8-5 8 5v3.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6.5 13.5h11V19H6.5z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10 16.5h4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

interface HoverPhotoProps {
  photos: { url: string }[];
  title: string;
  category: string;
}

function HoverPhoto({
  photos,
  title,
  category,
}: HoverPhotoProps): ReactElement {
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const timerRef = useRef<number | null>(null);
  const photoSet = photos.slice(0, 3);

  useEffect(() => {
    if (!isHovering || photoSet.length <= 1) {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setActiveIndex(0);
      return;
    }

    timerRef.current = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % photoSet.length);
    }, 900);

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isHovering, photoSet.length]);

  return (
    <div
      className="relative aspect-[4/3] overflow-hidden rounded-2xl"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {photoSet.map((photo, index) => (
        <img
          key={`${photo.url}-${index}`}
          src={photo.url}
          alt={index === 0 ? title : `${title} photo ${index + 1}`}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
            index === activeIndex ? "opacity-100" : "opacity-0"
          }`}
          loading="lazy"
        />
      ))}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/10" />
      <span className="absolute left-3 top-3 rounded-full border border-amber-300/40 bg-amber-300/20 px-3 py-1 text-[11px] font-semibold text-amber-100">
        {category}
      </span>
    </div>
  );
}

function EquipmentSkeletonCard(): ReactElement {
  return (
    <article className="animate-pulse rounded-3xl border border-white/10 bg-surface/80 p-3">
      <div className="aspect-[4/3] rounded-2xl bg-white/10" />
      <div className="space-y-3 p-3">
        <div className="h-4 w-2/3 rounded bg-white/10" />
        <div className="h-3 w-1/2 rounded bg-white/10" />
        <div className="h-4 w-full rounded bg-white/10" />
        <div className="h-6 w-1/3 rounded bg-white/10" />
      </div>
    </article>
  );
}

const hasActiveFilters = (
  category: "" | EquipmentCategory,
  search: string,
  location: string,
  minPrice: string,
  maxPrice: string,
): boolean =>
  Boolean(
    category ||
    search.trim() ||
    location.trim() ||
    minPrice.trim() ||
    maxPrice.trim(),
  );

export function BrowseEquipmentPage(): ReactElement {
  const [items, setItems] = useState<EquipmentListing[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const [category, setCategory] = useState<"" | EquipmentCategory>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 400);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [searchInput]);

  const activeFilters = useMemo(
    () =>
      hasActiveFilters(category, debouncedSearch, location, minPrice, maxPrice),
    [category, debouncedSearch, location, minPrice, maxPrice],
  );

  const loadPage = async (
    nextPage: number,
    mode: "replace" | "append",
  ): Promise<void> => {
    if (mode === "replace") {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    setError("");

    try {
      const response = await fetchBrowseEquipmentListings({
        category,
        location,
        minPrice,
        maxPrice,
        search: debouncedSearch,
        page: nextPage,
      });

      setItems((current) =>
        mode === "replace" ? response.items : [...current, ...response.items],
      );
      setPage(response.page);
      setHasMore(response.hasMore);
    } catch (loadError: unknown) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Unable to load equipment listings.";
      setError(message);
      if (mode === "replace") {
        setItems([]);
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    void loadPage(1, "replace");
  }, [category, location, minPrice, maxPrice, debouncedSearch]);

  const clearFilters = (): void => {
    setCategory("");
    setSearchInput("");
    setDebouncedSearch("");
    setLocation("");
    setMinPrice("");
    setMaxPrice("");
  };

  const onPriceChange =
    (setter: (value: string) => void) =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      const value = event.target.value;
      if (value === "" || /^\d+$/.test(value)) {
        setter(value);
      }
    };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
          Rental marketplace
        </p>
        <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Browse Equipment
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Discover field-ready machines and tools from verified engineers near
          your project site.
        </p>
      </div>

      <EquipmentSectionTabs />

      <section className="sticky top-3 z-30 space-y-4 rounded-2xl border border-white/10 bg-void/90 p-4 backdrop-blur">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <label className="group flex items-center gap-2 rounded-xl border border-white/10 bg-surface/70 px-3 focus-within:border-primary">
            <SearchIcon />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by equipment title or description"
              className="h-11 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
              aria-label="Search equipment"
            />
          </label>

          <label className="rounded-xl border border-white/10 bg-surface/70 px-3 py-2.5">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
              Min / day
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={minPrice}
              onChange={onPriceChange(setMinPrice)}
              placeholder="0"
              className="mt-1 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
              aria-label="Minimum daily rate"
            />
          </label>

          <label className="rounded-xl border border-white/10 bg-surface/70 px-3 py-2.5">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
              Max / day
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={maxPrice}
              onChange={onPriceChange(setMaxPrice)}
              placeholder="1000"
              className="mt-1 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
              aria-label="Maximum daily rate"
            />
          </label>

          <label className="rounded-xl border border-white/10 bg-surface/70 px-3 py-2.5">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
              Location
            </span>
            <input
              type="text"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="City or district"
              className="mt-1 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
              aria-label="Filter by location"
            />
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 overflow-x-auto">
          <div className="flex gap-2">
            {EQUIPMENT_CATEGORIES.map((item) => {
              const isActive = category === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(isActive ? "" : item)}
                  className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isActive
                      ? "border-primary bg-primary text-white"
                      : "border-white/20 bg-surface text-white/70 hover:border-primary/60 hover:text-white"
                  }`}
                >
                  {item}
                </button>
              );
            })}
          </div>

          {activeFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="shrink-0 text-xs font-semibold text-primary transition-colors hover:text-glow"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </section>

      {error ? (
        <section
          className="rounded-2xl border border-red-400/20 bg-red-400/5 p-6 text-center"
          role="alert"
        >
          <p className="text-sm text-red-200">{error}</p>
          <button
            type="button"
            onClick={() => void loadPage(1, "replace")}
            className="mt-4 rounded-full border border-primary px-5 py-2 text-sm font-semibold text-primary hover:bg-primary hover:text-white"
          >
            Try again
          </button>
        </section>
      ) : null}

      {isLoading ? (
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <EquipmentSkeletonCard key={`equipment-skeleton-${index}`} />
          ))}
        </section>
      ) : items.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-white/15 bg-surface/50 p-12 text-center">
          <p className="text-4xl">🧰</p>
          <h2 className="mt-3 font-heading text-3xl font-bold text-white">
            No equipment matches your filters
          </h2>
          <p className="mt-2 text-sm text-white/55">
            Try adjusting category, location, or price range.
          </p>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {items.map((item) => (
              <Link
                key={item.id}
                to={`/dashboard/engineer/equipment/${item.id}`}
                className="group rounded-3xl border border-white/10 bg-surface/85 p-3 shadow-[0_10px_40px_rgba(0,0,0,0.24)] transition-all duration-300 hover:-translate-y-1.5 hover:border-white/20 hover:shadow-[0_18px_56px_rgba(0,0,0,0.35)]"
              >
                <HoverPhoto
                  photos={item.photos}
                  title={item.title}
                  category={item.category}
                />

                <div className="space-y-3 p-3">
                  <h2 className="line-clamp-1 text-base font-bold text-white">
                    {item.title}
                  </h2>

                  {typeof item.equipmentRating === "number" &&
                  item.equipmentReviewCount > 0 ? (
                    <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/30 bg-sky-300/10 px-2.5 py-1">
                      <EquipmentIcon />
                      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-100/90">
                        Equipment
                      </span>
                      <RatingBadge
                        rating={item.equipmentRating}
                        reviewCount={item.equipmentReviewCount}
                        size="sm"
                      />
                    </div>
                  ) : null}

                  <p className="flex items-center gap-1.5 text-xs text-white/60">
                    <LocationPin />
                    <span className="line-clamp-1">{item.location}</span>
                  </p>

                  <div className="flex items-center justify-between gap-2 text-xs text-white/70">
                    <span className="truncate font-semibold">
                      {item.owner.name}
                    </span>
                    <RatingBadge
                      rating={item.owner.rating ?? null}
                      reviewCount={item.owner.reviewCount ?? 0}
                      size="sm"
                    />
                  </div>

                  <p className="pt-1 text-white">
                    <span className="text-xl font-extrabold tracking-tight">
                      {formatCurrency(item.dailyRate)}
                    </span>
                    <span className="ml-1 text-xs text-white/55">/day</span>
                  </p>
                </div>
              </Link>
            ))}
          </section>

          {hasMore ? (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => void loadPage(page + 1, "append")}
                disabled={isLoadingMore}
                className="rounded-full border border-white/20 bg-surface px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:border-primary hover:text-primary disabled:cursor-wait disabled:opacity-60"
              >
                {isLoadingMore ? "Loading..." : "Load More"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

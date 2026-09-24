import { MagnifyingGlassIcon, MapPinIcon } from "@phosphor-icons/react";
import {
  type ChangeEvent,
  type ReactElement,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { EquipmentSectionTabs } from "../components/dashboard/EquipmentSectionTabs";
import { EquipmentThumb } from "../components/dashboard/equipment/EquipmentThumb";
import {
  inputClassName,
  primaryButtonClassName,
  quietLinkClassName,
  secondaryButtonClassName,
} from "../components/dashboard/ui/buttonStyles";
import { FilterTabs } from "../components/dashboard/ui/FilterTabs";
import { FormField } from "../components/dashboard/ui/FormField";
import { PageHeader } from "../components/dashboard/ui/PageHeader";
import { EmptyPanel, ErrorPanel } from "../components/dashboard/ui/StatePanels";
import { RatingBadge } from "../components/RatingBadge";
import { countOf, formatCurrency } from "../lib/format";
import {
  EQUIPMENT_CATEGORIES,
  fetchBrowseEquipmentListings,
  type EquipmentCategory,
  type EquipmentListing,
} from "./equipment.api";

const ALL_TYPES = "all";
type CategoryFilter = typeof ALL_TYPES | EquipmentCategory;

const categoryOptions: { key: CategoryFilter; label: string }[] = [
  { key: ALL_TYPES, label: "All types" },
  ...EQUIPMENT_CATEGORIES.map((category) => ({
    key: category,
    label: category,
  })),
];

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

function EquipmentCard({ item }: { item: EquipmentListing }): ReactElement {
  const hasEquipmentRating =
    typeof item.equipmentRating === "number" && item.equipmentReviewCount > 0;

  return (
    <Link
      to={`/dashboard/engineer/equipment/${item.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface transition-colors hover:border-white/25 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-glow"
    >
      <EquipmentThumb
        src={item.photos[0]?.url}
        alt={item.title}
        className="aspect-4/3 w-full"
      />
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-semibold text-white/45">{item.category}</p>
        <h2 className="mt-1 line-clamp-1 font-heading text-xl font-bold text-white">
          {item.title}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/60">
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPinIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.location}</span>
          </span>
          {hasEquipmentRating ? (
            <RatingBadge
              rating={item.equipmentRating}
              reviewCount={item.equipmentReviewCount}
              size="sm"
            />
          ) : null}
        </div>

        {/* The footer is pinned to the bottom so prices line up across a row
            of cards whose titles and ratings take different heights. */}
        <div className="mt-auto pt-5">
          <div className="flex items-end justify-between gap-3 border-t border-white/10 pt-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white/80">
                {item.owner.name}
              </p>
              <RatingBadge
                rating={item.owner.rating ?? null}
                reviewCount={item.owner.reviewCount ?? 0}
                size="sm"
              />
            </div>
            <p className="shrink-0 text-right">
              <span className="font-heading text-2xl font-bold text-white">
                {formatCurrency(item.dailyRate)}
              </span>
              <span className="ml-1 text-xs text-white/50">/day</span>
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

function EquipmentCardSkeleton(): ReactElement {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-white/10 bg-surface">
      <div className="aspect-4/3 bg-white/10" />
      <div className="p-5">
        <div className="h-3 w-1/4 rounded bg-white/10" />
        <div className="mt-3 h-5 w-2/3 rounded bg-white/10" />
        <div className="mt-3 h-3.5 w-1/3 rounded bg-white/10" />
        <div className="mt-6 flex justify-between border-t border-white/10 pt-4">
          <div className="h-4 w-1/3 rounded bg-white/10" />
          <div className="h-6 w-1/4 rounded bg-white/10" />
        </div>
      </div>
    </div>
  );
}

export function BrowseEquipmentPage(): ReactElement {
  const [items, setItems] = useState<EquipmentListing[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [loadMoreError, setLoadMoreError] = useState<string>("");
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
      setError("");
    } else {
      setIsLoadingMore(true);
    }
    setLoadMoreError("");

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
      setTotal(response.total);
      setPage(response.page);
      setHasMore(response.hasMore);
    } catch (loadError: unknown) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Unable to load equipment listings.";
      // A failed "load more" keeps what is already on screen; only a failed
      // fresh search replaces the results with an error.
      if (mode === "replace") {
        setError(message);
        setItems([]);
      } else {
        setLoadMoreError(message);
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

  const summary =
    isLoading || error
      ? "Machines and tools other engineers rent out, with a daily rate and deposit."
      : activeFilters
        ? `${countOf(total, "listing matches", "listings match")} your filters.`
        : `${countOf(total, "listing", "listings")} available to rent.`;

  return (
    <div className="space-y-8">
      <PageHeader title="Browse equipment" summary={summary} />

      <EquipmentSectionTabs />

      <section
        className="space-y-5 rounded-2xl border border-white/10 bg-surface p-4 sm:p-5"
        aria-label="Filter equipment"
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
          <FormField id="equipment-search" label="Search">
            <div className="relative">
              <MagnifyingGlassIcon
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
                aria-hidden="true"
              />
              <input
                id="equipment-search"
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Equipment name or description"
                className={`${inputClassName} pl-10`}
              />
            </div>
          </FormField>
          <FormField id="equipment-location" label="Location">
            <input
              id="equipment-location"
              type="text"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="City or district"
              className={inputClassName}
            />
          </FormField>
          <FormField id="equipment-min" label="Min per day ($)">
            <input
              id="equipment-min"
              type="text"
              inputMode="numeric"
              value={minPrice}
              onChange={onPriceChange(setMinPrice)}
              className={inputClassName}
            />
          </FormField>
          <FormField id="equipment-max" label="Max per day ($)">
            <input
              id="equipment-max"
              type="text"
              inputMode="numeric"
              value={maxPrice}
              onChange={onPriceChange(setMaxPrice)}
              className={inputClassName}
            />
          </FormField>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 pt-4 lg:flex-row lg:items-center lg:justify-between">
          <FilterTabs
            options={categoryOptions}
            value={category || ALL_TYPES}
            onChange={(key) => setCategory(key === ALL_TYPES ? "" : key)}
            label="Filter by equipment type"
          />
          {activeFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className={`self-start lg:self-auto ${quietLinkClassName}`}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </section>

      {isLoading ? (
        <section
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Loading equipment"
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <EquipmentCardSkeleton key={`equipment-skeleton-${index}`} />
          ))}
        </section>
      ) : error ? (
        <ErrorPanel
          message={error}
          onRetry={() => void loadPage(1, "replace")}
        />
      ) : items.length === 0 ? (
        activeFilters ? (
          <EmptyPanel
            title="Nothing matches these filters"
            body="Try another type, a wider price range or a nearby district."
            action={
              <button
                type="button"
                onClick={clearFilters}
                className={primaryButtonClassName}
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <EmptyPanel
            title="No equipment listed yet"
            body="When engineers list machines or tools for rent, they appear here."
            action={
              <Link
                to="/dashboard/engineer/equipment/mine"
                className={primaryButtonClassName}
              >
                List your equipment
              </Link>
            }
          />
        )
      ) : (
        <>
          <section
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Equipment for rent"
          >
            {items.map((item) => (
              <EquipmentCard key={item.id} item={item} />
            ))}
          </section>

          {hasMore ? (
            <div className="flex flex-col items-center gap-3 pt-2">
              {loadMoreError ? (
                <p className="text-sm text-red-300" role="alert">
                  {loadMoreError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void loadPage(page + 1, "append")}
                disabled={isLoadingMore}
                className={secondaryButtonClassName}
              >
                {isLoadingMore
                  ? "Loading..."
                  : `Show more (${items.length} of ${total})`}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

import {
  type ChangeEvent,
  type ReactElement,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../components/Avatar";

interface EngineerDirectoryItem {
  id: string;
  name: string;
  profilePhotoUrl: string | null;
  bio: string;
  location: string | null;
  specialty: string;
  rating: number | null;
  reviewCount: number;
  typicalRate: number | null;
  rateMin: number | null;
  rateMax: number | null;
  isVerified: boolean;
}

interface DirectoryResponse {
  engineers: EngineerDirectoryItem[];
  page: number;
  limit: number;
  total: number;
}

interface ErrorResponse {
  message?: string;
}

interface Filters {
  query: string;
  category: string;
  location: string;
  minRating: string;
  minRate: string;
  maxRate: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const isDirectoryItem = (value: unknown): value is EngineerDirectoryItem => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    (typeof item.profilePhotoUrl === "string" ||
      item.profilePhotoUrl === null) &&
    typeof item.bio === "string" &&
    (typeof item.location === "string" || item.location === null) &&
    typeof item.specialty === "string" &&
    (typeof item.rating === "number" || item.rating === null) &&
    typeof item.reviewCount === "number" &&
    (typeof item.typicalRate === "number" || item.typicalRate === null) &&
    (typeof item.rateMin === "number" || item.rateMin === null) &&
    (typeof item.rateMax === "number" || item.rateMax === null) &&
    typeof item.isVerified === "boolean"
  );
};

const isDirectoryResponse = (value: unknown): value is DirectoryResponse => {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return (
    Array.isArray(body.engineers) &&
    body.engineers.every(isDirectoryItem) &&
    typeof body.page === "number" &&
    typeof body.limit === "number" &&
    typeof body.total === "number"
  );
};

const getErrorMessage = (value: unknown, fallback: string): string => {
  if (typeof value === "object" && value !== null) {
    const body = value as ErrorResponse;
    if (typeof body.message === "string") return body.message;
  }
  return fallback;
};

const formatCurrency = (value: number): string =>
  `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const formatRate = (engineer: EngineerDirectoryItem): string => {
  if (engineer.rateMin !== null && engineer.rateMax !== null) {
    if (engineer.rateMin === engineer.rateMax) {
      return formatCurrency(engineer.rateMin);
    }
    return `${formatCurrency(engineer.rateMin)} - ${formatCurrency(engineer.rateMax)}`;
  }
  if (engineer.typicalRate !== null) {
    return formatCurrency(engineer.typicalRate);
  }
  return "Not listed";
};

const defaultFilters: Filters = {
  query: "",
  category: "",
  location: "",
  minRating: "",
  minRate: "",
  maxRate: "",
};

export function ClientBrowseEngineersPage(): ReactElement {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [engineers, setEngineers] = useState<EngineerDirectoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(12);
  const [total, setTotal] = useState<number>(0);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / Math.max(1, limit))),
    [total, limit],
  );

  const handleFilterChange = (key: keyof Filters, value: string): void => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const clearFilters = (): void => {
    setFilters(defaultFilters);
    setPage(1);
  };

  useEffect(() => {
    const loadEngineers = async (): Promise<void> => {
      setIsLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: "12",
        });

        if (filters.query.trim()) params.set("q", filters.query.trim());
        if (filters.category.trim())
          params.set("category", filters.category.trim());
        if (filters.location.trim())
          params.set("location", filters.location.trim());
        if (filters.minRating.trim())
          params.set("minRating", filters.minRating.trim());
        if (filters.minRate.trim())
          params.set("minRate", filters.minRate.trim());
        if (filters.maxRate.trim())
          params.set("maxRate", filters.maxRate.trim());

        const response = await fetch(
          `${API_BASE_URL}/api/engineers/search?${params.toString()}`,
          { credentials: "include" },
        );

        const body: unknown = await response.json();
        if (!response.ok || !isDirectoryResponse(body)) {
          setError(getErrorMessage(body, "Unable to load engineers."));
          setEngineers([]);
          return;
        }

        setEngineers(body.engineers);
        setPage(body.page);
        setLimit(body.limit);
        setTotal(body.total);
      } catch {
        setError("Unable to connect to CivilHub. Please try again.");
        setEngineers([]);
      } finally {
        setIsLoading(false);
      }
    };

    void loadEngineers();
  }, [filters, page]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-heading text-4xl font-bold text-white sm:text-5xl">
          Browse Engineers
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
          Explore verified engineering talent, compare expertise and rates, and
          open a conversation when a profile matches your project.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-white/10 bg-surface p-5">
          <h2 className="font-heading text-2xl font-bold text-white">
            Filters
          </h2>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-white/60">
                Search
              </label>
              <input
                value={filters.query}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  handleFilterChange("query", event.target.value)
                }
                placeholder="Name or bio"
                className="form-input"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-white/60">
                Specialty
              </label>
              <input
                value={filters.category}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  handleFilterChange("category", event.target.value)
                }
                placeholder="Residential, bridge, planning"
                className="form-input"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-white/60">
                Location
              </label>
              <input
                value={filters.location}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  handleFilterChange("location", event.target.value)
                }
                placeholder="City or region"
                className="form-input"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-white/60">
                Minimum rating
              </label>
              <select
                value={filters.minRating}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  handleFilterChange("minRating", event.target.value)
                }
                className="form-input"
              >
                <option value="">Any</option>
                <option value="4.5">4.5+</option>
                <option value="4.0">4.0+</option>
                <option value="3.5">3.5+</option>
                <option value="3.0">3.0+</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-white/60">
                  Min rate
                </label>
                <input
                  type="number"
                  min={0}
                  value={filters.minRate}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    handleFilterChange("minRate", event.target.value)
                  }
                  placeholder="0"
                  className="form-input"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-white/60">
                  Max rate
                </label>
                <input
                  type="number"
                  min={0}
                  value={filters.maxRate}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    handleFilterChange("maxRate", event.target.value)
                  }
                  placeholder="Any"
                  className="form-input"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={clearFilters}
              className="w-full rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 transition-colors hover:border-primary hover:text-white"
            >
              Clear filters
            </button>
          </div>
        </aside>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-surface px-5 py-4">
            <p className="text-sm text-white/70">
              {isLoading
                ? "Loading engineers..."
                : `${total} engineer${total === 1 ? "" : "s"} found`}
            </p>
            {!isLoading && totalPages > 1 ? (
              <p className="text-xs text-white/50">
                Page {page} of {totalPages}
              </p>
            ) : null}
          </div>

          {error ? (
            <div
              className="rounded-2xl border border-red-400/20 bg-red-400/5 p-6"
              role="alert"
            >
              <p className="text-sm text-red-200">{error}</p>
            </div>
          ) : null}

          {isLoading ? (
            <div
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
              aria-label="Loading engineers"
            >
              {Array.from({ length: 6 }).map((_, index) => (
                <article
                  key={`skeleton-${index}`}
                  className="animate-pulse rounded-2xl border border-white/10 bg-surface p-5"
                >
                  <div className="h-12 w-12 rounded-full bg-white/10" />
                  <div className="mt-4 h-5 w-2/3 rounded bg-white/10" />
                  <div className="mt-2 h-4 w-1/2 rounded bg-white/10" />
                  <div className="mt-5 h-3 w-full rounded bg-white/10" />
                  <div className="mt-2 h-3 w-5/6 rounded bg-white/10" />
                </article>
              ))}
            </div>
          ) : engineers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-surface/60 p-8 text-center">
              <h2 className="font-heading text-2xl font-bold text-white">
                No engineers match this filter set
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-white/60">
                Adjust your filters or clear them to browse the full directory.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {engineers.map((engineer) => (
                <article
                  key={engineer.id}
                  className="rounded-2xl border border-white/10 bg-surface p-5 transition-colors hover:border-primary/45"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={engineer.name}
                        photoUrl={engineer.profilePhotoUrl}
                        size="sm"
                      />
                      <div>
                        <h3 className="text-sm font-semibold text-white">
                          {engineer.name}
                        </h3>
                        <p className="mt-0.5 text-xs text-white/55">
                          {engineer.specialty}
                        </p>
                      </div>
                    </div>
                    {engineer.isVerified ? (
                      <span className="rounded-full border border-primary/35 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        Verified
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-4 text-sm leading-6 text-white/65">
                    {engineer.bio || "No bio provided yet."}
                  </p>

                  <dl className="mt-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-white/65">
                      <dt>Rating</dt>
                      <dd className="font-semibold text-white">
                        {engineer.rating !== null
                          ? `${engineer.rating.toFixed(1)} (${engineer.reviewCount})`
                          : "No reviews"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between text-white/65">
                      <dt>Typical rate</dt>
                      <dd className="font-semibold text-white">
                        {formatRate(engineer)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between text-white/65">
                      <dt>Location</dt>
                      <dd className="font-semibold text-white">
                        {engineer.location ?? "Not listed"}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-5 border-t border-white/10 pt-4">
                    <Link
                      to={`/users/${engineer.id}`}
                      className="inline-flex rounded-full border border-primary px-4 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
                    >
                      View profile
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!isLoading && totalPages > 1 ? (
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-surface p-4">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 transition-colors hover:border-primary hover:text-white disabled:opacity-40"
              >
                Previous
              </button>
              <p className="text-xs text-white/55">
                {page} / {totalPages}
              </p>
              <button
                type="button"
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={page >= totalPages}
                className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 transition-colors hover:border-primary hover:text-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

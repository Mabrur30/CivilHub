import {
  FunnelSimpleIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PaperPlaneTiltIcon,
  SealCheckIcon,
} from "@phosphor-icons/react";
import {
  type ReactElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { getErrorMessage } from "../components/dashboard/client/clientData";
import { InviteToBidDialog } from "../components/dashboard/client/InviteToBidDialog";
import {
  inputClassName,
  panelClassName,
  quietLinkClassName,
  rowButtonClassName,
  secondaryButtonClassName,
} from "../components/dashboard/ui/buttonStyles";
import { PageHeader } from "../components/dashboard/ui/PageHeader";
import { EmptyPanel, ErrorPanel } from "../components/dashboard/ui/StatePanels";
import { RatingBadge } from "../components/RatingBadge";
import { countOf, formatCurrency } from "../lib/format";
import { MoneyInput } from "../components/dashboard/ui/MoneyInput";
import { moneyValue } from "../lib/money";

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

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const PAGE_SIZE = 12;
const TYPING_DELAY_MS = 300;

// URL param -> API param. Filters live in the URL so a search can be
// bookmarked, shared, or restored with the back button.
const filterKeys = ["q", "category", "location", "minRating", "minRate", "maxRate"] as const;
type FilterKey = (typeof filterKeys)[number];
type Filters = Record<FilterKey, string>;

const isDirectoryItem = (value: unknown): value is EngineerDirectoryItem => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    (typeof item.profilePhotoUrl === "string" || item.profilePhotoUrl === null) &&
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

const formatRate = (engineer: EngineerDirectoryItem): string | null => {
  if (engineer.rateMin !== null && engineer.rateMax !== null) {
    return engineer.rateMin === engineer.rateMax
      ? formatCurrency(engineer.rateMin)
      : `${formatCurrency(engineer.rateMin)} - ${formatCurrency(engineer.rateMax)}`;
  }
  return engineer.typicalRate !== null ? formatCurrency(engineer.typicalRate) : null;
};

const readFilters = (params: URLSearchParams): Filters =>
  Object.fromEntries(filterKeys.map((key) => [key, params.get(key) ?? ""])) as Filters;

function EngineerRow({
  engineer,
  onInvite,
}: {
  engineer: EngineerDirectoryItem;
  onInvite: () => void;
}): ReactElement {
  const rate = formatRate(engineer);
  return (
    <li className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-8">
      <div className="flex min-w-0 gap-4">
        <Avatar name={engineer.name} photoUrl={engineer.profilePhotoUrl} size="sm" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="font-semibold text-white">{engineer.name}</p>
            {engineer.isVerified ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-200">
                <SealCheckIcon className="h-4 w-4" weight="fill" aria-hidden="true" />
                Verified
              </span>
            ) : null}
            {engineer.rating !== null ? (
              <RatingBadge rating={engineer.rating} reviewCount={engineer.reviewCount} size="sm" />
            ) : (
              <span className="text-xs text-white/45">No reviews yet</span>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/55">
            <span>{engineer.specialty}</span>
            {engineer.location ? (
              <span className="flex items-center gap-1">
                <MapPinIcon className="h-4 w-4" aria-hidden="true" />
                {engineer.location}
              </span>
            ) : null}
            {rate ? <span className="tabular-nums">Typical bid {rate}</span> : null}
          </p>
          {engineer.bio.trim() ? (
            <p className="mt-2 line-clamp-2 max-w-[70ch] text-sm leading-6 text-white/60">
              {engineer.bio}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-14 lg:pl-0">
        <button type="button" onClick={onInvite} className={rowButtonClassName}>
          <PaperPlaneTiltIcon className="h-4 w-4" aria-hidden="true" />
          Invite to bid
        </button>
        <Link
          to={`/profile/${engineer.id}`}
          state={{ backTo: "/dashboard/client/network", backLabel: "Back to Browse Engineers" }}
          className={rowButtonClassName}
        >
          View profile
        </Link>
      </div>
    </li>
  );
}

export function ClientBrowseEngineersPage(): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const applied = useMemo(() => readFilters(searchParams), [searchParams]);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  // Text boxes update instantly; the URL (and the search) follows after a pause.
  const [draft, setDraft] = useState<Filters>(applied);
  const [showMore, setShowMore] = useState<boolean>(Boolean(applied.minRate || applied.maxRate));
  const [engineers, setEngineers] = useState<EngineerDirectoryItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [retryKey, setRetryKey] = useState<number>(0);
  const [inviting, setInviting] = useState<EngineerDirectoryItem | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const lastCommitted = useRef<string>(searchParams.toString());

  const commit = (next: Filters): void => {
    const params = new URLSearchParams();
    for (const key of filterKeys) {
      if (next[key].trim()) params.set(key, next[key].trim());
    }
    lastCommitted.current = params.toString();
    setSearchParams(params, { replace: true });
  };

  // The back button (or a shared link) can change the URL without typing;
  // bring the boxes in line with it.
  useEffect(() => {
    const current = new URLSearchParams(searchParams);
    current.delete("page");
    if (current.toString() !== lastCommitted.current) {
      lastCommitted.current = current.toString();
      setDraft(readFilters(searchParams));
    }
  }, [searchParams]);

  // Debounce typing so a search runs once the client pauses, not per letter.
  useEffect(() => {
    const changed = filterKeys.some((key) => draft[key].trim() !== applied[key]);
    if (!changed) return;
    const timeout = window.setTimeout(() => commit(draftRef.current), TYPING_DELAY_MS);
    return () => window.clearTimeout(timeout);
    // commit only reads the latest draft through the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, applied]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async (): Promise<void> => {
      setIsLoading(true);
      setError("");
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      for (const key of filterKeys) {
        if (!applied[key]) continue;
        // Rates may be typed as "50k" or "2 lakh"; the API wants plain numbers.
        if (key === "minRate" || key === "maxRate") {
          const amount = moneyValue(applied[key]);
          if (amount !== null) params.set(key, String(amount));
          continue;
        }
        params.set(key, applied[key]);
      }
      try {
        const response = await fetch(`${API_BASE_URL}/api/engineers/search?${params.toString()}`, {
          credentials: "include",
          signal: controller.signal,
        });
        const body: unknown = await response.json();
        if (!response.ok || !isDirectoryResponse(body)) {
          setError(getErrorMessage(body, "Unable to load engineers."));
          setEngineers([]);
          return;
        }
        setEngineers(body.engineers);
        setTotal(body.total);
      } catch (caught) {
        // A newer search replaced this one; its result no longer matters.
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError("Unable to connect to CivilHub. Please try again.");
        setEngineers([]);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [applied, page, retryKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = filterKeys.some((key) => applied[key]);

  const setPage = (next: number): void => {
    const params = new URLSearchParams(searchParams);
    if (next <= 1) params.delete("page");
    else params.set("page", String(next));
    setSearchParams(params);
    window.scrollTo({ top: 0 });
  };

  const update = (key: FilterKey, value: string, immediate = false): void => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (immediate) commit(next);
  };

  const clearFilters = (): void => {
    const empty = Object.fromEntries(filterKeys.map((key) => [key, ""])) as Filters;
    setDraft(empty);
    commit(empty);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Browse engineers"
        summary={
          isLoading
            ? "Search by name, specialty or area, then invite engineers to bid on your briefs."
            : `${countOf(total, "engineer matches", "engineers match")} ${hasFilters ? "these filters" : "on CivilHub"}. Invite the ones you like to bid on a brief.`
        }
      />

      <section aria-label="Search filters" className={`${panelClassName} p-4 sm:p-5`}>
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
          <div className="grid gap-1.5">
            <label htmlFor="engineer-search" className="text-xs font-semibold text-white/55">
              Search
            </label>
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden="true" />
              <input
                id="engineer-search"
                type="search"
                value={draft.q}
                onChange={(event) => update("q", event.target.value)}
                className={`${inputClassName} pl-10`}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="engineer-specialty" className="text-xs font-semibold text-white/55">
              Specialty
            </label>
            <input
              id="engineer-specialty"
              value={draft.category}
              onChange={(event) => update("category", event.target.value)}
              className={inputClassName}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="engineer-location" className="text-xs font-semibold text-white/55">
              Area
            </label>
            <input
              id="engineer-location"
              value={draft.location}
              onChange={(event) => update("location", event.target.value)}
              className={inputClassName}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="engineer-rating" className="text-xs font-semibold text-white/55">
              Rating
            </label>
            <select
              id="engineer-rating"
              value={draft.minRating}
              onChange={(event) => update("minRating", event.target.value, true)}
              className={inputClassName}
            >
              <option value="">Any</option>
              <option value="4.5">4.5 and up</option>
              <option value="4.0">4.0 and up</option>
              <option value="3.5">3.5 and up</option>
            </select>
          </div>
        </div>

        {showMore ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 md:max-w-md">
            <div className="grid gap-1.5">
              <label htmlFor="engineer-min-rate" className="text-xs font-semibold text-white/55">
                Typical bid from
              </label>
              <MoneyInput
                id="engineer-min-rate"
                value={draft.minRate}
                onChange={(value) => update("minRate", value)}
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="engineer-max-rate" className="text-xs font-semibold text-white/55">
                Typical bid up to
              </label>
              <MoneyInput
                id="engineer-max-rate"
                value={draft.maxRate}
                onChange={(value) => update("maxRate", value)}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          <button
            type="button"
            onClick={() => setShowMore((value) => !value)}
            aria-expanded={showMore}
            className={`inline-flex items-center gap-1.5 ${quietLinkClassName}`}
          >
            <FunnelSimpleIcon className="h-4 w-4" aria-hidden="true" />
            {showMore ? "Fewer filters" : "Filter by typical bid"}
          </button>
          {hasFilters ? (
            <button type="button" onClick={clearFilters} className={quietLinkClassName}>
              Clear filters
            </button>
          ) : null}
        </div>
      </section>

      {error ? (
        <ErrorPanel message={error} onRetry={() => setRetryKey((key) => key + 1)} />
      ) : isLoading ? (
        <section className={panelClassName} aria-label="Loading engineers">
          <ul className="divide-y divide-white/10">
            {[0, 1, 2, 3].map((row) => (
              <li key={row} className="flex animate-pulse gap-4 px-6 py-5">
                <span className="h-10 w-10 rounded-full bg-white/10" />
                <span className="flex-1">
                  <span className="block h-4 w-1/3 rounded bg-white/10" />
                  <span className="mt-2 block h-3 w-1/2 rounded bg-white/10" />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : engineers.length === 0 ? (
        <EmptyPanel
          title="No engineers match"
          body={
            hasFilters
              ? "Try a broader specialty or area, or clear the filters to see everyone."
              : "No engineers have joined yet."
          }
          action={
            hasFilters ? (
              <button type="button" onClick={clearFilters} className={secondaryButtonClassName}>
                Clear filters
              </button>
            ) : undefined
          }
        />
      ) : (
        <section className={panelClassName} aria-label="Engineers">
          <ul className="divide-y divide-white/10">
            {engineers.map((engineer) => (
              <EngineerRow key={engineer.id} engineer={engineer} onInvite={() => setInviting(engineer)} />
            ))}
          </ul>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-4 border-t border-white/10 px-5 py-4 sm:px-6">
              <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1} className={rowButtonClassName}>
                Previous
              </button>
              <p className="text-sm tabular-nums text-white/50">
                Page {page} of {totalPages}
              </p>
              <button type="button" onClick={() => setPage(page + 1)} disabled={page >= totalPages} className={rowButtonClassName}>
                Next
              </button>
            </div>
          ) : null}
        </section>
      )}

      {inviting ? (
        <InviteToBidDialog
          engineerId={inviting.id}
          engineerName={inviting.name}
          onClose={() => setInviting(null)}
        />
      ) : null}
    </div>
  );
}

import {
  FunnelSimpleIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PaperPlaneTiltIcon,
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
  primaryButtonBaseClassName,
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
import { ENGINEER_DISCIPLINES } from "../lib/disciplines";
import { VerifiedBadge } from "../components/VerifiedBadge";

interface EngineerDirectoryItem {
  id: string;
  name: string;
  profilePhotoUrl: string | null;
  bio: string;
  location: string | null;
  /** Their main speciality, or null when they haven't chosen one. */
  specialty: string | null;
  rating: number | null;
  reviewCount: number;
  /** The starting rate they state themselves. */
  rateMin: number | null;
  rateMax: number | null;
  /** Certificates the engineer uploaded; clients can open them on the profile. */
  certificateCount: number;
  /** CivilHub checked their IEB membership or trade licence, and their ID. */
  verified?: boolean;
  /** Engineers and companies that take on projects share this directory. */
  role: "engineer" | "organisation";
  teamSize: string | null;
  yearFounded: number | null;
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
const filterKeys = ["q", "category", "location", "minRating", "minRate", "maxRate", "type", "verified"] as const;

const typeOptions = [
  { value: "", label: "Everyone" },
  { value: "engineer", label: "Engineers" },
  { value: "company", label: "Companies" },
];
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
    (typeof item.specialty === "string" || item.specialty === null) &&
    (typeof item.rating === "number" || item.rating === null) &&
    typeof item.reviewCount === "number" &&
    (typeof item.rateMin === "number" || item.rateMin === null) &&
    (typeof item.rateMax === "number" || item.rateMax === null) &&
    typeof item.certificateCount === "number" &&
    (item.role === "engineer" || item.role === "organisation")
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
  const { rateMin, rateMax } = engineer;
  if (rateMin !== null && rateMax !== null) {
    return rateMin === rateMax
      ? formatCurrency(rateMin)
      : `${formatCurrency(rateMin)} - ${formatCurrency(rateMax)}`;
  }
  if (rateMin !== null) return `From ${formatCurrency(rateMin)}`;
  if (rateMax !== null) return `Up to ${formatCurrency(rateMax)}`;
  return null;
};

const readFilters = (params: URLSearchParams): Filters =>
  Object.fromEntries(filterKeys.map((key) => [key, params.get(key) ?? ""])) as Filters;

// Same grid as the marketplace, so both sides of the product browse alike.
const cardGridClassName = "grid gap-5 md:grid-cols-2 xl:grid-cols-3";

function CardSkeleton(): ReactElement {
  return (
    <ul className={cardGridClassName} aria-label="Loading engineers">
      {[1, 2, 3].map((item) => (
        <li key={item} className={`${panelClassName} animate-pulse p-5 sm:p-6`}>
          <div className="h-5 w-40 rounded-full bg-white/10" />
          <div className="mt-4 flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-white/10" />
            <div className="h-6 w-3/5 rounded bg-white/10" />
          </div>
          <div className="mt-4 h-3.5 w-full rounded bg-white/10" />
          <div className="mt-2 h-3.5 w-4/5 rounded bg-white/10" />
          <div className="mt-6 space-y-3 border-t border-white/10 pt-4">
            <div className="h-3.5 w-full rounded bg-white/10" />
            <div className="h-3.5 w-2/3 rounded bg-white/10" />
            <div className="h-3.5 w-3/4 rounded bg-white/10" />
          </div>
          <div className="mt-5 h-11 w-full rounded-full bg-white/10" />
        </li>
      ))}
    </ul>
  );
}

function EngineerCard({
  engineer,
  onInvite,
}: {
  engineer: EngineerDirectoryItem;
  onInvite: () => void;
}): ReactElement {
  const rate = formatRate(engineer);
  const isCompany = engineer.role === "organisation";
  const profileLink = {
    pathname: `/profile/${engineer.id}`,
    state: { backTo: "/dashboard/client/network", backLabel: "Back to Browse Engineers" },
  };

  return (
    <li>
      <div className={`${panelClassName} flex h-full flex-col p-5 sm:p-6`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs">
          {engineer.specialty ? (
            <span className="rounded-full bg-white/5 px-2.5 py-1 font-semibold text-white/70">
              {engineer.specialty}
            </span>
          ) : (
            <span className="rounded-full border border-dashed border-white/15 px-2.5 py-1 text-white/45">
              No speciality set
            </span>
          )}
          {isCompany ? (
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-semibold uppercase tracking-[0.08em] text-primary">
              Company
            </span>
          ) : null}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Avatar name={engineer.name} photoUrl={engineer.profilePhotoUrl} size="md" />
          <div className="min-w-0">
            <h2 className="font-heading text-2xl font-bold leading-tight text-white">
              <Link
                to={profileLink.pathname}
                state={profileLink.state}
                className="rounded transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-glow"
              >
                {engineer.name}
              </Link>
              {engineer.verified ? <VerifiedBadge className="ml-2 align-middle" /> : null}
            </h2>
            <div className="mt-1">
              {engineer.rating !== null ? (
                <RatingBadge rating={engineer.rating} reviewCount={engineer.reviewCount} size="sm" />
              ) : (
                <span className="text-xs text-white/45">No reviews yet</span>
              )}
            </div>
          </div>
        </div>

        <p className="mb-5 mt-3 line-clamp-4 whitespace-pre-line text-sm leading-6 text-white/60">
          {engineer.bio.trim() ||
            (isCompany
              ? "This company hasn't added an introduction yet."
              : "This engineer hasn't added an introduction yet.")}
        </p>

        <dl className="mt-auto grid gap-3 border-t border-white/10 pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="shrink-0 text-white/45">Starting rate</dt>
            <dd className="text-right font-semibold tabular-nums text-white/90">
              {rate ?? <span className="font-normal text-white/50">Not stated</span>}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="shrink-0 text-white/45">Where</dt>
            <dd className="flex items-center gap-1.5 text-right text-white/80">
              <MapPinIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {engineer.location ?? "Not listed"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="shrink-0 text-white/45">{isCompany ? "Team" : "Credentials"}</dt>
            <dd className="text-right text-white/80">
              {isCompany
                ? [
                    engineer.teamSize ? `${engineer.teamSize} people` : null,
                    engineer.yearFounded ? `since ${engineer.yearFounded}` : null,
                  ]
                    .filter(Boolean)
                    .join(", ") || "Not listed"
                : engineer.certificateCount > 0
                  ? `${engineer.certificateCount} ${engineer.certificateCount === 1 ? "certificate" : "certificates"} to view`
                  : "None uploaded yet"}
            </dd>
          </div>
        </dl>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onInvite} className={`${primaryButtonBaseClassName} w-full`}>
            <PaperPlaneTiltIcon className="h-4 w-4" aria-hidden="true" />
            Invite to bid
          </button>
          <Link
            to={profileLink.pathname}
            state={profileLink.state}
            className={`${secondaryButtonClassName} w-full`}
          >
            View profile
          </Link>
        </div>
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
            ? "Search engineers and construction companies by name, specialty or area, then invite them to bid on your briefs."
            : `${
                applied.type === "company"
                  ? countOf(total, "company matches", "companies match")
                  : applied.type === "engineer"
                    ? countOf(total, "engineer matches", "engineers match")
                    : countOf(total, "engineer or company matches", "engineers and companies match")
              } ${hasFilters ? "these filters" : "on CivilHub"}. Invite the ones you like to bid on a brief.`
        }
      />

      <section aria-label="Search filters" className={`${panelClassName} p-4 sm:p-5`}>
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div
          role="radiogroup"
          aria-label="Show"
          className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-white/10 bg-void/60 p-1"
        >
          {typeOptions.map((option) => {
            const isActive = draft.type === option.value;
            return (
              <button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => update("type", option.value, true)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-glow ${
                  isActive ? "bg-white/10 text-white" : "text-white/55 hover:text-white"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-white/75">
          <input
            type="checkbox"
            checked={draft.verified === "1"}
            onChange={(event) => update("verified", event.target.checked ? "1" : "", true)}
            className="h-4 w-4 accent-primary"
          />
          <VerifiedBadge compact /> Verified only
        </label>
        </div>
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
              Speciality
            </label>
            <select
              id="engineer-specialty"
              value={draft.category}
              onChange={(event) => update("category", event.target.value)}
              className={inputClassName}
            >
              <option value="">Any speciality</option>
              {ENGINEER_DISCIPLINES.map((discipline) => (
                <option key={discipline} value={discipline}>
                  {discipline}
                </option>
              ))}
            </select>
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
                Starting rate from
              </label>
              <MoneyInput
                id="engineer-min-rate"
                value={draft.minRate}
                onChange={(value) => update("minRate", value)}
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="engineer-max-rate" className="text-xs font-semibold text-white/55">
                Starting rate up to
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
            {showMore ? "Fewer filters" : "Filter by starting rate"}
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
        <CardSkeleton />
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
        <section className="grid gap-4" aria-label="Engineers and companies">
          <ul className={cardGridClassName}>
            {engineers.map((engineer) => (
              <EngineerCard key={engineer.id} engineer={engineer} onInvite={() => setInviting(engineer)} />
            ))}
          </ul>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-4 pt-2">
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

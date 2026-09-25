import {
  CheckIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
} from "@phosphor-icons/react";
import {
  type FormEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useState,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { formatRelativeTime } from "../components/dashboard/notificationUtils";
import {
  inputClassName,
  panelClassName,
  primaryButtonBaseClassName,
  primaryButtonClassName,
  inlineLinkClassName,
  quietLinkClassName,
} from "../components/dashboard/ui/buttonStyles";
import { Dialog } from "../components/dashboard/ui/Dialog";
import { PageHeader } from "../components/dashboard/ui/PageHeader";
import { EmptyPanel, ErrorPanel } from "../components/dashboard/ui/StatePanels";
import { countOf, formatDate } from "../lib/format";
import { MoneyInput } from "../components/dashboard/ui/MoneyInput";
import { moneyValue } from "../lib/money";

interface MarketplaceProject {
  id: string;
  title: string;
  clientId: string | null;
  clientName: string;
  description: string;
  budgetRange: string;
  location: string;
  postedDate: string;
  category: string;
}

interface BidForm {
  amount: string;
  message: string;
}

interface SubmitBidRequestBody {
  projectId: string;
  amount: number;
  message: string;
}

interface EngineerBidSummary {
  projectId: string;
  status: "pending" | "accepted" | "declined";
}

type BudgetFilter = "any" | "under-10l" | "10l-1cr" | "over-1cr";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const ALL_CATEGORIES = "All categories";

const budgetOptions: { key: BudgetFilter; label: string }[] = [
  { key: "any", label: "Any budget" },
  { key: "under-10l", label: "Under ৳10 lakh" },
  { key: "10l-1cr", label: "৳10 lakh to ৳1 crore" },
  { key: "over-1cr", label: "Over ৳1 crore" },
];

const isMarketplaceProject = (value: unknown): value is MarketplaceProject => {
  if (typeof value !== "object" || value === null) return false;
  const project = value as Record<string, unknown>;
  return (
    typeof project.id === "string" &&
    typeof project.title === "string" &&
    (typeof project.clientId === "string" || project.clientId === null) &&
    typeof project.clientName === "string" &&
    typeof project.description === "string" &&
    typeof project.budgetRange === "string" &&
    typeof project.location === "string" &&
    typeof project.postedDate === "string" &&
    typeof project.category === "string"
  );
};

const isEngineerBidSummary = (value: unknown): value is EngineerBidSummary => {
  if (typeof value !== "object" || value === null) return false;
  const bid = value as Record<string, unknown>;
  return (
    typeof bid.projectId === "string" &&
    (bid.status === "pending" ||
      bid.status === "accepted" ||
      bid.status === "declined")
  );
};

const getErrorMessage = (value: unknown, fallback: string): string => {
  if (typeof value === "object" && value !== null) {
    const body = value as { message?: unknown };
    if (typeof body.message === "string") return body.message;
  }
  return fallback;
};

const TEN_LAKH = 1_000_000;
const ONE_CRORE = 10_000_000;

// Budgets arrive as display strings ("৳25,00,000 - ৳50,00,000", older ones
// "$250,000 - $500,000"). Each side is read with the same parser as the money
// inputs; a budget with no numbers ("Budget to be discussed") only matches "Any".
const parseBudgetRange = (
  budgetRange: string,
): { min: number; max: number } | null => {
  const values = budgetRange
    .replace(/\$/g, "")
    .split(/\s+-\s+|\s+to\s+/i)
    .map((part) => moneyValue(part))
    .filter((value): value is number => value !== null && value > 0);

  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
};

// A brief matches a budget band when its range overlaps the band at all.
const matchesBudget = (budgetRange: string, filter: BudgetFilter): boolean => {
  if (filter === "any") return true;
  const range = parseBudgetRange(budgetRange);
  if (!range) return false;
  if (filter === "under-10l") return range.min < TEN_LAKH;
  if (filter === "10l-1cr") {
    return range.min <= ONE_CRORE && range.max >= TEN_LAKH;
  }
  return range.max > ONE_CRORE;
};

function BriefListSkeleton(): ReactElement {
  return (
    <section className={panelClassName} aria-label="Loading marketplace">
      <ul className="divide-y divide-white/10">
        {[1, 2, 3].map((item) => (
          <li
            key={item}
            className="grid animate-pulse gap-5 px-5 py-6 sm:px-6 lg:grid-cols-12 lg:gap-8"
          >
            <div className="lg:col-span-8">
              <div className="h-5 w-40 rounded-full bg-white/10" />
              <div className="mt-4 h-6 w-2/3 rounded bg-white/10" />
              <div className="mt-2 h-3.5 w-1/4 rounded bg-white/10" />
              <div className="mt-4 h-3.5 w-full rounded bg-white/10" />
              <div className="mt-2 h-3.5 w-4/5 rounded bg-white/10" />
            </div>
            <div className="lg:col-span-4">
              <div className="h-3 w-16 rounded bg-white/10" />
              <div className="mt-2 h-5 w-40 rounded bg-white/10" />
              <div className="mt-4 h-3.5 w-28 rounded bg-white/10" />
              <div className="mt-5 h-11 w-32 rounded-full bg-white/10" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface BriefRowProps {
  project: MarketplaceProject;
  hasSubmittedBid: boolean;
  onBid: () => void;
}

function BriefRow({
  project,
  hasSubmittedBid,
  onBid,
}: BriefRowProps): ReactElement {
  const posted = formatRelativeTime(project.postedDate);

  return (
    <li className="grid gap-5 px-5 py-6 sm:px-6 lg:grid-cols-12 lg:gap-8">
      <div className="min-w-0 lg:col-span-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
          <span className="rounded-full bg-white/5 px-2.5 py-1 font-semibold text-white/70">
            {project.category}
          </span>
          <span className="text-white/40" title={formatDate(project.postedDate)}>
            Posted {posted ? posted.toLowerCase() : formatDate(project.postedDate)}
          </span>
        </div>
        <h2 className="mt-3 font-heading text-2xl font-bold text-white">
          {project.title}
        </h2>
        <p className="mt-1 text-sm text-white/55">
          {project.clientId ? (
            <Link
              to={`/profile/${project.clientId}`}
              state={{
                backTo: "/dashboard/engineer/marketplace",
                backLabel: "Back to Marketplace",
              }}
              className={inlineLinkClassName}
            >
              {project.clientName}
            </Link>
          ) : (
            project.clientName
          )}
        </p>
        <p className="mt-3 line-clamp-3 max-w-[65ch] text-sm leading-6 text-white/60">
          {project.description}
        </p>
      </div>

      <div className="flex flex-col gap-4 lg:col-span-4 lg:border-l lg:border-white/10 lg:pl-8">
        <div>
          <p className="text-xs font-semibold text-white/40">Budget</p>
          <p className="mt-1 font-semibold text-white/90">
            {project.budgetRange}
          </p>
        </div>
        <p className="flex items-center gap-1.5 text-sm text-white/60">
          <MapPinIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {project.location}
        </p>
        {hasSubmittedBid ? (
          <p className="inline-flex w-fit items-center gap-2 rounded-full bg-white/5 px-5 py-3 text-sm font-semibold text-white/60">
            <CheckIcon className="h-4 w-4" aria-hidden="true" />
            Bid submitted
          </p>
        ) : (
          <button
            type="button"
            onClick={onBid}
            className={primaryButtonClassName}
          >
            Submit bid
          </button>
        )}
      </div>
    </li>
  );
}

export function EngineerMarketplacePage(): ReactElement {
  const [projects, setProjects] = useState<MarketplaceProject[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>("");
  const [retryKey, setRetryKey] = useState<number>(0);
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);
  const [budget, setBudget] = useState<BudgetFilter>("any");
  const [search, setSearch] = useState<string>("");
  const [selectedProject, setSelectedProject] =
    useState<MarketplaceProject | null>(null);
  const [bid, setBid] = useState<BidForm>({ amount: "", message: "" });
  const [bidError, setBidError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedProjectIds, setSubmittedProjectIds] = useState<Set<string>>(
    new Set(),
  );
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedProjectId = searchParams.get("project");

  useEffect(() => {
    const loadProjects = async (): Promise<void> => {
      setIsLoading(true);
      setLoadError("");
      try {
        const [projectsResponse, bidsResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/projects/open`),
          fetch(`${API_BASE_URL}/api/bids/my-bids`, {
            credentials: "include",
          }),
        ]);
        const projectsBody: unknown = await projectsResponse.json();
        const bidsBody: unknown = await bidsResponse.json();
        if (
          !projectsResponse.ok ||
          !Array.isArray(projectsBody) ||
          !projectsBody.every(isMarketplaceProject)
        ) {
          setLoadError(
            getErrorMessage(
              projectsBody,
              "Unable to load marketplace projects.",
            ),
          );
          return;
        }
        if (
          !bidsResponse.ok ||
          !Array.isArray(bidsBody) ||
          !bidsBody.every(isEngineerBidSummary)
        ) {
          setLoadError(
            getErrorMessage(bidsBody, "Unable to load your bid history."),
          );
          return;
        }
        setProjects(projectsBody);
        setSubmittedProjectIds(new Set(bidsBody.map((bid) => bid.projectId)));
      } catch {
        setLoadError("Unable to connect to CivilHub. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };
    void loadProjects();
  }, [retryKey]);

  // A client profile links here with ?project=<id> so "Submit bid" there opens
  // the same dialog here. The param is dropped once handled, so closing the
  // dialog or refreshing does not reopen it.
  useEffect(() => {
    if (isLoading || !requestedProjectId) return;
    const requested = projects.find(
      (project) => project.id === requestedProjectId,
    );
    if (requested && !submittedProjectIds.has(requested.id)) {
      setSelectedProject(requested);
      setBid({ amount: "", message: "" });
      setBidError("");
    }
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("project");
        return next;
      },
      { replace: true },
    );
  }, [
    isLoading,
    projects,
    requestedProjectId,
    setSearchParams,
    submittedProjectIds,
  ]);

  useEffect(() => {
    if (!successMessage) return;
    const timeoutId = window.setTimeout(() => setSuccessMessage(""), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  const categories = [
    ALL_CATEGORIES,
    ...new Set(projects.map((project) => project.category)),
  ];
  const searchTerm = search.trim().toLowerCase();
  const filteredProjects = projects.filter((project) => {
    const matchesCategory =
      category === ALL_CATEGORIES || project.category === category;
    const matchesSearch =
      !searchTerm ||
      `${project.title} ${project.clientName} ${project.location}`
        .toLowerCase()
        .includes(searchTerm);
    return (
      matchesCategory &&
      matchesSearch &&
      matchesBudget(project.budgetRange, budget)
    );
  });
  const hasActiveFilters =
    searchTerm !== "" || category !== ALL_CATEGORIES || budget !== "any";
  const openToBid = projects.filter(
    (project) => !submittedProjectIds.has(project.id),
  ).length;

  const clearFilters = (): void => {
    setSearch("");
    setCategory(ALL_CATEGORIES);
    setBudget("any");
  };

  const closeBidDialog = useCallback((): void => setSelectedProject(null), []);

  const openBidDialog = (project: MarketplaceProject): void => {
    setSelectedProject(project);
    setBid({ amount: "", message: "" });
    setBidError("");
  };

  const submitBid = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!selectedProject) return;
    const amount = moneyValue(bid.amount) ?? Number.NaN;
    if (!Number.isFinite(amount) || amount <= 0) {
      setBidError("Enter a price greater than zero.");
      return;
    }
    if (!bid.message.trim()) {
      setBidError("Add a short message for the client.");
      return;
    }
    setBidError("");
    setIsSubmitting(true);
    const requestBody: SubmitBidRequestBody = {
      projectId: selectedProject.id,
      amount,
      message: bid.message.trim(),
    };
    try {
      const response = await fetch(`${API_BASE_URL}/api/bids`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(requestBody),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        setBidError(getErrorMessage(body, "Unable to submit your bid."));
        return;
      }
      setSubmittedProjectIds((current) =>
        new Set(current).add(selectedProject.id),
      );
      setSelectedProject(null);
      setSuccessMessage(`Bid submitted for ${selectedProject.title}.`);
    } catch {
      setBidError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Marketplace"
        summary={
          isLoading || loadError
            ? "Open briefs from clients looking for an engineer."
            : projects.length === 0
              ? "There are no open briefs right now."
              : `${countOf(projects.length, "open brief", "open briefs")}. ${
                  openToBid === projects.length
                    ? "You haven't bid on any yet."
                    : openToBid === 0
                      ? "You've bid on all of them."
                      : `${countOf(openToBid, "is", "are")} still open to your bid.`
                }`
        }
      />

      {successMessage ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-5 py-3.5 text-sm font-semibold text-emerald-200"
        >
          <CheckIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {successMessage}
        </p>
      ) : null}

      <div className="grid gap-4 rounded-2xl border border-white/10 bg-surface p-4 sm:p-5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid gap-2">
          <label
            htmlFor="marketplace-search"
            className="text-xs font-semibold text-white/55"
          >
            Search
          </label>
          <div className="relative">
            <MagnifyingGlassIcon
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
              aria-hidden="true"
            />
            <input
              id="marketplace-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Project, client or location"
              className={`${inputClassName} pl-10`}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <label
            htmlFor="marketplace-category"
            className="text-xs font-semibold text-white/55"
          >
            Category
          </label>
          <select
            id="marketplace-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className={inputClassName}
          >
            {categories.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <label
            htmlFor="marketplace-budget"
            className="text-xs font-semibold text-white/55"
          >
            Budget
          </label>
          <select
            id="marketplace-budget"
            value={budget}
            onChange={(event) => setBudget(event.target.value as BudgetFilter)}
            className={inputClassName}
          >
            {budgetOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <BriefListSkeleton />
      ) : loadError ? (
        <ErrorPanel
          message={loadError}
          onRetry={() => setRetryKey((key) => key + 1)}
        />
      ) : projects.length === 0 ? (
        <EmptyPanel
          title="No open briefs yet"
          body="New briefs appear here as soon as clients post them."
        />
      ) : filteredProjects.length === 0 ? (
        <EmptyPanel
          title="No briefs match these filters"
          body="Try a broader search, or clear the filters to see every open brief."
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
        <section className={panelClassName} aria-label="Open briefs">
          {hasActiveFilters ? (
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-3.5 text-sm text-white/50 sm:px-6">
              <span>
                Showing {filteredProjects.length} of {projects.length}
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className={quietLinkClassName}
              >
                Clear filters
              </button>
            </div>
          ) : null}
          <ul className="divide-y divide-white/10">
            {filteredProjects.map((project) => (
              <BriefRow
                key={project.id}
                project={project}
                hasSubmittedBid={submittedProjectIds.has(project.id)}
                onBid={() => openBidDialog(project)}
              />
            ))}
          </ul>
        </section>
      )}

      {selectedProject ? (
        <Dialog
          title="Submit a bid"
          description={
            <>
              <p>
                {selectedProject.title} for {selectedProject.clientName}
              </p>
              <p className="mt-1">
                {parseBudgetRange(selectedProject.budgetRange)
                  ? `Client budget: ${selectedProject.budgetRange}`
                  : selectedProject.budgetRange}
              </p>
            </>
          }
          onClose={closeBidDialog}
          isBusy={isSubmitting}
        >
            <form onSubmit={submitBid} className="grid gap-5" noValidate>
              <div className="grid gap-2">
                <label
                  htmlFor="bid-amount"
                  className="text-sm font-semibold text-white/80"
                >
                  Your price
                </label>
                <MoneyInput
                  id="bid-amount"
                  value={bid.amount}
                  onChange={(value) => setBid({ ...bid, amount: value })}
                  describedBy={bidError ? "bid-error" : undefined}
                  autoFocus
                />
              </div>
              <div className="grid gap-2">
                <label
                  htmlFor="bid-message"
                  className="text-sm font-semibold text-white/80"
                >
                  Message to {selectedProject.clientName}
                </label>
                <textarea
                  id="bid-message"
                  rows={4}
                  value={bid.message}
                  onChange={(event) =>
                    setBid({ ...bid, message: event.target.value })
                  }
                  aria-describedby={
                    bidError ? "bid-message-help bid-error" : "bid-message-help"
                  }
                  className={`${inputClassName} resize-none`}
                />
                <p id="bid-message-help" className="text-xs text-white/45">
                  Why your team fits, your approach and a rough timeline.
                </p>
              </div>
              {bidError ? (
                <p id="bid-error" role="alert" className="text-sm text-rose-300">
                  {bidError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={isSubmitting}
                className={`${primaryButtonBaseClassName} w-full`}
              >
                {isSubmitting ? "Submitting..." : "Submit bid"}
              </button>
            </form>
        </Dialog>
      ) : null}
    </div>
  );
}

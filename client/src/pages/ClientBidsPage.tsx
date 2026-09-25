import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import {
  type ReactElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { useClientWorkspace } from "../components/dashboard/client/ClientWorkspace";
import { getErrorMessage } from "../components/dashboard/client/clientData";
import { formatRelativeTime } from "../components/dashboard/notificationUtils";
import {
  inlineLinkClassName,
  panelClassName,
  primaryButtonBaseClassName,
  primaryButtonClassName,
  quietLinkClassName,
  outlineButtonClassName,
  secondaryButtonClassName,
} from "../components/dashboard/ui/buttonStyles";
import { Dialog } from "../components/dashboard/ui/Dialog";
import { FilterTabs } from "../components/dashboard/ui/FilterTabs";
import { PageHeader } from "../components/dashboard/ui/PageHeader";
import { EmptyPanel, ErrorPanel } from "../components/dashboard/ui/StatePanels";
import { RatingBadge } from "../components/RatingBadge";
import { countOf, formatCurrency, formatDate } from "../lib/format";

type BidStatus = "pending" | "accepted" | "declined";

interface ClientBid {
  id: string;
  engineerId: string;
  engineerName: string;
  amount: number;
  message: string;
  submittedDate: string;
  status: BidStatus;
  engineerPhotoUrl: string | null;
  engineerRating: number | null;
  engineerReviewCount: number;
  engineerCompletedProjects: number;
}

interface ProjectBids {
  projectId: string;
  projectName: string;
  projectStatus: string;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetRange: string;
  bids: ClientBid[];
}

type ProjectFilter = "needs_decision" | "decided" | "all";
type BidSort = "price" | "rating" | "newest";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isClientBid = (value: unknown): value is ClientBid =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.engineerId === "string" &&
  typeof value.engineerName === "string" &&
  typeof value.amount === "number" &&
  typeof value.message === "string" &&
  typeof value.submittedDate === "string" &&
  (value.status === "pending" ||
    value.status === "accepted" ||
    value.status === "declined") &&
  (typeof value.engineerPhotoUrl === "string" || value.engineerPhotoUrl === null) &&
  (typeof value.engineerRating === "number" || value.engineerRating === null) &&
  typeof value.engineerReviewCount === "number" &&
  typeof value.engineerCompletedProjects === "number";

const isProjectBids = (value: unknown): value is ProjectBids =>
  isRecord(value) &&
  typeof value.projectId === "string" &&
  typeof value.projectName === "string" &&
  typeof value.projectStatus === "string" &&
  (typeof value.budgetMin === "number" || value.budgetMin === null) &&
  (typeof value.budgetMax === "number" || value.budgetMax === null) &&
  typeof value.budgetRange === "string" &&
  Array.isArray(value.bids) &&
  value.bids.every(isClientBid);

const needsDecision = (project: ProjectBids): boolean =>
  project.projectStatus === "open_for_bids" &&
  project.bids.some((bid) => bid.status === "pending");

const sorters: Record<BidSort, (a: ClientBid, b: ClientBid) => number> = {
  price: (a, b) => a.amount - b.amount,
  rating: (a, b) =>
    (b.engineerRating ?? -1) - (a.engineerRating ?? -1) ||
    b.engineerReviewCount - a.engineerReviewCount,
  newest: (a, b) =>
    new Date(b.submittedDate).getTime() - new Date(a.submittedDate).getTime(),
};

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name;

/** Where a bid sits against the client's budget, as words and a small strip. */
function BudgetMarker({
  amount,
  min,
  max,
}: {
  amount: number;
  min: number | null;
  max: number | null;
}): ReactElement | null {
  if (min === null || max === null || max <= min) return null;

  const low = Math.min(min, amount);
  const high = Math.max(max, amount);
  const pad = (high - low) * 0.12 || 1;
  const span = high - low + pad * 2;
  const position = (value: number): number => ((value - low + pad) / span) * 100;

  const verdict =
    amount > max
      ? { text: `${formatCurrency(amount - max)} over budget`, tone: "text-violet-200" }
      : amount < min
        ? { text: `${formatCurrency(min - amount)} under budget`, tone: "text-white/60" }
        : { text: "Within budget", tone: "text-emerald-200" };

  return (
    <div className="flex items-center gap-3 sm:justify-end">
      <span className="relative block h-2.5 w-28" aria-hidden="true">
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/15" />
        <span
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/25"
          style={{
            left: `${position(min)}%`,
            width: `${position(max) - position(min)}%`,
          }}
        />
        <span
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
          style={{ left: `${position(amount)}%` }}
        />
      </span>
      <span className={`text-xs font-semibold ${verdict.tone}`}>
        {verdict.text}
      </span>
    </div>
  );
}

function BidMessage({ message }: { message: string }): ReactElement {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const isLong = message.length > 220;
  return (
    <div className="mt-4 max-w-[65ch]">
      <p
        className={`whitespace-pre-line text-sm leading-6 text-white/70 ${
          isLong && !isExpanded ? "line-clamp-3" : ""
        }`}
      >
        {message}
      </p>
      {isLong ? (
        <button
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          className={`mt-1 ${quietLinkClassName}`}
        >
          {isExpanded ? "Show less" : "Read the full message"}
        </button>
      ) : null}
    </div>
  );
}

interface BidRowProps {
  bid: ClientBid;
  project: ProjectBids;
  onHire: () => void;
  onDecline: () => void;
}

function BidRow({ bid, project, onHire, onDecline }: BidRowProps): ReactElement {
  const canDecide =
    bid.status === "pending" && project.projectStatus === "open_for_bids";
  const submitted = formatRelativeTime(bid.submittedDate);

  return (
    <li
      className={`px-5 py-5 sm:px-6 ${bid.status === "declined" ? "opacity-60" : ""}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <Avatar name={bid.engineerName} photoUrl={bid.engineerPhotoUrl} size="sm" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link
                to={`/profile/${bid.engineerId}`}
                state={{ backTo: "/dashboard/client/bids", backLabel: "Back to Bids" }}
                className={`font-semibold ${inlineLinkClassName}`}
              >
                {bid.engineerName}
              </Link>
              {bid.engineerRating !== null ? (
                <RatingBadge
                  rating={bid.engineerRating}
                  reviewCount={bid.engineerReviewCount}
                  size="sm"
                />
              ) : (
                <span className="text-xs text-white/45">No reviews yet</span>
              )}
            </div>
            <p className="mt-1 text-sm text-white/50">
              {bid.engineerCompletedProjects > 0
                ? `${countOf(bid.engineerCompletedProjects, "project", "projects")} delivered on CivilHub`
                : "New to CivilHub"}
              <span className="text-white/35">
                {" "}
                · bid {submitted ? submitted.toLowerCase() : formatDate(bid.submittedDate)}
              </span>
            </p>
          </div>
        </div>
        <div className="shrink-0 pl-14 sm:pl-0 sm:text-right">
          <p className="text-2xl font-semibold tabular-nums text-white">
            {formatCurrency(bid.amount)}
          </p>
          <div className="mt-1.5">
            <BudgetMarker amount={bid.amount} min={project.budgetMin} max={project.budgetMax} />
          </div>
        </div>
      </div>

      <div className="pl-14">
        <BidMessage message={bid.message} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {canDecide ? (
            <>
              <button type="button" onClick={onHire} className={outlineButtonClassName}>
                Hire {firstName(bid.engineerName)}
              </button>
              <button type="button" onClick={onDecline} className={secondaryButtonClassName}>
                Decline
              </button>
            </>
          ) : bid.status === "accepted" ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-3 py-1.5 text-sm font-semibold text-emerald-200">
                <CheckIcon className="h-4 w-4" weight="bold" aria-hidden="true" />
                Hired
              </span>
              <Link
                to={`/dashboard/client/projects/${project.projectId}`}
                className={quietLinkClassName}
              >
                Open project
              </Link>
            </>
          ) : bid.status === "declined" ? (
            <span className="text-sm text-white/45">Declined</span>
          ) : (
            <span className="text-sm text-white/45">
              Not selected, the project has an engineer
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function ProjectBidsPanel({
  project,
  sort,
  isExpanded,
  onToggle,
  onHire,
  onDecline,
}: {
  project: ProjectBids;
  sort: BidSort;
  isExpanded: boolean;
  onToggle: () => void;
  onHire: (bid: ClientBid) => void;
  onDecline: (bid: ClientBid) => void;
}): ReactElement {
  const listId = useId();
  const pending = project.bids.filter((bid) => bid.status === "pending").length;
  const hired = project.bids.find((bid) => bid.status === "accepted");
  const bids = [...project.bids].sort(sorters[sort]);

  return (
    <section
      id={`project-${project.projectId}`}
      className={`${panelClassName} scroll-mt-40`}
    >
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={listId}
          className="group flex w-full items-start justify-between gap-4 px-5 py-5 text-left transition-colors hover:bg-white/3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-glow sm:px-6"
        >
          <span className="min-w-0">
            <span className="block font-heading text-2xl font-bold text-white">
              {project.projectName}
            </span>
            <span className="mt-1 block text-sm text-white/55">
              Budget {project.budgetRange}
              <span className="text-white/40">
                {" "}
                · {countOf(project.bids.length, "bid", "bids")}
                {hired
                  ? `, hired ${hired.engineerName}`
                  : pending > 0
                    ? `, ${pending} waiting on you`
                    : ""}
              </span>
            </span>
          </span>
          <CaretDownIcon
            className={`mt-2 h-5 w-5 shrink-0 text-white/45 transition-transform duration-300 group-hover:text-white/80 motion-reduce:transition-none ${
              isExpanded ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>
      </h2>
      {isExpanded ? (
        <ul id={listId} className="divide-y divide-white/10 border-t border-white/10">
          {bids.map((bid) => (
            <BidRow
              key={bid.id}
              bid={bid}
              project={project}
              onHire={() => onHire(bid)}
              onDecline={() => onDecline(bid)}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

interface PendingDecision {
  kind: "hire" | "decline";
  bid: ClientBid;
  project: ProjectBids;
}

function DecisionDialog({
  decision,
  isBusy,
  error,
  onConfirm,
  onClose,
}: {
  decision: PendingDecision;
  isBusy: boolean;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
}): ReactElement {
  const { bid, project, kind } = decision;
  const name = firstName(bid.engineerName);
  const others = project.bids.filter(
    (other) => other.id !== bid.id && other.status === "pending",
  ).length;

  return (
    <Dialog
      title={kind === "hire" ? `Hire ${bid.engineerName}?` : "Decline this bid?"}
      description={`${project.projectName}, ${formatCurrency(bid.amount)}`}
      onClose={onClose}
      isBusy={isBusy}
    >
      {kind === "hire" ? (
        <ul className="grid gap-3 text-sm leading-6 text-white/70">
          <li>
            {others > 0
              ? `The other ${countOf(others, "bid is", "bids are")} declined automatically, and those engineers are told.`
              : "This is the only bid waiting, so no one else is affected."}
          </li>
          <li>
            Next, {name} drafts a phase plan with prices that add up to{" "}
            {formatCurrency(bid.amount)}. You review it before any work starts.
          </li>
          <li>You can't undo a hire.</li>
        </ul>
      ) : (
        <p className="text-sm leading-6 text-white/70">
          {name} is told this bid wasn't selected. You can't undo this, but you
          can invite {name} to another brief later.
        </p>
      )}
      {error ? (
        <p role="alert" className="mt-4 text-sm text-rose-300">
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} disabled={isBusy} className={secondaryButtonClassName}>
          {kind === "hire" ? "Not yet" : "Keep bid"}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isBusy}
          className={primaryButtonBaseClassName}
        >
          {isBusy
            ? kind === "hire"
              ? "Hiring..."
              : "Declining..."
            : kind === "hire"
              ? `Hire for ${formatCurrency(bid.amount)}`
              : "Decline bid"}
        </button>
      </div>
    </Dialog>
  );
}

export function ClientBidsPage(): ReactElement {
  const workspace = useClientWorkspace();
  const [searchParams] = useSearchParams();
  const focusProjectId = searchParams.get("project");

  const [projects, setProjects] = useState<ProjectBids[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>("");
  const [reloadKey, setReloadKey] = useState<number>(0);
  const [filter, setFilter] = useState<ProjectFilter>("needs_decision");
  const [sort, setSort] = useState<BidSort>("price");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [decision, setDecision] = useState<PendingDecision | null>(null);
  const [isDeciding, setIsDeciding] = useState<boolean>(false);
  const [decisionError, setDecisionError] = useState<string>("");
  const [notice, setNotice] = useState<{ text: string; projectId: string | null } | null>(null);

  useEffect(() => {
    let isActive = true;
    const load = async (): Promise<void> => {
      setLoadError("");
      try {
        const response = await fetch(`${API_BASE_URL}/api/bids/my-projects-bids`, {
          credentials: "include",
        });
        const body: unknown = await response.json();
        if (!isActive) return;
        if (!response.ok || !Array.isArray(body) || !body.every(isProjectBids)) {
          setLoadError(getErrorMessage(body, "Unable to load your bids."));
          return;
        }
        setProjects(body);
      } catch {
        if (isActive) setLoadError("Unable to connect to CivilHub. Please try again.");
      } finally {
        if (isActive) setIsLoading(false);
      }
    };
    void load();
    return () => {
      isActive = false;
    };
  }, [reloadKey]);

  // Projects waiting on a decision open by default; a link to a specific
  // project (from the overview queue) opens and scrolls to that one.
  useEffect(() => {
    if (isLoading || projects.length === 0) return;
    setExpanded((current) => {
      if (current.size > 0) return current;
      const open = new Set(projects.filter(needsDecision).map((project) => project.projectId));
      if (focusProjectId) open.add(focusProjectId);
      return open;
    });
    if (!projects.some(needsDecision)) setFilter("all");
    if (focusProjectId) {
      const target = projects.find((project) => project.projectId === focusProjectId);
      if (target && !needsDecision(target)) setFilter("all");
      requestAnimationFrame(() =>
        document.getElementById(`project-${focusProjectId}`)?.scrollIntoView({ block: "start" }),
      );
    }
  }, [focusProjectId, isLoading, projects]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const counts = useMemo(
    () => ({
      needs_decision: projects.filter(needsDecision).length,
      decided: projects.filter((project) => !needsDecision(project)).length,
      all: projects.length,
    }),
    [projects],
  );

  const visible = projects.filter((project) =>
    filter === "all" ? true : filter === "needs_decision" ? needsDecision(project) : !needsDecision(project),
  );
  const waitingBids = projects
    .filter((project) => project.projectStatus === "open_for_bids")
    .reduce((sum, project) => sum + project.bids.filter((bid) => bid.status === "pending").length, 0);

  const toggle = useCallback((projectId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }, []);

  const confirmDecision = async (): Promise<void> => {
    if (!decision) return;
    setIsDeciding(true);
    setDecisionError("");
    const action = decision.kind === "hire" ? "accept" : "decline";
    try {
      const response = await fetch(`${API_BASE_URL}/api/bids/${decision.bid.id}/${action}`, {
        method: "PATCH",
        credentials: "include",
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        setDecisionError(
          getErrorMessage(
            body,
            response.status === 409 ? "This project already has an engineer." : "Unable to update this bid.",
          ),
        );
        return;
      }
      setNotice(
        decision.kind === "hire"
          ? {
              text: `You hired ${decision.bid.engineerName}. They'll send a phase plan for your review next.`,
              projectId: decision.project.projectId,
            }
          : { text: `Declined ${decision.bid.engineerName}'s bid.`, projectId: null },
      );
      setDecision(null);
      setReloadKey((key) => key + 1);
      void workspace?.refresh();
    } catch {
      setDecisionError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsDeciding(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Bids"
        summary={
          isLoading
            ? "Compare the engineers who bid on your briefs."
            : waitingBids > 0
              ? `${countOf(waitingBids, "bid is", "bids are")} waiting across ${countOf(counts.needs_decision, "brief", "briefs")}. Hiring one engineer declines the rest for that brief.`
              : "No bids are waiting on you right now."
        }
      />

      {notice ? (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-5 py-3.5 text-sm font-semibold text-emerald-200"
        >
          {notice.text}
          {notice.projectId ? (
            <Link to={`/dashboard/client/projects/${notice.projectId}`} className="underline underline-offset-4">
              Open project
            </Link>
          ) : null}
        </p>
      ) : null}

      {isLoading ? (
        <section className={panelClassName} aria-label="Loading bids">
          {[0, 1].map((row) => (
            <div key={row} className="animate-pulse border-b border-white/10 px-6 py-6 last:border-b-0">
              <div className="h-6 w-1/3 rounded bg-white/10" />
              <div className="mt-3 h-3 w-1/4 rounded bg-white/10" />
            </div>
          ))}
        </section>
      ) : loadError ? (
        <ErrorPanel message={loadError} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : projects.length === 0 ? (
        <EmptyPanel
          title="No bids yet"
          body="Engineers' bids on your briefs show up here, with their price, rating and track record side by side."
          action={
            <Link to="/dashboard/client/network" className={primaryButtonClassName}>
              Browse engineers
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <FilterTabs
              options={[
                { key: "needs_decision", label: "Needs a decision", count: counts.needs_decision },
                { key: "decided", label: "Decided", count: counts.decided },
                { key: "all", label: "All", count: counts.all },
              ]}
              value={filter}
              onChange={setFilter}
              label="Filter briefs"
            />
            <FilterTabs
              options={[
                { key: "price", label: "Lowest price" },
                { key: "rating", label: "Best rated" },
                { key: "newest", label: "Newest" },
              ]}
              value={sort}
              onChange={setSort}
              label="Sort bids"
            />
          </div>

          {visible.length === 0 ? (
            <p className={`${panelClassName} px-6 py-8 text-sm text-white/55`}>
              {filter === "needs_decision"
                ? "Nothing waiting on you. Every bid has been answered."
                : "No briefs here yet."}
            </p>
          ) : (
            <div className="space-y-5">
              {visible.map((project) => (
                <ProjectBidsPanel
                  key={project.projectId}
                  project={project}
                  sort={sort}
                  isExpanded={expanded.has(project.projectId)}
                  onToggle={() => toggle(project.projectId)}
                  onHire={(bid) => {
                    setDecisionError("");
                    setDecision({ kind: "hire", bid, project });
                  }}
                  onDecline={(bid) => {
                    setDecisionError("");
                    setDecision({ kind: "decline", bid, project });
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {decision ? (
        <DecisionDialog
          decision={decision}
          isBusy={isDeciding}
          error={decisionError}
          onConfirm={() => void confirmDecision()}
          onClose={() => setDecision(null)}
        />
      ) : null}
    </div>
  );
}

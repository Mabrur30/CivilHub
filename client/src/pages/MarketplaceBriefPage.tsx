import { CheckIcon } from "@phosphor-icons/react";
import { type ReactElement, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BackButton } from "../components/BackButton";
import { formatRelativeTime } from "../components/dashboard/notificationUtils";
import {
  inlineLinkClassName,
  panelClassName,
  primaryButtonClassName,
} from "../components/dashboard/ui/buttonStyles";
import { PageHeader } from "../components/dashboard/ui/PageHeader";
import { EmptyPanel, ErrorPanel } from "../components/dashboard/ui/StatePanels";
import { CategoryIcon } from "../components/project/CategoryIcon";
import { ProjectRequirementsList } from "../components/project/ProjectRequirementsList";
import { SiteDetailsPanel } from "../components/project/SiteDetailsPanel";
import { MessageButton } from "../components/messages/MessageButton";
import { messageLink } from "../lib/messages";
import { useDashboardBase } from "../lib/dashboardPaths";
import { formatDate } from "../lib/format";
import { formatBudgetShort } from "../lib/money";
import {
  type ProjectRequirements,
  findCategory,
  useProjectCriteria,
} from "../lib/projectCriteria";
import { type PrivateSite, type PublicSite, toSite } from "../lib/siteDetails";
import { describeTimeline } from "../lib/timeline";
import { API_BASE_URL } from "../lib/apiBase";

interface ProjectBrief {
  id: string;
  title: string;
  clientId: string | null;
  clientName: string;
  description: string;
  budgetRange: string;
  budgetMin: number | null;
  budgetMax: number | null;
  targetStartDate: string | null;
  targetCompletionDate: string | null;
  location: string;
  postedDate: string;
  category: string;
  status: string;
  servicesNeeded: string[];
  requirements: ProjectRequirements | null;
  site: PublicSite | PrivateSite | null;
}

const toBrief = (value: unknown): ProjectBrief | null => {
  if (typeof value !== "object" || value === null) return null;
  const brief = value as Record<string, unknown>;
  if (
    typeof brief.id !== "string" ||
    typeof brief.title !== "string" ||
    typeof brief.description !== "string" ||
    typeof brief.category !== "string"
  ) {
    return null;
  }
  return {
    ...(brief as unknown as ProjectBrief),
    servicesNeeded: Array.isArray(brief.servicesNeeded)
      ? brief.servicesNeeded.filter((entry): entry is string => typeof entry === "string")
      : [],
    requirements:
      typeof brief.requirements === "object" && brief.requirements !== null
        ? (brief.requirements as ProjectRequirements)
        : null,
    site: toSite(brief.site),
  };
};

const getErrorMessage = (value: unknown, fallback: string): string =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { message?: unknown }).message === "string"
    ? (value as { message: string }).message
    : fallback;

function BriefSkeleton(): ReactElement {
  return (
    <div aria-busy="true" aria-label="Loading brief" className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className={`${panelClassName} h-96 animate-pulse`} />
      <div className={`${panelClassName} h-96 animate-pulse`} />
    </div>
  );
}

/** A client's brief in full, so an engineer can decide whether and what to bid. */
export function MarketplaceBriefPage(): ReactElement {
  const { projectId } = useParams<{ projectId: string }>();
  const base = useDashboardBase();
  const { spec } = useProjectCriteria();
  const [brief, setBrief] = useState<ProjectBrief | null>(null);
  const [hasBid, setHasBid] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>("");
  const [notFound, setNotFound] = useState<boolean>(false);
  const [retryKey, setRetryKey] = useState<number>(0);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    const load = async (): Promise<void> => {
      setIsLoading(true);
      setLoadError("");
      setNotFound(false);
      try {
        const [briefResponse, bidsResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/projects/${projectId}/brief`, { credentials: "include" }),
          fetch(`${API_BASE_URL}/api/bids/my-bids`, { credentials: "include" }),
        ]);
        const body: unknown = await briefResponse.json();
        if (!active) return;
        if (briefResponse.status === 404) {
          setNotFound(true);
          return;
        }
        const parsed = toBrief(body);
        if (!briefResponse.ok || !parsed) {
          setLoadError(getErrorMessage(body, "Unable to load this brief."));
          return;
        }
        setBrief(parsed);
        const bids: unknown = bidsResponse.ok ? await bidsResponse.json() : [];
        if (active && Array.isArray(bids)) {
          setHasBid(
            bids.some(
              (bid) =>
                typeof bid === "object" &&
                bid !== null &&
                (bid as { projectId?: unknown }).projectId === projectId,
            ),
          );
        }
      } catch {
        if (active) setLoadError("Unable to connect to CivilHub. Please try again.");
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [projectId, retryKey]);

  const back = <BackButton to={`${base}/marketplace`} label="Back to Marketplace" />;

  if (isLoading) {
    return (
      <div className="space-y-6">
        {back}
        <BriefSkeleton />
      </div>
    );
  }

  if (notFound || !brief) {
    return (
      <div className="space-y-6">
        {back}
        {loadError ? (
          <ErrorPanel message={loadError} onRetry={() => setRetryKey((key) => key + 1)} />
        ) : (
          <EmptyPanel
            title="This brief is no longer open"
            body="The client may have hired someone already. Other open briefs are in the marketplace."
          />
        )}
      </div>
    );
  }

  const criteria = findCategory(spec, brief.category);
  const posted = formatRelativeTime(brief.postedDate);
  const isOpen = brief.status === "open_for_bids";
  const serviceLabels = brief.servicesNeeded.map(
    (value) => spec?.services.find((service) => service.value === value)?.label ?? value,
  );
  const timeline =
    (brief.targetStartDate && brief.targetCompletionDate
      ? describeTimeline(brief.targetStartDate.slice(0, 10), brief.targetCompletionDate.slice(0, 10))
      : null) ?? "To be agreed";

  const bidAction = !isOpen ? null : hasBid ? (
    <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-5 py-3 text-sm font-semibold text-white/60">
      <CheckIcon aria-hidden="true" className="h-4 w-4" />
      Bid submitted
    </p>
  ) : (
    <Link to={`${base}/marketplace?project=${brief.id}`} className={primaryButtonClassName}>
      Submit bid
    </Link>
  );

  return (
    <div className="space-y-8">
      {back}
      <PageHeader
        title={brief.title}
        summary={`${criteria?.title ?? brief.category} in ${brief.location}. Posted ${
          posted ? posted.toLowerCase() : formatDate(brief.postedDate)
        } by ${brief.clientName}.`}
        action={
          <div className="flex flex-wrap gap-3">
            {brief.clientId ? (
              <MessageButton
                userId={brief.clientId}
                projectId={brief.id}
                label="Message client"
                size="page"
              />
            ) : null}
            {bidAction}
          </div>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="grid gap-6">
          <section aria-labelledby="brief-about" className={`${panelClassName} grid gap-5 p-5 sm:p-6`}>
            <div className="flex items-center gap-3">
              <CategoryIcon category={brief.category} weight="fill" className="h-6 w-6 text-primary" />
              <h2 id="brief-about" className="font-heading text-2xl font-bold text-white">
                About the project
              </h2>
            </div>
            <p className="whitespace-pre-line text-sm leading-6 text-white/70">{brief.description}</p>
            {serviceLabels.length > 0 ? (
              <div className="grid gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/45">
                  Services wanted
                </h3>
                <ul className="flex flex-wrap gap-1.5">
                  {serviceLabels.map((label) => (
                    <li key={label} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section aria-labelledby="brief-requirements" className={`${panelClassName} grid gap-5 p-5 sm:p-6`}>
            <h2 id="brief-requirements" className="font-heading text-2xl font-bold text-white">
              Project requirements
            </h2>
            {criteria && brief.requirements && Object.keys(brief.requirements).length > 0 ? (
              <ProjectRequirementsList criteria={criteria} requirements={brief.requirements} />
            ) : (
              <p className="text-sm text-white/55">
                The client posted this brief before project details were asked for.{" "}
                {brief.clientId ? (
                  <Link to={messageLink(brief.clientId, brief.id)} className={inlineLinkClassName}>
                    Message them
                  </Link>
                ) : (
                  "Message them"
                )}{" "}
                for plot size, storeys and approvals before you price it.
              </p>
            )}
          </section>
        </div>

        <div className="grid gap-6">
          <section aria-label="Budget and timeline" className={`${panelClassName} p-5 sm:p-6`}>
            <dl className="grid gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-white/50">Budget</dt>
                <dd className="text-right font-semibold tabular-nums text-white/90">
                  {formatBudgetShort(brief.budgetMin, brief.budgetMax, brief.budgetRange)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/50">Timeline</dt>
                <dd className="text-right text-white/85">{timeline}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-white/50">Client</dt>
                <dd className="text-right">
                  {brief.clientId ? (
                    <Link
                      to={`/profile/${brief.clientId}`}
                      state={{
                        backTo: `${base}/marketplace/${brief.id}`,
                        backLabel: "Back to brief",
                      }}
                      className={inlineLinkClassName}
                    >
                      {brief.clientName}
                    </Link>
                  ) : (
                    <span className="text-white/85">{brief.clientName}</span>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          {brief.site ? (
            <SiteDetailsPanel site={brief.site} siteOptions={spec?.siteOptions} headingId="brief-site" />
          ) : (
            <section aria-labelledby="brief-site" className={`${panelClassName} p-5 sm:p-6`}>
              <h2 id="brief-site" className="font-heading text-2xl font-bold text-white">
                Site
              </h2>
              <p className="mt-2 text-sm text-white/60">{brief.location}</p>
              <p className="mt-2 text-sm text-white/45">
                The client hasn't pinned the site on a map.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

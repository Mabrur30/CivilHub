import { type ReactElement, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  type ClientProject,
  describeProjectState,
  getProjectStage,
  type ProjectStage,
  projectHref,
  stageLabels,
} from "../components/dashboard/client/clientData";
import { useClientProjects } from "../components/dashboard/client/useClientProjects";
import {
  panelClassName,
  primaryButtonClassName,
  quietLinkClassName,
} from "../components/dashboard/ui/buttonStyles";
import { FilterTabs } from "../components/dashboard/ui/FilterTabs";
import { PageHeader } from "../components/dashboard/ui/PageHeader";
import { ProgressBar } from "../components/dashboard/ui/ProgressBar";
import { EmptyPanel, ErrorPanel } from "../components/dashboard/ui/StatePanels";
import { countOf, formatDate } from "../lib/format";
import { dueToneClassName, getDueLabel } from "../lib/projectProgress";

type StageFilter = "all" | ProjectStage;

const stageOrder: ProjectStage[] = [
  "taking_bids",
  "planning",
  "in_delivery",
  "cancelled",
];

const stagePhrase: Record<Exclude<ProjectStage, "cancelled">, (count: number) => string> = {
  taking_bids: (count) => countOf(count, "brief taking bids", "briefs taking bids"),
  planning: (count) => `${count} in planning`,
  in_delivery: (count) => `${count} in delivery`,
};

const getSummary = (projects: ClientProject[]): string => {
  if (projects.length === 0) return "Everything you have posted, by stage.";
  const parts = (["taking_bids", "planning", "in_delivery"] as const)
    .map((stage) => ({
      stage,
      count: projects.filter((project) => getProjectStage(project) === stage)
        .length,
    }))
    .filter((entry) => entry.count > 0)
    .map((entry) => stagePhrase[entry.stage](entry.count));
  const needYou = projects.filter(
    (project) => describeProjectState(project).needsYou,
  ).length;
  const decisions =
    needYou > 0
      ? `${countOf(needYou, "project needs", "projects need")} your decision.`
      : "Nothing is waiting on you.";
  if (parts.length === 0) return decisions;
  const listed = parts.join(", ");
  return `${listed.charAt(0).toUpperCase()}${listed.slice(1)}. ${decisions}`;
};

function StageDetail({ project }: { project: ClientProject }): ReactElement {
  const stage = getProjectStage(project);
  if (stage === "in_delivery") {
    return (
      <div>
        <ProgressBar
          value={project.progressPercentage}
          label={`${project.projectName} progress`}
        />
        <p className="mt-1.5 truncate text-sm text-white/55">
          {project.currentPhaseName}
        </p>
      </div>
    );
  }
  if (stage === "taking_bids") {
    return (
      <p className="text-sm text-white/60">
        <span className="font-semibold text-white/85">
          {countOf(project.bidCount, "bid", "bids")}
        </span>
        <span className="text-white/45"> on a {project.budgetRange} budget</span>
      </p>
    );
  }
  return (
    <p className="text-sm text-white/60">
      {project.assignedEngineer
        ? `Hired ${project.assignedEngineer}`
        : "No engineer hired"}
    </p>
  );
}

function StateColumn({ project }: { project: ClientProject }): ReactElement {
  const state = describeProjectState(project);
  if (state.needsYou) {
    return (
      <p className="text-sm font-semibold text-violet-200">{state.text}</p>
    );
  }

  const due =
    getProjectStage(project) === "in_delivery" && project.nextMilestoneDueDate
      ? getDueLabel({
          id: project.id,
          projectName: project.projectName,
          clientName: "",
          currentPhaseName: project.currentPhaseName,
          progressPercentage: project.progressPercentage,
          nextMilestone: project.nextMilestone,
          nextMilestoneDueDate: project.nextMilestoneDueDate,
        })
      : null;

  return (
    <>
      <p className="truncate text-sm text-white/70">
        {getProjectStage(project) === "in_delivery"
          ? project.nextMilestone
          : getProjectStage(project) === "planning"
            ? "Drafting the phase plan"
            : state.text}
      </p>
      {due ? (
        <p
          className={`mt-1 text-sm font-semibold ${dueToneClassName[due.tone]}`}
          title={due.fullDate}
        >
          {due.text}
        </p>
      ) : null}
    </>
  );
}

function ProjectRow({
  project,
  isHighlighted,
}: {
  project: ClientProject;
  isHighlighted: boolean;
}): ReactElement {
  return (
    <li>
      <Link
        to={projectHref(project)}
        className={`grid gap-4 px-5 py-5 transition-colors hover:bg-white/4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-glow sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-6 ${
          isHighlighted ? "bg-primary/6" : ""
        }`}
      >
        <div className="min-w-0 lg:col-span-5">
          <p className="truncate font-heading text-xl font-bold text-white">
            {project.projectName}
          </p>
          <p className="mt-1 truncate text-sm text-white/50">
            {project.category}, posted {formatDate(project.postedDate)}
          </p>
        </div>
        <div className="min-w-0 lg:col-span-4">
          <StageDetail project={project} />
        </div>
        <div className="min-w-0 lg:col-span-3 lg:text-right">
          <StateColumn project={project} />
        </div>
      </Link>
    </li>
  );
}

function StagePanel({
  stage,
  projects,
  highlightId,
}: {
  stage: ProjectStage;
  projects: ClientProject[];
  highlightId: string | null;
}): ReactElement {
  const headingId = `stage-${stage}`;
  return (
    <section className={panelClassName} aria-labelledby={headingId}>
      <div className="flex items-baseline justify-between gap-4 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
        <h2 id={headingId} className="font-heading text-2xl font-bold text-white">
          {stageLabels[stage]}
        </h2>
        <span className="text-sm text-white/45">
          {countOf(projects.length, "project", "projects")}
        </span>
      </div>
      <ul className="divide-y divide-white/10 border-t border-white/10">
        {projects.map((project) => (
          <ProjectRow
            key={project.id}
            project={project}
            isHighlighted={project.id === highlightId}
          />
        ))}
      </ul>
    </section>
  );
}

export function ClientProjectsPage(): ReactElement {
  const { projects, isLoading, error, reload } = useClientProjects();
  const [filter, setFilter] = useState<StageFilter>("all");
  const location = useLocation();
  const justPosted =
    (location.state as { justPosted?: string } | null)?.justPosted ?? null;
  const [notice, setNotice] = useState<string>(
    justPosted ? "Brief posted. Engineers can bid on it now." : "",
  );

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const byStage = useMemo(() => {
    const groups = new Map<ProjectStage, ClientProject[]>();
    for (const project of projects) {
      const stage = getProjectStage(project);
      groups.set(stage, [...(groups.get(stage) ?? []), project]);
    }
    return groups;
  }, [projects]);

  const filterOptions: { key: StageFilter; label: string; count?: number }[] = [
    { key: "all", label: "All", count: projects.length },
    ...stageOrder
      .filter((stage) => stage !== "cancelled" || byStage.has("cancelled"))
      .map((stage) => ({
        key: stage,
        label: stageLabels[stage],
        count: byStage.get(stage)?.length ?? 0,
      })),
  ];

  const visibleStages = stageOrder.filter(
    (stage) =>
      (filter === "all" || filter === stage) &&
      (byStage.get(stage)?.length ?? 0) > 0,
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="My projects"
        summary={isLoading ? "Everything you have posted, by stage." : getSummary(projects)}
      />

      {notice ? (
        <p
          role="status"
          className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-5 py-3.5 text-sm font-semibold text-emerald-200"
        >
          {notice}
        </p>
      ) : null}

      {isLoading ? (
        <section className={panelClassName} aria-label="Loading projects">
          <ul className="divide-y divide-white/10">
            {[0, 1, 2].map((row) => (
              <li key={row} className="animate-pulse px-6 py-6">
                <div className="h-5 w-1/3 rounded bg-white/10" />
                <div className="mt-3 h-3 w-1/4 rounded bg-white/10" />
              </li>
            ))}
          </ul>
        </section>
      ) : error ? (
        <ErrorPanel message={error} onRetry={reload} />
      ) : projects.length === 0 ? (
        <EmptyPanel
          title="No projects yet"
          body="Post a brief with your budget and timeline, and engineers can start bidding on it."
          action={
            <Link to="/dashboard/client/post-project" className={primaryButtonClassName}>
              Post a project
            </Link>
          }
        />
      ) : (
        <>
          <FilterTabs
            options={filterOptions}
            value={filter}
            onChange={setFilter}
            label="Filter projects by stage"
          />
          {visibleStages.length === 0 ? (
            <p className={`${panelClassName} px-6 py-8 text-sm text-white/55`}>
              No projects at this stage.
            </p>
          ) : (
            visibleStages.map((stage) => (
              <StagePanel
                key={stage}
                stage={stage}
                projects={byStage.get(stage) ?? []}
                highlightId={justPosted}
              />
            ))
          )}
        </>
      )}

      <p className="text-sm text-white/50">
        Finished projects move to{" "}
        <Link to="/dashboard/client/history" className={quietLinkClassName}>
          History
        </Link>
        .
      </p>
    </div>
  );
}

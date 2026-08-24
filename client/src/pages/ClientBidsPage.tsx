import { type ReactElement, useState } from "react";

interface ClientBid {
  id: string;
  engineerName: string;
  amount: string;
  message: string;
  submittedDate: string;
}
interface ProjectBids {
  projectId: string;
  projectName: string;
  bids: ClientBid[];
}
type BidDecision = "accepted" | "declined" | "pending";

const projects: ProjectBids[] = [
  {
    projectId: "northline-bypass",
    projectName: "Northline By-Pass",
    bids: [
      {
        id: "nb-1",
        engineerName: "Morgan Rivera",
        amount: "$210,000",
        message:
          "Our transport design team can mobilize within two weeks and has delivered comparable corridor upgrades.",
        submittedDate: "Aug 21, 2026",
      },
      {
        id: "nb-2",
        engineerName: "Amara Stone",
        amount: "$228,000",
        message:
          "We bring deep highway and stakeholder coordination experience across the region.",
        submittedDate: "Aug 22, 2026",
      },
    ],
  },
  {
    projectId: "east-ridge-water",
    projectName: "East Ridge Water Main",
    bids: [
      {
        id: "er-1",
        engineerName: "Theo Bennett",
        amount: "$145,000",
        message:
          "Our utilities practice specializes in staged delivery in constrained urban corridors.",
        submittedDate: "Aug 23, 2026",
      },
      {
        id: "er-2",
        engineerName: "Priya Shah",
        amount: "$132,000",
        message:
          "We can provide a lean survey-to-construction package with clear approval gates.",
        submittedDate: "Aug 24, 2026",
      },
    ],
  },
];

export function ClientBidsPage(): ReactElement {
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(projects.map((project) => project.projectId)),
  );
  const [decisions, setDecisions] = useState<Record<string, BidDecision>>({});
  const decide = (
    project: ProjectBids,
    bidId: string,
    decision: BidDecision,
  ): void => {
    setDecisions((current) => {
      const next = { ...current };
      project.bids.forEach((bid) => {
        next[bid.id] =
          decision === "accepted" && bid.id !== bidId
            ? "declined"
            : bid.id === bidId
              ? decision
              : (current[bid.id] ?? "pending");
      });
      return next;
    });
  };
  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
          Partner selection
        </p>
        <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Bids
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Review proposals side by side and choose the team that best fits each
          brief.
        </p>
      </div>
      <div className="space-y-5">
        {projects.map((project) => {
          const isExpanded = expanded.has(project.projectId);
          return (
            <section
              key={project.projectId}
              className="rounded-2xl border border-white/10 bg-surface"
            >
              <button
                type="button"
                onClick={() =>
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(project.projectId))
                      next.delete(project.projectId);
                    else next.add(project.projectId);
                    return next;
                  })
                }
                className="flex w-full items-center justify-between gap-4 p-6 text-left"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                    {project.bids.length} proposals
                  </p>
                  <h2 className="mt-2 font-heading text-2xl font-bold text-white">
                    {project.projectName}
                  </h2>
                </div>
                <span className="text-white/50">{isExpanded ? "-" : "+"}</span>
              </button>
              {isExpanded ? (
                <div className="space-y-3 border-t border-white/10 p-4 sm:p-6">
                  {project.bids.map((bid) => {
                    const decision = decisions[bid.id] ?? "pending";
                    return (
                      <article
                        key={bid.id}
                        className={`rounded-xl border p-5 ${decision === "accepted" ? "border-emerald-400/40 bg-emerald-400/5" : decision === "declined" ? "border-white/5 bg-black/10 opacity-60" : "border-white/10 bg-void/50"}`}
                      >
                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                          <div>
                            <h3 className="font-heading text-xl font-bold text-white">
                              {bid.engineerName}
                            </h3>
                            <p className="mt-1 text-xs text-white/40">
                              Submitted {bid.submittedDate}
                            </p>
                          </div>
                          <p className="font-heading text-2xl font-bold text-primary">
                            {bid.amount}
                          </p>
                        </div>
                        <p className="mt-4 text-sm leading-6 text-white/60">
                          {bid.message}
                        </p>
                        <div className="mt-5 flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            disabled={decision !== "pending"}
                            onClick={() => decide(project, bid.id, "accepted")}
                            className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-glow disabled:cursor-not-allowed disabled:bg-emerald-500/20 disabled:text-emerald-200"
                          >
                            {decision === "accepted"
                              ? "Accepted"
                              : "Accept Bid"}
                          </button>
                          <button
                            type="button"
                            disabled={decision !== "pending"}
                            onClick={() => decide(project, bid.id, "declined")}
                            className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/70 hover:border-red-300 hover:text-red-200 disabled:cursor-not-allowed"
                          >
                            {decision === "declined" ? "Declined" : "Decline"}
                          </button>
                          {decision === "accepted" ? (
                            <span className="text-xs font-semibold text-emerald-300">
                              Selected for this project
                            </span>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

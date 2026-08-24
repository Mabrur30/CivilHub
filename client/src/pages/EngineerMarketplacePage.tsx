import { type FormEvent, type ReactElement, useEffect, useState } from "react";

interface MarketplaceProject {
  id: string;
  title: string;
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

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const isMarketplaceProject = (value: unknown): value is MarketplaceProject => {
  if (typeof value !== "object" || value === null) return false;
  const project = value as Record<string, unknown>;
  return (
    typeof project.id === "string" &&
    typeof project.title === "string" &&
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

const formatPostedDate = (date: string): string => {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString();
};

const ProjectSkeleton = (): ReactElement => (
  <div className="animate-pulse rounded-2xl border border-white/10 bg-surface p-6">
    <div className="h-4 w-1/3 rounded bg-white/10" />
    <div className="mt-5 h-7 w-2/3 rounded bg-white/10" />
    <div className="mt-4 h-16 rounded bg-white/10" />
    <div className="mt-6 h-11 rounded bg-white/10" />
  </div>
);

export function EngineerMarketplacePage(): ReactElement {
  const [projects, setProjects] = useState<MarketplaceProject[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>("");
  const [retryKey, setRetryKey] = useState<number>(0);
  const [category, setCategory] = useState<string>("All categories");
  const [budget, setBudget] = useState<string>("Any budget");
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

  const categories = [
    "All categories",
    ...new Set(projects.map((project) => project.category)),
  ];
  const filteredProjects = projects.filter((project) => {
    const matchesCategory =
      category === "All categories" || project.category === category;
    const matchesSearch =
      `${project.title} ${project.clientName} ${project.location}`
        .toLowerCase()
        .includes(search.toLowerCase());
    const matchesBudget =
      budget === "Any budget" ||
      (budget === "Under $250k" &&
        /\$([0-2]?\d\d)k/.test(project.budgetRange)) ||
      (budget === "$250k - $500k" && project.budgetRange.includes("320")) ||
      (budget === "Over $500k" && project.budgetRange.includes("500"));
    return matchesCategory && matchesSearch && matchesBudget;
  });

  const openBidModal = (project: MarketplaceProject): void => {
    setSelectedProject(project);
    setBid({ amount: "", message: "" });
    setBidError("");
  };

  const submitBid = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!selectedProject) return;
    const amount = Number(bid.amount.replace(/[$,]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      setBidError("Enter a positive bid amount.");
      return;
    }
    setBidError("");
    setIsSubmitting(true);
    const requestBody: SubmitBidRequestBody = {
      projectId: selectedProject.id,
      amount,
      message: bid.message,
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
      window.setTimeout(() => setSuccessMessage(""), 4000);
    } catch {
      setBidError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
          Find your next brief
        </p>
        <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Marketplace
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Explore open civil opportunities from clients looking for the right
          technical partner.
        </p>
      </div>
      {successMessage ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-200"
        >
          {successMessage}
        </p>
      ) : null}
      <div className="grid gap-3 rounded-2xl border border-white/10 bg-surface p-4 md:grid-cols-[1.2fr_1fr_1fr]">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search projects, clients, or locations"
          className="rounded-xl border border-white/10 bg-void px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-primary"
        />
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="rounded-xl border border-white/10 bg-void px-4 py-3 text-sm text-white outline-none focus:border-primary"
          aria-label="Filter by category"
        >
          {categories.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <select
          value={budget}
          onChange={(event) => setBudget(event.target.value)}
          className="rounded-xl border border-white/10 bg-void px-4 py-3 text-sm text-white outline-none focus:border-primary"
        >
          <option>Any budget</option>
          <option>Under $250k</option>
          <option>$250k - $500k</option>
          <option>Over $500k</option>
        </select>
      </div>

      {isLoading ? (
        <section
          className="grid gap-5 lg:grid-cols-2"
          aria-label="Loading marketplace projects"
        >
          <ProjectSkeleton />
          <ProjectSkeleton />
        </section>
      ) : loadError ? (
        <section
          className="rounded-2xl border border-red-400/20 bg-red-400/5 p-8 text-center"
          role="alert"
        >
          <p className="text-sm text-red-200">{loadError}</p>
          <button
            type="button"
            onClick={() => setRetryKey((key) => key + 1)}
            className="mt-5 rounded-full border border-primary px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary hover:text-white"
          >
            Try again
          </button>
        </section>
      ) : filteredProjects.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-white/15 bg-surface/50 p-12 text-center">
          <h2 className="font-heading text-3xl font-bold text-white">
            No open projects yet
          </h2>
          <p className="mt-3 text-sm text-white/55">
            Check back soon for new opportunities that match your expertise.
          </p>
        </section>
      ) : (
        <section
          className="grid gap-5 lg:grid-cols-2"
          aria-label="Marketplace projects"
        >
          {filteredProjects.map((project) => {
            const hasSubmittedBid = submittedProjectIds.has(project.id);
            return (
              <article
                key={project.id}
                className="rounded-2xl border border-white/10 bg-surface p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    {project.category}
                  </span>
                  <span className="text-xs text-white/40">
                    {formatPostedDate(project.postedDate)}
                  </span>
                </div>
                <h2 className="mt-5 font-heading text-2xl font-bold text-white">
                  {project.title}
                </h2>
                <p className="mt-2 text-sm font-semibold text-white/65">
                  {project.clientName}
                </p>
                <p className="mt-4 text-sm leading-6 text-white/55">
                  {project.description}
                </p>
                <div className="mt-6 grid grid-cols-2 gap-4 border-y border-white/10 py-4 text-sm">
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-white/35">
                      Budget
                    </p>
                    <p className="mt-2 font-semibold text-white/85">
                      {project.budgetRange}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-white/35">
                      Location
                    </p>
                    <p className="mt-2 font-semibold text-white/85">
                      {project.location}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={hasSubmittedBid}
                  onClick={() => openBidModal(project)}
                  className="mt-5 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-glow disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/50"
                >
                  {hasSubmittedBid ? "Bid Submitted" : "Submit Bid"}
                </button>
              </article>
            );
          })}
        </section>
      )}

      {selectedProject ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSubmitting)
              setSelectedProject(null);
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl sm:p-8"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bid-dialog-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Submit a bid
                </p>
                <h2
                  id="bid-dialog-title"
                  className="mt-2 font-heading text-2xl font-bold text-white"
                >
                  {selectedProject.title}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close bid modal"
                disabled={isSubmitting}
                onClick={() => setSelectedProject(null)}
                className="text-xl text-white/50 hover:text-white disabled:opacity-40"
              >
                &times;
              </button>
            </div>
            <form onSubmit={submitBid} className="mt-6 space-y-5">
              <div>
                <label
                  htmlFor="bid-amount"
                  className="mb-2 block text-sm font-semibold text-white/75"
                >
                  Bid amount
                </label>
                <input
                  id="bid-amount"
                  required
                  value={bid.amount}
                  onChange={(event) =>
                    setBid({ ...bid, amount: event.target.value })
                  }
                  placeholder="$0"
                  className="w-full rounded-xl border border-white/10 bg-void px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-primary"
                />
              </div>
              <div>
                <label
                  htmlFor="bid-message"
                  className="mb-2 block text-sm font-semibold text-white/75"
                >
                  Message
                </label>
                <textarea
                  id="bid-message"
                  required
                  rows={4}
                  value={bid.message}
                  onChange={(event) =>
                    setBid({ ...bid, message: event.target.value })
                  }
                  placeholder="Tell the client why your team is a strong fit"
                  className="w-full resize-none rounded-xl border border-white/10 bg-void px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-primary"
                />
              </div>
              {bidError ? (
                <p role="alert" className="text-sm text-red-300">
                  {bidError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-glow disabled:cursor-wait disabled:opacity-60"
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

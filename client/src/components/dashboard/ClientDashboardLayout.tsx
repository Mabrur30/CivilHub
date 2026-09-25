import { type ReactElement } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  ClientWorkspaceProvider,
  useClientWorkspace,
} from "./client/ClientWorkspace";
import { TopNavAlerts } from "./TopNavAlerts";
import { UserMenu } from "./UserMenu";

const tabs = [
  { label: "Overview", to: "/dashboard/client/overview" },
  { label: "My Projects", to: "/dashboard/client/projects" },
  { label: "Project History", to: "/dashboard/client/history" },
  { label: "Post a Project", to: "/dashboard/client/post-project" },
  { label: "Cost Estimator", to: "/dashboard/client/cost-estimator" },
  { label: "Bids", to: "/dashboard/client/bids" },
  { label: "Browse Engineers", to: "/dashboard/client/network" },
];

// Fades the right edge of the tab row while it can still scroll on narrow
// screens, so the hidden tabs read as "more this way" rather than cut off.
const tabRowFade =
  "[mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] lg:[mask-image:none]";

export function ClientDashboardLayout(): ReactElement {
  return (
    <ClientWorkspaceProvider>
      <ClientShell />
    </ClientWorkspaceProvider>
  );
}

// Same shell as the engineer dashboard. The tabs for My Projects and Bids
// carry a count of what is waiting on the client.
function ClientShell(): ReactElement {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const overview = useClientWorkspace()?.overview;

  const counts: Record<string, number> = {
    "/dashboard/client/projects":
      overview?.actionItems.filter((item) => item.kind !== "bids_review")
        .length ?? 0,
    "/dashboard/client/bids": overview?.pendingBidReviews ?? 0,
  };

  return (
    <div className="min-h-screen bg-void text-white">
      <div className="sticky top-0 z-30 border-b border-white/10 bg-void/90 backdrop-blur-md">
        <header>
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => navigate("/dashboard/client")}
              className="flex items-center gap-3 rounded-full text-white transition-opacity duration-300 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-glow"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/60 bg-primary/10 text-sm font-bold text-primary">
                C
              </span>
              <span className="font-heading text-xl font-bold tracking-tight">
                CivilHub
              </span>
            </button>

            <div className="flex items-center gap-3">
              <TopNavAlerts role="client" />
              {currentUser ? (
                <UserMenu
                  name={currentUser.name}
                  email={currentUser.email}
                  role={currentUser.role}
                  photoUrl={currentUser.profilePhotoUrl}
                  onViewProfile={() => navigate(`/profile/${currentUser.id}`)}
                  onLogout={logout}
                />
              ) : null}
            </div>
          </div>
        </header>

        <nav aria-label="Client dashboard navigation">
          <div
            className={`scrollbar-hidden mx-auto flex max-w-7xl overflow-x-auto px-2 sm:px-4 lg:px-6 ${tabRowFade}`}
          >
            {tabs.map((tab) => {
              const count = counts[tab.to] ?? 0;
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  aria-label={count > 0 ? `${tab.label}, ${count} waiting` : undefined}
                  className={({ isActive }) =>
                    `-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-glow ${
                      isActive
                        ? "border-primary text-white"
                        : "border-transparent text-white/50 hover:text-white/85"
                    }`
                  }
                >
                  {tab.label}
                  {count > 0 ? (
                    <span className="rounded-full bg-primary/15 px-1.5 text-xs tabular-nums text-glow">
                      {count}
                    </span>
                  ) : null}
                </NavLink>
              );
            })}
          </div>
        </nav>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
        <Outlet />
      </main>
    </div>
  );
}

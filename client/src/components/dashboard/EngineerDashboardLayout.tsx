import { type ReactElement } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { TopNavAlerts } from "./TopNavAlerts";
import { UserMenu } from "./UserMenu";

interface EngineerDashboardLayoutProps {}

const tabs = [
  { label: "Overview", to: "/dashboard/engineer/overview" },
  { label: "My Projects", to: "/dashboard/engineer/projects" },
  { label: "Project History", to: "/dashboard/engineer/history" },
  { label: "Marketplace", to: "/dashboard/engineer/marketplace" },
  { label: "Equipment", to: "/dashboard/engineer/equipment" },
  { label: "Cost Estimator", to: "/dashboard/engineer/cost-estimator" },
  { label: "My Bids", to: "/dashboard/engineer/bids" },
  { label: "My Network", to: "/dashboard/engineer/network" },
];

// Fades the right edge of the tab row while it can still scroll on narrow
// screens, so the hidden tabs read as "more this way" rather than cut off.
const tabRowFade =
  "[mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] lg:[mask-image:none]";

export function EngineerDashboardLayout(
  _props: EngineerDashboardLayoutProps,
): ReactElement {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();

  return (
    <div className="min-h-screen bg-void text-white">
      <div className="sticky top-0 z-30 border-b border-white/10 bg-void/90 backdrop-blur-md">
        <header>
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => navigate("/dashboard/engineer")}
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
              <TopNavAlerts role="engineer" />
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

        <nav aria-label="Engineer dashboard navigation">
          <div
            className={`scrollbar-hidden mx-auto flex max-w-7xl overflow-x-auto px-2 sm:px-4 lg:px-6 ${tabRowFade}`}
          >
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  `-mb-px whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-glow ${
                    isActive
                      ? "border-primary text-white"
                      : "border-transparent text-white/50 hover:text-white/85"
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
        <Outlet />
      </main>
    </div>
  );
}

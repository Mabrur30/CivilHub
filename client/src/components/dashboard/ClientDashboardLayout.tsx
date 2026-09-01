import { type ReactElement } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { TopNavAlerts } from "./TopNavAlerts";
import { UserMenu } from "./UserMenu";

interface ClientDashboardLayoutProps {}

const tabs = [
  { label: "Overview", to: "/dashboard/client/overview" },
  { label: "My Projects", to: "/dashboard/client/projects" },
  { label: "Project History", to: "/dashboard/client/history" },
  { label: "Post a Project", to: "/dashboard/client/post-project" },
  { label: "Bids", to: "/dashboard/client/bids" },
  { label: "My Network", to: "/dashboard/client/network" },
];

export function ClientDashboardLayout(
  _props: ClientDashboardLayoutProps,
): ReactElement {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();

  return (
    <div className="min-h-screen bg-void text-white">
      <header className="border-b border-white/10 bg-void/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate("/dashboard/client")}
            className="flex items-center gap-3 text-white transition-opacity hover:opacity-90"
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
                onViewProfile={() => navigate("/dashboard/client/profile")}
                onLogout={logout}
              />
            ) : null}
          </div>
        </div>
      </header>
      <nav
        className="border-b border-white/10 bg-surface/60"
        aria-label="Client dashboard navigation"
      >
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `whitespace-nowrap border-b-2 px-4 py-4 text-sm font-semibold transition-colors ${isActive ? "border-primary bg-primary/10 text-white" : "border-transparent text-white/50 hover:text-white"}`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <Outlet />
      </main>
    </div>
  );
}

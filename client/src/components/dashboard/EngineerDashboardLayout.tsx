import { type ReactElement } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

interface EngineerDashboardLayoutProps {}

const tabs = [
  { label: "Overview", to: "/dashboard/engineer/overview" },
  { label: "My Projects", to: "/dashboard/engineer/projects" },
  { label: "Marketplace", to: "/dashboard/engineer/marketplace" },
  { label: "My Bids", to: "/dashboard/engineer/bids" },
  { label: "My Network", to: "/dashboard/engineer/network" },
  { label: "Profile", to: "/dashboard/engineer/profile" },
];

export function EngineerDashboardLayout(
  _props: EngineerDashboardLayoutProps,
): ReactElement {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();

  const initials = currentUser?.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-void text-white">
      <header className="border-b border-white/10 bg-void/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-3 text-white transition-opacity duration-300 hover:opacity-90"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/60 bg-primary/10 text-sm font-bold text-primary">
              C
            </span>
            <span className="font-heading text-xl font-bold tracking-tight">
              CivilHub
            </span>
          </button>

          <div className="flex items-center gap-3">
            <Link
              to="/messages"
              className="rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-white/70 transition-colors hover:border-primary hover:text-white"
            >
              Messages
            </Link>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-white">
                {currentUser?.name}
              </p>
              <p className="text-xs capitalize text-white/50">
                {currentUser?.role}
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
              {initials}
            </span>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-white/70 transition-colors hover:border-primary hover:text-white"
            >
              Log Out
            </button>
          </div>
        </div>
      </header>

      <nav
        className="border-b border-white/10 bg-surface/60"
        aria-label="Engineer dashboard navigation"
      >
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `whitespace-nowrap border-b-2 px-4 py-4 text-sm font-semibold transition-colors ${
                  isActive
                    ? "border-primary bg-primary/10 text-white"
                    : "border-transparent text-white/50 hover:text-white"
                }`
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

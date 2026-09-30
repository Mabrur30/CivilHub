import {
  ArrowUUpLeftIcon,
  ClipboardTextIcon,
  FlagIcon,
  GaugeIcon,
  HandCoinsIcon,
  ReceiptIcon,
  ScalesIcon,
  SealCheckIcon,
  SignOutIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { type ReactElement } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

const links = [
  { to: "/", label: "Overview", icon: GaugeIcon, end: true },
  { to: "/reports", label: "Reports", icon: FlagIcon, end: false },
  { to: "/users", label: "Accounts", icon: UsersThreeIcon, end: false },
  { to: "/payouts", label: "Payouts", icon: HandCoinsIcon, end: false },
  { to: "/refunds", label: "Refunds", icon: ArrowUUpLeftIcon, end: false },
  { to: "/verifications", label: "Verification", icon: SealCheckIcon, end: false },
  { to: "/deposits", label: "Deposits", icon: ScalesIcon, end: false },
  { to: "/payments", label: "Payments", icon: ReceiptIcon, end: false },
  { to: "/log", label: "Action log", icon: ClipboardTextIcon, end: false },
];

export function Layout(): ReactElement {
  const { admin, signOut } = useAuth();
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-white/10 bg-surface md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2 p-4 md:block md:p-5">
          <p className="font-heading text-xl font-bold text-white">
            CivilHub <span className="text-primary">Admin</span>
          </p>
          <p className="hidden text-xs text-white/45 md:mt-1 md:block">{admin?.email}</p>
        </div>
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:space-y-1 md:px-3">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                  isActive ? "bg-primary/15 text-primary" : "text-white/65 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-white/50 transition-colors hover:bg-white/5 hover:text-white md:mt-4 md:w-full"
          >
            <SignOutIcon aria-hidden="true" className="h-4 w-4" />
            Sign out
          </button>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

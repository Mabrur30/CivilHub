import { type ReactElement } from "react";
import { NavLink } from "react-router-dom";

interface EquipmentSectionTabsProps {
  className?: string;
}

const tabs = [
  { label: "Browse", to: "/dashboard/engineer/equipment/browse" },
  { label: "My Listings", to: "/dashboard/engineer/equipment/mine" },
  { label: "My Bookings", to: "/dashboard/engineer/equipment/bookings" },
];

export function EquipmentSectionTabs({
  className = "",
}: EquipmentSectionTabsProps): ReactElement {
  return (
    <nav
      className={`overflow-x-auto rounded-2xl border border-white/10 bg-surface/70 p-1 ${className}`}
      aria-label="Equipment section navigation"
    >
      <div className="flex min-w-max gap-1">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-primary text-white"
                  : "text-white/65 hover:bg-white/5 hover:text-white"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

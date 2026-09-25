import { type ReactElement } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { equipmentPathsFor } from "./equipment/paths";

interface EquipmentSectionTabsProps {
  className?: string;
}

export function EquipmentSectionTabs({
  className = "",
}: EquipmentSectionTabsProps): ReactElement {
  const { currentUser } = useAuth();
  const isClient = currentUser?.role === "client";
  const paths = equipmentPathsFor(isClient ? "client" : "engineer");
  // Clients rent but don't list equipment.
  const tabs = [
    { label: "Browse", to: paths.browse },
    ...(isClient ? [] : [{ label: "My listings", to: paths.mine }]),
    { label: "My bookings", to: paths.bookings },
  ];

  return (
    <nav
      className={`scrollbar-hidden w-fit max-w-full overflow-x-auto rounded-full border border-white/10 bg-surface p-1 ${className}`}
      aria-label="Equipment section navigation"
    >
      <div className="flex min-w-max gap-1">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `block rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-glow ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-white/55 hover:text-white"
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

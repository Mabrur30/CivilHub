import { type ReactElement } from "react";
import { Link } from "react-router-dom";
import { formatCurrency } from "../../../lib/format";
import { useEquipmentPaths } from "../../dashboard/equipment/paths";
import { panelClassName } from "../../dashboard/ui/buttonStyles";
import { type ProfileListing } from "./profileTypes";

/** Machines an engineer or company has up for rent, linking to each listing. */
export function ProfileEquipment({
  listings,
  emptyText,
  headingId,
}: {
  listings: ProfileListing[];
  emptyText: string;
  headingId: string;
}): ReactElement {
  const equipmentPaths = useEquipmentPaths();

  return (
    <section className={`${panelClassName} p-6`} aria-labelledby={headingId}>
      <h2 id={headingId} className="font-heading text-2xl font-bold text-white">
        Equipment for rent
      </h2>
      {listings.length === 0 ? (
        <p className="mt-3 text-sm text-white/55">{emptyText}</p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {listings.map((item) => (
            <li key={item.id}>
              <Link
                to={equipmentPaths.listing(item.id)}
                className="flex gap-3 rounded-xl border border-white/10 bg-void/45 p-3 transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow"
              >
                {item.photoUrl ? (
                  <img
                    src={item.photoUrl}
                    alt=""
                    className="h-16 w-20 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span className="h-16 w-20 shrink-0 rounded-lg bg-white/5" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-white/55">
                    {item.category}
                    {item.quantity > 1 ? ` · ${item.quantity} units` : ""}
                  </span>
                  <span className="mt-1 block text-sm font-semibold tabular-nums text-white/85">
                    {formatCurrency(item.dailyRate)}
                    <span className="font-normal text-white/50">/day</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

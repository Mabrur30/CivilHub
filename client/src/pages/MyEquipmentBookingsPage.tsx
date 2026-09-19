import { type ReactElement, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { EquipmentSectionTabs } from "../components/dashboard/EquipmentSectionTabs";
import { RatingBadge } from "../components/RatingBadge";
import {
  fetchMyEquipmentBookings,
  payEquipmentBooking,
  type EquipmentBookingBucket,
  type EquipmentMyBooking,
} from "./equipment.api";

const BUCKETS: EquipmentBookingBucket[] = [
  "pending",
  "upcoming",
  "active",
  "history",
];

const bucketLabel: Record<EquipmentBookingBucket, string> = {
  pending: "Pending",
  upcoming: "Upcoming",
  active: "Active",
  history: "History",
};

const statusLabel: Record<EquipmentMyBooking["status"], string> = {
  pending: "Pending approval",
  approved: "Approved",
  in_progress: "In progress",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
};

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const formatDateRange = (startDate: string, endDate: string): string => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
};

export function MyEquipmentBookingsPage(): ReactElement {
  const navigate = useNavigate();
  const [items, setItems] = useState<EquipmentMyBooking[]>([]);
  const [activeBucket, setActiveBucket] =
    useState<EquipmentBookingBucket>("pending");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [payingId, setPayingId] = useState<string | null>(null);

  const loadBookings = async (): Promise<void> => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetchMyEquipmentBookings();
      setItems(response);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load your bookings.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadBookings();
  }, []);

  const grouped = useMemo(() => {
    const mapping: Record<EquipmentBookingBucket, EquipmentMyBooking[]> = {
      pending: [],
      upcoming: [],
      active: [],
      history: [],
    };

    items.forEach((item) => {
      mapping[item.bucket].push(item);
    });

    return mapping;
  }, [items]);

  const visibleItems = grouped[activeBucket];

  const goToDetail = (bookingId: string): void => {
    navigate(`/dashboard/engineer/equipment/bookings/${bookingId}`);
  };

  const handlePayShortcut = async (bookingId: string): Promise<void> => {
    setPayingId(bookingId);
    try {
      await payEquipmentBooking(bookingId);
      await loadBookings();
    } catch (payError: unknown) {
      setError(
        payError instanceof Error
          ? payError.message
          : "Unable to process booking payment.",
      );
    } finally {
      setPayingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
          Renter workspace
        </p>
        <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
          My Equipment Bookings
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Open a booking to view its full timeline and next step.
        </p>
      </div>

      <EquipmentSectionTabs />

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-surface/70 p-1">
        <div className="flex min-w-max gap-1">
          {BUCKETS.map((bucket) => (
            <button
              key={bucket}
              type="button"
              onClick={() => setActiveBucket(bucket)}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                activeBucket === bucket
                  ? "bg-primary text-white"
                  : "text-white/65 hover:bg-white/5 hover:text-white"
              }`}
            >
              {bucketLabel[bucket]}
              <span className="ml-2 text-xs text-white/70">
                ({grouped[bucket].length})
              </span>
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <section
          className="rounded-2xl border border-red-400/20 bg-red-400/5 p-4"
          role="alert"
        >
          <p className="text-sm text-red-200">{error}</p>
        </section>
      ) : null}

      {isLoading ? (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <article
              key={`booking-skeleton-${index}`}
              className="animate-pulse rounded-2xl border border-white/10 bg-surface p-4"
            >
              <div className="h-28 rounded-xl bg-white/10" />
              <div className="mt-3 h-4 w-2/3 rounded bg-white/10" />
              <div className="mt-2 h-3 w-1/2 rounded bg-white/10" />
            </article>
          ))}
        </section>
      ) : visibleItems.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-white/20 bg-surface/50 p-10 text-center">
          <p className="text-3xl">📅</p>
          <p className="mt-3 text-sm text-white/60">
            No {bucketLabel[activeBucket].toLowerCase()} bookings yet.
          </p>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {visibleItems.map((booking) => {
            const canPay =
              booking.status === "approved" &&
              booking.paymentStatus === "unpaid";

            return (
              <article
                key={booking.id}
                role="button"
                tabIndex={0}
                onClick={() => goToDetail(booking.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    goToDetail(booking.id);
                  }
                }}
                className="cursor-pointer rounded-2xl border border-white/10 bg-surface p-4 transition-colors hover:border-primary/40"
              >
                <div className="flex gap-4">
                  <img
                    src={booking.equipment.photoUrl ?? ""}
                    alt={booking.equipment.title}
                    className="h-24 w-32 rounded-xl object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="line-clamp-1 text-lg font-bold text-white">
                      {booking.equipment.title}
                    </h2>
                    <p className="mt-1 text-xs text-white/55">
                      {formatDateRange(booking.startDate, booking.endDate)}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      {formatCurrency(booking.totalRentalFee)}
                      <span className="ml-1 text-xs font-normal text-white/55">
                        rental fee
                      </span>
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar
                      name={booking.owner.name}
                      photoUrl={booking.owner.profilePhotoUrl}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {booking.owner.name}
                      </p>
                      <RatingBadge
                        rating={booking.owner.rating ?? null}
                        reviewCount={booking.owner.reviewCount ?? 0}
                        size="sm"
                      />
                    </div>
                  </div>

                  <span className="rounded-full border border-white/20 px-2.5 py-1 text-[11px] font-semibold text-white/75">
                    {statusLabel[booking.status]}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-primary">
                    View Details
                  </p>
                  {canPay ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handlePayShortcut(booking.id);
                      }}
                      disabled={payingId === booking.id}
                      className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-glow disabled:opacity-60"
                    >
                      {payingId === booking.id ? "Processing..." : "Pay Now"}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

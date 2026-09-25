import { type ReactElement, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { EquipmentSectionTabs } from "../components/dashboard/EquipmentSectionTabs";
import {
  bookingStatusClassName,
  bookingStatusLabel,
  getPaymentSummary,
  needsPayment,
} from "../components/dashboard/equipment/bookingStatus";
import { EquipmentThumb } from "../components/dashboard/equipment/EquipmentThumb";
import { useEquipmentPaths } from "../components/dashboard/equipment/paths";
import {
  bookingTotalDue,
  describeBookingExtras,
} from "../components/dashboard/equipment/bookingTerms";
import {
  panelClassName,
  primaryButtonClassName,
  quietLinkClassName,
} from "../components/dashboard/ui/buttonStyles";
import { FilterTabs } from "../components/dashboard/ui/FilterTabs";
import { PageHeader } from "../components/dashboard/ui/PageHeader";
import { EmptyPanel, ErrorPanel } from "../components/dashboard/ui/StatePanels";
import { RatingBadge } from "../components/RatingBadge";
import { countOf, formatCurrency, formatDateRange } from "../lib/format";
import {
  fetchMyEquipmentBookings,
  type EquipmentBookingBucket,
  type EquipmentMyBooking,
} from "./equipment.api";
import { startCheckout } from "../lib/payments";

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
  history: "Past",
};

const emptyBucketMessage: Record<EquipmentBookingBucket, string> = {
  pending: "No requests are waiting on an owner.",
  upcoming: "No approved bookings are coming up.",
  active: "Nothing is out on rent to you right now.",
  history: "Finished and cancelled bookings will be kept here.",
};

const getSummary = (items: EquipmentMyBooking[]): string => {
  if (items.length === 0) {
    return "Equipment you rent from other engineers, from request to return.";
  }

  const awaiting = items.filter((item) => item.status === "pending").length;
  const toPay = items.filter(needsPayment).length;
  const inUse = items.filter((item) => item.status === "in_progress").length;
  const sentences: string[] = [];
  if (toPay > 0) {
    sentences.push(
      `${countOf(toPay, "approved booking needs", "approved bookings need")} payment.`,
    );
  }
  if (awaiting > 0) {
    sentences.push(
      `${countOf(awaiting, "request is", "requests are")} waiting on the owner.`,
    );
  }
  if (inUse > 0) {
    sentences.push(
      `${countOf(inUse, "rental is", "rentals are")} in progress.`,
    );
  }
  return sentences.length
    ? sentences.join(" ")
    : "Nothing needs your attention right now.";
};

interface BookingRowProps {
  booking: EquipmentMyBooking;
  isPaying: boolean;
  payError: string;
  onPay: () => void;
}

function BookingRow({
  booking,
  isPaying,
  payError,
  onPay,
}: BookingRowProps): ReactElement {
  const paths = useEquipmentPaths();
  const detailPath = paths.booking(booking.id);
  const canPay = needsPayment(booking);

  return (
    <li className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-6">
      <Link
        to={detailPath}
        className="group flex min-w-0 gap-4 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-glow lg:col-span-6"
      >
        <EquipmentThumb
          src={booking.equipment.photoUrl}
          alt={booking.equipment.title}
          className="h-16 w-24 shrink-0 rounded-xl"
        />
        <div className="min-w-0">
          <p className="truncate font-heading text-lg font-bold text-white transition-colors group-hover:text-primary">
            {booking.equipment.title}
          </p>
          <p className="mt-0.5 text-sm text-white/55">
            {formatDateRange(booking.startDate, booking.endDate)}
          </p>
          {describeBookingExtras(booking) ? (
            <p className="mt-0.5 text-xs text-white/50">
              {describeBookingExtras(booking)}
            </p>
          ) : null}
          <div className="mt-1.5 flex min-w-0 items-center gap-2 text-sm text-white/55">
            <Avatar
              name={booking.owner.name}
              photoUrl={booking.owner.profilePhotoUrl}
              size="2xs"
            />
            <span className="truncate">{booking.owner.name}</span>
            <RatingBadge
              rating={booking.owner.rating ?? null}
              reviewCount={booking.owner.reviewCount ?? 0}
              size="sm"
            />
          </div>
        </div>
      </Link>

      <div className="lg:col-span-2">
        <p className="font-heading text-xl font-bold tabular-nums text-white">
          {formatCurrency(booking.totalRentalFee)}
        </p>
        <p
          className={`text-xs ${canPay ? "font-semibold text-primary" : "text-white/45"}`}
        >
          {getPaymentSummary(booking)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 lg:col-span-4 lg:justify-end">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${bookingStatusClassName[booking.status]}`}
        >
          {bookingStatusLabel[booking.status]}
        </span>
        {canPay ? (
          <button
            type="button"
            onClick={onPay}
            disabled={isPaying}
            className={primaryButtonClassName}
          >
            {isPaying
              ? "Opening payment..."
              : `Pay ${formatCurrency(bookingTotalDue(booking))}`}
          </button>
        ) : (
          <Link to={detailPath} className={quietLinkClassName}>
            Details
          </Link>
        )}
      </div>

      {payError ? (
        <p className="text-sm text-rose-300 lg:col-span-12" role="alert">
          {payError}
        </p>
      ) : null}
    </li>
  );
}

function BookingListSkeleton(): ReactElement {
  return (
    <section className={panelClassName} aria-label="Loading bookings">
      <div className="px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
        <div className="h-8 w-72 animate-pulse rounded-full bg-white/10" />
      </div>
      <ul className="divide-y divide-white/10 border-t border-white/10">
        {[1, 2, 3].map((item) => (
          <li
            key={item}
            className="grid animate-pulse gap-4 px-5 py-5 sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-6"
          >
            <div className="flex gap-4 lg:col-span-6">
              <div className="h-16 w-24 shrink-0 rounded-xl bg-white/10" />
              <div className="flex-1">
                <div className="h-5 w-2/3 rounded bg-white/10" />
                <div className="mt-2 h-3.5 w-1/3 rounded bg-white/10" />
                <div className="mt-2 h-3.5 w-1/2 rounded bg-white/10" />
              </div>
            </div>
            <div className="h-6 w-20 rounded bg-white/10 lg:col-span-2" />
            <div className="h-6 w-28 rounded-full bg-white/10 lg:col-span-4 lg:ml-auto" />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MyEquipmentBookingsPage(): ReactElement {
  const paths = useEquipmentPaths();
  const [items, setItems] = useState<EquipmentMyBooking[]>([]);
  // null until the person picks a filter, so the page can open on the group
  // that needs them: wherever a payment is due, else the first non-empty one.
  const [chosenBucket, setChosenBucket] =
    useState<EquipmentBookingBucket | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payError, setPayError] = useState<{
    id: string;
    message: string;
  } | null>(null);

  const loadBookings = async (): Promise<void> => {
    setIsLoading(true);
    setError("");
    try {
      setItems(await fetchMyEquipmentBookings());
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

  const activeBucket =
    chosenBucket ??
    items.find(needsPayment)?.bucket ??
    BUCKETS.find((bucket) => grouped[bucket].length > 0) ??
    "pending";
  const visibleItems = grouped[activeBucket];

  // Opens SSLCommerz; the page only stays here if the checkout couldn't open.
  const handlePay = async (bookingId: string): Promise<void> => {
    setPayingId(bookingId);
    setPayError(null);
    const checkoutError = await startCheckout({
      purpose: "equipment_booking",
      bookingId,
    });
    if (checkoutError) {
      setPayError({ id: bookingId, message: checkoutError });
      setPayingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="My bookings"
        summary={
          isLoading
            ? "Equipment you rent from other engineers, from request to return."
            : getSummary(items)
        }
      />

      <EquipmentSectionTabs />

      {isLoading ? (
        <BookingListSkeleton />
      ) : error ? (
        <ErrorPanel message={error} onRetry={() => void loadBookings()} />
      ) : items.length === 0 ? (
        <EmptyPanel
          title="No bookings yet"
          body="Find a machine or tool, pick your dates and send a request. It shows up here while the owner decides."
          action={
            <Link to={paths.browse} className={primaryButtonClassName}>
              Browse equipment
            </Link>
          }
        />
      ) : (
        <section className={panelClassName} aria-label="Your bookings">
          <div className="px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
            <FilterTabs
              options={BUCKETS.map((bucket) => ({
                key: bucket,
                label: bucketLabel[bucket],
                count: grouped[bucket].length,
              }))}
              value={activeBucket}
              onChange={setChosenBucket}
              label="Filter bookings"
            />
          </div>
          {visibleItems.length > 0 ? (
            <ul className="divide-y divide-white/10 border-t border-white/10">
              {visibleItems.map((booking) => (
                <BookingRow
                  key={booking.id}
                  booking={booking}
                  isPaying={payingId === booking.id}
                  payError={payError?.id === booking.id ? payError.message : ""}
                  onPay={() => void handlePay(booking.id)}
                />
              ))}
            </ul>
          ) : (
            <p className="border-t border-white/10 px-5 py-8 text-sm text-white/50 sm:px-6">
              {emptyBucketMessage[activeBucket]}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

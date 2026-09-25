import {
  type ChangeEvent,
  type ReactElement,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { BackButton } from "../components/BackButton";
import { RatingBadge } from "../components/RatingBadge";
import { useAuth } from "../context/AuthContext";
import {
  createEquipmentReview,
  confirmEquipmentPickup,
  confirmEquipmentReturn,
  fetchBookingReviewEligibility,
  fetchEquipmentBookingById,
  resolveEquipmentDeposit,
  type BookingReviewEligibilityResponse,
  type EquipmentBookingConditionPhoto,
  type EquipmentMyBooking,
} from "./equipment.api";
import { MoneyInput } from "../components/dashboard/ui/MoneyInput";
import { formatCurrency } from "../lib/format";
import { moneyValue } from "../lib/money";
import { startCheckout } from "../lib/payments";
import { useEquipmentPaths } from "../components/dashboard/equipment/paths";
import { bookingTotalDue } from "../components/dashboard/equipment/bookingTerms";

type TimelineState = "complete" | "current" | "upcoming";

interface TimelineItem {
  key: string;
  title: string;
  state: TimelineState;
  subtitle: string;
  details?: ReactElement;
}

interface ConditionDraft {
  notes: string;
  photos: File[];
}

interface DepositDraft {
  resolution: "released" | "claimed";
  claimNotes: string;
  claimAmount: string;
}

const formatDateTime = (value: string | null): string => {
  if (!value) return "Not recorded yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded yet";
  return date.toLocaleString();
};

const formatDateRange = (startDate: string, endDate: string): string => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
};

const statusBadgeClass: Record<EquipmentMyBooking["status"], string> = {
  pending: "border-violet-300/40 bg-violet-300/10 text-violet-200",
  approved: "border-sky-300/40 bg-sky-300/10 text-sky-200",
  in_progress: "border-primary/50 bg-primary/15 text-primary",
  completed: "border-emerald-300/40 bg-emerald-300/10 text-emerald-200",
  declined: "border-rose-300/40 bg-rose-300/10 text-rose-200",
  cancelled: "border-white/20 bg-white/5 text-white/65",
};

const LockIcon = (): ReactElement => (
  <svg
    viewBox="0 0 24 24"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="4" y="11" width="16" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 1 1 8 0v3" />
  </svg>
);

const CheckIcon = (): ReactElement => (
  <svg
    viewBox="0 0 24 24"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m5 12 5 5L20 7" />
  </svg>
);

export function BookingDetailPage(): ReactElement {
  const paths = useEquipmentPaths();
  const navigate = useNavigate();
  const { bookingId } = useParams<{ bookingId: string }>();
  const { currentUser } = useAuth();

  const [booking, setBooking] = useState<EquipmentMyBooking | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const [isPaying, setIsPaying] = useState<boolean>(false);
  const [pickupDraft, setPickupDraft] = useState<ConditionDraft>({
    notes: "",
    photos: [],
  });
  const [returnDraft, setReturnDraft] = useState<ConditionDraft>({
    notes: "",
    photos: [],
  });
  const [depositDraft, setDepositDraft] = useState<DepositDraft>({
    resolution: "released",
    claimNotes: "",
    claimAmount: "",
  });
  const [isSubmittingAction, setIsSubmittingAction] = useState<boolean>(false);
  const [reviewEligibility, setReviewEligibility] =
    useState<BookingReviewEligibilityResponse | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(0);
  const [reviewText, setReviewText] = useState<string>("");
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string>("");
  const [reviewSuccess, setReviewSuccess] = useState<boolean>(false);

  const loadBooking = async (): Promise<void> => {
    if (!bookingId) {
      setError("Booking ID is required.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const item = await fetchEquipmentBookingById(bookingId);
      setBooking(item);
    } catch (loadError: unknown) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Unable to load booking details.";

      if (
        message.toLowerCase().includes("not authorized") ||
        message.toLowerCase().includes("forbidden")
      ) {
        navigate(paths.bookings, { replace: true });
        return;
      }

      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadBooking();
  }, [bookingId]);

  useEffect(() => {
    const loadReviewEligibility = async (): Promise<void> => {
      if (
        !booking ||
        !currentUser ||
        currentUser.id !== booking.renter.userId
      ) {
        setReviewEligibility(null);
        return;
      }

      try {
        const eligibility = await fetchBookingReviewEligibility(booking.id);
        setReviewEligibility(eligibility);
      } catch {
        setReviewEligibility(null);
      }
    };

    void loadReviewEligibility();
  }, [booking, currentUser]);

  const viewerRole = useMemo(() => {
    if (!booking || !currentUser) return null;
    if (currentUser.id === booking.owner.userId) return "owner" as const;
    if (currentUser.id === booking.renter.userId) return "renter" as const;
    return null;
  }, [booking, currentUser]);

  useEffect(() => {
    if (!isLoading && booking && viewerRole === null) {
      navigate(paths.bookings, { replace: true });
    }
  }, [isLoading, booking, viewerRole, navigate, paths.bookings]);

  if (isLoading) {
    return (
      <section className="space-y-4 animate-pulse">
        <div className="h-10 w-72 rounded bg-white/10" />
        <div className="h-56 rounded-2xl bg-white/10" />
      </section>
    );
  }

  if (!booking || error || !viewerRole) {
    return (
      <div className="space-y-4">
        <BackButton to={paths.bookings} label="Back to My Bookings" />
        <section
          className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-6"
          role="alert"
        >
          <p className="text-sm text-rose-200">
            {error || "Booking not found."}
          </p>
        </section>
      </div>
    );
  }

  const otherParty = viewerRole === "owner" ? booking.renter : booking.owner;
  const total = bookingTotalDue(booking);

  const renderTimelinePhotos = (
    photos: EquipmentBookingConditionPhoto[],
  ): ReactElement | null => {
    if (photos.length === 0) return null;
    return (
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {photos.map((photo) => (
          <button
            key={photo.publicId}
            type="button"
            onClick={() => setLightboxUrl(photo.url)}
            className="overflow-hidden rounded-lg border border-white/15 transition-colors hover:border-primary"
            aria-label="Open condition photo"
          >
            <img
              src={photo.url}
              alt="Condition record"
              className="h-16 w-full object-cover"
            />
          </button>
        ))}
      </div>
    );
  };

  const timeline: TimelineItem[] = [
    {
      key: "requested",
      title: "Requested",
      state: "complete",
      subtitle: formatDateTime(booking.createdAt),
    },
    {
      key: "decision",
      title:
        booking.status === "pending"
          ? "Approved / Declined"
          : booking.status === "declined"
            ? "Declined"
            : booking.status === "cancelled"
              ? "Cancelled"
              : "Approved",
      state:
        booking.status === "pending"
          ? "current"
          : booking.status === "declined" ||
              booking.status === "cancelled" ||
              booking.status === "approved" ||
              booking.status === "in_progress" ||
              booking.status === "completed"
            ? "complete"
            : "upcoming",
      subtitle:
        booking.status === "pending"
          ? "Waiting for owner decision"
          : booking.status === "declined"
            ? "Booking declined"
            : booking.status === "cancelled"
              ? "Request cancelled"
              : "Booking approved",
    },
    {
      key: "paid",
      title: "Paid",
      state:
        booking.paymentStatus === "paid"
          ? "complete"
          : booking.status === "approved"
            ? "current"
            : booking.status === "pending"
              ? "upcoming"
              : "upcoming",
      subtitle:
        booking.paymentStatus === "paid"
          ? `${formatCurrency(total)} on ${formatDateTime(booking.paidAt)}`
          : "Awaiting payment",
    },
    {
      key: "pickup",
      title: "Picked Up",
      state: booking.pickupConfirmedAt
        ? "complete"
        : booking.paymentStatus === "paid" && booking.status !== "pending"
          ? "current"
          : "upcoming",
      subtitle: booking.pickupConfirmedAt
        ? formatDateTime(booking.pickupConfirmedAt)
        : "Pickup not confirmed yet",
      details:
        booking.pickupConfirmedAt || booking.pickupConditionNotes ? (
          <div className="mt-2 space-y-2">
            {booking.pickupConditionNotes ? (
              <p className="text-xs text-white/65">
                {booking.pickupConditionNotes}
              </p>
            ) : null}
            {renderTimelinePhotos(booking.pickupConditionPhotos)}
          </div>
        ) : undefined,
    },
    {
      key: "return",
      title: "Returned",
      state: booking.returnConfirmedAt
        ? "complete"
        : booking.status === "in_progress"
          ? "current"
          : "upcoming",
      subtitle: booking.returnConfirmedAt
        ? formatDateTime(booking.returnConfirmedAt)
        : "Return not confirmed yet",
      details:
        booking.returnConfirmedAt || booking.returnConditionNotes ? (
          <div className="mt-2 space-y-2">
            {booking.returnConditionNotes ? (
              <p className="text-xs text-white/65">
                {booking.returnConditionNotes}
              </p>
            ) : null}
            {renderTimelinePhotos(booking.returnConditionPhotos)}
          </div>
        ) : undefined,
    },
    {
      key: "deposit",
      title: "Deposit Resolved",
      state:
        booking.depositResolution === "released" ||
        booking.depositResolution === "claimed"
          ? "complete"
          : booking.status === "completed"
            ? "current"
            : "upcoming",
      subtitle:
        booking.depositResolution === "released"
          ? "Security deposit released"
          : booking.depositResolution === "claimed"
            ? `Claimed ${formatCurrency(booking.depositClaimAmount ?? 0)}`
            : "Pending owner decision",
      details:
        booking.depositResolution === "claimed" ? (
          <p className="mt-2 text-xs text-white/65">
            {booking.depositClaimNotes ||
              "Damage claim details were not provided."}
          </p>
        ) : undefined,
    },
  ];

  const canPay =
    viewerRole === "renter" &&
    booking.status === "approved" &&
    booking.paymentStatus === "unpaid";
  const canConfirmPickup =
    booking.paymentStatus === "paid" &&
    !booking.pickupConfirmedAt &&
    booking.status === "approved";
  const canConfirmReturn =
    booking.status === "in_progress" && !booking.returnConfirmedAt;
  const canResolveDeposit =
    viewerRole === "owner" &&
    booking.status === "completed" &&
    booking.depositResolution === "pending";

  // Opens SSLCommerz; the page only stays here if the checkout couldn't open.
  const submitPay = async (): Promise<void> => {
    setIsPaying(true);
    setError("");
    const checkoutError = await startCheckout({
      purpose: "equipment_booking",
      bookingId: booking.id,
    });
    if (checkoutError) {
      setError(checkoutError);
      setIsPaying(false);
    }
  };

  const submitPickup = async (): Promise<void> => {
    setIsSubmittingAction(true);
    setError("");
    try {
      await confirmEquipmentPickup(booking.id, {
        conditionNotes: pickupDraft.notes,
        photos: pickupDraft.photos,
      });
      setPickupDraft({ notes: "", photos: [] });
      await loadBooking();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to confirm pickup.",
      );
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const submitReturn = async (): Promise<void> => {
    setIsSubmittingAction(true);
    setError("");
    try {
      await confirmEquipmentReturn(booking.id, {
        conditionNotes: returnDraft.notes,
        photos: returnDraft.photos,
      });
      setReturnDraft({ notes: "", photos: [] });
      await loadBooking();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to confirm return.",
      );
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const submitDeposit = async (): Promise<void> => {
    setIsSubmittingAction(true);
    setError("");
    try {
      await resolveEquipmentDeposit(booking.id, {
        resolution: depositDraft.resolution,
        claimNotes: depositDraft.claimNotes,
        claimAmount:
          depositDraft.resolution === "claimed"
            ? (moneyValue(depositDraft.claimAmount) ?? Number.NaN)
            : undefined,
      });
      await loadBooking();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to resolve deposit.",
      );
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const submitReview = async (): Promise<void> => {
    if (!booking || !reviewEligibility?.canReview) {
      return;
    }
    if (reviewRating === 0 || !reviewText.trim()) {
      setReviewError("Choose a rating and write a review before submitting.");
      return;
    }

    setIsSubmittingReview(true);
    setReviewError("");

    try {
      const review = await createEquipmentReview({
        bookingId: booking.id,
        rating: reviewRating,
        reviewText: reviewText.trim(),
      });
      setReviewEligibility({
        canReview: false,
        alreadyReviewed: true,
        review,
      });
      setReviewSuccess(true);
      setReviewRating(0);
      setReviewText("");
    } catch (submitError: unknown) {
      setReviewError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit review.",
      );
    } finally {
      setIsSubmittingReview(false);
    }
  };

  return (
    <div className="space-y-6">
      <BackButton to={paths.bookings} label="Back to My Bookings" />

      <div className="rounded-2xl border border-white/10 bg-surface p-5">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
          Equipment booking
        </p>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <img
              src={booking.equipment.photoUrl ?? ""}
              alt={booking.equipment.title}
              className="h-22 w-30 rounded-xl object-cover"
            />
            <div className="min-w-0">
              <Link
                to={paths.listing(booking.equipment.id)}
                className="line-clamp-2 text-xl font-bold text-white transition-colors hover:text-primary"
              >
                {booking.equipment.title}
              </Link>
              <p className="mt-1 text-xs text-white/60">
                {formatDateRange(booking.startDate, booking.endDate)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-void/40 px-3 py-2">
            <Avatar
              name={otherParty.name}
              photoUrl={otherParty.profilePhotoUrl}
              size="md"
            />
            <div>
              <Link
                to={`/profile/${otherParty.userId}`}
                className="text-sm font-semibold text-white transition-colors hover:text-primary"
              >
                {otherParty.name}
              </Link>
              <RatingBadge
                rating={otherParty.rating ?? null}
                reviewCount={otherParty.reviewCount}
                size="sm"
              />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold capitalize ${statusBadgeClass[booking.status]}`}
          >
            {booking.status.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      {error ? (
        <section
          className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-4"
          role="alert"
        >
          <p className="text-sm text-rose-200">{error}</p>
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-white/10 bg-surface p-5">
          <h2 className="font-heading text-2xl font-bold text-white">
            Timeline
          </h2>
          <div className="relative mt-5 space-y-4 pl-7 sm:pl-9">
            <div className="absolute bottom-8 left-[0.7rem] top-8 w-px bg-white/10 sm:left-[1rem]" />
            {timeline.map((item) => {
              const isLocked = item.state === "upcoming";
              const isCurrent = item.state === "current";
              const isComplete = item.state === "complete";

              return (
                <article
                  key={item.key}
                  className={`relative rounded-xl border p-4 transition-all duration-200 ${
                    isLocked
                      ? "border-white/10 bg-void/60 opacity-65"
                      : isCurrent
                        ? "border-primary/30 bg-primary/10"
                        : "border-white/10 bg-void/45"
                  }`}
                >
                  <span
                    className={`absolute -left-[2.05rem] top-6 flex h-5 w-5 items-center justify-center rounded-full border-2 bg-surface sm:-left-[2.35rem] ${
                      isComplete
                        ? "border-primary text-primary"
                        : isLocked
                          ? "border-white/20 text-white/40"
                          : "border-white/35 text-white/70"
                    }`}
                  >
                    {isComplete ? (
                      <CheckIcon />
                    ) : isLocked ? (
                      <LockIcon />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    )}
                  </span>

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        {item.title}
                      </h3>
                      <p className="mt-1 text-xs text-white/65">
                        {item.subtitle}
                      </p>
                    </div>
                    {isCurrent ? (
                      <span className="rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                        Current
                      </span>
                    ) : null}
                  </div>

                  {item.details}
                </article>
              );
            })}
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-white/10 bg-surface p-5">
            <h2 className="font-heading text-xl font-bold text-white">
              Price Summary
            </h2>
            <div className="mt-4 space-y-2 text-sm text-white/80">
              <p className="flex items-start justify-between gap-3">
                <span>
                  Rental
                  <span className="block text-xs text-white/50">
                    {booking.rentalDays} day
                    {booking.rentalDays === 1 ? "" : "s"}
                    {booking.units > 1 ? ` · ${booking.units} units` : ""}
                  </span>
                </span>
                <span className="tabular-nums">
                  {formatCurrency(booking.rentalFee)}
                </span>
              </p>
              {booking.operatorFee > 0 ? (
                <p className="flex items-center justify-between">
                  <span>Operator</span>
                  <span className="tabular-nums">
                    {formatCurrency(booking.operatorFee)}
                  </span>
                </p>
              ) : null}
              {booking.fulfilment === "delivery" ? (
                <p className="flex items-start justify-between gap-3">
                  <span>
                    Delivery
                    {booking.deliveryAddress ? (
                      <span className="block text-xs text-white/50">
                        To {booking.deliveryAddress}
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular-nums">
                    {booking.deliveryFee > 0
                      ? formatCurrency(booking.deliveryFee)
                      : "Free"}
                  </span>
                </p>
              ) : (
                <p className="flex items-center justify-between">
                  <span>Collection</span>
                  <span className="text-white/60">Renter collects</span>
                </p>
              )}
              <p className="flex items-center justify-between">
                <span>
                  Security deposit
                  <span className="block text-xs text-white/50">
                    Refundable
                  </span>
                </span>
                <span className="tabular-nums">
                  {formatCurrency(booking.securityDeposit)}
                </span>
              </p>
              <p className="flex items-center justify-between border-t border-white/15 pt-2 text-base font-bold text-white">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </p>
              {booking.payment ? (
                <p className="text-xs text-emerald-200">
                  Paid
                  {booking.payment.paidAt
                    ? ` on ${formatDateTime(booking.payment.paidAt)}`
                    : ""}
                  {booking.payment.method
                    ? ` via ${booking.payment.method}`
                    : ""}
                </p>
              ) : null}
              {viewerRole === "owner" &&
              booking.payment &&
              booking.payment.platformFee > 0 ? (
                <div className="mt-2 space-y-1.5 rounded-xl border border-white/10 bg-void/45 p-3 text-xs text-white/65">
                  <p className="flex items-center justify-between">
                    <span>CivilHub fee</span>
                    <span className="tabular-nums">
                      −{formatCurrency(booking.payment.platformFee)}
                    </span>
                  </p>
                  <p className="flex items-center justify-between font-semibold text-white">
                    <span>You receive</span>
                    <span className="tabular-nums">
                      {formatCurrency(booking.payment.payeeAmount)}
                    </span>
                  </p>
                  <p className="text-white/45">
                    The {formatCurrency(booking.payment.depositAmount)} deposit
                    is held by CivilHub until you resolve it after the return.
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          {canPay ? (
            <section className="rounded-2xl border border-primary/40 bg-primary/10 p-5">
              <h2 className="font-heading text-xl font-bold text-white">
                Action Required
              </h2>
              <p className="mt-2 text-sm text-white/75">
                Pay the rental and deposit to unlock pickup. You'll pay on
                SSLCommerz with bKash, Nagad, a card or internet banking.
              </p>
              <button
                type="button"
                onClick={() => void submitPay()}
                disabled={isPaying}
                className="mt-4 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-glow disabled:opacity-60"
              >
                {isPaying
                  ? "Opening payment..."
                  : `Pay ${formatCurrency(total)} securely`}
              </button>
            </section>
          ) : null}

          {canConfirmPickup ? (
            <section className="rounded-2xl border border-white/10 bg-surface p-5">
              <h2 className="font-heading text-xl font-bold text-white">
                Confirm Pickup
              </h2>
              <p className="mt-2 text-sm text-white/70">
                Add optional notes and up to 4 condition photos.
              </p>
              <textarea
                rows={3}
                value={pickupDraft.notes}
                onChange={(event) =>
                  setPickupDraft((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                placeholder="Pickup condition notes"
                className="mt-3 w-full rounded-xl border border-white/20 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-primary focus:outline-none"
              />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setPickupDraft((current) => ({
                    ...current,
                    photos: event.target.files
                      ? Array.from(event.target.files).slice(0, 4)
                      : [],
                  }))
                }
                className="mt-2 block w-full text-xs text-white/70 file:mr-3 file:rounded-full file:border-0 file:bg-white/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-white/20"
              />
              <button
                type="button"
                onClick={() => void submitPickup()}
                disabled={isSubmittingAction}
                className="mt-3 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-glow disabled:opacity-60"
              >
                {isSubmittingAction ? "Submitting..." : "Confirm Pickup"}
              </button>
            </section>
          ) : null}

          {canConfirmReturn ? (
            <section className="rounded-2xl border border-white/10 bg-surface p-5">
              <h2 className="font-heading text-xl font-bold text-white">
                Confirm Return
              </h2>
              <p className="mt-2 text-sm text-white/70">
                Add optional notes and up to 4 condition photos.
              </p>
              <textarea
                rows={3}
                value={returnDraft.notes}
                onChange={(event) =>
                  setReturnDraft((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                placeholder="Return condition notes"
                className="mt-3 w-full rounded-xl border border-white/20 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-primary focus:outline-none"
              />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setReturnDraft((current) => ({
                    ...current,
                    photos: event.target.files
                      ? Array.from(event.target.files).slice(0, 4)
                      : [],
                  }))
                }
                className="mt-2 block w-full text-xs text-white/70 file:mr-3 file:rounded-full file:border-0 file:bg-white/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-white/20"
              />
              <button
                type="button"
                onClick={() => void submitReturn()}
                disabled={isSubmittingAction}
                className="mt-3 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-glow disabled:opacity-60"
              >
                {isSubmittingAction ? "Submitting..." : "Confirm Return"}
              </button>
            </section>
          ) : null}

          {canResolveDeposit ? (
            <section className="rounded-2xl border border-white/10 bg-surface p-5">
              <h2 className="font-heading text-xl font-bold text-white">
                Resolve Deposit
              </h2>
              <p className="mt-2 text-sm text-white/70">
                Choose whether to release the deposit or claim damages.
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="radio"
                    checked={depositDraft.resolution === "released"}
                    onChange={() =>
                      setDepositDraft((current) => ({
                        ...current,
                        resolution: "released",
                      }))
                    }
                  />
                  Release deposit
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="radio"
                    checked={depositDraft.resolution === "claimed"}
                    onChange={() =>
                      setDepositDraft((current) => ({
                        ...current,
                        resolution: "claimed",
                      }))
                    }
                  />
                  Claim damage
                </label>
              </div>

              {depositDraft.resolution === "claimed" ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    rows={3}
                    value={depositDraft.claimNotes}
                    onChange={(event) =>
                      setDepositDraft((current) => ({
                        ...current,
                        claimNotes: event.target.value,
                      }))
                    }
                    placeholder="Claim reason"
                    className="w-full rounded-xl border border-white/20 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-primary focus:outline-none"
                  />
                  <div className="grid gap-1.5">
                    <label
                      htmlFor="deposit-claim-amount"
                      className="text-sm font-semibold text-white/80"
                    >
                      Amount to claim
                    </label>
                    <MoneyInput
                      id="deposit-claim-amount"
                      value={depositDraft.claimAmount}
                      onChange={(value) =>
                        setDepositDraft((current) => ({
                          ...current,
                          claimAmount: value,
                        }))
                      }
                    />
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void submitDeposit()}
                disabled={isSubmittingAction}
                className="mt-3 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-glow disabled:opacity-60"
              >
                {isSubmittingAction ? "Submitting..." : "Submit Decision"}
              </button>
            </section>
          ) : null}

          {viewerRole === "renter" && reviewEligibility?.canReview ? (
            <section className="rounded-2xl border border-primary/30 bg-primary/10 p-5">
              <h2 className="font-heading text-xl font-bold text-white">
                Leave a Review
              </h2>
              <p className="mt-2 text-sm text-white/75">
                Share your experience after completion and deposit resolution.
              </p>
              <div className="mt-4 flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setReviewRating(value)}
                    className={`text-3xl leading-none transition-all duration-150 hover:scale-110 ${value <= reviewRating ? "text-amber-300" : "text-white/20 hover:text-amber-200/70"}`}
                    aria-label={`${value} star${value === 1 ? "" : "s"}`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <textarea
                rows={4}
                value={reviewText}
                onChange={(event) =>
                  setReviewText(event.target.value.slice(0, 1000))
                }
                placeholder="What went well, what could improve?"
                className="mt-3 w-full rounded-xl border border-white/20 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-primary focus:outline-none"
              />
              <p className="mt-1 text-xs text-white/45">
                {reviewText.length}/1000
              </p>
              <button
                type="button"
                onClick={() => void submitReview()}
                disabled={isSubmittingReview}
                className="mt-3 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-glow disabled:opacity-60"
              >
                {isSubmittingReview ? "Submitting..." : "Submit Review"}
              </button>
              {reviewError ? (
                <p className="mt-2 text-sm text-rose-300" role="alert">
                  {reviewError}
                </p>
              ) : null}
            </section>
          ) : null}

          {viewerRole === "renter" &&
          reviewEligibility?.alreadyReviewed &&
          reviewEligibility.review ? (
            <section className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-5">
              <h2 className="font-heading text-xl font-bold text-white">
                {reviewSuccess ? "Review submitted" : "Your review"}
              </h2>
              <div className="mt-3 flex items-center gap-1 text-lg">
                {[0, 1, 2, 3, 4].map((index) => (
                  <span
                    key={index}
                    className={
                      index < reviewEligibility.review!.rating
                        ? "text-amber-300"
                        : "text-white/20"
                    }
                  >
                    ★
                  </span>
                ))}
              </div>
              <p className="mt-2 text-sm text-white/85">
                {reviewEligibility.review.reviewText}
              </p>
              <p className="mt-2 text-xs text-white/55">
                Submitted {formatDateTime(reviewEligibility.review.createdAt)}
              </p>
            </section>
          ) : null}
        </div>
      </div>

      {lightboxUrl ? (
        <div className="fixed inset-0 z-90 flex items-center justify-center bg-black/80 p-4">
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute right-5 top-5 rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:border-primary hover:text-white"
          >
            Close
          </button>
          <img
            src={lightboxUrl}
            alt="Expanded booking condition"
            className="max-h-[90vh] w-auto max-w-[95vw] rounded-xl border border-white/10"
          />
        </div>
      ) : null}
    </div>
  );
}

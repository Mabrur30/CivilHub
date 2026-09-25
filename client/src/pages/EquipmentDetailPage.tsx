import { type ReactElement, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { EquipmentCalendar } from "../components/EquipmentCalendar";
import { EquipmentSectionTabs } from "../components/dashboard/EquipmentSectionTabs";
import { RatingBadge } from "../components/RatingBadge";
import { useAuth } from "../context/AuthContext";
import {
  createEquipmentBookingRequest,
  fetchEquipmentById,
  fetchEquipmentReviews,
  replyToEquipmentReview,
  type EquipmentReviewsResponse,
  type EquipmentListing,
} from "./equipment.api";
import { formatCurrency } from "../lib/format";


const LocationPin = (): ReactElement => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4 text-white/50"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M12 22s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

export function EquipmentDetailPage(): ReactElement {
  const { currentUser } = useAuth();
  const { equipmentId } = useParams<{ equipmentId: string }>();
  const [item, setItem] = useState<EquipmentListing | null>(null);
  const [mainPhotoIndex, setMainPhotoIndex] = useState<number>(0);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [selectedRange, setSelectedRange] = useState<{
    start: Date;
    end: Date;
  } | null>(null);
  const [calendarResetKey, setCalendarResetKey] = useState<number>(0);
  const [bookingMessage, setBookingMessage] = useState<string>("");
  const [bookingError, setBookingError] = useState<string>("");
  const [isSubmittingBooking, setIsSubmittingBooking] =
    useState<boolean>(false);
  const [reviews, setReviews] = useState<EquipmentReviewsResponse | null>(null);
  const [isLoadingReviews, setIsLoadingReviews] = useState<boolean>(false);
  const [reviewsError, setReviewsError] = useState<string>("");
  const [replyingReviewId, setReplyingReviewId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>("");
  const [isSubmittingReply, setIsSubmittingReply] = useState<boolean>(false);

  useEffect(() => {
    const load = async (): Promise<void> => {
      if (!equipmentId) {
        setError("Equipment ID is required.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError("");

      try {
        const response = await fetchEquipmentById(equipmentId);
        setItem(response);
        setMainPhotoIndex(0);
      } catch (loadError: unknown) {
        const message =
          loadError instanceof Error
            ? loadError.message
            : "Unable to load this equipment listing.";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [equipmentId]);

  useEffect(() => {
    const loadReviews = async (): Promise<void> => {
      if (!equipmentId) {
        setReviews(null);
        return;
      }

      setIsLoadingReviews(true);
      setReviewsError("");
      try {
        const response = await fetchEquipmentReviews(equipmentId);
        setReviews(response);
      } catch (loadError: unknown) {
        setReviewsError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load reviews.",
        );
      } finally {
        setIsLoadingReviews(false);
      }
    };

    void loadReviews();
  }, [equipmentId]);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-5">
        <div className="h-10 w-56 rounded bg-white/10" />
        <div className="h-80 rounded-3xl bg-white/10" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <section
        className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-8 text-center"
        role="alert"
      >
        <p className="text-sm text-rose-200">{error || "Listing not found."}</p>
      </section>
    );
  }

  const mainPhoto = item.photos[mainPhotoIndex] ?? item.photos[0];

  const durationDays = selectedRange
    ? Math.floor(
        (selectedRange.end.getTime() - selectedRange.start.getTime()) /
          (24 * 60 * 60 * 1000),
      )
    : 0;
  const rentalFee = durationDays * item.dailyRate;
  const totalDue = rentalFee + item.securityDeposit;

  const formatDate = (value: Date): string =>
    value.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const formatReviewDate = (value: string): string => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  };

  const isOwnerViewing = currentUser?.id === item.owner.userId;

  const submitReply = async (reviewId: string): Promise<void> => {
    if (!replyText.trim()) return;

    setIsSubmittingReply(true);
    setReviewsError("");
    try {
      const updated = await replyToEquipmentReview(reviewId, replyText.trim());
      setReviews((current) =>
        current
          ? {
              ...current,
              reviews: current.reviews.map((review) =>
                review.id === reviewId ? updated : review,
              ),
            }
          : current,
      );
      setReplyText("");
      setReplyingReviewId(null);
    } catch (submitError: unknown) {
      setReviewsError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit reply.",
      );
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const submitBookingRequest = async (): Promise<void> => {
    if (!equipmentId || !selectedRange) {
      return;
    }

    setIsSubmittingBooking(true);
    setBookingError("");
    setBookingMessage("");

    try {
      await createEquipmentBookingRequest({
        equipmentId,
        startDate: selectedRange.start.toISOString(),
        endDate: selectedRange.end.toISOString(),
      });

      setBookingMessage("Request sent - waiting for owner approval.");
      setSelectedRange(null);
      setCalendarResetKey((current) => current + 1);
    } catch (submitError: unknown) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit booking request.";
      setBookingError(message);
      if (message.includes("no longer available")) {
        setCalendarResetKey((current) => current + 1);
      }
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
          Listing details
        </p>
        <h1 className="mt-2 font-heading text-4xl font-bold text-white sm:text-5xl">
          Equipment Detail
        </h1>
      </div>

      <EquipmentSectionTabs />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_360px]">
        <section className="space-y-4">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-surface">
            <button
              type="button"
              onClick={() => setLightboxUrl(mainPhoto.url)}
              className="block w-full"
              aria-label="Open main equipment photo"
            >
              <img
                src={mainPhoto.url}
                alt={item.title}
                className="h-90 w-full object-cover sm:h-115"
              />
            </button>
          </div>

          <div className="grid grid-cols-5 gap-3">
            {item.photos.map((photo, index) => (
              <button
                key={photo.publicId}
                type="button"
                onClick={() => setMainPhotoIndex(index)}
                className={`overflow-hidden rounded-xl border transition-colors ${
                  index === mainPhotoIndex
                    ? "border-primary"
                    : "border-white/15 hover:border-white/40"
                }`}
                aria-label={`Show photo ${index + 1}`}
              >
                <img
                  src={photo.url}
                  alt={`${item.title} thumbnail ${index + 1}`}
                  className="h-16 w-full object-cover"
                />
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-white/10 bg-surface/80 p-6">
            <span className="inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
              {item.category}
            </span>
            <h2 className="mt-4 font-heading text-3xl font-bold text-white">
              {item.title}
            </h2>
            <p className="mt-3 flex items-center gap-2 text-sm text-white/60">
              <LocationPin />
              {item.location}
            </p>
            <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-white/75">
              {item.description}
            </p>
          </div>

          <section className="rounded-2xl border border-white/10 bg-surface/80 p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-2xl font-bold text-white">
                Reviews
              </h2>
              {reviews && reviews.totalReviews > 0 ? (
                <p className="text-sm font-semibold text-white/80">
                  {reviews.averageRating.toFixed(1)} ★ ({reviews.totalReviews})
                </p>
              ) : null}
            </div>

            {reviewsError ? (
              <p className="mt-4 text-sm text-rose-300">{reviewsError}</p>
            ) : isLoadingReviews ? (
              <p className="mt-4 text-sm text-white/55">Loading reviews...</p>
            ) : !reviews || reviews.reviews.length === 0 ? (
              <p className="mt-4 text-sm text-white/55">
                No reviews yet. Completed bookings will appear here.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {reviews.reviews.map((review) => (
                  <article
                    key={review.id}
                    className="rounded-xl border border-white/10 bg-void/35 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar
                          name={review.client.name}
                          photoUrl={review.client.profilePhotoUrl}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">
                            {review.client.name}
                          </p>
                          <p className="text-xs text-white/50">
                            {formatReviewDate(review.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="text-amber-300">
                        {[0, 1, 2, 3, 4].map((index) => (
                          <span key={index}>
                            {index < review.rating ? "★" : "☆"}
                          </span>
                        ))}
                      </div>
                    </div>

                    <p className="mt-3 whitespace-pre-wrap text-sm text-white/80">
                      {review.reviewText}
                    </p>

                    {review.engineerReply ? (
                      <div className="mt-3 rounded-lg border border-primary/25 bg-primary/10 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">
                          Owner reply
                        </p>
                        <p className="mt-1 text-sm text-white/85">
                          {review.engineerReply}
                        </p>
                        {review.engineerRepliedAt ? (
                          <p className="mt-1 text-xs text-white/55">
                            {formatReviewDate(review.engineerRepliedAt)}
                          </p>
                        ) : null}
                      </div>
                    ) : isOwnerViewing ? (
                      <div className="mt-3">
                        {replyingReviewId === review.id ? (
                          <div className="space-y-2">
                            <textarea
                              rows={3}
                              value={replyText}
                              onChange={(event) =>
                                setReplyText(event.target.value.slice(0, 500))
                              }
                              placeholder="Write a thoughtful reply..."
                              className="w-full rounded-xl border border-white/20 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-primary focus:outline-none"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setReplyingReviewId(null);
                                  setReplyText("");
                                }}
                                className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 hover:border-white/40"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => void submitReply(review.id)}
                                disabled={isSubmittingReply}
                                className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:bg-glow disabled:opacity-60"
                              >
                                {isSubmittingReply
                                  ? "Sending..."
                                  : "Send reply"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setReplyingReviewId(review.id)}
                            className="text-xs font-semibold text-primary hover:text-glow"
                          >
                            Reply as owner
                          </button>
                        )}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>

        <aside className="h-fit rounded-2xl border border-white/10 bg-surface/90 p-5 lg:sticky lg:top-6">
          <p className="text-white">
            <span className="text-4xl font-extrabold tracking-tight">
              {formatCurrency(item.dailyRate)}
            </span>
            <span className="ml-1 text-sm text-white/55">/day</span>
          </p>
          <p className="mt-2 text-sm text-white/65">
            Security deposit: {formatCurrency(item.securityDeposit)}
          </p>

          <div className="mt-5 rounded-xl border border-white/10 bg-void/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.13em] text-white/45">
              Owner
            </p>
            <div className="mt-3 flex items-center gap-3">
              <Avatar
                name={item.owner.name}
                photoUrl={item.owner.profilePhotoUrl}
                size="md"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {item.owner.name}
                </p>
                <RatingBadge
                  rating={item.owner.rating ?? null}
                  reviewCount={item.owner.reviewCount ?? 0}
                  size="sm"
                />
              </div>
            </div>
            <Link
              to={`/profile/${item.owner.userId}`}
              className="mt-3 inline-block text-xs font-semibold text-primary hover:text-glow"
            >
              View public profile
            </Link>
          </div>

          <div className="mt-5 rounded-xl border border-dashed border-white/15 bg-void/50 p-4">
            <p className="text-sm font-semibold text-white">
              Availability & Booking
            </p>
            {isOwnerViewing ? (
              <p className="mt-2 text-sm leading-6 text-white/55">
                This is your listing. Booking requests from other engineers will
                appear in your Incoming Requests panel.
              </p>
            ) : (
              <>
                <div className="mt-3">
                  <EquipmentCalendar
                    key={`${equipmentId}-${calendarResetKey}`}
                    equipmentId={equipmentId ?? ""}
                    onRangeSelect={(start, end) => {
                      setSelectedRange({ start, end });
                      setBookingError("");
                      setBookingMessage("");
                    }}
                  />
                </div>

                {selectedRange ? (
                  <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">
                      Booking summary
                    </p>
                    <p className="mt-2 text-sm text-white/85">
                      {formatDate(selectedRange.start)} to{" "}
                      {formatDate(selectedRange.end)}
                    </p>
                    <p className="mt-1 text-xs text-white/60">
                      {durationDays} day{durationDays === 1 ? "" : "s"} x{" "}
                      {formatCurrency(item.dailyRate)}
                    </p>
                    <div className="mt-3 space-y-1 text-sm text-white/80">
                      <p className="flex items-center justify-between">
                        <span>Rental fee</span>
                        <span>{formatCurrency(rentalFee)}</span>
                      </p>
                      <p className="flex items-center justify-between">
                        <span>Security deposit</span>
                        <span>{formatCurrency(item.securityDeposit)}</span>
                      </p>
                      <p className="mt-1 flex items-center justify-between border-t border-white/15 pt-1.5 text-base font-bold text-white">
                        <span>Total due</span>
                        <span>{formatCurrency(totalDue)}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void submitBookingRequest()}
                      disabled={isSubmittingBooking}
                      className="mt-3 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-glow disabled:opacity-60"
                    >
                      {isSubmittingBooking
                        ? "Sending request..."
                        : "Request to Book"}
                    </button>
                  </div>
                ) : null}

                {bookingMessage ? (
                  <p role="status" className="mt-3 text-sm text-emerald-300">
                    {bookingMessage}
                  </p>
                ) : null}

                {bookingError ? (
                  <p role="alert" className="mt-3 text-sm text-rose-300">
                    {bookingError}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </aside>
      </div>

      {lightboxUrl ? (
        <div className="fixed inset-0 z-90 flex items-center justify-center bg-black/80 p-4">
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute right-5 top-5 rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 transition-colors duration-200 hover:border-primary hover:text-white"
          >
            Close
          </button>
          <img
            src={lightboxUrl}
            alt="Expanded equipment image"
            className="max-h-[90vh] w-auto max-w-[95vw] rounded-xl border border-white/10"
          />
        </div>
      ) : null}
    </div>
  );
}

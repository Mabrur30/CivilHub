import { ImageIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { EquipmentSectionTabs } from "../components/dashboard/EquipmentSectionTabs";
import {
  bookingStatusClassName,
  bookingStatusLabel,
  getPaymentSummary,
} from "../components/dashboard/equipment/bookingStatus";
import { EquipmentThumb } from "../components/dashboard/equipment/EquipmentThumb";
import { ListingFields } from "../components/dashboard/equipment/ListingFields";
import {
  validateListingDetails,
  type ListingDetails,
} from "../components/dashboard/equipment/listingDetails";
import {
  panelClassName,
  primaryButtonClassName,
  rowButtonClassName,
  rowDangerButtonClassName,
  secondaryButtonClassName,
} from "../components/dashboard/ui/buttonStyles";
import { Dialog } from "../components/dashboard/ui/Dialog";
import { FilterTabs } from "../components/dashboard/ui/FilterTabs";
import { PageHeader } from "../components/dashboard/ui/PageHeader";
import { EmptyPanel, ErrorPanel } from "../components/dashboard/ui/StatePanels";
import { RatingBadge } from "../components/RatingBadge";
import { countOf, formatCurrency, formatDateRange } from "../lib/format";
import {
  createEquipmentListing,
  deleteEquipmentListing,
  fetchIncomingEquipmentBookings,
  fetchMyEquipmentListings,
  fetchOwnerEquipmentBookings,
  respondToEquipmentBooking,
  updateEquipmentListing,
  type EquipmentBookingBucket,
  type EquipmentBookingParty,
  type EquipmentIncomingBooking,
  type EquipmentListing,
  type EquipmentOwnerBooking,
  type EquipmentStatus,
} from "./equipment.api";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_LIMIT = 5 * 1024 * 1024;
const PHOTO_LIMIT = 6;
const BOOKING_DETAIL_BASE = "/dashboard/engineer/equipment/bookings";

const RENTAL_BUCKETS: EquipmentBookingBucket[] = [
  "pending",
  "upcoming",
  "active",
  "history",
];

const rentalBucketLabel: Record<EquipmentBookingBucket, string> = {
  pending: "Pending",
  upcoming: "Upcoming",
  active: "Out on rent",
  history: "Past",
};

const defaultDetails: ListingDetails = {
  title: "",
  description: "",
  category: "Excavator",
  dailyRate: "",
  securityDeposit: "",
  location: "",
};

interface RowError {
  id: string;
  message: string;
}

const listingStatusClassName: Record<EquipmentStatus, string> = {
  active: "bg-emerald-400/10 text-emerald-300",
  paused: "bg-white/5 text-white/50",
};

const listingStatusLabel: Record<EquipmentStatus, string> = {
  active: "Active",
  paused: "Paused",
};

const getMessage = (value: unknown, fallback: string): string =>
  value instanceof Error ? value.message : fallback;

const validateImageFile = (file: File): string => {
  if (!IMAGE_TYPES.includes(file.type)) {
    return "Only JPG, PNG and WEBP images are supported.";
  }
  if (file.size > IMAGE_LIMIT) {
    return "Each image must be 5 MB or smaller.";
  }
  return "";
};

const toDetails = (item: EquipmentListing): ListingDetails => ({
  title: item.title,
  description: item.description,
  category: item.category,
  dailyRate: String(item.dailyRate),
  securityDeposit: String(item.securityDeposit),
  location: item.location,
});

function PartyLine({ party }: { party: EquipmentBookingParty }): ReactElement {
  return (
    <div className="mt-1.5 flex min-w-0 items-center gap-2 text-sm text-white/55">
      <Avatar name={party.name} photoUrl={party.profilePhotoUrl} size="2xs" />
      <span className="truncate">{party.name}</span>
      <RatingBadge
        rating={party.rating ?? null}
        reviewCount={party.reviewCount ?? 0}
        size="sm"
      />
    </div>
  );
}

function RowSkeletons({ count = 2 }: { count?: number }): ReactElement {
  return (
    <ul className="divide-y divide-white/10 border-t border-white/10">
      {Array.from({ length: count }).map((_, index) => (
        <li
          key={`row-skeleton-${index}`}
          className="flex animate-pulse gap-4 px-5 py-5 sm:px-6"
        >
          <div className="h-16 w-24 shrink-0 rounded-xl bg-white/10" />
          <div className="flex-1">
            <div className="h-5 w-1/2 rounded bg-white/10" />
            <div className="mt-2 h-3.5 w-1/3 rounded bg-white/10" />
            <div className="mt-2 h-3.5 w-1/4 rounded bg-white/10" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function InlineError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): ReactElement {
  return (
    <div
      className="flex flex-col gap-3 border-t border-white/10 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6"
      role="alert"
    >
      <p className="text-sm text-rose-200">{message}</p>
      <button type="button" onClick={onRetry} className={rowButtonClassName}>
        Try again
      </button>
    </div>
  );
}

function PanelHeading({
  id,
  title,
  body,
  aside,
}: {
  id: string;
  title: string;
  body?: string;
  aside?: ReactElement | null;
}): ReactElement {
  return (
    <div className="flex flex-col gap-3 px-5 pb-4 pt-5 sm:px-6 sm:pt-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h2 id={id} className="font-heading text-2xl font-bold text-white">
          {title}
        </h2>
        {body ? <p className="mt-1 text-sm text-white/50">{body}</p> : null}
      </div>
      {aside ?? null}
    </div>
  );
}

export function MyEquipmentPage(): ReactElement {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [items, setItems] = useState<EquipmentListing[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [listingsError, setListingsError] = useState<string>("");

  const [incomingBookings, setIncomingBookings] = useState<
    EquipmentIncomingBooking[]
  >([]);
  const [isLoadingIncoming, setIsLoadingIncoming] = useState<boolean>(true);
  const [incomingError, setIncomingError] = useState<string>("");

  const [ownerBookings, setOwnerBookings] = useState<EquipmentOwnerBooking[]>(
    [],
  );
  const [isLoadingOwnerBookings, setIsLoadingOwnerBookings] =
    useState<boolean>(true);
  const [ownerBookingsError, setOwnerBookingsError] = useState<string>("");
  const [rentalBucket, setRentalBucket] =
    useState<EquipmentBookingBucket | null>(null);

  // One slot for the latest failed row action, shown on the row it came from.
  const [rowError, setRowError] = useState<RowError | null>(null);
  const [respondingBookingId, setRespondingBookingId] = useState<string | null>(
    null,
  );
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [isAddOpen, setIsAddOpen] = useState<boolean>(false);
  const [addDetails, setAddDetails] = useState<ListingDetails>(defaultDetails);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [addError, setAddError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [editingItem, setEditingItem] = useState<EquipmentListing | null>(null);
  const [editDetails, setEditDetails] =
    useState<ListingDetails>(defaultDetails);
  const [editError, setEditError] = useState<string>("");
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  const loadMine = async (): Promise<void> => {
    setIsLoading(true);
    setListingsError("");
    try {
      setItems(await fetchMyEquipmentListings());
    } catch (loadError: unknown) {
      setListingsError(
        getMessage(loadError, "Unable to load your equipment listings."),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const loadIncomingBookings = async (): Promise<void> => {
    setIsLoadingIncoming(true);
    setIncomingError("");
    try {
      setIncomingBookings(await fetchIncomingEquipmentBookings());
    } catch (loadError: unknown) {
      setIncomingError(
        getMessage(loadError, "Unable to load booking requests."),
      );
    } finally {
      setIsLoadingIncoming(false);
    }
  };

  const loadOwnerBookings = async (): Promise<void> => {
    setIsLoadingOwnerBookings(true);
    setOwnerBookingsError("");
    try {
      setOwnerBookings(await fetchOwnerEquipmentBookings());
    } catch (loadError: unknown) {
      setOwnerBookingsError(
        getMessage(loadError, "Unable to load rentals of your equipment."),
      );
    } finally {
      setIsLoadingOwnerBookings(false);
    }
  };

  useEffect(() => {
    void loadMine();
    void loadIncomingBookings();
    void loadOwnerBookings();
  }, []);

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  const rentalsByBucket = useMemo(() => {
    const mapping: Record<EquipmentBookingBucket, EquipmentOwnerBooking[]> = {
      pending: [],
      upcoming: [],
      active: [],
      history: [],
    };
    ownerBookings.forEach((booking) => mapping[booking.bucket].push(booking));
    return mapping;
  }, [ownerBookings]);

  const activeRentalBucket =
    rentalBucket ??
    RENTAL_BUCKETS.find((bucket) => rentalsByBucket[bucket].length > 0) ??
    "pending";

  const setPhotoSelection = (nextPhotos: File[]): void => {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    setPhotos(nextPhotos);
    setPreviewUrls(nextPhotos.map((file) => URL.createObjectURL(file)));
  };

  const onFilesChanged = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = event.target.files;
    if (files) {
      const nextFiles = Array.from(files);
      const firstProblem = nextFiles
        .map(validateImageFile)
        .find((message) => message.length > 0);
      if (firstProblem) {
        setAddError(firstProblem);
      } else {
        setPhotoSelection([...photos, ...nextFiles].slice(0, PHOTO_LIMIT));
        setAddError("");
      }
    }
    event.target.value = "";
  };

  const closeAdd = useCallback((): void => {
    setIsAddOpen(false);
    setAddDetails(defaultDetails);
    setPhotos([]);
    setPreviewUrls((current) => {
      current.forEach((url) => URL.revokeObjectURL(url));
      return [];
    });
    setAddError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const closeEdit = useCallback((): void => {
    setEditingItem(null);
    setEditError("");
  }, []);

  const submitCreate = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();

    const validationError =
      validateListingDetails(addDetails) ||
      (photos.length === 0 ? "Add at least one photo." : "");
    if (validationError) {
      setAddError(validationError);
      return;
    }

    setIsSubmitting(true);
    setAddError("");
    try {
      const created = await createEquipmentListing({ ...addDetails, photos });
      setItems((current) => [created, ...current]);
      closeAdd();
    } catch (submitError: unknown) {
      setAddError(getMessage(submitError, "Unable to create this listing."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveEdit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!editingItem) return;

    const validationError = validateListingDetails(editDetails);
    if (validationError) {
      setEditError(validationError);
      return;
    }

    setIsSavingEdit(true);
    setEditError("");
    try {
      const updated = await updateEquipmentListing(editingItem.id, {
        ...editDetails,
        title: editDetails.title.trim(),
        description: editDetails.description.trim(),
        location: editDetails.location.trim(),
      });
      setItems((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      closeEdit();
    } catch (saveError: unknown) {
      setEditError(getMessage(saveError, "Unable to update this listing."));
    } finally {
      setIsSavingEdit(false);
    }
  };

  const toggleStatus = async (item: EquipmentListing): Promise<void> => {
    setUpdatingStatusId(item.id);
    setRowError(null);
    try {
      const updated = await updateEquipmentListing(item.id, {
        status: item.status === "active" ? "paused" : "active",
      });
      setItems((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
    } catch (toggleError: unknown) {
      setRowError({
        id: item.id,
        message: getMessage(toggleError, "Unable to update this listing."),
      });
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const removeListing = async (id: string): Promise<void> => {
    setDeletingId(id);
    setRowError(null);
    try {
      await deleteEquipmentListing(id);
      setItems((current) => current.filter((item) => item.id !== id));
      setConfirmDeleteId(null);
    } catch (deleteError: unknown) {
      setRowError({
        id,
        message: getMessage(deleteError, "Unable to delete this listing."),
      });
    } finally {
      setDeletingId(null);
    }
  };

  const respondToIncomingBooking = async (
    bookingId: string,
    action: "approve" | "decline",
  ): Promise<void> => {
    setRespondingBookingId(bookingId);
    setRowError(null);
    try {
      await respondToEquipmentBooking(bookingId, action);
      // An answered request leaves this list and changes state in Rentals.
      await Promise.all([loadIncomingBookings(), loadOwnerBookings()]);
    } catch (respondError: unknown) {
      setRowError({
        id: bookingId,
        message: getMessage(respondError, "Unable to update this request."),
      });
    } finally {
      setRespondingBookingId(null);
    }
  };

  const errorFor = (id: string): string =>
    rowError?.id === id ? rowError.message : "";

  const activeCount = items.filter((item) => item.status === "active").length;
  const hasListings = items.length > 0;
  const showRequests =
    isLoadingIncoming || Boolean(incomingError) || incomingBookings.length > 0;
  const showRentals =
    isLoadingOwnerBookings ||
    Boolean(ownerBookingsError) ||
    ownerBookings.length > 0;

  const summary = (() => {
    if (isLoading) return "Equipment you rent out to other engineers.";
    if (!hasListings) {
      return "List a machine or tool and other engineers can request it by the day.";
    }
    const sentences = [
      `${countOf(items.length, "listing", "listings")}, ${activeCount} active.`,
    ];
    if (!isLoadingIncoming && incomingBookings.length > 0) {
      sentences.push(
        `${countOf(incomingBookings.length, "booking request needs", "booking requests need")} a reply.`,
      );
    }
    return sentences.join(" ");
  })();

  const addButton = (
    <button
      type="button"
      onClick={() => setIsAddOpen(true)}
      className={primaryButtonClassName}
    >
      <PlusIcon className="h-4 w-4" aria-hidden="true" />
      Add equipment
    </button>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="My listings"
        summary={summary}
        // With no listings the empty state carries this action instead, so
        // the page never shows the same button twice.
        action={!isLoading && !hasListings && !listingsError ? null : addButton}
      />

      <EquipmentSectionTabs />

      {showRequests ? (
        <section
          className={panelClassName}
          aria-labelledby="requests-heading"
        >
          <PanelHeading
            id="requests-heading"
            title="Booking requests"
            body="Approve to confirm the dates. The renter pays after you approve."
          />
          {isLoadingIncoming ? (
            <RowSkeletons count={1} />
          ) : incomingError ? (
            <InlineError
              message={incomingError}
              onRetry={() => void loadIncomingBookings()}
            />
          ) : (
            <ul className="divide-y divide-white/10 border-t border-white/10">
              {incomingBookings.map((booking) => {
                const isResponding = respondingBookingId === booking.id;
                return (
                  <li
                    key={booking.id}
                    className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-6"
                  >
                    <Link
                      to={`${BOOKING_DETAIL_BASE}/${booking.id}`}
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
                        <PartyLine party={booking.renter} />
                      </div>
                    </Link>
                    <p className="font-heading text-xl font-bold tabular-nums text-white lg:col-span-2">
                      {formatCurrency(booking.totalRentalFee)}
                    </p>
                    <div className="flex flex-wrap gap-2 lg:col-span-4 lg:justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          void respondToIncomingBooking(booking.id, "decline")
                        }
                        disabled={isResponding}
                        className={secondaryButtonClassName}
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void respondToIncomingBooking(booking.id, "approve")
                        }
                        disabled={isResponding}
                        className={primaryButtonClassName}
                      >
                        {isResponding ? "Saving..." : "Approve"}
                      </button>
                    </div>
                    {errorFor(booking.id) ? (
                      <p
                        className="text-sm text-rose-300 lg:col-span-12"
                        role="alert"
                      >
                        {errorFor(booking.id)}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {isLoading ? (
        <section className={panelClassName} aria-label="Loading listings">
          <div className="px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
            <div className="h-7 w-40 animate-pulse rounded bg-white/10" />
          </div>
          <RowSkeletons count={3} />
        </section>
      ) : listingsError ? (
        <ErrorPanel message={listingsError} onRetry={() => void loadMine()} />
      ) : !hasListings ? (
        <EmptyPanel
          title="No listings yet"
          body="Add a machine or tool with photos, a daily rate and a deposit. Other engineers can then request it for the dates they need."
          action={addButton}
        />
      ) : (
        <section className={panelClassName} aria-labelledby="listings-heading">
          <PanelHeading id="listings-heading" title="Your listings" />
          <ul className="divide-y divide-white/10 border-t border-white/10">
            {items.map((item) => {
              const isConfirmingDelete = confirmDeleteId === item.id;
              return (
                <li
                  key={item.id}
                  className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-6"
                >
                  <Link
                    to={`/dashboard/engineer/equipment/${item.id}`}
                    className="group flex min-w-0 gap-4 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-glow lg:col-span-5"
                  >
                    <EquipmentThumb
                      src={item.photos[0]?.url}
                      alt={item.title}
                      className="h-16 w-24 shrink-0 rounded-xl"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-heading text-lg font-bold text-white transition-colors group-hover:text-primary">
                        {item.title}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-white/55">
                        {item.category}, {item.location}
                      </p>
                      <span
                        className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${listingStatusClassName[item.status]}`}
                      >
                        {listingStatusLabel[item.status]}
                      </span>
                    </div>
                  </Link>

                  <div className="lg:col-span-3">
                    <p>
                      <span className="font-heading text-xl font-bold tabular-nums text-white">
                        {formatCurrency(item.dailyRate)}
                      </span>
                      <span className="ml-1 text-xs text-white/50">/day</span>
                    </p>
                    <p className="text-xs text-white/45">
                      {formatCurrency(item.securityDeposit)} deposit
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:col-span-4 lg:justify-end">
                    {isConfirmingDelete ? (
                      <>
                        <span className="text-sm text-white/70">
                          Delete this listing?
                        </span>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={deletingId === item.id}
                          className={rowButtonClassName}
                        >
                          Keep
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeListing(item.id)}
                          disabled={deletingId === item.id}
                          className={rowDangerButtonClassName}
                        >
                          {deletingId === item.id ? "Deleting..." : "Delete"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingItem(item);
                            setEditDetails(toDetails(item));
                            setEditError("");
                          }}
                          className={rowButtonClassName}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleStatus(item)}
                          disabled={updatingStatusId === item.id}
                          className={rowButtonClassName}
                        >
                          {updatingStatusId === item.id
                            ? "Saving..."
                            : item.status === "active"
                              ? "Pause"
                              : "Activate"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteId(item.id);
                            setRowError(null);
                          }}
                          className={rowDangerButtonClassName}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>

                  {errorFor(item.id) ? (
                    <p
                      className="text-sm text-rose-300 lg:col-span-12"
                      role="alert"
                    >
                      {errorFor(item.id)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {showRentals ? (
        <section className={panelClassName} aria-labelledby="rentals-heading">
          <PanelHeading
            id="rentals-heading"
            title="Rentals"
            body="Every booking of your equipment, from approval to deposit."
            aside={
              ownerBookings.length > 0 ? (
                <FilterTabs
                  options={RENTAL_BUCKETS.map((bucket) => ({
                    key: bucket,
                    label: rentalBucketLabel[bucket],
                    count: rentalsByBucket[bucket].length,
                  }))}
                  value={activeRentalBucket}
                  onChange={setRentalBucket}
                  label="Filter rentals"
                />
              ) : null
            }
          />
          {isLoadingOwnerBookings ? (
            <RowSkeletons count={2} />
          ) : ownerBookingsError ? (
            <InlineError
              message={ownerBookingsError}
              onRetry={() => void loadOwnerBookings()}
            />
          ) : rentalsByBucket[activeRentalBucket].length === 0 ? (
            <p className="border-t border-white/10 px-5 py-8 text-sm text-white/50 sm:px-6">
              No rentals in this group.
            </p>
          ) : (
            <ul className="divide-y divide-white/10 border-t border-white/10">
              {rentalsByBucket[activeRentalBucket].map((booking) => (
                <li key={booking.id}>
                  <Link
                    to={`${BOOKING_DETAIL_BASE}/${booking.id}`}
                    className="group grid gap-4 px-5 py-5 transition-colors hover:bg-white/4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-glow sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-6"
                  >
                    <div className="flex min-w-0 gap-4 lg:col-span-6">
                      <EquipmentThumb
                        src={booking.equipment.photoUrl}
                        alt={booking.equipment.title}
                        className="h-16 w-24 shrink-0 rounded-xl"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-heading text-lg font-bold text-white">
                          {booking.equipment.title}
                        </p>
                        <p className="mt-0.5 text-sm text-white/55">
                          {formatDateRange(booking.startDate, booking.endDate)}
                        </p>
                        <PartyLine party={booking.renter} />
                      </div>
                    </div>
                    <div className="lg:col-span-3">
                      <p className="font-heading text-xl font-bold tabular-nums text-white">
                        {formatCurrency(booking.totalRentalFee)}
                      </p>
                      <p className="text-xs text-white/45">
                        {getPaymentSummary(booking)}
                      </p>
                    </div>
                    <div className="lg:col-span-3 lg:text-right">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${bookingStatusClassName[booking.status]}`}
                      >
                        {bookingStatusLabel[booking.status]}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {isAddOpen ? (
        <Dialog
          title="Add equipment"
          description="Renters see the photos, daily rate and deposit before they request dates."
          onClose={closeAdd}
          isBusy={isSubmitting}
          size="lg"
        >
          <form
            onSubmit={(event) => void submitCreate(event)}
            className="grid gap-6"
            noValidate
          >
            <ListingFields
              idPrefix="add-listing"
              values={addDetails}
              onChange={(patch) =>
                setAddDetails((current) => ({ ...current, ...patch }))
              }
            />

            <div className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white/80">Photos</p>
                  <p className="text-xs text-white/45">
                    Up to {PHOTO_LIMIT}. JPG, PNG or WEBP, 5 MB each. The first
                    one is the cover.
                  </p>
                </div>
                <label
                  htmlFor="add-listing-photos"
                  className={`${rowButtonClassName} cursor-pointer ${
                    photos.length >= PHOTO_LIMIT
                      ? "pointer-events-none opacity-50"
                      : ""
                  }`}
                >
                  <ImageIcon className="h-4 w-4" aria-hidden="true" />
                  Choose photos
                </label>
                <input
                  ref={fileInputRef}
                  id="add-listing-photos"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={onFilesChanged}
                  disabled={photos.length >= PHOTO_LIMIT}
                  className="sr-only"
                />
              </div>

              {previewUrls.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {previewUrls.map((url, index) => (
                    <div
                      key={url}
                      className="relative overflow-hidden rounded-xl"
                    >
                      <img
                        src={url}
                        alt={`Selected photo ${index + 1}`}
                        className="aspect-square w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setPhotoSelection(
                            photos.filter((_, photoIndex) => photoIndex !== index),
                          )
                        }
                        className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-void/80 text-white transition-colors hover:bg-void focus-visible:outline-2 focus-visible:outline-glow"
                        aria-label={`Remove photo ${index + 1}`}
                      >
                        <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-white/15 text-sm text-white/40">
                  No photos chosen yet
                </div>
              )}
            </div>

            {addError ? (
              <p role="alert" className="text-sm text-rose-300">
                {addError}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeAdd}
                disabled={isSubmitting}
                className={secondaryButtonClassName}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={primaryButtonClassName}
              >
                {isSubmitting ? "Creating..." : "Create listing"}
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}

      {editingItem ? (
        <Dialog
          title="Edit listing"
          description={editingItem.title}
          onClose={closeEdit}
          isBusy={isSavingEdit}
          size="lg"
        >
          <form
            onSubmit={(event) => void saveEdit(event)}
            className="grid gap-6"
            noValidate
          >
            <ListingFields
              idPrefix="edit-listing"
              values={editDetails}
              onChange={(patch) =>
                setEditDetails((current) => ({ ...current, ...patch }))
              }
            />

            {editError ? (
              <p role="alert" className="text-sm text-rose-300">
                {editError}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-white/45">
                Photos stay as they were when the listing was created.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeEdit}
                  disabled={isSavingEdit}
                  className={secondaryButtonClassName}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className={primaryButtonClassName}
                >
                  {isSavingEdit ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}

import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { EquipmentSectionTabs } from "../components/dashboard/EquipmentSectionTabs";
import { RatingBadge } from "../components/RatingBadge";
import {
  fetchOwnerEquipmentBookings,
  fetchIncomingEquipmentBookings,
  createEquipmentListing,
  deleteEquipmentListing,
  EQUIPMENT_CATEGORIES,
  fetchMyEquipmentListings,
  respondToEquipmentBooking,
  type EquipmentIncomingBooking,
  type EquipmentCategory,
  type EquipmentListing,
  type EquipmentOwnerBooking,
  type EquipmentStatus,
  updateEquipmentListing,
} from "./equipment.api";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_LIMIT = 5 * 1024 * 1024;

interface EquipmentFormState {
  title: string;
  description: string;
  category: EquipmentCategory;
  dailyRate: string;
  securityDeposit: string;
  location: string;
  photos: File[];
}

interface EditDraftState {
  title: string;
  description: string;
  category: EquipmentCategory;
  dailyRate: string;
  securityDeposit: string;
  location: string;
}

const defaultForm: EquipmentFormState = {
  title: "",
  description: "",
  category: "Excavator",
  dailyRate: "",
  securityDeposit: "",
  location: "",
  photos: [],
};

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const validateImageFile = (file: File): string => {
  if (!IMAGE_TYPES.includes(file.type)) {
    return "Only JPG, PNG, and WEBP images are supported.";
  }
  if (file.size > IMAGE_LIMIT) {
    return "Each image must be 5MB or smaller.";
  }
  return "";
};

const validateForm = (form: EquipmentFormState): string => {
  if (!form.title.trim()) return "Title is required.";
  if (!form.description.trim()) return "Description is required.";
  if (form.description.trim().length > 1000) {
    return "Description must be 1000 characters or fewer.";
  }
  if (!form.location.trim()) return "Location is required.";

  const dailyRate = Number.parseFloat(form.dailyRate);
  if (!Number.isFinite(dailyRate) || dailyRate <= 0) {
    return "Daily rate must be a positive number.";
  }

  const securityDeposit = Number.parseFloat(form.securityDeposit);
  if (!Number.isFinite(securityDeposit) || securityDeposit <= 0) {
    return "Security deposit must be a positive number.";
  }

  if (form.photos.length === 0) {
    return "At least one photo is required.";
  }

  if (form.photos.length > 6) {
    return "You can upload up to 6 photos per listing.";
  }

  return "";
};

const toEditDraft = (item: EquipmentListing): EditDraftState => ({
  title: item.title,
  description: item.description,
  category: item.category,
  dailyRate: String(item.dailyRate),
  securityDeposit: String(item.securityDeposit),
  location: item.location,
});

const StatusChip = ({ status }: { status: EquipmentStatus }): ReactElement => (
  <span
    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
      status === "active"
        ? "border border-emerald-300/35 bg-emerald-300/15 text-emerald-200"
        : "border border-amber-300/35 bg-amber-300/15 text-amber-100"
    }`}
  >
    {status === "active" ? "Active" : "Paused"}
  </span>
);

export function MyEquipmentPage(): ReactElement {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<EquipmentListing[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const [isAddOpen, setIsAddOpen] = useState<boolean>(false);
  const [form, setForm] = useState<EquipmentFormState>(defaultForm);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [formError, setFormError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraftState | null>(null);
  const [editError, setEditError] = useState<string>("");
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [incomingBookings, setIncomingBookings] = useState<
    EquipmentIncomingBooking[]
  >([]);
  const [ownerBookings, setOwnerBookings] = useState<EquipmentOwnerBooking[]>(
    [],
  );
  const [isLoadingIncoming, setIsLoadingIncoming] = useState<boolean>(true);
  const [isLoadingOwnerBookings, setIsLoadingOwnerBookings] =
    useState<boolean>(true);
  const [respondingBookingId, setRespondingBookingId] = useState<string | null>(
    null,
  );

  const loadMine = async (): Promise<void> => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetchMyEquipmentListings();
      setItems(response);
    } catch (loadError: unknown) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Unable to load your equipment listings.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadMine();
  }, []);

  const loadIncomingBookings = async (): Promise<void> => {
    setIsLoadingIncoming(true);
    try {
      const response = await fetchIncomingEquipmentBookings();
      setIncomingBookings(response);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load incoming booking requests.",
      );
    } finally {
      setIsLoadingIncoming(false);
    }
  };

  const loadOwnerBookings = async (): Promise<void> => {
    setIsLoadingOwnerBookings(true);
    try {
      const response = await fetchOwnerEquipmentBookings();
      setOwnerBookings(response);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load owner booking lifecycle.",
      );
    } finally {
      setIsLoadingOwnerBookings(false);
    }
  };

  useEffect(() => {
    void loadIncomingBookings();
  }, []);

  useEffect(() => {
    void loadOwnerBookings();
  }, []);

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  const hasListings = items.length > 0;

  const canSubmit = useMemo(() => !isSubmitting, [isSubmitting]);

  const handlePhotoSelection = (files: FileList | null): void => {
    if (!files) return;

    const nextFiles = Array.from(files);
    const nextErrors = nextFiles
      .map(validateImageFile)
      .filter((message) => message.length > 0);

    if (nextErrors.length > 0) {
      setFormError(nextErrors[0]);
      return;
    }

    const merged = [...form.photos, ...nextFiles].slice(0, 6);

    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    const nextPreviews = merged.map((file) => URL.createObjectURL(file));

    setForm((current) => ({ ...current, photos: merged }));
    setPreviewUrls(nextPreviews);
    setFormError("");
  };

  const onFilesChanged = (event: ChangeEvent<HTMLInputElement>): void => {
    handlePhotoSelection(event.target.files);
    if (event.target) {
      event.target.value = "";
    }
  };

  const removeSelectedPhoto = (index: number): void => {
    const nextPhotos = form.photos.filter(
      (_, itemIndex) => itemIndex !== index,
    );
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    const nextPreviews = nextPhotos.map((file) => URL.createObjectURL(file));
    setForm((current) => ({ ...current, photos: nextPhotos }));
    setPreviewUrls(nextPreviews);
  };

  const resetForm = (): void => {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    setPreviewUrls([]);
    setForm(defaultForm);
    setFormError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const submitCreate = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();

    const validationError = validateForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsSubmitting(true);
    setFormError("");

    try {
      const created = await createEquipmentListing({
        title: form.title,
        description: form.description,
        category: form.category,
        dailyRate: form.dailyRate,
        securityDeposit: form.securityDeposit,
        location: form.location,
        photos: form.photos,
      });

      setItems((current) => [created, ...current]);
      resetForm();
      setIsAddOpen(false);
    } catch (submitError: unknown) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Unable to create equipment listing.";
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleStatus = async (item: EquipmentListing): Promise<void> => {
    setUpdatingStatusId(item.id);
    try {
      const nextStatus: EquipmentStatus =
        item.status === "active" ? "paused" : "active";
      const updated = await updateEquipmentListing(item.id, {
        status: nextStatus,
      });
      setItems((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
    } catch (toggleError: unknown) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Unable to update listing status.",
      );
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const removeListing = async (id: string): Promise<void> => {
    setDeletingId(id);
    try {
      await deleteEquipmentListing(id);
      setItems((current) => current.filter((item) => item.id !== id));
      setActiveMenuId(null);
    } catch (deleteError: unknown) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete this listing.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const startEdit = (item: EquipmentListing): void => {
    setEditingItemId(item.id);
    setEditDraft(toEditDraft(item));
    setEditError("");
    setActiveMenuId(null);
  };

  const saveEdit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!editingItemId || !editDraft) return;

    if (!editDraft.title.trim()) {
      setEditError("Title is required.");
      return;
    }
    if (!editDraft.description.trim()) {
      setEditError("Description is required.");
      return;
    }
    if (!editDraft.location.trim()) {
      setEditError("Location is required.");
      return;
    }

    setIsSavingEdit(true);
    setEditError("");

    try {
      const updated = await updateEquipmentListing(editingItemId, {
        title: editDraft.title.trim(),
        description: editDraft.description.trim(),
        category: editDraft.category,
        dailyRate: editDraft.dailyRate,
        securityDeposit: editDraft.securityDeposit,
        location: editDraft.location.trim(),
      });

      setItems((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      setEditingItemId(null);
      setEditDraft(null);
    } catch (saveError: unknown) {
      setEditError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update this listing.",
      );
    } finally {
      setIsSavingEdit(false);
    }
  };

  const formatDateRange = (startDate: string, endDate: string): string => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  };

  const respondToIncomingBooking = async (
    bookingId: string,
    action: "approve" | "decline",
  ): Promise<void> => {
    setRespondingBookingId(bookingId);
    try {
      await respondToEquipmentBooking(bookingId, action);
      await loadIncomingBookings();
    } catch (respondError: unknown) {
      setError(
        respondError instanceof Error
          ? respondError.message
          : "Unable to update booking request.",
      );
    } finally {
      setRespondingBookingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
            Owner workspace
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
            My Equipment Listings
          </h1>
          <p className="mt-3 max-w-2xl text-white/60">
            Publish, pause, and manage the gear you want to rent out.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddOpen(true)}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-glow"
        >
          Add Equipment
        </button>
      </div>

      <EquipmentSectionTabs />

      <section className="rounded-2xl border border-white/10 bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-2xl font-bold text-white">
            Incoming Requests
          </h2>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/70">
            {incomingBookings.length}
          </span>
        </div>

        {isLoadingIncoming ? (
          <div className="mt-4 space-y-3">
            {Array.from({ length: 2 }).map((_, index) => (
              <div
                key={`incoming-skeleton-${index}`}
                className="animate-pulse rounded-xl border border-white/10 bg-void/45 p-4"
              >
                <div className="h-16 rounded bg-white/10" />
              </div>
            ))}
          </div>
        ) : incomingBookings.length === 0 ? (
          <p className="mt-3 text-sm text-white/50">
            No pending booking requests right now.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {incomingBookings.map((booking) => (
              <article
                key={booking.id}
                className="rounded-xl border border-white/10 bg-void/45 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <img
                      src={booking.equipment.photoUrl ?? ""}
                      alt={booking.equipment.title}
                      className="h-16 w-24 rounded-lg object-cover"
                    />
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-sm font-semibold text-white">
                        {booking.equipment.title}
                      </p>
                      <p className="mt-1 text-xs text-white/55">
                        {formatDateRange(booking.startDate, booking.endDate)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-white/75">
                        Total: {formatCurrency(booking.totalRentalFee)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Avatar
                        name={booking.renter.name}
                        photoUrl={booking.renter.profilePhotoUrl}
                        size="sm"
                      />
                      <div className="min-w-0 text-right">
                        <p className="truncate text-xs font-semibold text-white">
                          {booking.renter.name}
                        </p>
                        <div className="mt-1 flex justify-end">
                          <RatingBadge
                            rating={booking.renter.rating ?? null}
                            reviewCount={booking.renter.reviewCount ?? 0}
                            size="sm"
                          />
                        </div>
                      </div>
                    </div>

                    <Link
                      to={`/dashboard/engineer/equipment/bookings/${booking.id}`}
                      className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/75 transition-colors hover:border-primary hover:text-primary"
                    >
                      View Details
                    </Link>

                    <button
                      type="button"
                      onClick={() =>
                        void respondToIncomingBooking(booking.id, "approve")
                      }
                      disabled={respondingBookingId === booking.id}
                      className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-glow disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void respondToIncomingBooking(booking.id, "decline")
                      }
                      disabled={respondingBookingId === booking.id}
                      className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/70 hover:border-red-300 hover:text-red-200 disabled:opacity-60"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-2xl font-bold text-white">
            Booking Lifecycle
          </h2>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/70">
            {ownerBookings.length}
          </span>
        </div>

        {isLoadingOwnerBookings ? (
          <div className="mt-4 space-y-3">
            {Array.from({ length: 2 }).map((_, index) => (
              <div
                key={`owner-bookings-skeleton-${index}`}
                className="animate-pulse rounded-xl border border-white/10 bg-void/45 p-4"
              >
                <div className="h-16 rounded bg-white/10" />
              </div>
            ))}
          </div>
        ) : ownerBookings.length === 0 ? (
          <p className="mt-3 text-sm text-white/50">
            No lifecycle bookings yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {ownerBookings.map((booking) => {
              return (
                <article
                  key={booking.id}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    navigate(
                      `/dashboard/engineer/equipment/bookings/${booking.id}`,
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(
                        `/dashboard/engineer/equipment/bookings/${booking.id}`,
                      );
                    }
                  }}
                  className="cursor-pointer rounded-xl border border-white/10 bg-void/45 p-4 transition-colors hover:border-primary/35"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <img
                        src={booking.equipment.photoUrl ?? ""}
                        alt={booking.equipment.title}
                        className="h-16 w-24 rounded-lg object-cover"
                      />
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-sm font-semibold text-white">
                          {booking.equipment.title}
                        </p>
                        <p className="mt-1 text-xs text-white/55">
                          {formatDateRange(booking.startDate, booking.endDate)}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <Avatar
                            name={booking.renter.name}
                            photoUrl={booking.renter.profilePhotoUrl}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-white/80">
                              {booking.renter.name}
                            </p>
                            <RatingBadge
                              rating={booking.renter.rating ?? null}
                              reviewCount={booking.renter.reviewCount ?? 0}
                              size="sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <span className="rounded-full border border-white/20 px-2.5 py-1 text-[11px] font-semibold capitalize text-white/75">
                      {booking.status}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
                    <p className="text-xs text-white/65">
                      Payment {booking.paymentStatus} • Deposit{" "}
                      {booking.depositResolution}
                    </p>
                    <p className="text-xs font-semibold text-primary">
                      View Details
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {error ? (
        <section
          className="rounded-2xl border border-red-400/20 bg-red-400/5 p-4"
          role="alert"
        >
          <p className="text-sm text-red-200">{error}</p>
        </section>
      ) : null}

      {isLoading ? (
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <article
              key={`mine-skeleton-${index}`}
              className="animate-pulse rounded-3xl border border-white/10 bg-surface/80 p-3"
            >
              <div className="aspect-4/3 rounded-2xl bg-white/10" />
              <div className="space-y-3 p-3">
                <div className="h-4 w-1/2 rounded bg-white/10" />
                <div className="h-3 w-2/3 rounded bg-white/10" />
                <div className="h-6 w-1/3 rounded bg-white/10" />
              </div>
            </article>
          ))}
        </section>
      ) : !hasListings ? (
        <section className="rounded-2xl border border-dashed border-white/20 bg-surface/50 p-12 text-center">
          <p className="text-4xl">🚜</p>
          <h2 className="mt-3 font-heading text-3xl font-bold text-white">
            You haven't listed any equipment yet
          </h2>
          <p className="mt-2 text-sm text-white/55">
            Add your first listing to start receiving rental interest.
          </p>
          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-glow"
          >
            Add Equipment
          </button>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <article
              key={item.id}
              className="group rounded-3xl border border-white/10 bg-surface/85 p-3 shadow-[0_10px_40px_rgba(0,0,0,0.24)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_18px_56px_rgba(0,0,0,0.35)]"
            >
              <div className="relative overflow-hidden rounded-2xl">
                <img
                  src={item.photos[0]?.url}
                  alt={item.title}
                  className="aspect-4/3 w-full object-cover"
                />
                <div className="absolute left-3 top-3 flex items-center gap-2">
                  <StatusChip status={item.status} />
                  <span className="rounded-full border border-amber-300/40 bg-amber-300/20 px-2.5 py-1 text-[11px] font-semibold text-amber-100">
                    {item.category}
                  </span>
                </div>

                <div className="absolute right-3 top-3">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveMenuId((current) =>
                        current === item.id ? null : item.id,
                      )
                    }
                    className="rounded-full border border-white/20 bg-black/35 px-2.5 py-1 text-sm font-semibold text-white"
                    aria-label="Listing actions"
                  >
                    ...
                  </button>
                  {activeMenuId === item.id ? (
                    <div className="absolute right-0 mt-2 w-32 rounded-xl border border-white/15 bg-void/95 p-1.5">
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-white/80 hover:bg-white/10"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeListing(item.id)}
                        disabled={deletingId === item.id}
                        className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-200 hover:bg-red-300/10 disabled:opacity-60"
                      >
                        {deletingId === item.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3 p-3">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="line-clamp-1 text-base font-bold text-white">
                    {item.title}
                  </h2>
                  <p className="text-sm font-extrabold text-white">
                    {formatCurrency(item.dailyRate)}
                    <span className="ml-1 text-xs font-normal text-white/55">
                      /day
                    </span>
                  </p>
                </div>

                <p className="line-clamp-2 text-sm text-white/60">
                  {item.description}
                </p>
                <p className="text-xs text-white/55">{item.location}</p>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void toggleStatus(item)}
                    disabled={updatingStatusId === item.id}
                    className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 transition-colors hover:border-primary hover:text-white disabled:opacity-60"
                  >
                    {updatingStatusId === item.id
                      ? "Saving..."
                      : item.status === "active"
                        ? "Pause listing"
                        : "Activate listing"}
                  </button>

                  <Link
                    to={`/dashboard/engineer/equipment/${item.id}`}
                    className="text-xs font-semibold text-primary hover:text-glow"
                  >
                    Open details
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {isAddOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSubmitting) {
              setIsAddOpen(false);
              resetForm();
            }
          }}
        >
          <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-surface p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Add equipment
                </p>
                <h2 className="mt-2 font-heading text-3xl font-bold text-white">
                  New Listing
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddOpen(false);
                  resetForm();
                }}
                className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/70 hover:border-primary hover:text-white"
              >
                Close
              </button>
            </div>

            <form
              onSubmit={(event) => void submitCreate(event)}
              className="mt-6 space-y-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm text-white/70">
                  Title
                  <input
                    value={form.title}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    className="form-input"
                    placeholder="CAT 320 Excavator"
                  />
                </label>

                <label className="space-y-1.5 text-sm text-white/70">
                  Category
                  <select
                    value={form.category}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        category: event.target.value as EquipmentCategory,
                      }))
                    }
                    className="form-input"
                  >
                    {EQUIPMENT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block space-y-1.5 text-sm text-white/70">
                Description
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  rows={4}
                  className="form-input resize-none"
                  placeholder="Condition, specs, delivery notes, and operator availability"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="space-y-1.5 text-sm text-white/70">
                  Daily Rate
                  <input
                    value={form.dailyRate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        dailyRate: event.target.value,
                      }))
                    }
                    className="form-input"
                    placeholder="250"
                  />
                </label>

                <label className="space-y-1.5 text-sm text-white/70">
                  Security Deposit
                  <input
                    value={form.securityDeposit}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        securityDeposit: event.target.value,
                      }))
                    }
                    className="form-input"
                    placeholder="1200"
                  />
                </label>

                <label className="space-y-1.5 text-sm text-white/70">
                  Location
                  <input
                    value={form.location}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        location: event.target.value,
                      }))
                    }
                    className="form-input"
                    placeholder="Dhaka"
                  />
                </label>
              </div>

              <div className="rounded-xl border border-dashed border-white/25 bg-void/45 p-4">
                <p className="text-sm font-semibold text-white">
                  Photos (up to 6)
                </p>
                <p className="mt-1 text-xs text-white/50">
                  JPG, PNG, WEBP only. Max 5MB each.
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={onFilesChanged}
                  className="mt-3 block w-full text-sm text-white/60 file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:font-semibold file:text-white"
                />

                {previewUrls.length > 0 ? (
                  <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {previewUrls.map((url, index) => (
                      <div
                        key={`${url}-${index}`}
                        className="relative overflow-hidden rounded-lg"
                      >
                        <img
                          src={url}
                          alt={`Selected upload ${index + 1}`}
                          className="h-20 w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeSelectedPhoto(index)}
                          className="absolute right-1 top-1 rounded-full bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                          aria-label={`Remove selected image ${index + 1}`}
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {formError ? (
                <p role="alert" className="text-sm text-red-300">
                  {formError}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-glow disabled:cursor-wait disabled:opacity-60"
              >
                {isSubmitting ? "Saving listing..." : "Create listing"}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {editingItemId && editDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-surface p-6 sm:p-8">
            <div className="flex items-start justify-between">
              <h3 className="font-heading text-2xl font-bold text-white">
                Edit Listing
              </h3>
              <button
                type="button"
                onClick={() => {
                  setEditingItemId(null);
                  setEditDraft(null);
                  setEditError("");
                }}
                className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/70 hover:border-primary hover:text-white"
              >
                Close
              </button>
            </div>

            <form
              onSubmit={(event) => void saveEdit(event)}
              className="mt-5 space-y-4"
            >
              <input
                value={editDraft.title}
                onChange={(event) =>
                  setEditDraft((current) =>
                    current
                      ? { ...current, title: event.target.value }
                      : current,
                  )
                }
                className="form-input"
                placeholder="Title"
              />
              <textarea
                value={editDraft.description}
                onChange={(event) =>
                  setEditDraft((current) =>
                    current
                      ? { ...current, description: event.target.value }
                      : current,
                  )
                }
                rows={4}
                className="form-input resize-none"
                placeholder="Description"
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <select
                  value={editDraft.category}
                  onChange={(event) =>
                    setEditDraft((current) =>
                      current
                        ? {
                            ...current,
                            category: event.target.value as EquipmentCategory,
                          }
                        : current,
                    )
                  }
                  className="form-input"
                >
                  {EQUIPMENT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>

                <input
                  value={editDraft.location}
                  onChange={(event) =>
                    setEditDraft((current) =>
                      current
                        ? { ...current, location: event.target.value }
                        : current,
                    )
                  }
                  className="form-input"
                  placeholder="Location"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  value={editDraft.dailyRate}
                  onChange={(event) =>
                    setEditDraft((current) =>
                      current
                        ? { ...current, dailyRate: event.target.value }
                        : current,
                    )
                  }
                  className="form-input"
                  placeholder="Daily rate"
                />

                <input
                  value={editDraft.securityDeposit}
                  onChange={(event) =>
                    setEditDraft((current) =>
                      current
                        ? { ...current, securityDeposit: event.target.value }
                        : current,
                    )
                  }
                  className="form-input"
                  placeholder="Security deposit"
                />
              </div>

              {editError ? (
                <p role="alert" className="text-sm text-red-300">
                  {editError}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSavingEdit}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-glow disabled:opacity-60"
              >
                {isSavingEdit ? "Saving..." : "Save changes"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

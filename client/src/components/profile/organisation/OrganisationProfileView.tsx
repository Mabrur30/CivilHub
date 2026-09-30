import {
  BuildingsIcon,
  CalendarBlankIcon,
  CameraIcon,
  CertificateIcon,
  GlobeIcon,
  MapPinIcon,
  PencilSimpleIcon,
  PlusIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import {
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { Avatar } from "../../Avatar";
import { RatingBadge } from "../../RatingBadge";
import {
  panelClassName,
  primaryButtonClassName,
  rowButtonClassName,
  rowDangerButtonClassName,
  secondaryButtonClassName,
} from "../../dashboard/ui/buttonStyles";
import { DeliveredProjects } from "../shared/DeliveredProjects";
import { ProfileEquipment } from "../shared/ProfileEquipment";
import { formatMonthYear } from "../shared/profileTypes";
import { AddPortfolioItemDialog } from "./AddPortfolioItemDialog";
import { EditOrganisationProfileDialog } from "./EditOrganisationProfileDialog";
import {
  type CompanyDetails,
  type CompanyPublicProfile,
  getErrorMessage,
  isCompanyDetails,
  serviceLabels,
  websiteHref,
} from "./organisationProfile";
import { ProfileSafetyActions } from "../../safety/ProfileSafetyActions";
import { VerifiedBadge } from "../../VerifiedBadge";
import { GetVerifiedLink } from "../../verification/GetVerifiedLink";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_LIMIT = 5 * 1024 * 1024;

interface OrganisationProfileViewProps {
  profile: CompanyPublicProfile;
  isSelf: boolean;
  /** Reloads the page's profile after a change here. */
  onChanged: () => void;
  /** Built by the profile page, which already loads these for engineers. */
  reviewsSection?: ReactNode;
  postsSection?: ReactNode;
  /** "Invite to bid", for clients viewing a company that takes on projects. */
  inviteSection?: ReactNode;
}

function Chip({ children }: { children: string }): ReactElement {
  return (
    <li className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-white/70">
      {children}
    </li>
  );
}

export function OrganisationProfileView({
  profile,
  isSelf,
  onChanged,
  reviewsSection,
  postsSection,
  inviteSection,
}: OrganisationProfileViewProps): ReactElement {
  const { currentUser, refetchUser } = useAuth();
  const [ownDetails, setOwnDetails] = useState<CompanyDetails | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isAddingWork, setIsAddingWork] = useState<boolean>(false);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState<boolean>(false);
  const [isActioning, setIsActioning] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  // The owner edits from their full details (phone included).
  useEffect(() => {
    if (!isSelf) return;
    let isActive = true;
    const load = async (): Promise<void> => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/organisations/me`, {
          credentials: "include",
        });
        const body: unknown = await response.json();
        if (isActive && response.ok && isCompanyDetails(body)) {
          setOwnDetails(body);
        }
      } catch {
        // Editing stays unavailable until the owner's details load.
      }
    };
    void load();
    return () => {
      isActive = false;
    };
  }, [isSelf, profile.userId]);

  const company = profile.company;
  const isClientViewer = currentUser?.role === "client";
  // Clients can message companies directly; other providers connect first.
  const canMessage = isClientViewer || profile.connectionStatus === "connected";

  const connect = async (): Promise<void> => {
    setIsActioning(true);
    setError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/network/${profile.userId}/request`,
        { method: "POST", credentials: "include" },
      );
      if (!response.ok) {
        setError(getErrorMessage(await response.json(), "Unable to send the request."));
        return;
      }
      onChanged();
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsActioning(false);
    }
  };

  const respond = async (decision: "accept" | "decline"): Promise<void> => {
    if (!profile.connectionId) return;
    setIsActioning(true);
    setError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/network/${profile.connectionId}/${decision}`,
        { method: "PATCH", credentials: "include" },
      );
      if (!response.ok) {
        setError(getErrorMessage(await response.json(), "Unable to update the request."));
        return;
      }
      onChanged();
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsActioning(false);
    }
  };

  const uploadLogo = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setError("Logo must be a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size > IMAGE_LIMIT) {
      setError("Logo must be 5MB or smaller.");
      return;
    }
    setIsUploadingLogo(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const response = await fetch(`${API_BASE_URL}/api/organisations/me/logo`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) {
        setError(getErrorMessage(await response.json(), "Unable to upload your logo."));
        return;
      }
      onChanged();
      await refetchUser();
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const removePortfolioItem = async (itemId: string): Promise<void> => {
    setRemovingItemId(itemId);
    setError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/organisations/me/portfolio/${itemId}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!response.ok) {
        setError(getErrorMessage(await response.json(), "Unable to remove this work."));
        return;
      }
      onChanged();
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setRemovingItemId(null);
    }
  };

  const facts = [
    company?.location
      ? { icon: MapPinIcon, text: company.location }
      : null,
    company?.yearFounded
      ? { icon: BuildingsIcon, text: `Founded ${company.yearFounded}` }
      : null,
    company?.teamSize
      ? { icon: UsersThreeIcon, text: `${company.teamSize} people` }
      : null,
    { icon: CalendarBlankIcon, text: `On CivilHub since ${formatMonthYear(profile.memberSince)}` },
  ].filter((fact): fact is { icon: typeof MapPinIcon; text: string } => fact !== null);

  return (
    <div className="grid gap-6">
      <section className="rounded-2xl border border-white/10 bg-surface p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="group/avatar relative w-fit shrink-0">
            <Avatar name={profile.name} photoUrl={profile.profilePhotoUrl} size="lg" />
            {isSelf ? (
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={isUploadingLogo}
                aria-label={profile.profilePhotoUrl ? "Change logo" : "Add logo"}
                className={`absolute inset-0 flex items-center justify-center rounded-full text-white transition-opacity duration-200 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-glow disabled:cursor-wait ${
                  profile.profilePhotoUrl
                    ? "bg-void/70 opacity-0 group-hover/avatar:opacity-100"
                    : "border border-dashed border-white/30 bg-surface text-white/70 opacity-100 hover:border-primary hover:text-white"
                }`}
              >
                {isUploadingLogo ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <CameraIcon className="h-6 w-6" aria-hidden="true" />
                )}
              </button>
            ) : null}
            {isSelf ? (
              <input
                ref={logoInputRef}
                type="file"
                accept={IMAGE_TYPES.join(",")}
                onChange={(event) => void uploadLogo(event)}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
              />
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-heading text-3xl font-bold leading-tight text-white sm:text-4xl">
                    {profile.name}
                  </h1>
                  <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.08em] text-primary">
                    Company
                  </span>
                  {profile.verified ? <VerifiedBadge /> : null}
                  {isSelf ? <GetVerifiedLink status={profile.ownVerificationStatus} /> : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <RatingBadge rating={profile.rating} reviewCount={profile.reviewCount} />
                  {profile.ratingKind === "equipment" ? (
                    <span className="text-xs text-white/50">from equipment rentals</span>
                  ) : null}
                </div>
                {company ? (
                  <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Services">
                    {company.services.map((service) => (
                      <li
                        key={service}
                        className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
                      >
                        {serviceLabels[service]}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                {isSelf ? (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    disabled={!ownDetails}
                    className={secondaryButtonClassName}
                  >
                    <PencilSimpleIcon className="h-4 w-4" aria-hidden="true" />
                    Edit profile
                  </button>
                ) : (
                  <>
                    {profile.blockedEitherWay ? null : canMessage ? (
                      <Link
                        to={`/messages/${profile.userId}`}
                        className={isClientViewer ? primaryButtonClassName : secondaryButtonClassName}
                      >
                        Message
                      </Link>
                    ) : null}
                    {/* Clients don't use connections; they message companies directly. */}
                    {isClientViewer || profile.blockedEitherWay ? null : profile.connectionStatus === "not_connected" ? (
                      <button
                        type="button"
                        onClick={() => void connect()}
                        disabled={isActioning}
                        className={isClientViewer ? secondaryButtonClassName : primaryButtonClassName}
                      >
                        <UsersThreeIcon className="h-4 w-4" aria-hidden="true" />
                        {isActioning ? "Sending..." : "Connect"}
                      </button>
                    ) : profile.connectionStatus === "pending_received" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void respond("accept")}
                          disabled={isActioning}
                          className={primaryButtonClassName}
                        >
                          Accept request
                        </button>
                        <button
                          type="button"
                          onClick={() => void respond("decline")}
                          disabled={isActioning}
                          className={secondaryButtonClassName}
                        >
                          Decline
                        </button>
                      </>
                    ) : profile.connectionStatus === "pending_sent" ? (
                      <p className="inline-flex w-fit items-center rounded-full bg-white/5 px-5 py-3 text-sm font-semibold text-white/60">
                        Request sent
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/60">
              {facts.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-1.5">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {text}
                </li>
              ))}
              <li className="flex items-center gap-1.5">
                <UsersThreeIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {profile.connectionsCount}{" "}
                {profile.connectionsCount === 1 ? "connection" : "connections"}
              </li>
            </ul>

            {!isSelf ? (
              <div className="mt-4">
                <ProfileSafetyActions
                  userId={profile.userId}
                  name={profile.name}
                  blockedByMe={Boolean(profile.blockedByMe)}
                  onChanged={onChanged}
                />
              </div>
            ) : null}

            {company?.about ? (
              <p className="mt-5 max-w-[65ch] whitespace-pre-line text-sm leading-6 text-white/70">
                {company.about}
              </p>
            ) : isSelf ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                disabled={!ownDetails}
                className="mt-5 w-full max-w-[65ch] rounded-xl border border-dashed border-white/20 px-4 py-3 text-left text-sm text-white/55 transition-colors hover:border-primary/60 hover:text-white/80"
              >
                Add a short introduction: what your company does, your fleet or
                team, and the work you take on.
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-rose-200"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="grid min-w-0 gap-6">
          {company?.services.includes("equipment") || profile.equipment.length > 0 ? (
            <ProfileEquipment
              listings={profile.equipment}
              headingId="company-equipment"
              emptyText={
                isSelf
                  ? "You haven't listed any equipment yet."
                  : "No equipment listed right now."
              }
            />
          ) : null}
          {company?.services.includes("projects") || profile.completedWork.length > 0 ? (
            <DeliveredProjects
              projects={profile.completedWork}
              headingId="company-work"
              emptyText="No completed projects yet."
            />
          ) : null}

          {company && (company.portfolio.length > 0 || isSelf) ? (
            <section className={`${panelClassName} p-6`} aria-labelledby="company-portfolio">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="company-portfolio" className="font-heading text-2xl font-bold text-white">
                  Portfolio
                </h2>
                {isSelf ? (
                  <button type="button" onClick={() => setIsAddingWork(true)} className={rowButtonClassName}>
                    <PlusIcon className="h-4 w-4" aria-hidden="true" />
                    Add work
                  </button>
                ) : null}
              </div>
              {company.portfolio.length === 0 ? (
                <p className="mt-3 text-sm text-white/55">
                  Show clients what you've built: a photo and a line or two about each job.
                </p>
              ) : (
                <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                  {company.portfolio.map((item) => (
                    <li key={item.id} className="overflow-hidden rounded-xl border border-white/10 bg-void/45">
                      <img src={item.imageUrl} alt="" className="aspect-video w-full object-cover" />
                      <div className="p-3">
                        <p className="text-sm font-semibold text-white">{item.title}</p>
                        <p className="mt-1 text-xs leading-5 text-white/60">{item.description}</p>
                        {isSelf ? (
                          <button
                            type="button"
                            onClick={() => void removePortfolioItem(item.id)}
                            disabled={removingItemId === item.id}
                            className={`${rowDangerButtonClassName} mt-3`}
                          >
                            {removingItemId === item.id ? "Removing..." : "Remove"}
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {reviewsSection}
          {postsSection}
        </div>

        <div className="grid gap-6 lg:sticky lg:top-8">
        {inviteSection}
        <aside className={`${panelClassName} grid gap-5 p-6`} aria-label="Company details">
          {company && company.specialties.length > 0 ? (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">Specialties</h2>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {company.specialties.map((item) => (
                  <Chip key={item}>{item}</Chip>
                ))}
              </ul>
            </div>
          ) : null}
          {company && company.serviceAreas.length > 0 ? (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">Areas served</h2>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {company.serviceAreas.map((item) => (
                  <Chip key={item}>{item}</Chip>
                ))}
              </ul>
            </div>
          ) : null}
          {company?.tradeLicenceNo ? (
            <p className="flex items-start gap-2 text-sm text-white/70">
              <CertificateIcon className="mt-0.5 h-4 w-4 shrink-0 text-white/45" aria-hidden="true" />
              <span>
                Trade licence <span className="font-semibold text-white/85">{company.tradeLicenceNo}</span>
                <span className="block text-xs text-white/45">
                  {profile.verified
                    ? "Checked by CivilHub against the licence itself."
                    : "As provided by the company; not checked by CivilHub."}
                </span>
              </span>
            </p>
          ) : null}
          {company?.website ? (
            <a
              href={websiteHref(company.website)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 break-all text-sm text-white/75 underline decoration-white/25 underline-offset-4 hover:text-white"
            >
              <GlobeIcon className="h-4 w-4 shrink-0 text-white/45" aria-hidden="true" />
              {company.website}
            </a>
          ) : null}
          {isSelf && ownDetails?.phone ? (
            <p className="text-sm text-white/70">
              Phone {ownDetails.phone}
              <span className="block text-xs text-white/45">Only you can see this.</span>
            </p>
          ) : null}
          {!company?.specialties.length &&
          !company?.serviceAreas.length &&
          !company?.tradeLicenceNo &&
          !company?.website ? (
            <p className="text-sm text-white/55">
              {isSelf
                ? "Add your specialties, areas served and trade licence so clients know what you take on."
                : "No company details added yet."}
            </p>
          ) : null}
        </aside>
        </div>
      </div>

      {isAddingWork ? (
        <AddPortfolioItemDialog
          onClose={() => setIsAddingWork(false)}
          onAdded={() => {
            setIsAddingWork(false);
            onChanged();
          }}
        />
      ) : null}

      {isEditing && ownDetails ? (
        <EditOrganisationProfileDialog
          details={ownDetails}
          onClose={() => setIsEditing(false)}
          onSaved={(details) => {
            setOwnDetails(details);
            setIsEditing(false);
            onChanged();
            // The dashboard tabs follow the company's services.
            void refetchUser();
          }}
        />
      ) : null}
    </div>
  );
}

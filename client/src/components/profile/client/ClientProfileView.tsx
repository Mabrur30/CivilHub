import {
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { ClientProfileHeader, type ConnectionActions } from "./ClientProfileHeader";
import { ClientTrackRecord, TypicalWork } from "./ClientTrackRecord";
import { CompletedWork } from "./CompletedWork";
import { EditClientProfileDialog } from "./EditClientProfileDialog";
import { type BriefViewer, OpenBriefs } from "./OpenBriefs";
import { ProfileStrength, type ProfileTask } from "./ProfileStrength";
import {
  type ClientPublicProfile,
  getErrorMessage,
  isOwnClientDetails,
  type OwnClientDetails,
} from "./clientProfile";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_LIMIT = 5 * 1024 * 1024;

interface ClientProfileViewProps {
  profile: ClientPublicProfile;
  isSelf: boolean;
  viewerRole: "client" | "engineer" | null;
  connection: ConnectionActions;
  actionError: string;
  onProfileChange: (
    update: (current: ClientPublicProfile) => ClientPublicProfile,
  ) => void;
  onPhotoChanged: () => Promise<void>;
  /** The page's posts section; left out when there is nothing to show. */
  posts: ReactNode;
}

export function ClientProfileView({
  profile,
  isSelf,
  viewerRole,
  connection,
  actionError,
  onProfileChange,
  onPhotoChanged,
  posts,
}: ClientProfileViewProps): ReactElement {
  const [ownDetails, setOwnDetails] = useState<OwnClientDetails | null>(null);
  const [editField, setEditField] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);
  const [photoError, setPhotoError] = useState<string>("");
  const [savedNotice, setSavedNotice] = useState<string>("");
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isSelf) return;
    let isActive = true;
    const load = async (): Promise<void> => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/clients/me`, {
          credentials: "include",
        });
        const body: unknown = await response.json();
        if (isActive && response.ok && isOwnClientDetails(body)) {
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

  useEffect(() => {
    if (!savedNotice) return;
    const timeout = window.setTimeout(() => setSavedNotice(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [savedNotice]);

  const openEditor = (field?: string): void => {
    if (!ownDetails) return;
    setEditField(field ?? null);
    setIsEditing(true);
  };

  const fixTask = (task: ProfileTask): void => {
    if (task === "photo") {
      photoInputRef.current?.click();
      return;
    }
    openEditor(task);
  };

  const handleSaved = (details: OwnClientDetails): void => {
    setOwnDetails(details);
    onProfileChange((current) => ({
      ...current,
      bio: details.bio,
      companyName: details.companyName,
      clientType: details.clientType,
      location: details.location.trim() || null,
    }));
    setIsEditing(false);
    setSavedNotice("Profile saved.");
  };

  const handlePhotoChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setPhotoError("Profile photo must be a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size > IMAGE_LIMIT) {
      setPhotoError("Profile photo must be 5MB or smaller.");
      return;
    }

    setIsUploadingPhoto(true);
    setPhotoError("");
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const response = await fetch(`${API_BASE_URL}/api/clients/me/photo`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const body: unknown = await response.json();
      const photoUrl =
        typeof body === "object" && body !== null
          ? (body as { profilePhotoUrl?: unknown }).profilePhotoUrl
          : undefined;
      if (!response.ok || typeof photoUrl !== "string") {
        setPhotoError(
          getErrorMessage(body, "Unable to upload your profile photo."),
        );
        return;
      }
      onProfileChange((current) => ({ ...current, profilePhotoUrl: photoUrl }));
      setSavedNotice("Photo updated.");
      await onPhotoChanged();
    } catch {
      setPhotoError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const viewer: BriefViewer = isSelf
    ? "owner"
    : viewerRole === "engineer"
      ? "engineer"
      : "other";
  const firstName = profile.name.trim().split(/\s+/)[0] || profile.name;
  const profilePath = `/profile/${profile.userId}`;

  return (
    <div className="grid gap-6">
      <ClientProfileHeader
        profile={profile}
        isSelf={isSelf}
        connection={connection}
        onEditProfile={openEditor}
        photoInputRef={photoInputRef}
        isUploadingPhoto={isUploadingPhoto}
      />

      {isSelf ? (
        <input
          ref={photoInputRef}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          onChange={(event) => void handlePhotoChange(event)}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
      ) : null}

      {photoError || actionError ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-rose-200"
        >
          {photoError || actionError}
        </p>
      ) : null}

      {isSelf && ownDetails ? (
        <ProfileStrength
          profile={profile}
          ownDetails={ownDetails}
          onFix={fixTask}
        />
      ) : null}

      <ClientTrackRecord stats={profile.stats} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="grid min-w-0 gap-8">
          <OpenBriefs
            key={profile.userId}
            projects={profile.openProjectsList}
            totalOpen={profile.stats.openProjects}
            viewer={viewer}
            clientFirstName={firstName}
          />
          <CompletedWork
            projects={profile.completedWork}
            totalCompleted={profile.stats.completedProjects}
            isOwner={isSelf}
            profilePath={profilePath}
            profileName={firstName}
          />
          {posts}
        </div>
        <div className="lg:sticky lg:top-8">
          <TypicalWork
            stats={profile.stats}
            phone={isSelf ? (ownDetails?.phone ?? null) : null}
            onEditPhone={
              ownDetails ? () => openEditor("client-phone") : undefined
            }
          />
        </div>
      </div>

      {isEditing && ownDetails ? (
        <EditClientProfileDialog
          details={ownDetails}
          initialField={editField ?? undefined}
          onClose={() => setIsEditing(false)}
          onSaved={handleSaved}
        />
      ) : null}

      <p
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-0 bottom-6 z-40 mx-auto w-fit rounded-full border border-emerald-400/25 bg-surface px-5 py-3 text-sm font-semibold text-emerald-200 shadow-[0_12px_32px_rgb(0_0_0/0.45)] transition-[opacity,transform] duration-300 motion-reduce:transition-none ${
          savedNotice ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        {savedNotice}
      </p>
    </div>
  );
}

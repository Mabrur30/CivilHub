import {
  BriefcaseIcon,
  CalendarBlankIcon,
  CertificateIcon,
  ImagesIcon,
  MapPinIcon,
  PencilSimpleIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import {
  type ChangeEvent,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useState,
} from "react";
import { Avatar } from "../../Avatar";
import { RatingBadge } from "../../RatingBadge";
import { DisciplinePicker } from "../shared/DisciplinePicker";
import { formatMonthYear } from "../shared/profileTypes";
import {
  API_BASE_URL,
  CONNECTION_ERROR,
  type EngineerPublicProfile,
  IMAGE_LIMIT,
  IMAGE_TYPES,
  errorMessage,
  formatRateRange,
  hasStartingRate,
  validateFile,
} from "./engineerProfile";

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}): ReactElement {
  return (
    <div className="flex items-center gap-2.5 text-white/65">
      <span className="shrink-0 text-white/40" aria-hidden="true">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      <span className="text-right font-semibold text-white">{value}</span>
    </div>
  );
}

const iconClassName = "h-4 w-4";

/** Photo, name, specialities and key facts, with the visitor's actions below. */
export function EngineerSidebar({
  profile,
  isSelf,
  portfolioCount,
  certificateCount,
  photoInputRef,
  disciplineSignal,
  onPhotoChanged,
  onDisciplinesSaved,
  viewerActions,
  entrance,
}: {
  profile: EngineerPublicProfile;
  isSelf: boolean;
  portfolioCount: number;
  certificateCount: number;
  photoInputRef: RefObject<HTMLInputElement | null>;
  disciplineSignal: number;
  onPhotoChanged: (photoUrl: string) => void;
  onDisciplinesSaved: () => void;
  /** Connect, message, invite and safety actions, for visitors. */
  viewerActions: ReactNode;
  entrance?: { className: string; style: CSSProperties };
}): ReactElement {
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [photoError, setPhotoError] = useState<string>("");

  const handlePhotoChange = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const validationError = validateFile(file, IMAGE_TYPES, IMAGE_LIMIT, "Profile photo");
    if (validationError) {
      setPhotoError(validationError);
      return;
    }
    setIsUploading(true);
    setPhotoError("");
    try {
      const form = new FormData();
      form.append("photo", file);
      const response = await fetch(`${API_BASE_URL}/api/engineers/me/photo`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const body: unknown = await response.json().catch(() => null);
      const photoUrl = (body as { profilePhotoUrl?: unknown } | null)?.profilePhotoUrl;
      if (!response.ok || typeof photoUrl !== "string") {
        setPhotoError(errorMessage(body, "Unable to upload your profile photo."));
        return;
      }
      onPhotoChanged(photoUrl);
    } catch {
      setPhotoError(CONNECTION_ERROR);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <aside className="w-full shrink-0 lg:sticky lg:top-8 lg:w-[30%]">
      <div
        className={`overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-sm ${entrance?.className ?? ""}`}
        style={entrance?.style}
      >
        <div className="h-16 w-full bg-linear-to-r from-primary/70 via-primary/35 to-primary/10" />
        <div className="p-5 pt-0">
          <div className="-mt-10">
            <div className="group/avatar relative inline-flex rounded-full bg-surface p-1 shadow-lg">
              <Avatar name={profile.name} photoUrl={profile.profilePhotoUrl} size="lg" />
              {isSelf ? (
                <>
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={isUploading}
                    aria-label="Change profile photo"
                    className={`absolute inset-1 flex items-center justify-center rounded-full bg-black/55 text-snow backdrop-blur-sm transition-opacity duration-200 hover:bg-black/70 focus-visible:opacity-100 disabled:cursor-wait ${
                      isUploading ? "opacity-100" : "opacity-0 group-hover/avatar:opacity-100"
                    }`}
                  >
                    {isUploading ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : (
                      <PencilSimpleIcon className={iconClassName} aria-hidden="true" />
                    )}
                  </button>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept={IMAGE_TYPES.join(",")}
                    onChange={(event) => void handlePhotoChange(event)}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                </>
              ) : null}
            </div>
          </div>

          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-2xl font-bold text-white">{profile.name}</h1>
              {profile.reviewCount > 0 ? (
                <RatingBadge rating={profile.rating} reviewCount={profile.reviewCount} size="sm" />
              ) : null}
            </div>
            <span className="mt-1 inline-flex rounded-full border border-primary/35 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              Engineer
            </span>
            <DisciplinePicker
              key={(profile.disciplines ?? []).join("|")}
              disciplines={profile.disciplines ?? []}
              isOwner={isSelf}
              onSaved={onDisciplinesSaved}
              openSignal={disciplineSignal}
            />
          </div>

          <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-sm">
            {profile.location ? (
              <DetailRow icon={<MapPinIcon className={iconClassName} />} label="Based in" value={profile.location} />
            ) : null}
            {hasStartingRate(profile) ? (
              <DetailRow
                icon={<BriefcaseIcon className={iconClassName} />}
                label="Starting rate"
                value={formatRateRange(profile.startingRateMin, profile.startingRateMax)}
              />
            ) : null}
            {profile.memberSince ? (
              <DetailRow
                icon={<CalendarBlankIcon className={iconClassName} />}
                label="On CivilHub since"
                value={formatMonthYear(profile.memberSince)}
              />
            ) : null}
            <DetailRow
              icon={<UsersIcon className={iconClassName} />}
              label="Connections"
              value={profile.connectionsCount}
            />
            <DetailRow
              icon={<ImagesIcon className={iconClassName} />}
              label="Portfolio items"
              value={portfolioCount}
            />
            <DetailRow
              icon={<CertificateIcon className={iconClassName} />}
              label="Certificates"
              value={certificateCount}
            />
          </div>

          {viewerActions}

          {photoError ? (
            <p className="mt-4 text-xs text-rose-300" role="alert">
              {photoError}
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

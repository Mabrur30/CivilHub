import {
  CalendarBlankIcon,
  CameraIcon,
  MapPinIcon,
  PencilSimpleIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { type ReactElement, type RefObject } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../../Avatar";
import {
  primaryButtonClassName,
  secondaryButtonClassName,
} from "../../dashboard/ui/buttonStyles";
import {
  type ClientPublicProfile,
  describeClient,
  formatMonthYear,
} from "./clientProfile";

export interface ConnectionActions {
  isActioning: boolean;
  onConnect: () => void;
  onRespond: (decision: "accept" | "decline") => void;
}

interface ClientProfileHeaderProps {
  profile: ClientPublicProfile;
  isSelf: boolean;
  connection: ConnectionActions;
  onEditProfile: (field?: string) => void;
  photoInputRef: RefObject<HTMLInputElement | null>;
  isUploadingPhoto: boolean;
}

function ViewerActions({
  profile,
  connection,
}: {
  profile: ClientPublicProfile;
  connection: ConnectionActions;
}): ReactElement | null {
  const { isActioning, onConnect, onRespond } = connection;

  switch (profile.connectionStatus) {
    case "not_connected":
      return (
        <button
          type="button"
          onClick={onConnect}
          disabled={isActioning}
          className={primaryButtonClassName}
        >
          <UsersThreeIcon className="h-4 w-4" aria-hidden="true" />
          {isActioning ? "Sending..." : "Connect"}
        </button>
      );
    case "pending_received":
      return (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onRespond("accept")}
            disabled={isActioning}
            className={primaryButtonClassName}
          >
            Accept request
          </button>
          <button
            type="button"
            onClick={() => onRespond("decline")}
            disabled={isActioning}
            className={secondaryButtonClassName}
          >
            Decline
          </button>
        </div>
      );
    case "pending_sent":
      return (
        <p className="inline-flex w-fit items-center rounded-full bg-white/5 px-5 py-3 text-sm font-semibold text-white/60">
          Request sent
        </p>
      );
    case "connected":
      return (
        <Link
          to={`/messages/${profile.userId}`}
          className={secondaryButtonClassName}
        >
          Message
        </Link>
      );
  }
}

export function ClientProfileHeader({
  profile,
  isSelf,
  connection,
  onEditProfile,
  photoInputRef,
  isUploadingPhoto,
}: ClientProfileHeaderProps): ReactElement {
  const identity = describeClient(profile.clientType, profile.companyName);
  const bio = profile.bio.trim();

  return (
    <section className="rounded-2xl border border-white/10 bg-surface p-6 sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="group/avatar relative w-fit shrink-0">
          <Avatar
            name={profile.name}
            photoUrl={profile.profilePhotoUrl}
            size="lg"
          />
          {isSelf ? (
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={isUploadingPhoto}
              aria-label={
                profile.profilePhotoUrl
                  ? "Change profile photo"
                  : "Add profile photo"
              }
              // With no photo yet the camera stays visible as the prompt to
              // add one; once there is a photo it only appears on hover/focus.
              className={`absolute inset-0 flex items-center justify-center rounded-full text-white transition-opacity duration-200 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-glow disabled:cursor-wait ${
                profile.profilePhotoUrl
                  ? "bg-void/70"
                  : "border border-dashed border-white/30 bg-surface text-white/70 hover:border-primary hover:text-white"
              } ${
                isUploadingPhoto || !profile.profilePhotoUrl
                  ? "opacity-100"
                  : "opacity-0 group-hover/avatar:opacity-100"
              }`}
            >
              {isUploadingPhoto ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <CameraIcon className="h-6 w-6" aria-hidden="true" />
              )}
            </button>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="font-heading text-3xl font-bold leading-tight text-white sm:text-4xl">
                {profile.name}
              </h1>
              {identity ? (
                <p className="mt-1.5 text-base text-white/75">{identity}</p>
              ) : isSelf ? (
                <button
                  type="button"
                  onClick={() => onEditProfile("client-type")}
                  className="mt-1.5 text-sm font-semibold text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary"
                >
                  Say who you build for
                </button>
              ) : (
                <p className="mt-1.5 text-base text-white/55">Client</p>
              )}
            </div>

            <div className="shrink-0">
              {isSelf ? (
                <button
                  type="button"
                  onClick={() => onEditProfile()}
                  className={secondaryButtonClassName}
                >
                  <PencilSimpleIcon className="h-4 w-4" aria-hidden="true" />
                  Edit profile
                </button>
              ) : (
                <ViewerActions profile={profile} connection={connection} />
              )}
            </div>
          </div>

          <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/60">
            {profile.location ? (
              <li className="flex items-center gap-1.5">
                <MapPinIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {profile.location}
              </li>
            ) : null}
            <li className="flex items-center gap-1.5">
              <CalendarBlankIcon
                className="h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              On CivilHub since {formatMonthYear(profile.memberSince)}
            </li>
            <li className="flex items-center gap-1.5">
              <UsersThreeIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {profile.connectionsCount}{" "}
              {profile.connectionsCount === 1 ? "connection" : "connections"}
            </li>
          </ul>

          {bio ? (
            <p className="mt-5 max-w-[65ch] whitespace-pre-line text-sm leading-6 text-white/70">
              {bio}
            </p>
          ) : isSelf ? (
            <button
              type="button"
              onClick={() => onEditProfile("client-bio")}
              className="mt-5 w-full max-w-[65ch] rounded-xl border border-dashed border-white/20 px-4 py-3 text-left text-sm text-white/55 transition-colors hover:border-primary/60 hover:text-white/80"
            >
              Add a short introduction: what you are building and what you need
              from an engineer.
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

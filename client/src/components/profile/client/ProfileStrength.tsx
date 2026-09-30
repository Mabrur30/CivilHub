import { type ReactElement } from "react";
import { type ChecklistItem, ProfileChecklist } from "../shared/ProfileChecklist";
import { type ClientPublicProfile, type OwnClientDetails } from "./clientProfile";

export type ProfileTask = "photo" | "client-type" | "client-company" | "client-location" | "client-bio" | "client-phone";

interface ProfileStrengthProps {
  profile: ClientPublicProfile;
  ownDetails: OwnClientDetails;
  onFix: (task: ProfileTask) => void;
}

const buildChecklist = (
  profile: ClientPublicProfile,
  own: OwnClientDetails,
): ChecklistItem<ProfileTask>[] => {
  const items: ChecklistItem<ProfileTask>[] = [
    {
      task: "photo",
      todo: "Add a photo",
      done: "Photo",
      isDone: Boolean(profile.profilePhotoUrl),
    },
    {
      task: "client-type",
      todo: "Say who you build for",
      done: "Client type",
      isDone: own.clientType !== null,
    },
  ];
  // A company name means nothing to someone renovating their own home, so it
  // is only asked of clients who build for an organisation.
  if (own.clientType !== "individual") {
    items.push({
      task: "client-company",
      todo: "Add your company",
      done: "Company",
      isDone: Boolean(own.companyName.trim()),
    });
  }
  items.push(
    {
      task: "client-location",
      todo: "Add your location",
      done: "Location",
      isDone: Boolean(own.location.trim()),
    },
    {
      task: "client-bio",
      todo: "Write an introduction",
      done: "Introduction",
      isDone: Boolean(own.bio.trim()),
    },
    {
      task: "client-phone",
      todo: "Add a phone number",
      done: "Phone number",
      isDone: Boolean(own.phone.trim()),
    },
  );
  return items;
};

export function ProfileStrength({
  profile,
  ownDetails,
  onFix,
}: ProfileStrengthProps): ReactElement | null {
  return (
    <ProfileChecklist
      items={buildChecklist(profile, ownDetails)}
      intro="Engineers read this page before they bid on your briefs. A complete profile gets more serious bids."
      onFix={onFix}
    />
  );
}

import { CheckIcon, PlusIcon } from "@phosphor-icons/react";
import { type ReactElement } from "react";
import { type ClientPublicProfile, type OwnClientDetails } from "./clientProfile";

export type ProfileTask = "photo" | "client-type" | "client-company" | "client-location" | "client-bio" | "client-phone";

interface ChecklistItem {
  task: ProfileTask;
  todo: string;
  done: string;
  isDone: boolean;
}

interface ProfileStrengthProps {
  profile: ClientPublicProfile;
  ownDetails: OwnClientDetails;
  onFix: (task: ProfileTask) => void;
}

const buildChecklist = (
  profile: ClientPublicProfile,
  own: OwnClientDetails,
): ChecklistItem[] => {
  const items: ChecklistItem[] = [
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

// Only the owner sees this. It disappears once everything is filled in, so it
// never becomes permanent furniture on the page.
export function ProfileStrength({
  profile,
  ownDetails,
  onFix,
}: ProfileStrengthProps): ReactElement | null {
  const items = buildChecklist(profile, ownDetails);
  const doneCount = items.filter((item) => item.isDone).length;
  if (doneCount === items.length) return null;

  return (
    <section
      aria-labelledby="profile-strength-heading"
      className="rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="profile-strength-heading"
            className="font-heading text-xl font-bold text-white"
          >
            Finish your profile
          </h2>
          <p className="mt-1 max-w-[60ch] text-sm leading-6 text-white/65">
            Engineers read this page before they bid on your briefs. A complete
            profile gets more serious bids.
          </p>
        </div>
        <div className="shrink-0 sm:text-right">
          <p className="text-sm font-semibold text-white/80">
            {doneCount} of {items.length} done
          </p>
          {/* One pip per item rather than a percentage bar, so the count of
              what is left is readable at a glance. */}
          <div className="mt-2 flex gap-1" aria-hidden="true">
            {items.map((item) => (
              <span
                key={item.task}
                className={`h-1.5 w-6 rounded-full transition-colors duration-500 ${
                  item.isDone ? "bg-primary" : "bg-white/15"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <ul className="mt-5 flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.task}>
            {item.isDone ? (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-white/45">
                <CheckIcon
                  className="h-4 w-4 text-emerald-300"
                  weight="bold"
                  aria-hidden="true"
                />
                <span className="sr-only">Done: </span>
                {item.done}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onFix(item.task)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-surface px-3 py-1.5 text-sm font-semibold text-white/85 transition-[border-color,color,transform] hover:border-primary hover:text-white active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow"
              >
                <PlusIcon className="h-4 w-4" weight="bold" aria-hidden="true" />
                {item.todo}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

import { type CSSProperties, type ReactElement, useState } from "react";
import { MoneyInput } from "../../dashboard/ui/MoneyInput";
import { moneyValue } from "../../../lib/money";
import {
  type EngineerPublicProfile,
  type OpenRequest,
  formatRateRange,
  hasStartingRate,
  saveEngineerDetails,
} from "./engineerProfile";
import {
  FormError,
  SectionCard,
  emptyAddClassName,
  fieldLabelClassName,
  quietActionClassName,
  saveButtonClassName,
  textActionClassName,
  useOpenRequest,
} from "./SectionCard";

const TASKS = ["rate", "location"] as const;

function Tile({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-xl border border-white/10 bg-void/40 p-4">
      <dt className="text-xs text-white/50">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-white">{value}</dd>
    </div>
  );
}

/** The rate they state, where they're based, and where they've delivered. */
export function RateLocationSection({
  profile,
  isSelf,
  openRequest,
  onSaved,
  entrance,
}: {
  profile: EngineerPublicProfile;
  isSelf: boolean;
  openRequest: OpenRequest | null;
  onSaved: (update: Pick<EngineerPublicProfile, "startingRateMin" | "startingRateMax" | "location">) => void;
  entrance?: { className: string; style: CSSProperties };
}): ReactElement | null {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [minDraft, setMinDraft] = useState<string>("");
  const [maxDraft, setMaxDraft] = useState<string>("");
  const [locationDraft, setLocationDraft] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const startEditing = (): void => {
    setMinDraft(typeof profile.startingRateMin === "number" ? String(profile.startingRateMin) : "");
    setMaxDraft(typeof profile.startingRateMax === "number" ? String(profile.startingRateMax) : "");
    setLocationDraft(profile.location ?? "");
    setError("");
    setIsEditing(true);
  };
  const sectionRef = useOpenRequest(openRequest, [...TASKS], startEditing);

  const hasRate = hasStartingRate(profile);
  const hasAnything = hasRate || Boolean(profile.location) || Boolean(profile.derivedLocation);
  if (!hasAnything && !isSelf) return null;

  const save = async (): Promise<void> => {
    const min = minDraft.trim() ? (moneyValue(minDraft) ?? Number.NaN) : null;
    const max = maxDraft.trim() ? (moneyValue(maxDraft) ?? Number.NaN) : null;
    if ((min !== null && !(min >= 0)) || (max !== null && !(max >= 0))) {
      setError("Rates must be amounts of zero or more.");
      return;
    }
    if (min !== null && max !== null && min > max) {
      setError("The starting rate can't be more than the upper rate.");
      return;
    }
    const location = locationDraft.trim() || null;

    setIsSaving(true);
    setError("");
    const result = await saveEngineerDetails({
      startingRateMin: min,
      startingRateMax: max,
      location,
    });
    setIsSaving(false);
    if (result.error !== null) {
      setError(result.error);
      return;
    }
    onSaved({
      startingRateMin: result.data.startingRateMin,
      startingRateMax: result.data.startingRateMax,
      location: result.data.location,
    });
    setIsEditing(false);
  };

  const notSet = isSelf ? "Not added yet" : "Not stated";

  return (
    <SectionCard
      id="engineer-rate"
      title="Rate & location"
      sectionRef={sectionRef}
      className={entrance?.className}
      style={entrance?.style}
      action={
        isSelf && !isEditing && (hasRate || profile.location) ? (
          <button type="button" onClick={startEditing} className={textActionClassName}>
            Edit
          </button>
        ) : null
      }
    >
      {isEditing ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="grid content-start gap-1.5">
            <label htmlFor="starting-rate-min" className={fieldLabelClassName}>
              Starting rate from
            </label>
            <MoneyInput id="starting-rate-min" value={minDraft} onChange={setMinDraft} />
          </div>
          <div className="grid content-start gap-1.5">
            <label htmlFor="starting-rate-max" className={fieldLabelClassName}>
              Up to
            </label>
            <MoneyInput id="starting-rate-max" value={maxDraft} onChange={setMaxDraft} />
          </div>
          <div className="grid content-start gap-1.5">
            <label htmlFor="engineer-location" className={fieldLabelClassName}>
              Based in
            </label>
            <input
              id="engineer-location"
              value={locationDraft}
              onChange={(event) => setLocationDraft(event.target.value)}
              placeholder="e.g. Mirpur, Dhaka"
              maxLength={160}
              className="form-input"
            />
          </div>
          <p className="text-xs text-white/45 sm:col-span-3">
            Clients see this before they invite you. Your quotes on each brief are
            still up to you.
          </p>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={isSaving}
              className={saveButtonClassName}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
              className={quietActionClassName}
            >
              Cancel
            </button>
          </div>
          <div className="sm:col-span-3">
            <FormError message={error} />
          </div>
        </div>
      ) : (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <Tile
              label="Starting rate"
              value={
                hasRate ? formatRateRange(profile.startingRateMin, profile.startingRateMax) : notSet
              }
            />
            <Tile label="Based in" value={profile.location || notSet} />
            <Tile
              label="Most finished projects in"
              value={
                profile.derivedLocation
                  ? `${profile.derivedLocation} (${profile.completedLocationProjectCount})`
                  : "No finished projects yet"
              }
            />
          </dl>
          {isSelf && !hasRate && !profile.location ? (
            <button type="button" onClick={startEditing} className={emptyAddClassName}>
              + Add your rate and location
            </button>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}

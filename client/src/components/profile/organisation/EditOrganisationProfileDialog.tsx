import { type FormEvent, type ReactElement, useState } from "react";
import { type CompanyService } from "../../../context/AuthContext";
import {
  inputClassName,
  primaryButtonBaseClassName,
  secondaryButtonClassName,
} from "../../dashboard/ui/buttonStyles";
import { Dialog } from "../../dashboard/ui/Dialog";
import { FormField } from "../../dashboard/ui/FormField";
import {
  type CompanyDetails,
  getErrorMessage,
  isCompanyDetails,
  serviceLabels,
  TEAM_SIZES,
} from "./organisationProfile";
import { SpecialityChooser } from "../shared/SpecialityChooser";
import { API_BASE_URL } from "../../../lib/apiBase";

const ABOUT_LIMIT = 1000;

interface EditOrganisationProfileDialogProps {
  details: CompanyDetails;
  onClose: () => void;
  onSaved: (details: CompanyDetails) => void;
}

interface Draft {
  name: string;
  services: CompanyService[];
  about: string;
  location: string;
  serviceAreas: string;
  /** From the discipline list, main speciality first. */
  specialties: string[];
  tradeLicenceNo: string;
  yearFounded: string;
  teamSize: string;
  website: string;
  phone: string;
}

// Lists are typed as comma-separated text and sent as arrays.
const toList = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const validate = (draft: Draft): string => {
  if (!draft.name.trim()) return "Add your company name.";
  if (draft.services.length === 0) {
    return "Choose what your company does: rent out equipment, take on projects, or both.";
  }
  const year = draft.yearFounded.trim();
  const thisYear = new Date().getFullYear();
  if (year && (!/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > thisYear)) {
    return `Year founded must be between 1900 and ${thisYear}.`;
  }
  if (toList(draft.serviceAreas).length > 12) {
    return "Add up to 12 service areas.";
  }
  if (draft.services.includes("projects") && draft.specialties.length === 0) {
    return "Choose what your company specialises in, so clients can find you for project work.";
  }
  return "";
};

export function EditOrganisationProfileDialog({
  details,
  onClose,
  onSaved,
}: EditOrganisationProfileDialogProps): ReactElement {
  const [draft, setDraft] = useState<Draft>({
    name: details.name,
    services: details.services,
    about: details.about,
    location: details.location,
    serviceAreas: details.serviceAreas.join(", "),
    specialties: details.specialties,
    tradeLicenceNo: details.tradeLicenceNo,
    yearFounded: details.yearFounded ? String(details.yearFounded) : "",
    teamSize: details.teamSize ?? "",
    website: details.website,
    phone: details.phone,
  });
  const [error, setError] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]): void => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  };

  const toggleService = (service: CompanyService): void =>
    update(
      "services",
      draft.services.includes(service)
        ? draft.services.filter((item) => item !== service)
        : [...draft.services, service],
    );

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const validationError = validate(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/organisations/me`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          services: draft.services,
          about: draft.about,
          location: draft.location,
          serviceAreas: toList(draft.serviceAreas),
          specialties: draft.specialties,
          tradeLicenceNo: draft.tradeLicenceNo,
          yearFounded: draft.yearFounded.trim() || null,
          teamSize: draft.teamSize || null,
          website: draft.website,
          phone: draft.phone,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok || !isCompanyDetails(body)) {
        setError(getErrorMessage(body, "Unable to save your company profile."));
        return;
      }
      onSaved(body);
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      title="Edit company profile"
      description="Clients and engineers see everything here except your phone number."
      onClose={onClose}
      isBusy={isSaving}
      size="lg"
    >
      <form onSubmit={(event) => void save(event)} className="grid gap-6" noValidate>
        <FormField id="company-name" label="Company name">
          <input
            id="company-name"
            value={draft.name}
            onChange={(event) => update("name", event.target.value)}
            maxLength={120}
            autoComplete="organization"
            className={inputClassName}
          />
        </FormField>

        <fieldset className="grid gap-3">
          <legend className="text-sm font-semibold text-white/80">
            What does your company do?
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(serviceLabels) as CompanyService[]).map((service) => (
              <label
                key={service}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/15 bg-void p-3.5 transition-colors hover:border-white/35 has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-glow"
              >
                <input
                  type="checkbox"
                  checked={draft.services.includes(service)}
                  onChange={() => toggleService(service)}
                  className="h-4 w-4 shrink-0 accent-primary"
                />
                <span className="text-sm font-semibold text-white">
                  {serviceLabels[service]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-2">
          <label htmlFor="company-about" className="text-sm font-semibold text-white/80">
            About the company
          </label>
          <textarea
            id="company-about"
            rows={4}
            value={draft.about}
            onChange={(event) => update("about", event.target.value.slice(0, ABOUT_LIMIT))}
            maxLength={ABOUT_LIMIT}
            className={`${inputClassName} resize-none`}
          />
          <p className="flex justify-between gap-4 text-xs text-white/45">
            <span>What you do, the kind of work you take on, and your fleet or team.</span>
            <span className="tabular-nums">
              {draft.about.length}/{ABOUT_LIMIT}
            </span>
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField id="company-location" label="Head office" hint="City or district, e.g. Tongi, Gazipur">
            <input
              id="company-location"
              value={draft.location}
              onChange={(event) => update("location", event.target.value)}
              maxLength={160}
              className={inputClassName}
            />
          </FormField>
          <FormField id="company-areas" label="Areas served" hint="Separate with commas, e.g. Dhaka, Gazipur">
            <input
              id="company-areas"
              value={draft.serviceAreas}
              onChange={(event) => update("serviceAreas", event.target.value)}
              className={inputClassName}
            />
          </FormField>
          <div className="sm:col-span-2">
            <SpecialityChooser
              value={draft.specialties}
              onChange={(next) => update("specialties", next)}
              legend="Specialities"
              hint="Pick your main speciality first, then up to 2 more. Clients filter by these when they look for a firm."
            />
          </div>
          <FormField id="company-licence" label="Trade licence number">
            <input
              id="company-licence"
              value={draft.tradeLicenceNo}
              onChange={(event) => update("tradeLicenceNo", event.target.value)}
              maxLength={60}
              className={inputClassName}
            />
          </FormField>
          <FormField id="company-founded" label="Year founded">
            <input
              id="company-founded"
              inputMode="numeric"
              value={draft.yearFounded}
              onChange={(event) => update("yearFounded", event.target.value.replace(/\D/g, "").slice(0, 4))}
              className={inputClassName}
            />
          </FormField>
          <FormField id="company-team" label="Team size">
            <select
              id="company-team"
              value={draft.teamSize}
              onChange={(event) => update("teamSize", event.target.value)}
              className={inputClassName}
            >
              <option value="">Not specified</option>
              {TEAM_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} people
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="company-website" label="Website">
            <input
              id="company-website"
              type="url"
              value={draft.website}
              onChange={(event) => update("website", event.target.value)}
              maxLength={200}
              placeholder="example.com.bd"
              className={inputClassName}
            />
          </FormField>
          <FormField id="company-phone" label="Phone number" hint="Only you can see this.">
            <input
              id="company-phone"
              type="tel"
              value={draft.phone}
              onChange={(event) => update("phone", event.target.value)}
              maxLength={30}
              autoComplete="tel"
              className={inputClassName}
            />
          </FormField>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={isSaving} className={secondaryButtonClassName}>
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className={primaryButtonBaseClassName}>
            {isSaving ? "Saving..." : "Save profile"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

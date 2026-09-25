import { LockSimpleIcon } from "@phosphor-icons/react";
import { type FormEvent, type ReactElement, useEffect, useState } from "react";
import {
  inputClassName,
  primaryButtonBaseClassName,
  secondaryButtonClassName,
} from "../../dashboard/ui/buttonStyles";
import { Dialog } from "../../dashboard/ui/Dialog";
import { FormField } from "../../dashboard/ui/FormField";
import {
  CLIENT_TYPES,
  type ClientType,
  clientTypeHints,
  clientTypeLabels,
  getErrorMessage,
  isOwnClientDetails,
  type OwnClientDetails,
} from "./clientProfile";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const BIO_LIMIT = 500;

interface EditClientProfileDialogProps {
  details: OwnClientDetails;
  /** Id of the field to focus when the dialog opens, e.g. "client-location". */
  initialField?: string;
  onClose: () => void;
  onSaved: (details: OwnClientDetails) => void;
}

const validate = (draft: OwnClientDetails): string => {
  const phone = draft.phone.trim();
  if (phone && (phone.length < 7 || phone.length > 30)) {
    return "Phone number must be between 7 and 30 characters.";
  }
  if (draft.companyName.trim().length > 120) {
    return "Company name must be 120 characters or fewer.";
  }
  if (draft.location.trim().length > 120) {
    return "Location must be 120 characters or fewer.";
  }
  return "";
};

export function EditClientProfileDialog({
  details,
  initialField,
  onClose,
  onSaved,
}: EditClientProfileDialogProps): ReactElement {
  const [draft, setDraft] = useState<OwnClientDetails>(details);
  const [error, setError] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    // The client-type group has no single input, so it focuses whichever
    // option is selected, or the first one.
    const target =
      initialField === "client-type"
        ? (document.querySelector<HTMLInputElement>(
            'input[name="client-type"]:checked',
          ) ??
          document.querySelector<HTMLInputElement>('input[name="client-type"]'))
        : initialField
          ? document.getElementById(initialField)
          : null;
    target?.focus();
  }, [initialField]);

  const update = <K extends keyof OwnClientDetails>(
    key: K,
    value: OwnClientDetails[K],
  ): void => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  };

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const validationError = validate(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/clients/me`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientType: draft.clientType,
          companyName: draft.companyName,
          location: draft.location,
          phone: draft.phone,
          bio: draft.bio,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok || !isOwnClientDetails(body)) {
        setError(getErrorMessage(body, "Unable to save your profile."));
        return;
      }
      onSaved(body);
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const isIndividual = draft.clientType === "individual";

  return (
    <Dialog
      title="Edit profile"
      description="Engineers see everything here except your phone number."
      onClose={onClose}
      isBusy={isSaving}
      size="lg"
    >
      <form onSubmit={(event) => void save(event)} className="grid gap-6" noValidate>
        <fieldset className="grid gap-3">
          <legend className="text-sm font-semibold text-white/80">
            Who are you building for?
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CLIENT_TYPES.map((type: ClientType) => (
              <label
                key={type}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/15 bg-void p-3.5 transition-colors hover:border-white/35 has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-glow"
              >
                <input
                  type="radio"
                  name="client-type"
                  value={type}
                  checked={draft.clientType === type}
                  onChange={() => update("clientType", type)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                />
                <span>
                  <span className="block text-sm font-semibold text-white">
                    {clientTypeLabels[type]}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-white/55">
                    {clientTypeHints[type]}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            id="client-company"
            label="Company or organisation"
            hint={
              isIndividual
                ? "Optional. Leave it blank if you are building for yourself."
                : undefined
            }
          >
            <input
              id="client-company"
              value={draft.companyName}
              onChange={(event) => update("companyName", event.target.value)}
              maxLength={120}
              autoComplete="organization"
              className={inputClassName}
            />
          </FormField>
          <FormField
            id="client-location"
            label="Location"
            hint="City or district, e.g. Mirpur, Dhaka"
          >
            <input
              id="client-location"
              value={draft.location}
              onChange={(event) => update("location", event.target.value)}
              maxLength={120}
              autoComplete="address-level2"
              className={inputClassName}
            />
          </FormField>
        </div>

        <div className="grid gap-2">
          <label
            htmlFor="client-bio"
            className="text-sm font-semibold text-white/80"
          >
            Introduction
          </label>
          <textarea
            id="client-bio"
            rows={4}
            value={draft.bio}
            onChange={(event) =>
              update("bio", event.target.value.slice(0, BIO_LIMIT))
            }
            maxLength={BIO_LIMIT}
            aria-describedby="client-bio-hint"
            className={`${inputClassName} resize-none`}
          />
          <div
            id="client-bio-hint"
            className="flex justify-between gap-4 text-xs text-white/45"
          >
            <span>What you build, and how you like to work with engineers.</span>
            <span
              className={`tabular-nums ${
                draft.bio.length >= BIO_LIMIT - 50 ? "text-amber-200" : ""
              }`}
            >
              {draft.bio.length}/{BIO_LIMIT}
            </span>
          </div>
        </div>

        <div className="grid gap-2 rounded-xl border border-white/10 bg-void/60 p-4">
          <label
            htmlFor="client-phone"
            className="flex items-center gap-1.5 text-sm font-semibold text-white/80"
          >
            <LockSimpleIcon className="h-4 w-4" aria-hidden="true" />
            Phone number
          </label>
          <input
            id="client-phone"
            type="tel"
            value={draft.phone}
            onChange={(event) => update("phone", event.target.value)}
            autoComplete="tel"
            aria-describedby="client-phone-hint"
            className={inputClassName}
          />
          <p id="client-phone-hint" className="text-xs text-white/45">
            Only you can see this.
          </p>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className={secondaryButtonClassName}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className={primaryButtonBaseClassName}
          >
            {isSaving ? "Saving..." : "Save profile"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

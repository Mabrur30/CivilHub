import { TargetIcon } from "@phosphor-icons/react";
import { type ReactElement, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { SpecialityChooser } from "../profile/shared/SpecialityChooser";
import { panelClassName, primaryButtonBaseClassName } from "./ui/buttonStyles";
import { API_BASE_URL } from "../../lib/apiBase";

/**
 * Asks an engineer or project company that hasn't chosen a speciality to pick
 * one. Clients search and filter by it, so without one a provider is hard to
 * find. Disappears once saved.
 */
export function SpecialityPrompt(): ReactElement | null {
  const { currentUser, refetchUser } = useAuth();
  const [draft, setDraft] = useState<string[]>([]);
  const [error, setError] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Only shown when the server says the list is empty (older servers omit it).
  if (!currentUser || !currentUser.disciplines || currentUser.disciplines.length > 0) {
    return null;
  }
  const isCompany = currentUser.role === "organisation";

  const save = async (): Promise<void> => {
    if (draft.length === 0) {
      setError("Choose your main speciality.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/${isCompany ? "organisations" : "engineers"}/me`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isCompany ? { specialties: draft } : { disciplines: draft }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? "Unable to save your speciality.");
        return;
      }
      await refetchUser();
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="speciality-prompt-heading"
      className={`${panelClassName} grid gap-5 border-l-2 border-l-primary p-5 sm:p-6`}
    >
      <div className="flex items-start gap-3">
        <TargetIcon aria-hidden="true" weight="fill" className="mt-1 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h2 id="speciality-prompt-heading" className="font-heading text-2xl font-bold text-white">
            {isCompany ? "What does your company specialise in?" : "What's your speciality?"}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-white/60">
            Clients filter engineers by speciality. Until you choose one, you won't
            show up when they do.
          </p>
        </div>
      </div>
      <SpecialityChooser
        value={draft}
        legend={isCompany ? "Company specialities" : "Your speciality"}
        onChange={(next) => {
          setError("");
          setDraft(next);
        }}
        error={error}
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={isSaving}
        className={`${primaryButtonBaseClassName} w-fit`}
      >
        {isSaving ? "Saving..." : "Save speciality"}
      </button>
    </section>
  );
}

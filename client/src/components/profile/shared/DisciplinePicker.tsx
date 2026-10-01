import { type ReactElement, useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { SpecialityChooser } from "./SpecialityChooser";
import {
  primaryButtonBaseClassName,
  rowButtonClassName,
} from "../../dashboard/ui/buttonStyles";
import { API_BASE_URL } from "../../../lib/apiBase";

/** An engineer's specialities as chips, with an inline editor for the owner. */
export function DisciplinePicker({
  disciplines,
  isOwner,
  onSaved,
  openSignal = 0,
}: {
  disciplines: string[];
  isOwner: boolean;
  onSaved: () => void;
  /** Bump to open the editor from elsewhere, such as the profile checklist. */
  openSignal?: number;
}): ReactElement | null {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [draft, setDraft] = useState<string[]>(disciplines);
  const [error, setError] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const { refetchUser } = useAuth();

  useEffect(() => {
    if (openSignal === 0 || !isOwner) return;
    setDraft(disciplines);
    setIsEditing(true);
    // Only a new signal opens it, not a change to the saved list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);

  if (!isEditing) {
    if (disciplines.length === 0 && !isOwner) return null;
    return (
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {disciplines.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Specialities">
            {disciplines.map((item) => (
              <li
                key={item}
                className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
              >
                {item}
              </li>
            ))}
          </ul>
        ) : null}
        {isOwner ? (
          <button
            type="button"
            onClick={() => {
              setDraft(disciplines);
              setIsEditing(true);
            }}
            className="rounded-full border border-dashed border-white/25 px-3 py-1 text-xs font-semibold text-white/60 transition-colors hover:border-primary hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow"
          >
            {disciplines.length > 0 ? "Edit speciality" : "+ Add your speciality"}
          </button>
        ) : null}
      </div>
    );
  }

  const save = async (): Promise<void> => {
    if (draft.length === 0) {
      setError("Choose your main speciality.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/engineers/me`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disciplines: draft }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        setError(body.message ?? "Unable to save your speciality.");
        return;
      }
      setIsEditing(false);
      onSaved();
      // The dashboard's "choose your speciality" prompt reads the signed-in user.
      void refetchUser();
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-3 grid gap-3 rounded-xl border border-white/10 bg-void/40 p-4">
      <SpecialityChooser
        value={draft}
        onChange={(next) => {
          setError("");
          setDraft(next);
        }}
      />
      {error ? (
        <p role="alert" className="text-xs text-rose-300">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={isSaving}
          className={`${primaryButtonBaseClassName} px-4 py-2`}
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          disabled={isSaving}
          className={rowButtonClassName}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

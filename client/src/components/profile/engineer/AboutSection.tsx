import { type CSSProperties, type ReactElement, useState } from "react";
import { type OpenRequest, saveEngineerDetails } from "./engineerProfile";
import {
  FormError,
  SectionCard,
  emptyAddClassName,
  quietActionClassName,
  saveButtonClassName,
  textActionClassName,
  useOpenRequest,
} from "./SectionCard";

const BIO_LIMIT = 500;
const TASKS = ["about"] as const;

/** The engineer's introduction. Visitors see it only once it's written. */
export function AboutSection({
  bio,
  isSelf,
  openRequest,
  onSaved,
  entrance,
}: {
  bio: string;
  isSelf: boolean;
  openRequest: OpenRequest | null;
  onSaved: (bio: string) => void;
  entrance?: { className: string; style: CSSProperties };
}): ReactElement | null {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [draft, setDraft] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const startEditing = (): void => {
    setDraft(bio);
    setError("");
    setIsEditing(true);
  };
  const sectionRef = useOpenRequest(openRequest, [...TASKS], startEditing);

  if (!bio.trim() && !isSelf) return null;

  const save = async (): Promise<void> => {
    setIsSaving(true);
    setError("");
    const result = await saveEngineerDetails({ bio: draft });
    setIsSaving(false);
    if (result.error !== null) {
      setError(result.error);
      return;
    }
    onSaved(draft.trim());
    setIsEditing(false);
  };

  return (
    <SectionCard
      id="engineer-about"
      title="About"
      sectionRef={sectionRef}
      className={entrance?.className}
      style={entrance?.style}
      action={
        isSelf && !isEditing && bio.trim() ? (
          <button type="button" onClick={startEditing} className={textActionClassName}>
            Edit
          </button>
        ) : null
      }
    >
      {isEditing ? (
        <div className="mt-4 space-y-2">
          <label htmlFor="engineer-bio" className="sr-only">
            About you
          </label>
          <textarea
            id="engineer-bio"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value.slice(0, BIO_LIMIT));
              setError("");
            }}
            maxLength={BIO_LIMIT}
            rows={4}
            className="form-input"
            placeholder="What you do, the kind of projects you take on, and where you work"
          />
          <div className="flex flex-wrap items-center gap-3">
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
            <span className="text-xs text-white/45">
              {draft.length}/{BIO_LIMIT}
            </span>
          </div>
          <FormError message={error} />
        </div>
      ) : bio.trim() ? (
        <p className="mt-4 whitespace-pre-line text-sm leading-6 text-white/70">{bio}</p>
      ) : (
        <button type="button" onClick={startEditing} className={emptyAddClassName}>
          + Add an introduction
        </button>
      )}
    </SectionCard>
  );
}

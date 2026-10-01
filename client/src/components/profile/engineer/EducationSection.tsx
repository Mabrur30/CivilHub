import { type ReactElement, useState } from "react";
import { ConfirmDialog } from "../../dashboard/ui/ConfirmDialog";
import {
  type EngineerEducationItem,
  parseYear,
  saveEngineerDetails,
  toEducationPayload,
  toPublicEducation,
} from "./engineerProfile";
import {
  FormError,
  SectionCard,
  emptyAddClassName,
  fieldLabelClassName,
  quietActionClassName,
  removeActionClassName,
  saveButtonClassName,
  textActionClassName,
} from "./SectionCard";

const EMPTY_DRAFT = { institution: "", degree: "", fieldOfStudy: "", graduationYear: "" };
type Draft = typeof EMPTY_DRAFT;

const headline = (entry: EngineerEducationItem): string =>
  entry.institution || entry.degree || entry.fieldOfStudy || "Education";

/** Degrees and diplomas. The owner adds, edits and removes them in place. */
export function EducationSection({
  entries,
  isSelf,
  onSaved,
}: {
  entries: EngineerEducationItem[];
  isSelf: boolean;
  onSaved: (entries: EngineerEducationItem[]) => void;
}): ReactElement | null {
  // "new" while adding, an entry id while editing, null otherwise.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [removing, setRemoving] = useState<EngineerEducationItem | null>(null);

  const startAdding = (): void => {
    setDraft(EMPTY_DRAFT);
    setError("");
    setEditingId("new");
  };
  const startEditing = (entry: EngineerEducationItem): void => {
    setDraft({
      institution: entry.institution ?? "",
      degree: entry.degree ?? "",
      fieldOfStudy: entry.fieldOfStudy ?? "",
      graduationYear: entry.graduationYear?.toString() ?? "",
    });
    setError("");
    setEditingId(entry.id);
  };
  if (entries.length === 0 && !isSelf) return null;

  const saveList = async (next: Array<Omit<EngineerEducationItem, "id">>): Promise<boolean> => {
    setIsSaving(true);
    setError("");
    const result = await saveEngineerDetails({ education: next.map(toEducationPayload) });
    setIsSaving(false);
    if (result.error !== null) {
      setError(result.error);
      return false;
    }
    onSaved(toPublicEducation(result.data.education));
    return true;
  };

  const submit = async (): Promise<void> => {
    const graduationYear = parseYear(draft.graduationYear);
    if (graduationYear === "invalid") {
      setError("The graduation year must be between 1900 and 2100.");
      return;
    }
    const entry = {
      institution: draft.institution.trim() || null,
      degree: draft.degree.trim() || null,
      fieldOfStudy: draft.fieldOfStudy.trim() || null,
      graduationYear,
    };
    if (!entry.institution && !entry.degree && !entry.fieldOfStudy) {
      setError("Add an institution or a degree.");
      return;
    }
    const next =
      editingId === "new"
        ? [...entries, entry]
        : entries.map((current) => (current.id === editingId ? { ...current, ...entry } : current));
    if (await saveList(next)) setEditingId(null);
  };

  const confirmRemove = async (): Promise<void> => {
    if (!removing) return;
    await saveList(entries.filter((entry) => entry.id !== removing.id));
    setRemoving(null);
  };

  const set = (field: keyof Draft) => (value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setError("");
  };

  const field = (
    key: keyof Draft,
    label: string,
    placeholder: string,
    extra: { maxLength?: number; inputMode?: "numeric" } = {},
  ): ReactElement => (
    <div className="grid gap-1.5">
      <label htmlFor={`education-${key}`} className={fieldLabelClassName}>
        {label}
      </label>
      <input
        id={`education-${key}`}
        value={draft[key]}
        onChange={(event) => set(key)(event.target.value)}
        placeholder={placeholder}
        className="form-input"
        {...extra}
      />
    </div>
  );

  const form = (
    <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-void/40 p-4 sm:grid-cols-2">
      <p className="text-xs text-white/50 sm:col-span-2">
        Fill in at least an institution, a degree or a field of study. The rest
        is optional.
      </p>
      {field("institution", "Institution", "e.g. BUET", { maxLength: 160 })}
      {field("degree", "Degree", "e.g. BSc", { maxLength: 120 })}
      {field("fieldOfStudy", "Field of study", "e.g. Civil Engineering", { maxLength: 120 })}
      {field("graduationYear", "Graduation year", "e.g. 2018", { inputMode: "numeric" })}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={isSaving}
          className={saveButtonClassName}
        >
          {isSaving ? "Saving..." : editingId === "new" ? "Add education" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => setEditingId(null)}
          disabled={isSaving}
          className={quietActionClassName}
        >
          Cancel
        </button>
      </div>
      <div className="sm:col-span-2">
        <FormError message={error} />
      </div>
    </div>
  );

  return (
    <SectionCard
      id="engineer-education"
      title="Education"
      action={
        isSelf && editingId === null && entries.length > 0 ? (
          <button type="button" onClick={startAdding} className={textActionClassName}>
            + Add
          </button>
        ) : null
      }
    >
      {entries.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {entries.map((entry) =>
            editingId === entry.id ? (
              <li key={entry.id}>{form}</li>
            ) : (
              <li key={entry.id} className="rounded-xl border border-white/10 bg-void/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{headline(entry)}</p>
                    {entry.institution && (entry.degree || entry.fieldOfStudy) ? (
                      <p className="text-xs text-white/60">
                        {[entry.degree, entry.fieldOfStudy].filter(Boolean).join(", ")}
                      </p>
                    ) : null}
                    {entry.graduationYear ? (
                      <p className="mt-1 text-xs text-white/45">
                        Graduated {entry.graduationYear}
                      </p>
                    ) : null}
                  </div>
                  {isSelf && editingId === null ? (
                    <div className="flex shrink-0 gap-3">
                      <button
                        type="button"
                        onClick={() => startEditing(entry)}
                        aria-label={`Edit ${headline(entry)}`}
                        className={quietActionClassName}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemoving(entry)}
                        aria-label={`Remove ${headline(entry)}`}
                        className={removeActionClassName}
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ),
          )}
        </ul>
      ) : null}

      {editingId === "new" ? form : null}

      {isSelf && entries.length === 0 && editingId === null ? (
        <button type="button" onClick={startAdding} className={emptyAddClassName}>
          + Add your education
        </button>
      ) : null}

      {editingId === null && error ? (
        <div className="mt-3">
          <FormError message={error} />
        </div>
      ) : null}

      {removing ? (
        <ConfirmDialog
          title={`Remove ${headline(removing)}?`}
          description="It comes off your education straight away."
          confirmLabel="Remove"
          busyLabel="Removing..."
          tone="danger"
          isBusy={isSaving}
          onConfirm={() => void confirmRemove()}
          onClose={() => setRemoving(null)}
        />
      ) : null}
    </SectionCard>
  );
}

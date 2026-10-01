import { type ReactElement, useState } from "react";
import { ConfirmDialog } from "../../dashboard/ui/ConfirmDialog";
import {
  type EngineerExperienceItem,
  type OpenRequest,
  formatYears,
  parseYear,
  saveEngineerDetails,
  toExperiencePayload,
  toPublicExperience,
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
  useOpenRequest,
} from "./SectionCard";

const TASKS = ["experience"] as const;
const EMPTY_DRAFT = { title: "", organization: "", startYear: "", endYear: "", description: "" };
type Draft = typeof EMPTY_DRAFT;

/** Past roles. The owner adds, edits and removes them in place. */
export function ExperienceSection({
  entries,
  isSelf,
  openRequest,
  onSaved,
}: {
  entries: EngineerExperienceItem[];
  isSelf: boolean;
  openRequest: OpenRequest | null;
  onSaved: (entries: EngineerExperienceItem[]) => void;
}): ReactElement | null {
  // "new" while adding, an entry id while editing, null otherwise.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [removing, setRemoving] = useState<EngineerExperienceItem | null>(null);

  const startAdding = (): void => {
    setDraft(EMPTY_DRAFT);
    setError("");
    setEditingId("new");
  };
  const startEditing = (entry: EngineerExperienceItem): void => {
    setDraft({
      title: entry.title ?? "",
      organization: entry.organization ?? "",
      startYear: entry.startYear?.toString() ?? "",
      endYear: entry.endYear?.toString() ?? "",
      description: entry.description ?? "",
    });
    setError("");
    setEditingId(entry.id);
  };
  const sectionRef = useOpenRequest(openRequest, [...TASKS], startAdding);

  if (entries.length === 0 && !isSelf) return null;

  const saveList = async (next: Array<Omit<EngineerExperienceItem, "id">>): Promise<boolean> => {
    setIsSaving(true);
    setError("");
    const result = await saveEngineerDetails({ experience: next.map(toExperiencePayload) });
    setIsSaving(false);
    if (result.error !== null) {
      setError(result.error);
      return false;
    }
    onSaved(toPublicExperience(result.data.experience));
    return true;
  };

  const submit = async (): Promise<void> => {
    const startYear = parseYear(draft.startYear);
    const endYear = parseYear(draft.endYear);
    const entry = {
      title: draft.title.trim() || null,
      organization: draft.organization.trim() || null,
      startYear: startYear === "invalid" ? null : startYear,
      endYear: endYear === "invalid" ? null : endYear,
      description: draft.description.trim() || null,
    };
    if (!entry.title && !entry.organization) {
      setError("Add a job title or an organisation.");
      return;
    }
    if (startYear === "invalid" || endYear === "invalid") {
      setError("Years must be between 1900 and 2100.");
      return;
    }
    if (entry.startYear !== null && entry.endYear !== null && entry.endYear < entry.startYear) {
      setError("The end year can't be before the start year.");
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

  const form = (
    <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-void/40 p-4 sm:grid-cols-2">
      <p className="text-xs text-white/50 sm:col-span-2">
        Fill in at least a job title or an organisation. The rest is optional.
      </p>
      <div className="grid gap-1.5">
        <label htmlFor="experience-title" className={fieldLabelClassName}>
          Job title
        </label>
        <input
          id="experience-title"
          value={draft.title}
          onChange={(event) => set("title")(event.target.value)}
          placeholder="e.g. Site engineer"
          maxLength={160}
          className="form-input"
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="experience-organisation" className={fieldLabelClassName}>
          Organisation
        </label>
        <input
          id="experience-organisation"
          value={draft.organization}
          onChange={(event) => set("organization")(event.target.value)}
          placeholder="e.g. Concord Engineers"
          maxLength={160}
          className="form-input"
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="experience-start" className={fieldLabelClassName}>
          Start year
        </label>
        <input
          id="experience-start"
          value={draft.startYear}
          onChange={(event) => set("startYear")(event.target.value)}
          inputMode="numeric"
          placeholder="e.g. 2019"
          className="form-input"
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="experience-end" className={fieldLabelClassName}>
          End year <span className="font-normal text-white/40">(blank if you're still there)</span>
        </label>
        <input
          id="experience-end"
          value={draft.endYear}
          onChange={(event) => set("endYear")(event.target.value)}
          inputMode="numeric"
          className="form-input"
        />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <label htmlFor="experience-description" className={fieldLabelClassName}>
          What you did <span className="font-normal text-white/40">(optional)</span>
        </label>
        <textarea
          id="experience-description"
          value={draft.description}
          onChange={(event) => set("description")(event.target.value)}
          rows={3}
          maxLength={1000}
          className="form-input"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={isSaving}
          className={saveButtonClassName}
        >
          {isSaving ? "Saving..." : editingId === "new" ? "Add role" : "Save changes"}
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
      id="engineer-experience"
      title="Experience"
      sectionRef={sectionRef}
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
                    <p className="text-sm font-semibold text-white">
                      {entry.title || entry.organization || "Role"}
                    </p>
                    {entry.title && entry.organization ? (
                      <p className="text-xs text-white/60">{entry.organization}</p>
                    ) : null}
                    {formatYears(entry.startYear, entry.endYear) ? (
                      <p className="mt-1 text-xs text-white/45">
                        {formatYears(entry.startYear, entry.endYear)}
                      </p>
                    ) : null}
                  </div>
                  {isSelf && editingId === null ? (
                    <div className="flex shrink-0 gap-3">
                      <button
                        type="button"
                        onClick={() => startEditing(entry)}
                        aria-label={`Edit ${entry.title || entry.organization || "role"}`}
                        className={quietActionClassName}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemoving(entry)}
                        aria-label={`Remove ${entry.title || entry.organization || "role"}`}
                        className={removeActionClassName}
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </div>
                {entry.description ? (
                  <p className="mt-3 whitespace-pre-line text-xs leading-5 text-white/65">
                    {entry.description}
                  </p>
                ) : null}
              </li>
            ),
          )}
        </ul>
      ) : null}

      {editingId === "new" ? form : null}

      {isSelf && entries.length === 0 && editingId === null ? (
        <button type="button" onClick={startAdding} className={emptyAddClassName}>
          + Add your experience
        </button>
      ) : null}

      {editingId === null && error ? (
        <div className="mt-3">
          <FormError message={error} />
        </div>
      ) : null}

      {removing ? (
        <ConfirmDialog
          title={`Remove ${removing.title || removing.organization || "this role"}?`}
          description="It comes off your experience straight away."
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

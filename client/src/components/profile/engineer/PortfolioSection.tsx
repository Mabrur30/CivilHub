import { type FormEvent, type ReactElement, useRef, useState } from "react";
import { ConfirmDialog } from "../../dashboard/ui/ConfirmDialog";
import {
  IMAGE_LIMIT,
  IMAGE_TYPES,
  type OpenRequest,
  type OwnEngineerData,
  type PortfolioEntry,
  isPortfolioResponse,
  requestJson,
  validateFile,
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
import { RequiredMark } from "../../dashboard/ui/RequiredMark";

type OwnPortfolio = OwnEngineerData["portfolio"];

const TASKS = ["portfolio"] as const;

/** Photos of past work. The owner adds, edits and deletes them in place. */
export function PortfolioSection({
  entries,
  isSelf,
  openRequest,
  onChanged,
  onOpenImage,
}: {
  entries: PortfolioEntry[];
  isSelf: boolean;
  openRequest: OpenRequest | null;
  onChanged: (portfolio: OwnPortfolio) => void;
  onOpenImage: (url: string) => void;
}): ReactElement | null {
  // "new" while adding, an item id while editing, null otherwise.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<PortfolioEntry | null>(null);

  const startAdding = (): void => {
    setTitle("");
    setDescription("");
    setError("");
    setEditingId("new");
  };
  const startEditing = (entry: PortfolioEntry): void => {
    setTitle(entry.title);
    setDescription(entry.description);
    setError("");
    setEditingId(entry.id);
  };
  const sectionRef = useOpenRequest(openRequest, [...TASKS], startAdding);

  if (entries.length === 0 && !isSelf) return null;

  const send = async (path: string, init: RequestInit, fallback: string): Promise<boolean> => {
    setIsSaving(true);
    setError("");
    const result = await requestJson(path, init, isPortfolioResponse, fallback);
    setIsSaving(false);
    if (result.error !== null) {
      setError(result.error);
      return false;
    }
    onChanged(result.data.portfolio);
    return true;
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError("Add a title and a short description.");
      return;
    }
    if (editingId === "new") {
      const file = fileRef.current?.files?.[0];
      const fileError = validateFile(file, IMAGE_TYPES, IMAGE_LIMIT, "Photo");
      if (fileError) {
        setError(fileError);
        return;
      }
      const form = new FormData();
      form.append("title", title.trim());
      form.append("description", description.trim());
      form.append("image", file as File);
      if (await send("/api/engineers/me/portfolio", { method: "POST", body: form }, "Unable to upload the photo.")) {
        setEditingId(null);
      }
      return;
    }
    const saved = await send(
      `/api/engineers/me/portfolio/${editingId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() }),
      },
      "Unable to save your changes.",
    );
    if (saved) setEditingId(null);
  };

  const confirmDelete = async (): Promise<void> => {
    if (!deleting?.id) return;
    await send(
      `/api/engineers/me/portfolio/${deleting.id}`,
      { method: "DELETE" },
      "Unable to delete this item.",
    );
    setDeleting(null);
  };

  const form = (
    <form
      onSubmit={(event) => void submit(event)}
      className="mt-4 space-y-3 rounded-xl border border-white/10 bg-void/40 p-4 sm:col-span-2"
      noValidate
    >
      <div className="grid gap-1.5">
        <label htmlFor="portfolio-title" className={fieldLabelClassName}>
          Project
          <RequiredMark />
        </label>
        <input
          id="portfolio-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Six-storey residence, Uttara"
          maxLength={160}
          className="form-input"
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="portfolio-description" className={fieldLabelClassName}>
          Your part in it
          <RequiredMark />
        </label>
        <textarea
          id="portfolio-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          maxLength={1000}
          className="form-input"
        />
      </div>
      {editingId === "new" ? (
        <div className="grid gap-1.5">
          <label htmlFor="portfolio-image" className={fieldLabelClassName}>
            Photo
            <RequiredMark /> <span className="font-normal text-white/40">(JPG, PNG or WEBP, up to 5MB)</span>
          </label>
          <input
            id="portfolio-image"
            ref={fileRef}
            type="file"
            accept={IMAGE_TYPES.join(",")}
            className="block w-full text-sm text-white/60 file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:font-semibold file:text-on-primary"
          />
        </div>
      ) : (
        <p className="text-xs text-white/45">
          To change the photo, delete this item and add it again.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={isSaving} className={saveButtonClassName}>
          {isSaving
            ? editingId === "new"
              ? "Uploading..."
              : "Saving..."
            : editingId === "new"
              ? "Add to portfolio"
              : "Save changes"}
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
      <FormError message={error} />
    </form>
  );

  return (
    <SectionCard
      id="engineer-portfolio"
      title="Portfolio"
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
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {entries.map((entry, index) =>
            entry.id !== null && editingId === entry.id ? (
              <li key={entry.id} className="sm:col-span-2">
                {form}
              </li>
            ) : (
              <li
                key={entry.id ?? `${entry.title}-${index}`}
                className="rounded-xl border border-white/10 bg-void/40 p-4"
              >
                <button
                  type="button"
                  onClick={() => onOpenImage(entry.imageUrl)}
                  aria-label={`View photo: ${entry.title}`}
                  className="block w-full overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow"
                >
                  <img
                    src={entry.imageUrl}
                    alt=""
                    loading="lazy"
                    className="h-36 w-full object-cover transition-transform duration-300 hover:scale-[1.03]"
                  />
                </button>
                <div className="mt-3 flex items-start justify-between gap-2">
                  <h3 className="min-w-0 text-sm font-semibold text-white">{entry.title}</h3>
                  {isSelf && entry.id !== null && editingId === null ? (
                    <div className="flex shrink-0 gap-3">
                      <button
                        type="button"
                        onClick={() => startEditing(entry)}
                        aria-label={`Edit ${entry.title}`}
                        className={quietActionClassName}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(entry)}
                        aria-label={`Delete ${entry.title}`}
                        className={removeActionClassName}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
                <p className="mt-2 whitespace-pre-line text-xs leading-5 text-white/60">
                  {entry.description}
                </p>
              </li>
            ),
          )}
        </ul>
      ) : null}

      {editingId === "new" ? form : null}

      {isSelf && entries.length === 0 && editingId === null ? (
        <button type="button" onClick={startAdding} className={emptyAddClassName}>
          + Add a project photo
        </button>
      ) : null}

      {editingId === null && error ? (
        <div className="mt-3">
          <FormError message={error} />
        </div>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`Delete “${deleting.title}”?`}
          description="The photo and its description are removed from your portfolio."
          confirmLabel="Delete"
          busyLabel="Deleting..."
          tone="danger"
          isBusy={isSaving}
          onConfirm={() => void confirmDelete()}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </SectionCard>
  );
}

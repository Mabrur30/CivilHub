import { type FormEvent, type ReactElement, useRef, useState } from "react";
import { ConfirmDialog } from "../../dashboard/ui/ConfirmDialog";
import {
  CERTIFICATE_LIMIT,
  CERTIFICATE_TYPES,
  type CertificateEntry,
  type OpenRequest,
  type OwnEngineerData,
  formatDate,
  isCertificatesResponse,
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

const TASKS = ["certificate"] as const;

/** Certificates and memberships. Signed-in users can open the files. */
export function CertificatesSection({
  entries,
  isSelf,
  openRequest,
  onChanged,
}: {
  entries: CertificateEntry[];
  isSelf: boolean;
  openRequest: OpenRequest | null;
  onChanged: (certificates: OwnEngineerData["certificates"]) => void;
}): ReactElement | null {
  // "new" while adding, a certificate id while renaming, null otherwise.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<CertificateEntry | null>(null);

  const startAdding = (): void => {
    setTitle("");
    setError("");
    setEditingId("new");
  };
  const startEditing = (entry: CertificateEntry): void => {
    setTitle(entry.title);
    setError("");
    setEditingId(entry.id);
  };
  const sectionRef = useOpenRequest(openRequest, [...TASKS], startAdding);

  if (entries.length === 0 && !isSelf) return null;

  const send = async (path: string, init: RequestInit, fallback: string): Promise<boolean> => {
    setIsSaving(true);
    setError("");
    const result = await requestJson(path, init, isCertificatesResponse, fallback);
    setIsSaving(false);
    if (result.error !== null) {
      setError(result.error);
      return false;
    }
    onChanged(result.data.certificates);
    return true;
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!title.trim()) {
      setError("Give the certificate a name.");
      return;
    }
    if (editingId === "new") {
      const file = fileRef.current?.files?.[0];
      const fileError = validateFile(file, CERTIFICATE_TYPES, CERTIFICATE_LIMIT, "Certificate");
      if (fileError) {
        setError(fileError);
        return;
      }
      const form = new FormData();
      form.append("title", title.trim());
      form.append("certificate", file as File);
      if (
        await send(
          "/api/engineers/me/certificates",
          { method: "POST", body: form },
          "Unable to upload the certificate.",
        )
      ) {
        setEditingId(null);
      }
      return;
    }
    const saved = await send(
      `/api/engineers/me/certificates/${editingId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      },
      "Unable to save your changes.",
    );
    if (saved) setEditingId(null);
  };

  const confirmDelete = async (): Promise<void> => {
    if (!deleting?.id) return;
    await send(
      `/api/engineers/me/certificates/${deleting.id}`,
      { method: "DELETE" },
      "Unable to delete this certificate.",
    );
    setDeleting(null);
  };

  const form = (
    <form
      onSubmit={(event) => void submit(event)}
      className="mt-4 space-y-3 rounded-xl border border-white/10 bg-void/40 p-4"
      noValidate
    >
      <div className="grid gap-1.5">
        <label htmlFor="certificate-title" className={fieldLabelClassName}>
          Certificate name
          <RequiredMark />
        </label>
        <input
          id="certificate-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. IEB membership"
          maxLength={160}
          className="form-input"
        />
      </div>
      {editingId === "new" ? (
        <div className="grid gap-1.5">
          <label htmlFor="certificate-file" className={fieldLabelClassName}>
            File
            <RequiredMark /> <span className="font-normal text-white/40">(PDF or image, up to 10MB)</span>
          </label>
          <input
            id="certificate-file"
            ref={fileRef}
            type="file"
            accept={CERTIFICATE_TYPES.join(",")}
            aria-describedby="certificate-visibility"
            className="block w-full text-sm text-white/60 file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:font-semibold file:text-on-primary"
          />
          <p id="certificate-visibility" className="text-xs text-white/45">
            Signed-in CivilHub users can open this file to check it, so leave out
            anything you wouldn't share.
          </p>
        </div>
      ) : (
        <p className="text-xs text-white/45">
          To replace the file, delete this certificate and add it again.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={isSaving} className={saveButtonClassName}>
          {isSaving
            ? editingId === "new"
              ? "Uploading..."
              : "Saving..."
            : editingId === "new"
              ? "Add certificate"
              : "Save name"}
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
      id="engineer-certificates"
      title="Certificates"
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
          {entries.map((entry, index) =>
            entry.id !== null && editingId === entry.id ? (
              <li key={entry.id}>{form}</li>
            ) : (
              <li
                key={entry.id ?? `${entry.title}-${index}`}
                className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-void/40 p-4"
              >
                <div className="min-w-0">
                  {entry.fileUrl ? (
                    <a
                      href={entry.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded text-sm font-semibold text-primary transition-colors hover:text-glow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow"
                    >
                      {entry.title}
                    </a>
                  ) : (
                    <p className="text-sm font-semibold text-white">{entry.title}</p>
                  )}
                  <p className="mt-1 text-xs text-white/45">Added {formatDate(entry.uploadedAt)}</p>
                </div>
                {isSelf && entry.id !== null && editingId === null ? (
                  <div className="flex shrink-0 gap-3">
                    <button
                      type="button"
                      onClick={() => startEditing(entry)}
                      aria-label={`Rename ${entry.title}`}
                      className={quietActionClassName}
                    >
                      Rename
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
              </li>
            ),
          )}
        </ul>
      ) : null}

      {editingId === "new" ? form : null}

      {isSelf && entries.length === 0 && editingId === null ? (
        <button type="button" onClick={startAdding} className={emptyAddClassName}>
          + Add a certificate
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
          description="The file is removed from your profile."
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

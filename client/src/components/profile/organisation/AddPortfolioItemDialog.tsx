import { type ReactElement, useRef, useState } from "react";
import {
  inputClassName,
  primaryButtonBaseClassName,
  secondaryButtonClassName,
} from "../../dashboard/ui/buttonStyles";
import { Dialog } from "../../dashboard/ui/Dialog";
import { FormField } from "../../dashboard/ui/FormField";
import { getErrorMessage } from "./organisationProfile";
import { API_BASE_URL } from "../../../lib/apiBase";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_LIMIT = 5 * 1024 * 1024;

/** A company adds a piece of past work: a photo, a title and a line or two. */
export function AddPortfolioItemDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}): ReactElement {
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (file: File | undefined): void => {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setError("The photo must be a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size > IMAGE_LIMIT) {
      setError("The photo must be 5 MB or smaller.");
      return;
    }
    setError("");
    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  const save = async (): Promise<void> => {
    if (!image || !title.trim() || !description.trim()) {
      setError("Add a photo, a title and a short description.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("image", image);
      formData.append("title", title.trim());
      formData.append("description", description.trim());
      const response = await fetch(`${API_BASE_URL}/api/organisations/me/portfolio`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) {
        setError(getErrorMessage(await response.json(), "Unable to add this work."));
        return;
      }
      onAdded();
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      title="Add past work"
      description="Show a project your company delivered, on CivilHub or before."
      onClose={onClose}
      isBusy={isSaving}
    >
      <form
        className="grid gap-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-white/80">Photo</p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="overflow-hidden rounded-xl border border-dashed border-white/20 text-sm text-white/60 transition-colors hover:border-primary hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow"
          >
            {preview ? (
              <img src={preview} alt="Chosen photo" className="aspect-video w-full object-cover" />
            ) : (
              <span className="block px-4 py-8">Choose a photo (JPEG, PNG or WebP, up to 5 MB)</span>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_TYPES.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              pick(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
        <FormField id="portfolio-title" label="Title">
          <input
            id="portfolio-title"
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            className={inputClassName}
          />
        </FormField>
        <FormField id="portfolio-description" label="What you did">
          <textarea
            id="portfolio-description"
            value={description}
            rows={3}
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
            className={`${inputClassName} resize-y`}
          />
        </FormField>
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
            {isSaving ? "Uploading..." : "Add to portfolio"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

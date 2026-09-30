import { CameraIcon } from "@phosphor-icons/react";
import { type ReactElement, useId, useState } from "react";
import { addConditionReport } from "../../../pages/equipment.api";
import { inputClassName, rowButtonClassName } from "../ui/buttonStyles";

const PHOTO_LIMIT = 4;

/**
 * For the side that didn't confirm a pickup or return: their own photos and
 * notes, so both records stand side by side if the deposit is disputed.
 */
export function ConditionReportForm({
  bookingId,
  stage,
  until,
  onAdded,
}: {
  bookingId: string;
  stage: "pickup" | "return";
  /** When the chance to add them ends. */
  until: Date;
  onAdded: () => void;
}): ReactElement {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string>("");
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const id = useId();
  const deadline = until.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  if (!isOpen) {
    return (
      <button type="button" onClick={() => setIsOpen(true)} className={`${rowButtonClassName} mt-2 text-xs`}>
        <CameraIcon className="h-3.5 w-3.5" aria-hidden="true" />
        Add your own {stage} photos (until {deadline})
      </button>
    );
  }

  const submit = async (): Promise<void> => {
    if (photos.length === 0 && !notes.trim()) {
      setError("Add photos, notes, or both.");
      return;
    }
    setIsBusy(true);
    setError("");
    try {
      await addConditionReport(bookingId, stage, notes, photos);
      onAdded();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "That didn't work. Please try again.");
      setIsBusy(false);
    }
  };

  return (
    <div className="mt-2 grid gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-xs text-white/60">
        Your own record of the {stage}, next to the other side's. Take the photos now if you can; CivilHub checks their camera
        date and place. You can add these once.
      </p>
      <label htmlFor={`${id}-notes`} className="sr-only">
        Notes
      </label>
      <textarea
        id={`${id}-notes`}
        rows={2}
        maxLength={2000}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="What condition was it in?"
        className={`${inputClassName} text-sm`}
      />
      <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-white/70 hover:text-white">
        <CameraIcon className="h-4 w-4" aria-hidden="true" />
        {photos.length > 0 ? `${photos.length} photo${photos.length === 1 ? "" : "s"} chosen` : `Add up to ${PHOTO_LIMIT} photos`}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            if (picked.length > PHOTO_LIMIT) {
              setError(`Add up to ${PHOTO_LIMIT} photos.`);
              return;
            }
            setPhotos(picked);
            setError("");
          }}
        />
      </label>
      {error ? (
        <p role="alert" className="text-xs text-rose-300">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="button" disabled={isBusy} onClick={() => void submit()} className={`${rowButtonClassName} text-xs`}>
          {isBusy ? "Uploading..." : "Add to the record"}
        </button>
        <button type="button" disabled={isBusy} onClick={() => setIsOpen(false)} className="text-xs font-semibold text-white/55 hover:text-white">
          Cancel
        </button>
      </div>
    </div>
  );
}

import { type FormEvent, type ReactElement, useState } from "react";
import { Dialog } from "../dashboard/ui/Dialog";
import {
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "../dashboard/ui/buttonStyles";
import { ChoiceChips } from "../project/ChoiceChips";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

export type ReportTarget = "user" | "post" | "comment";

const REASONS = [
  { value: "spam", label: "Spam" },
  { value: "scam", label: "Scam or fraud" },
  { value: "harassment", label: "Harassment" },
  { value: "fake_profile", label: "Fake profile" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Something else" },
];

const TITLES: Record<ReportTarget, string> = {
  user: "Report this person",
  post: "Report this post",
  comment: "Report this comment",
};

/** Flags a person, post or comment for the CivilHub team to review. */
export function ReportDialog({
  targetType,
  targetId,
  onClose,
}: {
  targetType: ReportTarget;
  targetId: string;
  onClose: () => void;
}): ReactElement {
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isSent, setIsSent] = useState<boolean>(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!reason) {
      setError("Choose a reason.");
      return;
    }
    setIsSending(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/reports`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          reason,
          note: note.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? "Unable to send your report.");
        return;
      }
      setIsSent(true);
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  if (isSent) {
    return (
      <Dialog title="Thanks for telling us" onClose={onClose}>
        <p className="text-sm leading-6 text-white/70">
          The CivilHub team will review it. The person isn't told who reported them.
        </p>
        <button type="button" onClick={onClose} className={`${primaryButtonClassName} mt-6`}>
          Done
        </button>
      </Dialog>
    );
  }

  return (
    <Dialog
      title={TITLES[targetType]}
      description="Reports are private. Tell us what's wrong and we'll take a look."
      onClose={onClose}
      isBusy={isSending}
    >
      <form onSubmit={(event) => void submit(event)} className="grid gap-5" noValidate>
        <ChoiceChips
          id="report-reason"
          name="report-reason"
          legend="What's the problem?"
          options={REASONS}
          value={reason}
          onChange={(value) => {
            setReason(value);
            setError("");
          }}
          error={error}
        />
        <div className="grid gap-2">
          <label htmlFor="report-note" className="text-sm font-semibold text-white/80">
            Anything else we should know <span className="font-normal text-white/40">(optional)</span>
          </label>
          <textarea
            id="report-note"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className={`${inputClassName} resize-y`}
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={isSending} className={secondaryButtonClassName}>
            Cancel
          </button>
          <button type="submit" disabled={isSending} className={primaryButtonClassName}>
            {isSending ? "Sending..." : "Send report"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

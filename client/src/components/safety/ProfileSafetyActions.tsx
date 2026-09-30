import { FlagIcon, ProhibitIcon } from "@phosphor-icons/react";
import { type ReactElement, useState } from "react";
import { ConfirmDialog } from "../dashboard/ui/ConfirmDialog";
import { ReportDialog } from "./ReportDialog";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const quietAction =
  "inline-flex items-center gap-1.5 rounded text-xs font-semibold text-white/45 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow disabled:opacity-50";

/**
 * Block/Unblock and Report for someone else's profile. Blocking ends any
 * connection and stops requests, messages and comments both ways.
 */
export function ProfileSafetyActions({
  userId,
  name,
  blockedByMe,
  onChanged,
}: {
  userId: string;
  name: string;
  blockedByMe: boolean;
  /** Called after block or unblock so the page can refresh its buttons. */
  onChanged: () => void;
}): ReactElement {
  const [isReporting, setIsReporting] = useState<boolean>(false);
  const [isConfirmingBlock, setIsConfirmingBlock] = useState<boolean>(false);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const toggleBlock = async (): Promise<void> => {
    setIsBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/blocks/${userId}`, {
        method: blockedByMe ? "DELETE" : "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? "Unable to update this right now.");
        return;
      }
      setIsConfirmingBlock(false);
      onChanged();
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="grid gap-2">
      {blockedByMe ? (
        <p className="text-xs text-white/55">You've blocked {name}.</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => {
            setError("");
            if (blockedByMe) void toggleBlock();
            else setIsConfirmingBlock(true);
          }}
          disabled={isBusy}
          className={quietAction}
        >
          <ProhibitIcon aria-hidden="true" className="h-3.5 w-3.5" />
          {blockedByMe ? "Unblock" : "Block"}
        </button>
        <button type="button" onClick={() => setIsReporting(true)} className={quietAction}>
          <FlagIcon aria-hidden="true" className="h-3.5 w-3.5" />
          Report
        </button>
      </div>
      {error && !isConfirmingBlock ? (
        <p role="alert" className="text-xs text-rose-300">
          {error}
        </p>
      ) : null}
      {isConfirmingBlock ? (
        <ConfirmDialog
          title={`Block ${name}?`}
          description="They won't be told you blocked them."
          confirmLabel="Block"
          busyLabel="Blocking..."
          tone="danger"
          isBusy={isBusy}
          error={error}
          onConfirm={() => void toggleBlock()}
          onClose={() => {
            setIsConfirmingBlock(false);
            setError("");
          }}
        >
          <ul className="grid list-disc gap-1.5 pl-5">
            <li>If you're connected, the connection ends.</li>
            <li>Neither of you can send the other requests, messages or comments.</li>
            <li>You won't see each other in suggestions or search.</li>
          </ul>
          <p className="mt-3 text-white/50">You can unblock them from their profile at any time.</p>
        </ConfirmDialog>
      ) : null}
      {isReporting ? (
        <ReportDialog targetType="user" targetId={userId} onClose={() => setIsReporting(false)} />
      ) : null}
    </div>
  );
}

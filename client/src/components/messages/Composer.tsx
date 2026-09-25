import {
  MicrophoneIcon,
  PaperclipIcon,
  PaperPlaneRightIcon,
  StopIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAudioRecorder } from "../../hooks/useAudioRecorder";
import {
  ATTACHMENT_ACCEPT,
  AUDIO_MAX_SECONDS,
  formatBytes,
  formatDuration,
  postFormWithProgress,
  validateAttachmentFile,
} from "../../lib/messageAttachments";
import { FileTypeIcon } from "../chat/MessageAttachmentView";
import { API_BASE_URL, CONNECTION_ERROR, getErrorMessage } from "./api";
import { type ChatMessage, isMessage } from "./types";

interface ComposerProps {
  conversationId: string;
  recipientName: string;
  sendText: (content: string) => Promise<string>;
  onSent: (message?: ChatMessage) => void;
}

const toolButton =
  "inline-flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-glow disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent";

const getRecordingExtension = (mimeType: string): string => {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mpeg")) return "mp3";
  return "webm";
};

function UploadProgressBar({
  progress,
}: {
  progress: number | null;
}): ReactElement {
  const percent = Math.round((progress ?? 0) * 100);
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div
        className="h-1 flex-1 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-label="Upload progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-[11px] tabular-nums text-white/55">
        {percent < 100 ? `${percent}%` : "Processing"}
      </span>
    </div>
  );
}

export function Composer({
  conversationId,
  recipientName,
  sendText,
  onSent,
}: ComposerProps): ReactElement {
  const [draft, setDraft] = useState<string>("");
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendError, setSendError] = useState<string>("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorder = useAudioRecorder();

  const previewUrl = useMemo(
    () =>
      pendingFile && pendingFile.type.startsWith("image/")
        ? URL.createObjectURL(pendingFile)
        : null,
    [pendingFile],
  );
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const isUploading = uploadProgress !== null;
  const isRecorderActive =
    recorder.status === "requesting" || recorder.status === "recording";
  const hasRecording = recorder.status === "recorded" && recorder.recording;

  const onPickFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const validationError = validateAttachmentFile(file);
    setSendError(validationError);
    if (!validationError) setPendingFile(file);
  };

  const onToggleRecording = (): void => {
    setSendError("");
    if (recorder.status === "recording") {
      recorder.stop();
      return;
    }
    void recorder.start();
  };

  const sendAttachment = async (): Promise<void> => {
    if (isUploading) return;
    const recording =
      recorder.status === "recorded" ? recorder.recording : null;
    if (!recording && !pendingFile) return;

    const caption = draft.trim();
    const formData = new FormData();
    if (recording) {
      formData.append("messageType", "audio");
      formData.append(
        "durationSeconds",
        String(Math.round(recording.durationSeconds)),
      );
      formData.append(
        "attachment",
        recording.blob,
        `voice-message.${getRecordingExtension(recording.mimeType)}`,
      );
    } else if (pendingFile) {
      formData.append("messageType", "file");
      if (caption) formData.append("content", caption);
      formData.append("attachment", pendingFile, pendingFile.name);
    }

    setSendError("");
    setUploadProgress(0);
    try {
      const result = await postFormWithProgress(
        `${API_BASE_URL}/api/conversations/${conversationId}/messages`,
        formData,
        setUploadProgress,
      );

      // On failure the file or recording stays in the composer so it can be retried.
      if (!result.ok || !isMessage(result.body)) {
        const fallback = recording
          ? "Voice message could not be sent. Try again."
          : "File could not be sent. Try again.";
        // 5xx bodies only say "Internal server error", which gives no direction.
        setSendError(
          result.status >= 500
            ? fallback
            : getErrorMessage(result.body, fallback),
        );
        return;
      }

      onSent(result.body);
      if (recording) {
        recorder.discard();
      } else {
        setPendingFile(null);
        if (caption) setDraft("");
      }
    } catch {
      setSendError(CONNECTION_ERROR);
    } finally {
      setUploadProgress(null);
    }
  };

  const send = async (): Promise<void> => {
    if (pendingFile || hasRecording) {
      await sendAttachment();
      return;
    }
    const content = draft.trim();
    if (!content || isSending) return;

    setIsSending(true);
    setSendError("");
    setDraft("");
    const error = await sendText(content);
    setIsSending(false);
    if (error) {
      setSendError(error);
      setDraft((current) => current || content);
      return;
    }
    onSent();
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void send();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  const canSend =
    (draft.trim().length > 0 ||
      Boolean(pendingFile) ||
      Boolean(hasRecording)) &&
    !isSending &&
    !isUploading &&
    !isRecorderActive;

  const composerError = sendError || recorder.error;

  return (
    <form onSubmit={onSubmit} className="shrink-0 px-5 pb-5 pt-2">
      <div className="rounded-2xl border border-white/15 bg-void/60 transition-colors focus-within:border-primary/60">
        {pendingFile ? (
          <div className="flex items-center gap-3 border-b border-white/10 px-3 py-2.5">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
                <FileTypeIcon mimeType={pendingFile.type} className="h-6 w-6" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {pendingFile.name}
              </p>
              {isUploading ? (
                <UploadProgressBar progress={uploadProgress} />
              ) : (
                <p className="text-[11px] text-white/55">
                  {formatBytes(pendingFile.size)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setPendingFile(null);
                setSendError("");
              }}
              disabled={isUploading}
              className={toolButton}
              aria-label={`Remove ${pendingFile.name}`}
            >
              <XIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {isRecorderActive ? (
          <div className="flex min-h-[4.5rem] items-center gap-3 px-4 py-2">
            <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
            </span>
            <p className="text-sm text-white" aria-live="polite">
              {recorder.status === "requesting"
                ? "Waiting for microphone access"
                : "Recording"}
            </p>
            <p className="ml-auto text-sm tabular-nums text-white/70">
              {formatDuration(recorder.elapsedSeconds)}
              <span className="text-white/35">
                {" "}
                / {formatDuration(AUDIO_MAX_SECONDS)}
              </span>
            </p>
            <button
              type="button"
              onClick={recorder.discard}
              className={toolButton}
              aria-label="Cancel recording"
            >
              <TrashIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : hasRecording && recorder.recording ? (
          <div className="px-3 py-3">
            <div className="flex items-center gap-3">
              <audio
                controls
                src={recorder.recording.url}
                className="h-9 min-w-0 flex-1"
              />
              <span className="text-xs tabular-nums text-white/60">
                {formatDuration(recorder.recording.durationSeconds)}
              </span>
              <button
                type="button"
                onClick={() => {
                  recorder.discard();
                  setSendError("");
                }}
                disabled={isUploading}
                className={toolButton}
                aria-label="Discard voice message"
              >
                <TrashIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {isUploading ? (
              <UploadProgressBar progress={uploadProgress} />
            ) : null}
          </div>
        ) : (
          <textarea
            id="message-composer"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder={
              pendingFile
                ? "Add a note (optional)"
                : `Message ${recipientName}…`
            }
            aria-label={`Message ${recipientName}`}
            disabled={isUploading}
            className="block max-h-40 w-full resize-none bg-transparent px-4 pt-3 text-sm leading-6 text-white outline-none placeholder:text-white/35 disabled:opacity-60"
          />
        )}

        <div className="flex items-center justify-between gap-3 px-2 pb-2 pt-1">
          <div className="flex min-w-0 items-center gap-0.5">
            <input
              ref={fileInputRef}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              onChange={onPickFile}
              className="hidden"
              tabIndex={-1}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={
                isUploading ||
                isRecorderActive ||
                Boolean(hasRecording) ||
                Boolean(pendingFile)
              }
              className={toolButton}
              aria-label="Attach a file"
              title="Attach a file (images, PDF, Word, Excel, TXT, CSV up to 10 MB)"
            >
              <PaperclipIcon className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onToggleRecording}
              disabled={
                isUploading ||
                recorder.status === "requesting" ||
                Boolean(hasRecording) ||
                Boolean(pendingFile)
              }
              className={
                recorder.status === "recording"
                  ? `${toolButton} bg-primary text-on-primary! hover:bg-glow!`
                  : toolButton
              }
              aria-label={
                recorder.status === "recording"
                  ? "Stop recording"
                  : "Record a voice message"
              }
              aria-pressed={recorder.status === "recording"}
              title={
                recorder.status === "recording"
                  ? "Stop recording"
                  : "Record a voice message (up to 5 minutes)"
              }
            >
              {recorder.status === "recording" ? (
                <StopIcon
                  className="h-4 w-4"
                  weight="fill"
                  aria-hidden="true"
                />
              ) : (
                <MicrophoneIcon className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
            {composerError ? (
              <p className="ml-2 min-w-0 text-xs text-rose-300" role="alert">
                {composerError}
              </p>
            ) : (
              <span className="ml-2 hidden text-xs text-white/40 md:inline">
                {recorder.status === "recording"
                  ? "Tap stop when you're done"
                  : hasRecording
                    ? "Play it back, then send or discard"
                    : "Enter to send, Shift+Enter for a new line"}
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={!canSend}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-glow disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
          >
            {isUploading ? "Uploading…" : isSending ? "Sending…" : "Send"}
            <PaperPlaneRightIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </form>
  );
}

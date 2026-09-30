import { ChatsCircleIcon, FileTextIcon, ImageIcon, PaperclipIcon } from "@phosphor-icons/react";
import { type FormEvent, type ReactElement, useCallback, useEffect, useId, useRef, useState } from "react";
import { inlineLinkClassName, inputClassName, primaryButtonClassName } from "../dashboard/ui/buttonStyles";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

// Mirror the server's limits in CaseMessage.model.ts.
const TEXT_LIMIT = 2000;
const FILE_LIMIT = 5;
const FILE_TYPES = "image/jpeg,image/png,image/webp,application/pdf";

interface CaseFileView {
  name: string;
  isImage: boolean;
  url: string;
}

interface CaseMessageView {
  id: string;
  from: "admin" | "party";
  text: string;
  files: CaseFileView[];
  replyBy: string | null;
  at: string;
}

interface CaseThreadState {
  active: boolean;
  messages: CaseMessageView[];
  replyBy: string | null;
}

const isThread = (value: unknown): value is CaseThreadState =>
  typeof value === "object" && value !== null && Array.isArray((value as CaseThreadState).messages);

const formatWhen = (value: string): string =>
  new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const formatDay = (value: string): string =>
  new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

/**
 * A side's private conversation with CivilHub about a dispute: CivilHub's
 * questions, and the side's answers with photos or documents as evidence.
 */
export function CaseThread({
  caseType,
  caseId,
}: {
  caseType: "project" | "deposit";
  caseId: string;
}): ReactElement | null {
  const [thread, setThread] = useState<CaseThreadState | null>(null);
  const [text, setText] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string>("");
  const [isSending, setIsSending] = useState<boolean>(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textId = useId();
  const path = `${API_BASE_URL}/api/dispute-cases/${caseType}/${caseId}/messages`;

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(path, { credentials: "include" });
      const body: unknown = await response.json().catch(() => null);
      if (response.ok && isThread(body)) setThread(body);
    } catch {
      // The panel just stays hidden; the rest of the page still works.
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!thread) return null;

  const send = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!text.trim() && files.length === 0) {
      setError("Write a message or attach a file.");
      return;
    }
    setIsSending(true);
    setError("");
    const form = new FormData();
    form.append("text", text.trim());
    for (const file of files) form.append("files", file);
    try {
      const response = await fetch(path, { method: "POST", credentials: "include", body: form });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? "That didn't send. Please try again.");
        return;
      }
      setText("");
      setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
      await load();
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section aria-labelledby={`${textId}-heading`} className="mt-3 rounded-xl border border-white/10 bg-void/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`${textId}-heading`} className="inline-flex items-center gap-2 text-sm font-semibold text-white">
          <ChatsCircleIcon className="h-4 w-4 text-primary" aria-hidden="true" />
          Messages with CivilHub
        </h3>
        <p className="text-xs text-white/45">Only you and CivilHub see this.</p>
      </div>

      {thread.replyBy ? (
        <p className="mt-3 rounded-lg bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
          CivilHub asked for your reply by {formatDay(thread.replyBy)}.
        </p>
      ) : null}

      {thread.messages.length === 0 ? (
        <p className="mt-3 text-sm text-white/55">
          Add anything that helps CivilHub decide: photos, documents, or what happened in your own words.
        </p>
      ) : (
        <ol className="mt-3 grid gap-2">
          {thread.messages.map((message) => (
            <li
              key={message.id}
              className={`rounded-xl px-3.5 py-2.5 text-sm ${
                message.from === "admin" ? "border border-primary/25 bg-primary/5" : "bg-white/5"
              }`}
            >
              <p className="text-xs text-white/45">
                <span className="font-semibold text-white/70">{message.from === "admin" ? "CivilHub" : "You"}</span> ·{" "}
                {formatWhen(message.at)}
              </p>
              {message.text ? <p className="mt-1 whitespace-pre-line text-white/80">{message.text}</p> : null}
              {message.files.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {message.files.map((file) => (
                    <li key={file.url}>
                      <a href={file.url} target="_blank" rel="noreferrer" className={`${inlineLinkClassName} inline-flex items-center gap-1.5 text-xs`}>
                        {file.isImage ? (
                          <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <FileTextIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {file.name}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {thread.active ? (
        <form onSubmit={(event) => void send(event)} className="mt-3 grid gap-2">
          <label htmlFor={textId} className="sr-only">
            Message to CivilHub
          </label>
          <textarea
            id={textId}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setError("");
            }}
            rows={3}
            maxLength={TEXT_LIMIT}
            placeholder="Write to CivilHub"
            className={`${inputClassName} resize-y`}
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-white/70 hover:text-white">
              <PaperclipIcon className="h-4 w-4" aria-hidden="true" />
              {files.length > 0 ? `${files.length} file${files.length === 1 ? "" : "s"} attached` : "Attach photos or PDFs"}
              <input
                ref={fileInput}
                type="file"
                multiple
                accept={FILE_TYPES}
                className="sr-only"
                onChange={(event) => {
                  const picked = Array.from(event.target.files ?? []);
                  if (picked.length > FILE_LIMIT) {
                    setError(`Attach up to ${FILE_LIMIT} files at a time.`);
                    return;
                  }
                  setFiles(picked);
                  setError("");
                }}
              />
            </label>
            <button type="submit" disabled={isSending} className={`${primaryButtonClassName} ml-auto px-4 py-2`}>
              {isSending ? "Sending..." : "Send"}
            </button>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-rose-200">
              {error}
            </p>
          ) : null}
          <p className="text-xs text-white/40">Photos keep their camera date and place, which helps CivilHub check them.</p>
        </form>
      ) : null}
    </section>
  );
}

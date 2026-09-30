import { type ReactElement, useState } from "react";
import { type CaseThread, adminApi } from "../lib/api";
import { formatDate, formatDateTime } from "../lib/format";
import { EvidenceFile } from "./EvidenceFile";
import { ErrorNote, panel, primaryButton } from "./ui";

const TEXT_LIMIT = 2000;

/**
 * CivilHub's private conversation with each side of a dispute: one tab per
 * side, with their evidence, and a box to write to them, optionally asking
 * for a reply by a date.
 */
export function CaseThreads({
  threads,
  sides,
  postPath,
  isOpen,
  onSent,
}: {
  threads: Record<string, CaseThread>;
  /** The sides in order, e.g. client then provider, with display names. */
  sides: Array<{ role: string; label: string; name: string | null }>;
  /** Where to post, e.g. "/project-disputes/:id/messages". */
  postPath: string;
  isOpen: boolean;
  onSent: () => void;
}): ReactElement {
  const [active, setActive] = useState<string>(sides[0]?.role ?? "");
  const [text, setText] = useState<string>("");
  const [askReply, setAskReply] = useState<boolean>(false);
  const [replyDays, setReplyDays] = useState<number>(3);
  const [error, setError] = useState<string>("");
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const side = sides.find((item) => item.role === active) ?? sides[0];
  const thread = threads[side?.role ?? ""] ?? { messages: [], replyBy: null };

  const send = async (): Promise<void> => {
    if (!text.trim()) return setError("Write a message.");
    setIsBusy(true);
    setError("");
    try {
      await adminApi(postPath, {
        method: "POST",
        body: { to: side.role, text: text.trim(), ...(askReply ? { replyByDays: replyDays } : {}) },
      });
      setText("");
      setAskReply(false);
      onSent();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Couldn't send it.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className={`${panel} mt-6 p-5`} aria-labelledby="case-threads-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="case-threads-heading" className="font-heading text-xl font-bold text-white">
          Messages with each side
        </h2>
        <p className="text-xs text-white/45">Each side sees only their own thread.</p>
      </div>
      <div role="tablist" aria-label="Side" className="mt-3 flex flex-wrap gap-2">
        {sides.map((item) => {
          const count = threads[item.role]?.messages.length ?? 0;
          return (
            <button
              key={item.role}
              type="button"
              role="tab"
              aria-selected={item.role === side?.role}
              onClick={() => {
                setActive(item.role);
                setError("");
              }}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                item.role === side?.role ? "bg-primary/15 text-primary" : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              With {item.label}
              {item.name ? ` (${item.name})` : ""} · {count}
            </button>
          );
        })}
      </div>

      {thread.replyBy ? (
        <p className="mt-3 rounded-lg bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
          Waiting for their reply, asked for by {formatDate(thread.replyBy)}.
        </p>
      ) : null}

      {thread.messages.length === 0 ? (
        <p className="mt-3 text-sm text-white/55">Nothing yet.</p>
      ) : (
        <ol className="mt-3 grid gap-2">
          {thread.messages.map((message) => (
            <li
              key={message.id}
              className={`rounded-xl p-3 text-sm ${message.from === "admin" ? "border border-primary/25 bg-primary/5" : "bg-void/40"}`}
            >
              <p className="text-xs text-white/45">
                <span className="font-semibold text-white/70">{message.from === "admin" ? "CivilHub" : side.label}</span> ·{" "}
                {formatDateTime(message.at)}
                {message.replyBy ? ` · reply asked for by ${formatDate(message.replyBy)}` : ""}
              </p>
              {message.text ? <p className="mt-1 whitespace-pre-line text-white/80">{message.text}</p> : null}
              {message.files.length > 0 ? (
                <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {message.files.map((file) => (
                    <li key={file.url}>
                      <EvidenceFile file={{ ...file, uploadedByLabel: side.label }} label={`${side.label}'s evidence: ${file.name ?? "file"}`} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {isOpen ? (
        <div className="mt-4 grid gap-2 border-t border-white/10 pt-4">
          <label htmlFor="case-message" className="text-sm font-semibold text-white/80">
            Write to the {side?.label}
          </label>
          <textarea
            id="case-message"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setError("");
            }}
            rows={3}
            maxLength={TEXT_LIMIT}
            className="form-input"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-white/75">
              <input
                type="checkbox"
                checked={askReply}
                onChange={(event) => setAskReply(event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Ask for a reply within
            </label>
            <label htmlFor="reply-days" className="sr-only">
              Days to reply
            </label>
            <select
              id="reply-days"
              value={replyDays}
              disabled={!askReply}
              onChange={(event) => setReplyDays(Number(event.target.value))}
              className="form-input w-auto"
            >
              {[1, 2, 3, 5, 7].map((days) => (
                <option key={days} value={days}>
                  {days} {days === 1 ? "day" : "days"}
                </option>
              ))}
            </select>
            <button type="button" className={`${primaryButton} ml-auto`} disabled={isBusy} onClick={() => void send()}>
              {isBusy ? "Sending..." : "Send"}
            </button>
          </div>
          <ErrorNote message={error} />
        </div>
      ) : null}
    </section>
  );
}

import { type ReactElement, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../Avatar";

interface RepostAuthor {
  userId: string;
  name: string;
  role: "client" | "engineer";
  profilePhotoUrl: string | null;
}

interface RepostButtonProps {
  originalPostId: string;
  originalAuthor: RepostAuthor;
  originalContent: string;
  originalImageUrl: string | null;
  variant?: "default" | "inline";
}

interface ErrorResponse {
  message?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const getErrorMessage = (value: unknown): string => {
  if (typeof value === "object" && value !== null) {
    const error = value as ErrorResponse;
    if (typeof error.message === "string") return error.message;
  }
  return "Unable to repost this update.";
};

export function RepostButton({
  originalPostId,
  originalAuthor,
  originalContent,
  originalImageUrl,
  variant = "default",
}: RepostButtonProps): ReactElement {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [thoughts, setThoughts] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<boolean>(false);

  const submitRepost = async (): Promise<void> => {
    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/posts/repost`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalPostId,
          content: thoughts.trim() || undefined,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        setError(getErrorMessage(body));
        return;
      }
      setSuccess(true);
      setIsOpen(false);
      setThoughts("");
    } catch {
      setError("Unable to connect to CivilHub. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isInline = variant === "inline";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setIsOpen((open) => !open);
          setSuccess(false);
        }}
        className={
          isInline
            ? "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white/65 transition-colors duration-200 hover:bg-primary/10 hover:text-white"
            : "inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/65 transition-all duration-200 hover:border-emerald-300/50 hover:text-emerald-200"
        }
      >
        <span aria-hidden="true">↻</span>
        {success ? "Reposted" : "Repost"}
      </button>
      {isOpen && (
        <div className="absolute left-0 top-11 z-20 w-[min(22rem,calc(100vw-3rem))] rounded-xl border border-white/15 bg-surface p-4 shadow-2xl">
          <p className="text-sm font-semibold text-white">Repost this update</p>
          <textarea
            value={thoughts}
            onChange={(event) => setThoughts(event.target.value.slice(0, 2000))}
            maxLength={2000}
            rows={3}
            placeholder="Add your thoughts... (optional)"
            className="mt-3 w-full rounded-lg border border-white/10 bg-void/60 px-3 py-2 text-xs text-white outline-none focus:border-primary/50"
          />
          <div className="mt-3 rounded-lg border border-white/10 bg-void/40 p-3">
            <div className="flex items-center gap-2">
              <Link to={`/profile/${originalAuthor.userId}`}>
                <Avatar
                  name={originalAuthor.name}
                  photoUrl={originalAuthor.profilePhotoUrl}
                  size="sm"
                />
              </Link>
              <p className="text-xs font-semibold text-white">
                {originalAuthor.name}
              </p>
            </div>
            <p className="mt-2 line-clamp-3 text-xs leading-5 text-white/65">
              {originalContent}
            </p>
            {originalImageUrl ? (
              <img
                src={originalImageUrl}
                alt="Original post"
                className="mt-2 max-h-28 w-full rounded object-cover"
              />
            ) : null}
          </div>
          {error ? (
            <p className="mt-2 text-xs text-red-200" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void submitRepost()}
            disabled={isSubmitting}
            className="mt-3 w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isSubmitting ? "Reposting..." : "Repost"}
          </button>
        </div>
      )}
    </div>
  );
}

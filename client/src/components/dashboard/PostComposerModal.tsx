import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useEffect,
  useRef,
} from "react";
import { Avatar } from "../Avatar";

interface PostComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  authorName: string;
  authorPhotoUrl: string | null;
  authorRole: "client" | "engineer" | undefined;
  content: string;
  onContentChange: (value: string) => void;
  maxContentLength: number;
  remainingChars: number;
  showRemainingCount: boolean;
  selectedImagePreview: string;
  onImageChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearImage: () => void;
  composerError: string;
  isPosting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function PostComposerModal({
  isOpen,
  onClose,
  authorName,
  authorPhotoUrl,
  authorRole,
  content,
  onContentChange,
  maxContentLength,
  remainingChars,
  showRemainingCount,
  selectedImagePreview,
  onImageChange,
  onClearImage,
  composerError,
  isPosting,
  onSubmit,
}: PostComposerModalProps): ReactElement | null {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const firstName = authorName.trim().split(/\s+/)[0] || authorName;

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !isPosting) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, isPosting, onClose]);

  useEffect(() => {
    if (isOpen) {
      textareaRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPosting) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl sm:p-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-composer-title"
      >
        <div className="flex items-center justify-between gap-4">
          <h2
            id="post-composer-title"
            className="font-heading text-xl font-bold text-white"
          >
            Create a post
          </h2>
          <button
            type="button"
            aria-label="Close post composer"
            disabled={isPosting}
            onClick={onClose}
            className="text-xl text-white/50 transition-colors hover:text-white disabled:opacity-40"
          >
            &times;
          </button>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Avatar name={authorName} photoUrl={authorPhotoUrl} size="sm" />
          <div>
            <p className="text-sm font-semibold text-white">{authorName}</p>
            {authorRole ? (
              <span className="mt-0.5 inline-flex rounded-full border border-primary/35 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold capitalize text-primary">
                {authorRole}
              </span>
            ) : null}
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-4">
          <textarea
            ref={textareaRef}
            value={content}
            maxLength={maxContentLength}
            onChange={(event) => onContentChange(event.target.value)}
            placeholder={`What's on your mind, ${firstName}?`}
            rows={5}
            className="form-input min-h-[140px] resize-y"
          />

          {showRemainingCount ? (
            <p className="mt-2 text-xs font-semibold text-white/55">
              {remainingChars} characters left
            </p>
          ) : null}

          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-void/50 px-4 py-2.5">
            <span className="text-xs font-medium text-white/50">
              Add to your post
            </span>
            <label
              aria-label="Add a photo"
              className="inline-flex cursor-pointer items-center justify-center rounded-full p-2 text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-primary"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <circle cx="8.5" cy="10.5" r="1.5" />
                <path d="m21 15-5-5L5 19" />
              </svg>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onImageChange}
                className="sr-only"
              />
            </label>
          </div>

          {selectedImagePreview ? (
            <div className="relative mt-4 w-fit overflow-hidden rounded-xl border border-white/10">
              <img
                src={selectedImagePreview}
                alt="Selected preview"
                className="h-28 w-40 object-cover"
              />
              <button
                type="button"
                onClick={onClearImage}
                className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs font-semibold text-white transition-colors duration-200 hover:bg-primary"
              >
                X
              </button>
            </div>
          ) : null}

          {composerError ? (
            <p className="mt-3 text-sm text-red-300" role="alert">
              {composerError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isPosting || !content.trim()}
            className="mt-5 w-full rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-all duration-200 hover:-translate-y-0.5 hover:bg-glow disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPosting ? "Posting..." : "Post"}
          </button>
        </form>
      </div>
    </div>
  );
}

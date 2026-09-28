import { type ReactElement, useEffect, useRef } from "react";

/**
 * A full-screen view of a post image. Closes on Escape, a click outside the
 * image or the Close button, and hands focus back to whatever opened it.
 */
export function ImageLightbox({
  imageUrl,
  alt = "Post image",
  onClose,
}: {
  imageUrl: string;
  alt?: string;
  onClose: () => void;
}): ReactElement {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // Kept in a ref so a new handler from the parent doesn't re-run the effect
  // below (which would move focus back and forth).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      className="fixed inset-0 z-90 flex items-center justify-center bg-black/80 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        className="absolute right-5 top-5 rounded-full border border-snow/30 px-3 py-1.5 text-xs font-semibold text-snow transition-colors duration-200 hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow"
      >
        Close
      </button>
      <img
        src={imageUrl}
        alt={alt}
        className="max-h-[90vh] w-auto max-w-[95vw] rounded-xl border border-white/10"
      />
    </div>
  );
}

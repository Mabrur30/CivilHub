import { ImageIcon } from "@phosphor-icons/react";
import { type ReactElement } from "react";

interface EquipmentThumbProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
}

// Listings and bookings can arrive without a photo; show a quiet placeholder
// instead of a broken image.
export function EquipmentThumb({
  src,
  alt,
  className = "",
}: EquipmentThumbProps): ReactElement {
  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-white/5 text-white/30 ${className}`}
        role="img"
        aria-label={`${alt} (no photo)`}
      >
        <ImageIcon className="h-6 w-6" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={`object-cover ${className}`}
    />
  );
}

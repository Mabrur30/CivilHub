import { type ReactElement, useEffect, useMemo, useState } from "react";

export interface AvatarProps {
  photoUrl?: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
}

const sizeClassMap: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "h-10 w-10 text-sm",
  md: "h-16 w-16 text-xl",
  lg: "h-24 w-24 text-2xl",
};

const getInitials = (name: string): string => {
  const tokens = name
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return "?";
  }

  if (tokens.length === 1) {
    return tokens[0].slice(0, 1).toUpperCase();
  }

  return `${tokens[0].slice(0, 1)}${tokens[tokens.length - 1].slice(0, 1)}`.toUpperCase();
};

export function Avatar({
  photoUrl = null,
  name,
  size = "md",
}: AvatarProps): ReactElement {
  const [didImageFail, setDidImageFail] = useState<boolean>(false);

  const normalizedPhotoUrl = useMemo(() => {
    if (typeof photoUrl !== "string") {
      return "";
    }
    return photoUrl.trim();
  }, [photoUrl]);

  useEffect(() => {
    setDidImageFail(false);
  }, [normalizedPhotoUrl]);

  const className = `${sizeClassMap[size]} shrink-0 rounded-full`;
  const initials = getInitials(name);
  const shouldShowImage = normalizedPhotoUrl.length > 0 && !didImageFail;

  if (shouldShowImage) {
    return (
      <img
        src={normalizedPhotoUrl}
        alt={`${name} profile`}
        onError={() => setDidImageFail(true)}
        className={`${className} border border-white/15 object-cover`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${className} flex items-center justify-center border border-primary/50 bg-primary/10 font-bold text-primary`}
    >
      {initials}
    </span>
  );
}

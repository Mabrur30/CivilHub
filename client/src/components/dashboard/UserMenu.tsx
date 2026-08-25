import { type ReactElement, useEffect, useRef, useState } from "react";
import { Avatar } from "../Avatar";

interface UserMenuProps {
  name: string;
  email: string;
  role: "client" | "engineer";
  photoUrl?: string | null;
  onViewProfile: () => void;
  onLogout: () => Promise<void>;
}

export function UserMenu({
  name,
  email,
  role,
  photoUrl,
  onViewProfile,
  onLogout,
}: UserMenuProps): ReactElement {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent): void => {
      if (
        menuRef.current &&
        event.target instanceof Node &&
        !menuRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("click", handleDocumentClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handleViewProfile = (): void => {
    setIsOpen(false);
    onViewProfile();
  };

  const handleLogout = async (): Promise<void> => {
    setIsOpen(false);
    await onLogout();
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((open) => !open)}
        className="flex items-center gap-2.5 rounded-full border border-white/15 px-2 py-1.5 text-left transition-colors hover:border-primary"
      >
        <span className="hidden text-right sm:block">
          <span className="block text-sm font-semibold text-white">{name}</span>
          <span className="block text-xs capitalize text-white/50">{role}</span>
        </span>
        <Avatar name={name} photoUrl={photoUrl ?? null} size="sm" />
      </button>

      <div
        role="menu"
        aria-hidden={!isOpen}
        className={`absolute right-0 top-full z-50 mt-3 w-72 origin-top-right rounded-xl border border-white/10 bg-surface p-1.5 shadow-2xl transition-all duration-150 ${
          isOpen
            ? "scale-100 opacity-100"
            : "pointer-events-none scale-95 opacity-0"
        }`}
      >
        <div className="rounded-lg border border-white/10 bg-void/45 px-3 py-3">
          <p className="truncate text-sm font-semibold text-white">{name}</p>
          <p className="mt-1 truncate text-xs text-white/55">{email}</p>
          <span className="mt-2 inline-flex rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
            {role}
          </span>
        </div>

        <button
          type="button"
          role="menuitem"
          onClick={handleViewProfile}
          className="mt-1.5 block w-full rounded-lg border-l-2 border-transparent px-3 py-2.5 text-left text-sm font-semibold text-white/80 transition-colors duration-200 hover:border-glow hover:bg-primary/10 hover:text-white"
        >
          View Profile
        </button>

        <div className="my-1.5 h-px bg-white/10" />

        <button
          type="button"
          role="menuitem"
          onClick={() => void handleLogout()}
          className="block w-full rounded-lg border-l-2 border-transparent px-3 py-2.5 text-left text-sm font-semibold text-red-300 transition-colors duration-200 hover:border-primary hover:bg-primary/10 hover:text-red-200"
        >
          Log Out
        </button>
      </div>
    </div>
  );
}

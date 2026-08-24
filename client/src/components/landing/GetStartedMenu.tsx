import { type ReactElement, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

interface GetStartedMenuProps {}

export function GetStartedMenu(_props: GetStartedMenuProps): ReactElement {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

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

  const handleOptionClick = (path: string): void => {
    setIsOpen(false);
    navigate(path);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((open) => !open)}
        className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-all duration-300 hover:-translate-y-0.5 hover:bg-glow hover:shadow-[0_0_28px_rgba(255,59,78,0.45)]"
      >
        Get Started
      </button>

      <div
        role="menu"
        aria-hidden={!isOpen}
        className={`absolute right-0 top-full z-50 mt-3 w-56 origin-top-right rounded-xl border border-white/10 bg-surface p-1.5 shadow-2xl transition-all duration-150 ${
          isOpen
            ? "scale-100 opacity-100"
            : "pointer-events-none scale-95 opacity-0"
        }`}
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => handleOptionClick("/signup/client")}
          className="block w-full rounded-lg border-l-2 border-transparent px-3 py-2.5 text-left font-body text-sm text-white/80 transition-colors duration-200 hover:border-glow hover:bg-primary/10 hover:text-white"
        >
          Continue as Client
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => handleOptionClick("/signup/engineer")}
          className="block w-full rounded-lg border-l-2 border-transparent px-3 py-2.5 text-left font-body text-sm text-white/80 transition-colors duration-200 hover:border-glow hover:bg-primary/10 hover:text-white"
        >
          Continue as Engineer
        </button>
      </div>
    </div>
  );
}

import { type ReactElement, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { GetStartedMenu } from "./GetStartedMenu";

interface NavbarProps {}

const navItems = [
  { label: "Home", targetId: "home" },
  { label: "How It Works", targetId: "how-it-works" },
  { label: "For Engineers", targetId: "for-engineers-clients" },
  { label: "For Clients", targetId: "for-engineers-clients" },
  { label: "Pricing", targetId: "pricing" },
];

export function Navbar(_props: NavbarProps): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();

  const homeTarget = currentUser ? `/dashboard/${currentUser.role}` : "/";

  const scrollToSection = (targetId: string): void => {
    if (location.pathname !== "/") {
      navigate("/");
      window.setTimeout(() => {
        document.getElementById(targetId)?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 50);
      return;
    }

    document.getElementById(targetId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-void/80 backdrop-blur-md">
      <nav
        className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8"
        aria-label="Main navigation"
      >
        <button
          type="button"
          onClick={() => navigate(homeTarget)}
          className="flex items-center gap-3 text-white transition-opacity duration-300 hover:opacity-90"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/60 bg-primary/10 text-sm font-bold text-primary">
            C
          </div>
          <div>
            <div className="font-heading text-xl font-bold tracking-tight">
              CivilHub
            </div>
          </div>
        </button>

        <div className="hidden items-center gap-8 text-sm font-medium text-white/75 lg:flex">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => scrollToSection(item.targetId)}
              className="transition-colors duration-300 hover:text-white"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            to="/login"
            className="rounded-full border border-white/20 bg-transparent px-5 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:border-primary hover:text-primary"
          >
            Log In
          </Link>
          <GetStartedMenu />
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-white lg:hidden"
          aria-label="Toggle menu"
          onClick={() => setIsOpen((open) => !open)}
        >
          <span className="flex flex-col gap-1.5">
            <span className="block h-0.5 w-5 rounded-full bg-white" />
            <span className="block h-0.5 w-5 rounded-full bg-white" />
            <span className="block h-0.5 w-5 rounded-full bg-white" />
          </span>
        </button>
      </nav>

      {isOpen ? (
        <div className="border-t border-white/10 bg-void/95 px-4 py-4 lg:hidden">
          <div className="flex flex-col gap-4 text-base font-medium text-white/80">
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  scrollToSection(item.targetId);
                }}
                className="text-left transition-colors duration-300 hover:text-white"
              >
                {item.label}
              </button>
            ))}
            <div className="flex flex-col gap-3 pt-2">
              <Link
                to="/login"
                onClick={() => setIsOpen(false)}
                className="rounded-full border border-white/20 px-4 py-2.5 text-center text-sm font-semibold text-white transition-all duration-300 hover:border-primary hover:text-primary"
              >
                Log In
              </Link>
              <GetStartedMenu />
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

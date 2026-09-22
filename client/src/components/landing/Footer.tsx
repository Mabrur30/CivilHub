import { type ReactElement } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { scrollToSection } from "../../lib/scrollToSection";

interface FooterProps {}

/**
 * Column structure is deliberately narrow. Every client- and engineer-facing page
 * on this site sits behind ProtectedRoute, which redirects to /login without
 * preserving a return path — so "For clients" / "For engineers" link columns would
 * strand logged-out visitors on the login screen. The two signup routes carry that
 * split honestly instead.
 */

const exploreLinks = [
  { label: "Home", targetId: "home" },
  { label: "How it works", targetId: "how-it-works" },
  { label: "For clients and engineers", targetId: "for-engineers-clients" },
  { label: "Pricing", targetId: "pricing" },
];

const startLinks = [
  { label: "Post a project", to: "/signup/client" },
  { label: "Find work", to: "/signup/engineer" },
  { label: "Sign in", to: "/login" },
];

// TODO: replace with real CivilHub social accounts — these are placeholders and
// currently link nowhere. Remove any account that does not exist rather than
// shipping a dead link.
const socialLinks = [
  { label: "LinkedIn", href: "", path: "M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-1 1.82-2.05 3.75-2.05 4 0 4.4 2.5 4.4 5.8V21h-4v-5.6c0-1.35-.03-3.1-1.9-3.1-1.9 0-2.2 1.48-2.2 3v5.7h-4V9Z" },
  { label: "X", href: "", path: "M17.5 3h3.2l-7 8 8.2 10h-6.4l-5-6.1-5.7 6.1H1.6l7.5-8.5L1.2 3h6.6l4.5 5.6L17.5 3Zm-1.1 16.1h1.8L7.7 4.8H5.8l10.6 14.3Z" },
  { label: "Facebook", href: "", path: "M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5h1.65V3.6c-.29-.04-1.27-.12-2.41-.12-2.39 0-4.03 1.46-4.03 4.14V9.9H7.5V13h2.76v8h3.24Z" },
];

export function Footer(_props: FooterProps): ReactElement {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <footer className="bg-void px-4 pb-8 pt-16 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl border-t border-white/10 pt-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div className="max-w-xs">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/60 bg-primary/10 text-sm font-bold text-primary">
                C
              </div>
              <div className="font-heading text-xl font-bold tracking-tight">
                CivilHub
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-white/55">
              One platform for bids, approvals, and site coordination — from
              concept through to handover.
            </p>

            <div className="mt-6 flex items-center gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href || "#"}
                  aria-label={social.label}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white/55 transition-all duration-300 hover:border-primary hover:text-primary"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d={social.path} />
                  </svg>
                </a>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-white/40">Explore</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {exploreLinks.map((link) => (
                <li key={link.label}>
                  <button
                    type="button"
                    onClick={() =>
                      scrollToSection(link.targetId, location.pathname, navigate)
                    }
                    className="text-left text-white/55 transition-colors duration-300 hover:text-white/85"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-white/40">Get started</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {startLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-white/55 transition-colors duration-300 hover:text-white/85"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-sm text-white/55 sm:flex-row">
          <p>© 2026 CivilHub. All rights reserved.</p>

          {/* TODO: /privacy and /terms do not exist as routes yet — these two
              links go nowhere. Build the pages (and point these at them) before
              launch, or remove the links. */}
          <div className="flex items-center gap-5">
            <a
              href="#"
              className="transition-colors duration-300 hover:text-white/85"
            >
              Privacy
            </a>
            <a
              href="#"
              className="transition-colors duration-300 hover:text-white/85"
            >
              Terms
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

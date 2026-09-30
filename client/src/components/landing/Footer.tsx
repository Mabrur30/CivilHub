import { type ReactElement } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { scrollToSection } from "../../lib/scrollToSection";
import { BrandLogo } from "../BrandLogo";

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
  { label: "Equipment rental", targetId: "equipment" },
  { label: "Features", targetId: "features" },
  { label: "Who it's for", targetId: "for-engineers-clients" },
  { label: "Pricing", targetId: "pricing" },
];

const startLinks = [
  { label: "Post a project", to: "/signup/client" },
  { label: "Find work", to: "/signup/engineer" },
  { label: "Join as a company", to: "/signup/company" },
  { label: "List equipment", to: "/signup/company" },
  { label: "Sign in", to: "/login" },
];

export function Footer(_props: FooterProps): ReactElement {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <footer className="bg-void px-4 pb-8 pt-16 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl border-t border-white/10 pt-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div className="max-w-xs">
            <BrandLogo height={36} />

            <p className="mt-4 text-sm leading-6 text-white/55">
              Hire engineers, rent plant and get paid for finished work, with
              CivilHub holding the money in between.
            </p>

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

        <p className="mt-12 border-t border-white/10 pt-6 text-center text-sm text-white/55 sm:text-left">
          © 2026 CivilHub. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

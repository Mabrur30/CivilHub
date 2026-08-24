import { type ReactElement } from "react";

interface FooterProps {}

const footerLinks = [
  "Home",
  "How It Works",
  "For Clients",
  "For Engineers",
  "Pricing",
];

export function Footer(_props: FooterProps): ReactElement {
  return (
    <footer className="bg-void px-4 pb-8 pt-16 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl border-t border-white/10 pt-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/60 bg-primary/10 text-sm font-bold text-primary">
              C
            </div>
            <div>
              <div className="font-heading text-xl font-bold tracking-tight">
                CivilHub
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-sm text-white/70">
            {footerLinks.map((link) => (
              <a
                key={link}
                href="#"
                className="transition-colors duration-300 hover:text-white"
              >
                {link}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3 text-white/70">
            {["in", "x", "f"].map((icon) => (
              <a
                key={icon}
                href="#"
                aria-label="Social link"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 transition-all duration-300 hover:border-primary hover:text-primary"
              >
                {icon}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-sm text-white/55 sm:flex-row">
          <p>© 2026 CivilHub. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <a
              href="#"
              className="transition-colors duration-300 hover:text-white"
            >
              Privacy
            </a>
            <a
              href="#"
              className="transition-colors duration-300 hover:text-white"
            >
              Terms
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

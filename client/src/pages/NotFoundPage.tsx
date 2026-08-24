import { type ReactElement } from "react";
import { Link } from "react-router-dom";

export function NotFoundPage(): ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-void px-4 py-12 text-white sm:px-6">
      <div className="w-full max-w-xl rounded-[32px] border border-white/10 bg-surface p-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.35)] sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">
          404
        </p>
        <h1 className="mt-5 font-heading text-5xl font-bold tracking-[-0.04em] text-white">
          Page not found
        </h1>
        <p className="mt-4 text-base text-white/70">
          The route you requested doesn&apos;t exist or may have moved.
        </p>

        <div className="mt-8 flex justify-center">
          <Link
            to="/"
            className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white shadow-glow transition-all duration-300 hover:-translate-y-0.5 hover:bg-glow"
          >
            Return home
          </Link>
        </div>
      </div>
    </main>
  );
}

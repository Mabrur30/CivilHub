import { type ReactElement } from "react";
import { Link } from "react-router-dom";

export function ClientDashboardPage(): ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-void px-4 text-white">
      <section className="w-full max-w-xl rounded-2xl border border-white/10 bg-surface p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
          Client workspace
        </p>
        <h1 className="mt-3 font-heading text-4xl font-bold">Coming soon</h1>
        <p className="mt-4 text-white/60">
          Your client dashboard is being prepared.
        </p>
        <Link
          to="/"
          className="mt-7 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-glow"
        >
          Back to CivilHub
        </Link>
      </section>
    </main>
  );
}

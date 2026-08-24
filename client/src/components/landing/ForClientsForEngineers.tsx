import { type ReactElement } from "react";

interface RoleCardProps {
  role: "Clients" | "Engineers";
  title: string;
  description: string;
  bullets: string[];
  accent: string;
}

interface ForClientsForEngineersProps {}

function RoleCard({
  role,
  title,
  description,
  bullets,
  accent,
}: RoleCardProps): ReactElement {
  return (
    <div className="rounded-[28px] border border-white/10 bg-surface p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            For {role}
          </p>
          <h3 className="mt-3 font-heading text-3xl font-bold text-white">
            {title}
          </h3>
        </div>
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-full ${accent}`}
        >
          <span className="text-lg font-bold text-white">
            {role === "Clients" ? "C" : "E"}
          </span>
        </div>
      </div>

      <p className="mt-5 text-base leading-7 text-white/70">{description}</p>

      <ul className="mt-6 space-y-4">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-3 text-white/80">
            <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
              ✓
            </span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ForClientsForEngineers(
  _props: ForClientsForEngineersProps,
): ReactElement {
  return (
    <section
      id="for-engineers-clients"
      className="bg-void px-4 py-20 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">
            Built for both sides
          </p>
          <h2 className="mt-4 font-heading text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
            Purpose-built collaboration for every stakeholder.
          </h2>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          <RoleCard
            role="Clients"
            title="Control quality and certainty"
            description="Bring projects to life with visible scope, trusted partner matching, and streamlined approvals that help teams move from design intent to field-ready execution."
            bullets={[
              "Shortlist engineers and contractors with verified credentials and relevant civil project experience.",
              "Track approvals, packages, and milestone health in one shared delivery dashboard.",
              "Reduce timeline risk with transparent status updates and slower-moving administrative friction.",
            ]}
            accent="bg-primary/90"
          />
          <RoleCard
            role="Engineers"
            title="Win the right work and deliver confidently"
            description="Showcase capability, align with projects that match your expertise, and keep the entire delivery story clear for clients and stakeholders alike."
            bullets={[
              "Access fit-for-purpose project opportunities with clear technical briefs and client expectations.",
              "Keep design, costing, and progress communication aligned across project stakeholders.",
              "Protect your reputation with organized workflows, milestone reporting, and transparent collaboration.",
            ]}
            accent="bg-glow/90"
          />
        </div>
      </div>
    </section>
  );
}

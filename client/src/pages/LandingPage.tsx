import { type ReactElement } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CTASection } from "../components/landing/CTASection";
import { Footer } from "../components/landing/Footer";
import { ForClientsForEngineers } from "../components/landing/ForClientsForEngineers";
import { Hero } from "../components/landing/Hero";
import { HowItWorks } from "../components/landing/HowItWorks";
import { Navbar } from "../components/landing/Navbar";
import { TrustStats } from "../components/landing/TrustStats";

export function LandingPage(): ReactElement {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const showRolePrompt = searchParams.get("signup") === "choose-role";

  const closeRolePrompt = (): void => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("signup");
    setSearchParams(nextParams, { replace: true });
  };

  const continueAsRole = (role: "client" | "engineer"): void => {
    navigate(`/signup/${role}`);
  };

  return (
    <div className="min-h-screen bg-void text-white">
      <Navbar />
      <Hero />
      <HowItWorks />
      <TrustStats />
      <ForClientsForEngineers />
      <CTASection />
      <Footer />
      {showRolePrompt ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-surface p-6 text-center shadow-2xl sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              Get Started
            </p>
            <h2 className="mt-3 font-heading text-3xl font-bold tracking-[-0.03em] text-white">
              Choose your role
            </h2>
            <p className="mt-3 text-sm text-white/65">
              Select how you want to join CivilHub.
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => continueAsRole("client")}
                className="w-full rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white shadow-glow transition-all duration-300 hover:-translate-y-0.5 hover:bg-glow"
              >
                Continue as Client
              </button>
              <button
                type="button"
                onClick={() => continueAsRole("engineer")}
                className="w-full rounded-full border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-all duration-300 hover:border-primary hover:text-primary"
              >
                Continue as Engineer
              </button>
            </div>

            <button
              type="button"
              onClick={closeRolePrompt}
              className="mt-5 text-sm font-semibold text-white/60 transition-colors duration-200 hover:text-white"
            >
              Maybe later
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

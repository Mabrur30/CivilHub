import { type ReactElement } from "react";
import { CTASection } from "../components/landing/CTASection";
import { Footer } from "../components/landing/Footer";
import { ForClientsForEngineers } from "../components/landing/ForClientsForEngineers";
import { Hero } from "../components/landing/Hero";
import { HowItWorks } from "../components/landing/HowItWorks";
import { Navbar } from "../components/landing/Navbar";
import { TrustStats } from "../components/landing/TrustStats";

export function LandingPage(): ReactElement {
  return (
    <div className="min-h-screen bg-void text-white">
      <Navbar />
      <Hero />
      <HowItWorks />
      <TrustStats />
      <ForClientsForEngineers />
      <CTASection />
      <Footer />
    </div>
  );
}

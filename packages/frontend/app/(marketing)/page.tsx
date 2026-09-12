// Landing page
import { FeatureRow } from "~~/components/autovoyage/marketing/FeatureRow";
import { FooterCta } from "~~/components/autovoyage/marketing/FooterCta";
import { Hero } from "~~/components/autovoyage/marketing/Hero";
import { HowItWorks } from "~~/components/autovoyage/marketing/HowItWorks";
import { ScreenshotSection } from "~~/components/autovoyage/marketing/ScreenshotSection";
import { SponsorBand } from "~~/components/autovoyage/marketing/SponsorBand";
import { AgentActivityCard } from "~~/components/autovoyage/marketing/visuals/AgentActivityCard";
import { BudgetCard } from "~~/components/autovoyage/marketing/visuals/BudgetCard";
import { Reveal } from "~~/components/autovoyage/ui/Reveal";

export default function LandingPage() {
  return (
    <main>
      <Hero />

      <Reveal>
        <ScreenshotSection />
      </Reveal>

      <Reveal>
        <FeatureRow
          eyebrow="Boundaries"
          heading="Set the limits once. It never crosses them."
          body="Give AutoVoyage a budget, an auto-approve ceiling and per-category caps. Below the line it acts on its own; above it, it stops and asks."
          bullets={[
            "Total and per-category budgets",
            "An auto-approve ceiling for small spend",
            "Hard stops, enforced not promised",
          ]}
          visual={<BudgetCard />}
          band
        />
      </Reveal>
      <Reveal>
        <FeatureRow
          eyebrow="Autonomy"
          heading="It pays its own way, in real time."
          body="The agent hires and pays specialist sub-agents over x402 on Hedera, settling a micro-payment per request so research never waits on you."
          bullets={[
            "x402 agent-to-agent payments",
            "Machine-speed settlement on Hedera",
            "Bounded by the allowance you set",
          ]}
          visual={<AgentActivityCard />}
          reverse
        />
      </Reveal>

      <Reveal>
        <HowItWorks />
      </Reveal>
      <Reveal>
        <SponsorBand />
      </Reveal>
      <Reveal>
        <FooterCta />
      </Reveal>
    </main>
  );
}

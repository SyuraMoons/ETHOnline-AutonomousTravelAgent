// Landing page
import { Hero } from "~~/components/autovoyage/marketing/Hero";
import { ScreenshotSection } from "~~/components/autovoyage/marketing/ScreenshotSection";
import { FeatureRow } from "~~/components/autovoyage/marketing/FeatureRow";
import { BudgetCard } from "~~/components/autovoyage/marketing/visuals/BudgetCard";
import { AgentActivityCard } from "~~/components/autovoyage/marketing/visuals/AgentActivityCard";
import { ApprovalCard } from "~~/components/autovoyage/marketing/visuals/ApprovalCard";
import { HowItWorks } from "~~/components/autovoyage/marketing/HowItWorks";
import { SponsorBand } from "~~/components/autovoyage/marketing/SponsorBand";
import { FooterCta } from "~~/components/autovoyage/marketing/FooterCta";
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
          bullets={["Total and per-category budgets", "An auto-approve ceiling for small spend", "Hard stops, enforced not promised"]}
          visual={<BudgetCard />}
          band
        />
      </Reveal>
      <Reveal>
        <FeatureRow
          eyebrow="Autonomy"
          heading="It pays its own way, in real time."
          body="The agent hires and pays specialist sub-agents over x402 on Hedera, settling a micro-payment per request so research never waits on you."
          bullets={["x402 agent-to-agent payments", "Machine-speed settlement on Hedera", "Bounded by the allowance you set"]}
          visual={<AgentActivityCard />}
          reverse
        />
      </Reveal>
      <Reveal>
        <FeatureRow
          eyebrow="Human control"
          heading="A face check before anything that costs."
          body="When a purchase crosses your limit, AutoVoyage pauses for an on-device liveness check. It proceeds only with proof that a real human, you, approved."
          bullets={["On-device and privacy-preserving", "Proves the request came from you", "Every approval recorded on-chain"]}
          visual={<ApprovalCard />}
          band
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

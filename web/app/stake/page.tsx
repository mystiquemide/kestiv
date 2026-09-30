import type { Metadata } from "next";
import { StakeHero } from "@/components/stake/StakeHero";
import { getDevnetProof, getStakeView, type DevnetProof } from "@/lib/chain";
import { serverEnv } from "@/lib/env";
import { stakeHero } from "@/lib/stakePage";
import { getAgentStatus } from "@/lib/status";

export const metadata: Metadata = {
  title: "Founder stake",
  description: "How much of $KESTIV the founder holds, locked on Solana. Every number is read from the chain.",
  alternates: { canonical: "/stake" },
};

export default async function StakePage() {
  const env = serverEnv();
  const [stake, status, proof] = await Promise.all([
    getStakeView({ env }),
    getAgentStatus(),
    getDevnetProof().catch((): DevnetProof | null => null),
  ]);

  return (
    <main>
      <StakeHero model={stakeHero({ stake, status, proof, env: { cluster: env.cluster, wallet: env.wallet, founder: env.founder } })} />
    </main>
  );
}

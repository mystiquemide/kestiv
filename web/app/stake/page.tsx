import type { Metadata } from "next";
import { WhiteSheet } from "@/components/sheet/WhiteSheet";
import { PageNote } from "@/components/PageNote";
import { StakeHero } from "@/components/stake/StakeHero";
import { StakeAgentLine } from "@/components/stake/StakeAgentLine";
import { StakeFunding } from "@/components/stake/StakeFunding";
import { StakeSlices } from "@/components/stake/StakeSlices";
import { StakeStats } from "@/components/stake/StakeStats";
import { StakeLock } from "@/components/stake/StakeLock";
import { getDevnetProof, getMintSupply, getStakeView, type DevnetProof } from "@/lib/chain";
import { serverEnv } from "@/lib/env";
import { stakeHero } from "@/lib/stakePage";
import { agentPanel } from "@/lib/hero";
import { fundingModel } from "@/lib/stakeFunding";
import { slicesModel } from "@/lib/stakeSlices";
import { stakeStats } from "@/lib/stakeStats";
import { stakeChartCard } from "@/lib/stakeChart";
import { getAgentStatus } from "@/lib/status";
import { nowSec } from "@/lib/time";

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

  const devnetDecimals = proof ? await getMintSupply(proof.mint, "devnet").then((m) => m.decimals).catch(() => null) : null;
  const now = nowSec();
  const card = stakeChartCard({ stake, proof, devnetDecimals, now });
  const stats = stakeStats({ stake, status, proof, devnetDecimals, now });

  return (
    <main>
      <StakeHero model={stakeHero({ stake, status, proof, env: { cluster: env.cluster, wallet: env.wallet, founder: env.founder } })} />
      <WhiteSheet>
        <div className="flex flex-col gap-12">
          <StakeLock card={card} />
          <StakeStats model={stats} />
          <StakeSlices model={slicesModel({ status, stake })} />
          <StakeFunding model={fundingModel(status)} />
          <StakeAgentLine model={agentPanel(status, now)} />
        </div>
        <PageNote repoUrl={env.repoUrl} />
      </WhiteSheet>
    </main>
  );
}

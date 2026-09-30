import { HeroBand } from "@/components/hero/HeroBand";
import { HowItWorks } from "@/components/how/HowItWorks";
import { getDevnetProof, getMintSupply, getStakeView, type DevnetProof } from "@/lib/chain";
import { serverEnv } from "@/lib/env";
import { agentPanel, lockPanel, stakePanel } from "@/lib/hero";
import { buyCard, checksCard, feesCard, lockCard } from "@/lib/howItWorks";
import { getAgentStatus } from "@/lib/status";
import { nowSec } from "@/lib/time";

export default async function Home() {
  const env = serverEnv();
  const [stake, status, proof] = await Promise.all([
    getStakeView({ env }),
    getAgentStatus(),
    getDevnetProof().catch((): DevnetProof | null => null),
  ]);
  const now = nowSec();

  const latest = status.ok ? (status.live ?? status.dry) : null;
  const quoteDecimals =
    latest?.quote && latest.quote.decimals === null
      ? await getMintSupply(latest.mint, latest.cluster === "devnet" ? "devnet" : "mainnet-beta").then((m) => m.decimals).catch(() => null)
      : null;
  const devnetDecimals = proof ? await getMintSupply(proof.stream.mint, "devnet").then((m) => m.decimals).catch(() => null) : null;
  const liveStake = stake.state === "active" || stake.state === "cap_reached" ? { decimals: stake.decimals } : null;

  return (
    <main>
      <HeroBand
        stake={stakePanel({ stake, status, founder: env.founder, cluster: env.cluster })}
        agent={agentPanel(status, now)}
        lock={lockPanel(stake, proof)}
      />
      <HowItWorks
        fees={feesCard(status, now)}
        checks={checksCard(status)}
        buy={buyCard(status, quoteDecimals)}
        lock={lockCard(stake, proof, liveStake, devnetDecimals)}
      />
    </main>
  );
}

import { DecisionsBand } from "@/components/band/DecisionsBand";
import { Faq } from "@/components/faq/Faq";
import { ClosingCta } from "@/components/faq/ClosingCta";
import { Verify } from "@/components/verify/Verify";
import { HeroBand } from "@/components/hero/HeroBand";
import { BuiltOn } from "@/components/built/BuiltOn";
import { HowItWorks } from "@/components/how/HowItWorks";
import { Protection } from "@/components/protect/Protection";
import { WhiteSheet } from "@/components/sheet/WhiteSheet";
import { WhoItsFor } from "@/components/who/WhoItsFor";
import { getDevnetProof, getMintSupply, getStakeView, type DevnetProof } from "@/lib/chain";
import { serverEnv } from "@/lib/env";
import { decisionsModel } from "@/lib/decisions";
import { agentPanel, lockPanel, stakePanel } from "@/lib/hero";
import { protectionModel } from "@/lib/protection";
import { buyCard, checksCard, feesCard, lockCard } from "@/lib/howItWorks";
import { getAgentStatus } from "@/lib/status";
import { nowSec } from "@/lib/time";
import { verifyModel } from "@/lib/verify";

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
  const devnetDecimals = proof ? await getMintSupply(proof.mint, "devnet").then((m) => m.decimals).catch(() => null) : null;
  const liveStake = stake.state === "active" || stake.state === "cap_reached" ? { decimals: stake.decimals } : null;

  return (
    <main>
      <HeroBand
        stake={stakePanel({ stake, status, founder: env.founder, cluster: env.cluster })}
        agent={agentPanel(status, now)}
        lock={lockPanel(stake, proof)}
      />
      <WhiteSheet>
        <HowItWorks
          fees={feesCard(status, now)}
          checks={checksCard(status)}
          buy={buyCard(status, quoteDecimals)}
          lock={lockCard(stake, proof, liveStake, devnetDecimals)}
        />
        <WhoItsFor />
        <Protection
          model={protectionModel({ status, stake, proof, repoUrl: env.repoUrl })}
          lock={lockPanel(stake, proof)}
          agent={agentPanel(status, now)}
        />
        <BuiltOn />
        <DecisionsBand model={decisionsModel(status)} />
        <Verify model={verifyModel({ stake, status, proof, env: { cluster: env.cluster, wallet: env.wallet }, now })} />
        <Faq />
        <ClosingCta />
      </WhiteSheet>
    </main>
  );
}

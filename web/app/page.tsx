import { HeroBand } from "@/components/hero/HeroBand";
import { getDevnetProof, getStakeView, type DevnetProof } from "@/lib/chain";
import { serverEnv } from "@/lib/env";
import { agentPanel, lockPanel, stakePanel } from "@/lib/hero";
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

  return (
    <main>
      <HeroBand
        stake={stakePanel({ stake, status, founder: env.founder, cluster: env.cluster })}
        agent={agentPanel(status, now)}
        lock={lockPanel(stake, proof)}
      />
    </main>
  );
}

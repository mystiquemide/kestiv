import type { Metadata } from "next";
import { RunFacts } from "@/components/run/RunFacts";
import { RunHero } from "@/components/run/RunHero";
import { RunSteps } from "@/components/run/RunSteps";
import { WhiteSheet } from "@/components/sheet/WhiteSheet";
import { serverEnv } from "@/lib/env";
import { costRows, dryRunTranscript } from "@/lib/runPage";
import { getAgentStatus } from "@/lib/status";

export const metadata: Metadata = {
  title: "Run it on your token",
  description: "Set up Kestiv on your own token in six steps: a wallet, the skill, your details, a check, a dry run, then the loop.",
  alternates: { canonical: "/run" },
};

export default async function RunPage() {
  const env = serverEnv();
  const status = await getAgentStatus();
  const run = status.ok ? (status.live ?? status.dry) : null;
  const policy = run ? { stakeShareBps: run.policy.stakeShareBps, capBps: run.policy.capBps } : null;

  return (
    <main>
      <RunHero repoUrl={env.repoUrl} />
      <WhiteSheet>
        <RunSteps repoUrl={env.repoUrl} policy={policy} transcript={dryRunTranscript(status)} />
        <RunFacts costs={costRows(status)} />
      </WhiteSheet>
    </main>
  );
}

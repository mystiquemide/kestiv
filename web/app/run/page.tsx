import type { Metadata } from "next";
import { NextSteps } from "@/components/NextSteps";
import { PageNote } from "@/components/PageNote";
import { RunFacts } from "@/components/run/RunFacts";
import { RunHero } from "@/components/run/RunHero";
import { RunSteps } from "@/components/run/RunSteps";
import { WhiteSheet } from "@/components/sheet/WhiteSheet";
import { serverEnv } from "@/lib/env";
import { costRows, dryRunTranscript, terminalPreview } from "@/lib/runPage";
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
      <RunHero repoUrl={env.repoUrl} terminal={terminalPreview(status)} />
      <WhiteSheet>
        <RunSteps repoUrl={env.repoUrl} policy={policy} transcript={dryRunTranscript(status)} />
        <RunFacts costs={costRows(status)} />
        <NextSteps
          title="Before you run it"
          steps={[
            { label: "See a live stake", href: "/stake", text: "Look at what the lock looks like on chain, staircase and all." },
            { label: "Read the agent's decisions", href: "/decisions", text: "Every run and every check, including the ones that said no." },
          ]}
        />
        <PageNote repoUrl={env.repoUrl} />
      </WhiteSheet>
    </main>
  );
}

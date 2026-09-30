import type { Metadata } from "next";
import { CircleAlert } from "lucide-react";
import type { CSSProperties } from "react";
import { DecisionList } from "@/components/decisions/DecisionList";
import { NextSteps } from "@/components/NextSteps";
import { PageNote } from "@/components/PageNote";
import { WhiteSheet } from "@/components/sheet/WhiteSheet";
import { STATE_GUIDE, decisionsModel } from "@/lib/decisions";
import { serverEnv } from "@/lib/env";
import { getAgentStatus } from "@/lib/status";

export const metadata: Metadata = {
  title: "Decisions",
  description: "Every run of the Kestiv agent and every check behind it. Each skip comes with a reason.",
  alternates: { canonical: "/decisions" },
};

const delay = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

export default async function DecisionsPage() {
  const model = decisionsModel(await getAgentStatus());
  const env = serverEnv();
  return (
    <main>
      <section className="bg-band pt-[168px] pb-[120px]">
        <div className="container-k">
          <div className="mx-auto flex max-w-[880px] flex-col items-center text-center">
            <h1 className="rise text-h1">Decisions</h1>
            <p className="rise mt-6 max-w-[640px] text-sub" style={delay(0.1)}>
              Every run, every check. Each skip comes with a reason.
            </p>
          </div>
        </div>
      </section>
      <WhiteSheet>
        <section aria-labelledby="read-a-run">
          <h2 id="read-a-run" className="text-h3">
            How to read a run
          </h2>
          <dl className="mt-8 grid gap-4 md:grid-cols-3">
            {STATE_GUIDE.map((g) => (
              <div key={g.state} className="rounded-card bg-band p-6">
                <dt className="text-eyebrow text-helper">{g.state}</dt>
                <dd className="mt-3 text-[16px] text-ink">{g.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="latest-runs">
          <h2 id="latest-runs" className="text-h3">
            Latest runs
          </h2>
          {model.kind === "rows" && model.note && <p className="mt-4 max-w-[720px] text-[16px] text-body">{model.note}</p>}
          <div className="mt-8">
            {model.kind === "rows" ? (
              <DecisionList rows={model.rows} counts={model.counts} mixed={model.mixed} />
            ) : (
              <div className="flex items-start gap-3 rounded-card bg-band p-6 md:p-8">
                {model.kind === "error" && <CircleAlert size={24} strokeWidth={1.75} className="shrink-0 text-refusal" aria-hidden="true" />}
                <p className="max-w-[640px] text-[16px] text-body">{model.message}</p>
              </div>
            )}
          </div>
        </section>

        <NextSteps
          title="Keep going"
          steps={[
            { label: "See the stake", href: "/stake", text: "What the founder holds, and the lock these decisions feed." },
            { label: "Run it on your token", href: "/run", text: "Set up your own agent in six steps, practice run first." },
          ]}
        />
        <PageNote repoUrl={env.repoUrl} />
      </WhiteSheet>
    </main>
  );
}

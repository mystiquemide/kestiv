import type { Metadata } from "next";
import { CircleAlert } from "lucide-react";
import type { CSSProperties } from "react";
import { DecisionList } from "@/components/decisions/DecisionList";
import { WhiteSheet } from "@/components/sheet/WhiteSheet";
import { decisionsModel } from "@/lib/decisions";
import { getAgentStatus } from "@/lib/status";

export const metadata: Metadata = {
  title: "Decisions",
  description: "Every run of the Kestiv agent and every check behind it. Each skip comes with a reason.",
  alternates: { canonical: "/decisions" },
};

const delay = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

export default async function DecisionsPage() {
  const model = decisionsModel(await getAgentStatus());
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
        <section aria-label="Agent runs">
          {model.kind === "rows" ? (
            <DecisionList rows={model.rows} counts={model.counts} />
          ) : (
            <div className="flex items-start gap-3 rounded-card bg-band p-6 md:p-8">
              {model.kind === "error" && <CircleAlert size={24} strokeWidth={1.75} className="shrink-0 text-refusal" aria-hidden="true" />}
              <p className="max-w-[640px] text-[16px] text-body">{model.message}</p>
            </div>
          )}
        </section>
      </WhiteSheet>
    </main>
  );
}

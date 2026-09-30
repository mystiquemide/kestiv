import { ArrowRight, CircleAlert } from "lucide-react";
import Link from "next/link";
import type { AgentPanelModel } from "@/lib/hero";
import { routeLive } from "@/lib/routes";
import { TimeAgo } from "../hero/TimeAgo";

export function StakeAgentLine({ model }: { model: AgentPanelModel }) {
  return (
    <section aria-label="Latest agent report" className="rounded-card bg-band p-6 md:p-8">
      {model.kind !== "run" ? (
        <div className="flex items-start gap-3 text-[16px]">
          {model.kind === "feed_error" && <CircleAlert size={24} strokeWidth={1.75} className="shrink-0 text-refusal" aria-hidden="true" />}
          <p className="text-body">{model.message}</p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
          <div>
            <p className="text-caption text-helper">
              Agent · reported <TimeAgo ts={model.ts} initial={model.initialAgo} />
              {model.stale && " · older than 2 hours"}
              {model.source === "dry" && " · practice run, nothing bought"}
            </p>
            <p className="mt-2 text-[18px] text-ink">
              <span className="mr-3 rounded-pill bg-white px-3 py-1 text-[12px] font-medium tracking-[0.075em] text-ink uppercase">{model.state}</span>
              {model.reason}
            </p>
          </div>
          {routeLive("/decisions") && (
            <Link href="/decisions" className="inline-flex min-h-6 items-center gap-2 text-[16px] font-medium text-ink hover:underline">
              See every decision
              <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

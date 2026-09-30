import Link from "next/link";
import type { DecisionsModel } from "@/lib/decisions";
import { routeLive } from "@/lib/routes";
import { Panel } from "../hero/Panel";

/** The closing band of the home page: the promise on the left, the agent's latest decisions on the right. */
export function DecisionsBand({ model }: { model: DecisionsModel }) {
  const rows = model.kind === "rows" ? model.rows.slice(0, 3) : [];
  return (
    <section aria-labelledby="decisions-band-title" className="overflow-hidden rounded-card bg-night px-6 py-10 md:px-16 md:py-16">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 id="decisions-band-title" className="max-w-[520px] text-h2 text-night-fg">
            Every buy adds a step. No step can be taken away.
          </h2>
          {routeLive("/decisions") && (
            <Link href="/decisions" className="mt-8 inline-flex items-center justify-center rounded-pill bg-white px-[22px] py-[14px] text-[15px] leading-none font-medium text-ink hover:bg-band">
              See every decision
            </Link>
          )}
        </div>
        <Panel eyebrow="Latest decisions" right={model.kind === "rows" && model.note ? "Practice runs" : undefined}>
          {model.kind === "rows" ? (
            <ul className="mt-6 border-t border-line">
              {rows.map((r) => (
                <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-3">
                  <span className="num text-[14px] text-helper">{r.date}</span>
                  <span className="rounded-pill bg-band px-2.5 py-0.5 text-[11px] font-medium tracking-[0.075em] text-ink uppercase">{r.state}</span>
                  <span className="min-w-0 basis-full text-[16px] text-ink">{r.reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-[16px] text-body">{model.message}</p>
          )}
        </Panel>
      </div>
    </section>
  );
}

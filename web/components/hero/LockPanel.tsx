import type { LockPanelModel } from "@/lib/hero";
import { ExternalLink, Panel } from "./Panel";

export function LockPanel({ model, className = "" }: { model: LockPanelModel; className?: string }) {
  return (
    <Panel eyebrow="The lock" right={model.label} className={className}>
      {model.error ? (
        <p className="mt-6 text-[16px] text-ink">{model.error}</p>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 border-t border-line">
            {model.cells.map((c, i) => (
              <div key={c.label} className={`border-b border-line py-3 ${i % 2 === 0 ? "pr-4" : "border-l pl-4"}`}>
                <dt className="text-[14px] text-helper">{c.label}</dt>
                <dd className={`text-[18px] ${c.tone === "refusal" ? "text-refusal" : "text-ink"}`}>{c.value}</dd>
              </div>
            ))}
          </dl>
          {model.cancelAttemptHref ? (
            <div className="flex min-h-11 items-center justify-between gap-4 border-b border-line">
              <span className="text-[14px] text-helper">Cancel attempt</span>
              <ExternalLink href={model.cancelAttemptHref} className="text-[16px] text-ink">
                Failed on chain
              </ExternalLink>
            </div>
          ) : null}
          {model.streamflowHref ? (
            <p className="mt-4 text-[16px]">
              <ExternalLink href={model.streamflowHref} className="text-ink">
                Open on Streamflow
              </ExternalLink>
            </p>
          ) : null}
        </>
      )}
    </Panel>
  );
}

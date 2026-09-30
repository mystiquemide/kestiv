import { CircleAlert } from "lucide-react";
import type { StakePanelModel } from "@/lib/hero";
import { Panel, RowList } from "./Panel";

export function StakePanel({ model, className = "" }: { model: StakePanelModel; className?: string }) {
  return (
    <Panel eyebrow="$KESTIV founder stake" className={`flex flex-col ${className}`}>
      {model.kind === "error" ? (
        <div className="mt-6 flex items-start gap-3 text-[16px] text-ink">
          <CircleAlert size={24} strokeWidth={1.75} className="shrink-0 text-refusal" aria-hidden="true" />
          <p>{model.message}</p>
        </div>
      ) : model.kind === "not_launched" ? (
        <div className="mt-6">
          <p className="text-h3">{model.headline}</p>
          <p className="mt-3 text-[16px] text-body">{model.text}</p>
        </div>
      ) : (
        <div className="mt-6">
          <p className="num text-[56px] leading-none tracking-[-0.02em] text-ink">{model.headline}</p>
          {model.note ? <p className="mt-3 text-[16px] text-body">{model.note}</p> : null}
        </div>
      )}
      <RowList rows={model.rows} rowClassName="min-h-14" className="mt-auto pt-0" />
    </Panel>
  );
}

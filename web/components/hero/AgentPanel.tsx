import Link from "next/link";
import { Check, CircleAlert, Clock, X } from "lucide-react";
import type { AgentPanelModel } from "@/lib/hero";
import { ExternalLink, Panel } from "./Panel";
import { TimeAgo } from "./TimeAgo";

export function AgentPanel({ model, className = "" }: { model: AgentPanelModel; className?: string }) {
  if (model.kind !== "run") {
    const isError = model.kind === "feed_error";
    return (
      <Panel eyebrow="Latest agent run" className={className}>
        <div className="mt-6 flex items-start gap-3 text-[16px] text-ink">
          {isError ? <CircleAlert size={24} strokeWidth={1.75} className="shrink-0 text-refusal" aria-hidden="true" /> : null}
          <p>{model.message}</p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel eyebrow="Latest agent run" right={<TimeAgo ts={model.ts} initial={model.initialAgo} />} className={className}>
      {model.dryLabel ? (
        <p className="mt-4 text-caption text-helper">
          Dry run on{" "}
          <ExternalLink href={model.dryLabel.href} className="num text-ink">
            {model.dryLabel.token}
          </ExternalLink>
          , nothing bought.
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="rounded-pill bg-band px-3 py-1 text-eyebrow text-ink">{model.state}</span>
        <p className="text-[16px] text-ink">{model.reason}</p>
      </div>

      <ul className="mt-6 border-t border-line">
        {model.checks.map((c) => (
          <li key={c.label} className="flex min-h-12 items-center justify-between gap-4 border-b border-line">
            <div>
              <p className="text-[15px] leading-tight text-ink">{c.label}</p>
              <p className="text-[13px] leading-tight text-helper">{c.threshold}</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="num text-[16px] text-ink">{c.value}</span>
              <span className={`flex w-14 items-center gap-1 text-[14px] ${c.pass ? "text-ink" : "text-refusal"}`}>
                {c.pass ? (
                  <Check size={16} strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <X size={16} strokeWidth={1.75} aria-hidden="true" />
                )}
                {c.pass ? "Pass" : "Fail"}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-caption">
        <p className="text-helper">
          {model.passed} of {model.total} checks passed
        </p>
        <Link href="/decisions" className="text-ink underline-offset-2 hover:underline">
          See all checks
        </Link>
      </div>

      {model.stale ? (
        <p className="mt-3 flex items-center gap-2 text-caption text-helper">
          <Clock size={16} strokeWidth={1.75} aria-hidden="true" />
          {model.stale}
        </p>
      ) : null}
    </Panel>
  );
}

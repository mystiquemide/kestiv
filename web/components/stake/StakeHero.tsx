import { ArrowRight, CircleAlert } from "lucide-react";
import type { CSSProperties } from "react";
import { budgetText, type StakeHeroModel } from "@/lib/stakePage";
import { solFromLamports } from "@/lib/format";
import { CopyButton } from "../CopyButton";

const delay = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

export function StakeHero({ model }: { model: StakeHeroModel }) {
  const big = model.state === "not_launched" || model.state === "error";
  const [primary, ...rest] = model.links;
  return (
    <section className="bg-band pt-[168px] pb-[120px]">
      <div className="container-k">
        <div className="mx-auto flex max-w-[880px] flex-col items-center text-center">
          <p className="rise text-eyebrow text-helper">$KESTIV founder stake</p>
          <h1 className={`rise num mt-6 leading-none tracking-[-0.03em] text-ink ${big ? "text-h1" : "text-[72px] md:text-[120px]"}`} style={delay(0.08)}>
            {model.headline}
          </h1>

          {model.lead && model.state !== "active" && model.state !== "cap_reached" && (
            <p className="rise mt-6 max-w-[640px] text-sub" style={delay(0.16)}>
              {model.lead}
            </p>
          )}

          {(model.state === "active" || model.state === "cap_reached") && model.recipient && (
            <div className="rise mt-6 flex flex-wrap items-center justify-center gap-x-2 text-sub" style={delay(0.16)}>
              <span>{model.lead}</span>
              <span className="num text-ink" title={model.recipient.full}>
                {model.recipient.short}
              </span>
              <CopyButton value={model.recipient.full} label="Copy founder address" />
            </div>
          )}

          {model.lockLine && (
            <p className="rise mt-4 text-[18px] text-ink" style={delay(0.22)}>
              {model.lockLine}
            </p>
          )}

          {model.state === "error" && (
            <p className="rise mt-6 flex items-center gap-3 text-[16px] text-ink" style={delay(0.22)}>
              <CircleAlert size={24} strokeWidth={1.75} className="shrink-0 text-refusal" aria-hidden="true" />
              The numbers come back as soon as the chain answers.
            </p>
          )}

          {model.budget && (
            <div className="rise mt-8 w-full max-w-[560px] text-left" style={delay(0.22)}>
              <div
                role="progressbar"
                aria-label="Funding for the first lock"
                aria-valuemin={0}
                aria-valuemax={model.budget.neededLamports}
                aria-valuenow={Math.min(model.budget.haveLamports, model.budget.neededLamports)}
                aria-valuetext={`${solFromLamports(model.budget.haveLamports)} of ${solFromLamports(model.budget.neededLamports)} SOL`}
                className="h-2 w-full rounded-pill bg-white"
              >
                <div className="h-2 rounded-pill bg-brass" style={{ width: `${Math.round(model.budget.progress * 100)}%` }} />
              </div>
              <p className="mt-3 text-[16px] text-body">{budgetText(model.budget)}</p>
            </div>
          )}

          {model.recipient && !(model.state === "active" || model.state === "cap_reached") && (
            <div className="rise mt-6 flex items-center gap-1 text-[16px] text-body" style={delay(0.28)}>
              Founder <span className="num ml-1 text-ink" title={model.recipient.full}>{model.recipient.short}</span>
              <CopyButton value={model.recipient.full} label="Copy founder address" />
            </div>
          )}

          {primary && (
            <div className="rise mt-10 flex flex-wrap items-center justify-center gap-6" style={delay(0.32)}>
              <a
                href={primary.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-pill bg-brass px-[22px] py-[14px] text-[15px] leading-none font-medium text-ink transition-colors hover:bg-[#c8933a]"
              >
                {primary.label}
              </a>
              {rest.map((l) => (
                <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-6 items-center gap-2 text-[16px] font-medium text-ink hover:underline">
                  {l.label}
                  <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

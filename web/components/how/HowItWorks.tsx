import { Check, CircleAlert, X } from "lucide-react";
import type { BuyCard, ChecksCard, FeesCard, LockCard } from "@/lib/howItWorks";
import { ExternalLink } from "../hero/Panel";
import { TimeAgo } from "../hero/TimeAgo";
import { Card, InnerHeader } from "./Card";
import { StaircaseChart } from "./Staircase";

export interface HowModels {
  fees: FeesCard;
  checks: ChecksCard;
  buy: BuyCard;
  lock: LockCard;
}

function Message({ children, error = false }: { children: string; error?: boolean }) {
  return (
    <div className="flex items-start gap-3 text-[16px] text-ink">
      {error ? <CircleAlert size={24} strokeWidth={1.75} className="shrink-0 text-refusal" aria-hidden="true" /> : null}
      <p>{children}</p>
    </div>
  );
}

function DryLabel({ label }: { label: { token: string; href: string } | null }) {
  if (!label) return null;
  return (
    <p className="mb-4 text-caption text-helper">
      Dry run on{" "}
      <ExternalLink href={label.href} className="num text-ink">
        {label.token}
      </ExternalLink>
      , nothing bought.
    </p>
  );
}

function FeesData({ card }: { card: FeesCard }) {
  if (card.kind !== "inflows") return <Message error={card.kind === "feed_error"}>{card.message}</Message>;
  return (
    <div>
      <ul className="border-t border-line">
        {card.rows.map((r, i) => (
          <li key={`${r.href}-${i}`} className="flex min-h-12 items-center justify-between gap-3 border-b border-line">
            <span className="num text-[16px] text-ink">{r.amount}</span>
            <span className="rounded-pill bg-band px-3 py-1 text-[13px] leading-none text-ink">{r.source}</span>
            <span className="text-caption text-helper">
              <TimeAgo ts={r.ts} initial={r.initialAgo} />
            </span>
            <ExternalLink href={r.href} className="text-caption text-ink">
              Tx
            </ExternalLink>
          </li>
        ))}
      </ul>
      <p className="num mt-4 text-[13px] text-helper">{card.totals}</p>
    </div>
  );
}

function ChecksData({ card }: { card: ChecksCard }) {
  if (card.kind !== "run") return <Message error={card.kind === "feed_error"}>{card.message}</Message>;
  return (
    <div>
      <DryLabel label={card.dryLabel} />
      <ul className="border-t border-line md:grid md:grid-cols-2 md:gap-x-8">
        {card.gates.map((g) => (
          <li key={g.name} className="flex min-h-14 items-center justify-between gap-3 border-b border-line">
            <div className="min-w-0">
              <p className="text-[15px] leading-tight text-ink">{g.label}</p>
              <p className="text-[13px] leading-tight text-helper">{g.threshold}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="num text-right text-[14px] whitespace-nowrap text-ink">{g.value}</span>
              {g.pass ? (
                <Check size={16} strokeWidth={1.75} className="shrink-0 text-ink" aria-hidden="true" />
              ) : (
                <X size={16} strokeWidth={1.75} className="shrink-0 text-refusal" aria-hidden="true" />
              )}
              <span className="sr-only">{g.pass ? "Pass" : "Fail"}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BuyData({ card }: { card: BuyCard }) {
  if (card.kind === "feed_error") return <Message error>{card.message}</Message>;
  if (card.kind === "no_quote") {
    return (
      <div>
        <DryLabel label={card.dryLabel} />
        <Message>{card.message}</Message>
      </div>
    );
  }
  return (
    <div>
      <DryLabel label={card.dryLabel} />
      <p className="num text-[20px] leading-snug text-ink">
        {card.pays} → {card.receives}
      </p>
      <dl className="mt-4 border-t border-line">
        <div className="flex min-h-11 items-center justify-between border-b border-line">
          <dt className="text-[14px] text-helper">Price impact</dt>
          <dd className="num text-[16px] text-ink">{card.impact}</dd>
        </div>
        <div className="flex min-h-11 items-center justify-between gap-4">
          <dt className="text-[14px] text-helper">Route</dt>
          <dd className="text-[16px] text-ink">{card.route}</dd>
        </div>
      </dl>
    </div>
  );
}

function LockData({ card }: { card: LockCard }) {
  if (card.kind === "error") return <Message error>{card.message}</Message>;
  return (
    <div>
      <InnerHeader left="Each step is one deposit" right={card.label} />
      <StaircaseChart chart={card.chart} />
      <ul className="mt-6 border-t border-line">
        {card.list.map((s) => (
          <li key={s.href} className="flex min-h-11 items-center justify-between gap-3 border-b border-line text-[16px]">
            <span className="text-ink">{s.title}</span>
            <span className="num text-[14px] whitespace-nowrap text-ink sm:text-[16px]">{s.amount}</span>
            <span className="num hidden text-caption text-helper sm:inline">{s.date}</span>
            <ExternalLink href={s.href} className="text-caption text-ink">
              Tx
            </ExternalLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HowItWorks({ fees, checks, buy, lock }: HowModels) {
  return (
    <section id="how-it-works" className="relative z-10 -mt-[60px] rounded-t-[60px] bg-canvas pt-[120px] pb-24">
      <div className="container-k">
        <p className="text-eyebrow text-helper">How it works</p>
        <h2 className="mt-4 text-h2">Four steps, all onchain</h2>

        <div className="mt-14 grid gap-4 lg:grid-cols-2">
          <Card n={1} title="Fees come in" text={fees.text} wide>
            <FeesData card={fees} />
          </Card>
          <Card n={2} title="It waits for real trading" text={checks.text} wide>
            <ChecksData card={checks} />
          </Card>
          <Card n={3} title="It buys a small slice" text={buy.text}>
            <BuyData card={buy} />
          </Card>
          <Card n={4} title="It locks it for the founder" text={lock.text}>
            <LockData card={lock} />
          </Card>
        </div>
      </div>
    </section>
  );
}

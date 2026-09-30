import { Check, X } from "lucide-react";
import { NEVER, type CostRow } from "@/lib/runPage";

export function RunFacts({ costs }: { costs: CostRow[] }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <article className="rounded-card bg-band p-6 md:p-10">
        <h2 className="text-h3">What it costs</h2>
        <dl className="mt-8 flex flex-col">
          {costs.map((c) => (
            <div key={c.label} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-line py-4 first:border-t-0">
              <dt className="text-[16px] text-body">{c.label}</dt>
              <dd className="num text-[16px] text-ink">{c.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-caption text-helper">Streamflow and UsePod figures come from their docs and the agent&apos;s own quotes.</p>
      </article>
      <article className="rounded-card bg-band p-6 md:p-10">
        <h2 className="text-h3">What it never does</h2>
        <ul className="mt-8 flex flex-col gap-5">
          {NEVER.map((n) => (
            <li key={n.label} className="flex items-start gap-3">
              <X size={20} strokeWidth={1.75} className="mt-[3px] shrink-0 text-refusal" aria-hidden="true" />
              <div>
                <p className="text-[18px] text-ink">{n.label}</p>
                <p className="mt-1 text-[16px] text-body">{n.text}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-6 flex items-center gap-2 text-caption text-helper">
          <Check size={16} strokeWidth={1.75} aria-hidden="true" />
          Not financial advice. Hard limits reduce spending risk, they don&apos;t guarantee returns.
        </p>
      </article>
    </section>
  );
}

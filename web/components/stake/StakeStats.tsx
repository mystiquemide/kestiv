import type { StakeStatsModel } from "@/lib/stakeStats";

export function StakeStats({ model }: { model: StakeStatsModel }) {
  return (
    <section aria-label="Stake numbers">
      {model.label && (
        <p className="mb-4">
          <span className="rounded-pill bg-band px-3 py-1 text-caption text-ink">{model.label}: locked, vested and next unlock</span>
        </p>
      )}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-10 border-t border-line pt-8 lg:grid-cols-4">
        {model.cells.map((c) => (
          <div key={c.label}>
            <dt className="text-eyebrow text-helper">{c.label}</dt>
            <dd className={`mt-3 text-[26px] leading-tight md:text-[32px] ${c.mono ? "num" : ""} ${c.tone === "brass" ? "text-brass-ink" : "text-ink"}`}>{c.value}</dd>
            {c.sub && <dd className="mt-1 text-caption text-helper">{c.sub}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}

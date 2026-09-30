"use client";

import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import type { StakeChartModel } from "@/lib/stakeChart";

const pct = (n: number) => `${(n * 100).toFixed(3)}%`;
const ALIGN = { left: "translate-x-0", center: "-translate-x-1/2", right: "-translate-x-full" } as const;

export function StakeStaircase({ chart }: { chart: StakeChartModel }) {
  const [active, setActive] = useState(chart.points.length - 1);
  const p = chart.points[active]!;
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-eyebrow text-helper">Tokens locked</p>
        {chart.label === "Devnet proof" && <span className="rounded-pill bg-white px-3 py-1 text-caption text-ink">Devnet proof</span>}
      </div>

      <div className="mt-6 flex gap-3">
        <div className="relative w-14 shrink-0 md:w-20" aria-hidden="true">
          {chart.yTicks.map((t) => (
            <span key={t.label} className="num absolute right-0 -translate-y-1/2 text-[13px] text-helper" style={{ top: pct(t.y) }}>
              {t.label}
            </span>
          ))}
        </div>

        <div className="relative h-[240px] flex-1 md:h-[340px]">
          <svg role="img" aria-label={chart.ariaLabel} viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            {chart.yTicks.map((t) => (
              <line key={t.label} x1={0} x2={1000} y1={t.y * 1000} y2={t.y * 1000} stroke="#E7E7E7" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {chart.cliff && (
              <line x1={chart.cliff.x * 1000} x2={chart.cliff.x * 1000} y1={0} y2={1000} stroke="#8A8A84" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            )}
            <path d={chart.faint} fill="none" stroke="#1F1F1F" strokeOpacity={0.28} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            <path d={chart.solid} fill="none" stroke="#1F1F1F" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </svg>
          {chart.points.map((pt, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${pt.label} on ${pt.date}, ${pt.amount} tokens`}
              aria-pressed={i === active}
              onClick={() => setActive(i)}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              className="absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{ left: pct(pt.x), top: pct(pt.y) }}
            >
              <span className={`block size-[10px] border border-ink bg-brass transition-transform ${i === active ? "scale-150" : ""}`} />
            </button>
          ))}
          {chart.cliff && (
            <span className="num absolute top-0 -translate-x-1/2 -translate-y-full pb-1 text-[12px] text-helper" style={{ left: pct(chart.cliff.x) }}>
              Cliff
            </span>
          )}
        </div>
      </div>

      <div className="relative mt-3 ml-[68px] hidden h-11 md:ml-[92px] md:block" aria-hidden="true">
        {chart.xTicks.map((t) => (
          <div key={t.sub} className={`absolute top-0 whitespace-nowrap ${ALIGN[t.align]}`} style={{ left: pct(t.x) }}>
            <p className="num text-[13px] text-ink">{t.label}</p>
            <p className={`text-[12px] text-helper ${t.align === "center" ? "text-center" : t.align === "right" ? "text-right" : ""}`}>{t.sub}</p>
          </div>
        ))}
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 md:hidden">
        {chart.xTicks.map((t) => (
          <div key={t.sub}>
            <dt className="text-[12px] text-helper">{t.sub}</dt>
            <dd className="num text-[14px] text-ink">{t.label}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[16px]" aria-live="polite">
        <p className="text-ink">
          <span className="text-helper">{p.label} · </span>
          <span className="num">{p.date}</span> · <span className="num">{p.amount}</span> tokens
          <span className="text-helper"> · total </span>
          <span className="num">{p.cumulative}</span>
        </p>
        <a href={p.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-6 items-center gap-1 font-medium text-ink hover:underline">
          View lock
          <ArrowUpRight size={18} strokeWidth={1.75} aria-hidden="true" />
        </a>
      </div>
      <p className="mt-4 max-w-[720px] text-caption text-helper">{chart.legend}</p>
    </div>
  );
}

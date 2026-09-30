"use client";

import { ArrowUpRight, ChevronDown, Check, X } from "lucide-react";
import { useState } from "react";
import type { DecisionRow, Kind } from "@/lib/decisions";

type Filter = "all" | Kind;
const LABEL: Record<Filter, string> = { all: "All", bought: "Bought", skipped: "Skipped", waiting: "Waiting", error: "Errors" };
const PAGE = 20;

export function DecisionList({ rows, counts, mixed = false }: { rows: DecisionRow[]; counts: Record<Filter, number>; mixed?: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(PAGE);
  const filters = (Object.keys(LABEL) as Filter[]).filter((f) => f === "all" || counts[f] > 0);
  const visible = rows.filter((r) => filter === "all" || r.kind === filter);

  return (
    <div>
      <div role="group" aria-label="Filter runs" className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => {
              setFilter(f);
              setShown(PAGE);
            }}
            className={`min-h-11 rounded-pill px-5 text-[15px] font-medium transition-colors ${filter === f ? "bg-ink text-white" : "bg-band text-ink hover:bg-[#ececec]"}`}
          >
            {LABEL[f]} <span className="num ml-1 opacity-70">{counts[f]}</span>
          </button>
        ))}
      </div>

      <ul className="mt-8 flex flex-col gap-3" aria-live="polite">
        {visible.slice(0, shown).map((r) => (
          <li key={r.key}>
            <details className="group rounded-accordion bg-band">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 md:px-6 [&::-webkit-details-marker]:hidden">
                <span className="num shrink-0 whitespace-nowrap text-[15px] text-ink md:w-[210px]">{r.date}</span>
                <span className={`rounded-pill bg-white px-3 py-1 text-[12px] font-medium tracking-[0.075em] uppercase ${r.kind === "bought" ? "text-brass-ink" : r.kind === "error" ? "text-refusal" : "text-ink"}`}>{r.state}</span>
                <span className="min-w-0 flex-1 basis-[240px] text-[16px] text-ink">
                  {r.reason}
                  {r.dry && mixed && <span className="ml-2 text-caption text-helper">Practice run</span>}
                </span>
                <ChevronDown size={20} strokeWidth={1.75} className="shrink-0 text-helper transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>

              <div className="px-5 pb-6 md:px-6">
                <p className="text-caption text-helper">
                  Token <span className="num text-ink">{r.token}</span>
                </p>
                {r.gates.length > 0 ? (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[440px] text-left">
                      <caption className="sr-only">Checks for this run</caption>
                      <thead>
                        <tr className="border-b border-line text-eyebrow text-helper">
                          <th scope="col" className="py-2 pr-4 font-medium">Check</th>
                          <th scope="col" className="py-2 pr-4 font-medium">Value</th>
                          <th scope="col" className="py-2 pr-4 font-medium">Limit</th>
                          <th scope="col" className="py-2 font-medium">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.gates.map((g) => (
                          <tr key={g.name} className="border-b border-line text-[15px]">
                            <td className="py-2.5 pr-4 text-ink">{g.label}</td>
                            <td className="num py-2.5 pr-4 text-ink">{g.value}</td>
                            <td className="num py-2.5 pr-4 text-helper">{g.threshold}</td>
                            <td className={`py-2.5 font-medium ${g.pass ? "text-ink" : "text-refusal"}`}>
                              <span className="inline-flex items-center gap-1.5">
                                {g.pass ? <Check size={16} strokeWidth={1.75} aria-hidden="true" /> : <X size={16} strokeWidth={1.75} aria-hidden="true" />}
                                {g.pass ? "Pass" : "Fail"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  r.reason === "manual_first_lock" ? (
                  <p className="mt-3 max-w-[560px] text-[16px] text-body">The founder started this buy and lock by hand, so the agent&apos;s checks did not run. It used the agent&apos;s own buy and lock code. Later buys go through the checks.</p>
                ) : (
                  <p className="mt-3 max-w-[560px] text-[16px] text-body">No checks ran. The run stopped before them, so nothing was bought or signed. The agent tries again on its next run. The public reports share the state and reason, not the error text.</p>
                )
                )}

                {r.usepod && (
                  <p className="mt-4 text-[16px] text-ink">
                    <span className="text-helper">UsePod: </span>
                    {r.usepod.line}
                    {r.usepod.model && <span className="text-helper"> · {r.usepod.model}</span>}
                    {r.usepod.paidHref && (
                      <a href={r.usepod.paidHref} target="_blank" rel="noopener noreferrer" className="ml-3 inline-flex min-h-6 items-center gap-1 font-medium hover:underline">
                        Paid
                        <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden="true" />
                      </a>
                    )}
                  </p>
                )}

                {r.txs.length > 0 && (
                  <p className="mt-4 flex flex-wrap gap-x-6 text-[16px]">
                    {r.txs.map((t) => (
                      <a key={t.href} href={t.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-6 items-center gap-1 font-medium text-ink hover:underline">
                        {t.label}
                        <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden="true" />
                      </a>
                    ))}
                  </p>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>

      {visible.length > shown && (
        <div className="mt-8 flex justify-center">
          <button type="button" onClick={() => setShown((n) => n + PAGE)} className="min-h-11 rounded-pill bg-band px-6 text-[15px] font-medium text-ink transition-colors hover:bg-[#ececec]">
            Show older runs
          </button>
        </div>
      )}
      {visible.length === 0 && <p className="mt-8 text-[16px] text-body">No runs match this filter.</p>}
    </div>
  );
}

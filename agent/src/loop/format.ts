import type { Gate } from "./decide.js";
import type { RunResult } from "./types.js";

const fmt = (v: unknown): string => (v === null || v === undefined ? "n/a" : typeof v === "number" ? String(Number(v.toPrecision(6))) : String(v));

export function formatRun(r: RunResult): string {
  const p = r.dry ? "DRY-RUN " : "";
  const lines: string[] = [];
  const d = r.details as Record<string, any>;

  lines.push(`${p}${r.state} ${r.reason}`);
  if (d.signals) {
    const s = d.signals;
    lines.push(
      `${p}signals  price $${fmt(s.priceUsd)}  SOL $${fmt(s.solUsd)}  vol24h $${fmt(s.volume24hUsd)}  liq $${fmt(s.liquidityUsd)}  holders ${fmt(s.holders)}  swaps(6h) ${fmt(s.swapsInWindow)}/${fmt(s.swapsFetched)}`,
    );
  }
  if (r.budget) {
    const b = r.budget;
    lines.push(
      `${p}budget   budgeted ${b.budgetedLamports}  spent ${b.spentOnSlicesLamports}  expenses ${b.expensesLamports}  remaining ${b.remainingLamports}  wallet ${b.walletLamports}  spendable ${b.spendableLamports} lamports`,
    );
  }
  const gates = (d.gates ?? []) as Gate[];
  for (const g of gates) {
    lines.push(`${p}gate ${g.pass ? "PASS" : "FAIL"}  ${g.name}  value=${fmt(g.value)}  threshold=${fmt(g.threshold)}`);
  }
  if (d.quote) {
    lines.push(`${p}quote    ${d.quote.inLamports} lamports -> ${d.quote.outAmount} out (min ${d.quote.minOutAmount}), impact ${(d.quote.priceImpact * 100).toFixed(3)}%, route ${d.quote.route.join(">")}`);
  }
  if (d.usepod) {
    const u = d.usepod;
    lines.push(`${p}usepod   outcome=${u.outcome}${u.quoteLamports !== undefined ? ` quote=${u.quoteLamports} lamports` : ""}${u.verdict ? ` verdict=${u.verdict}` : ""}${u.error ? ` error=${u.error}` : ""}`);
  }
  for (const a of d.actions as string[]) lines.push(a.startsWith("DRY-RUN") ? a : `action  ${a}`);
  for (const n of d.notes as string[]) lines.push(`${p}note     ${n}`);
  if (d.error) lines.push(`${p}error    ${d.error}`);
  for (const t of r.txs) lines.push(`${p}tx       ${t}`);
  return lines.join("\n");
}

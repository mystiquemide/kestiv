import { formatFractionPct, formatInt, formatUsd, formatUsdSmall, solFromLamports, solTiny } from "./format";
import type { PublicStatus } from "./schema";

export type Gate = PublicStatus["gates"][number];

export interface GateView {
  name: string;
  label: string;
  value: string;
  threshold: string;
  pass: boolean;
}

const n = (v: Gate["value"]): number | null => (typeof v === "number" ? v : v === null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const na = "n/a";

interface Spec {
  label: string;
  value: (g: Gate) => string;
  threshold: (g: Gate) => string;
}

const num = (g: Gate) => n(g.value);
const thr = (g: Gate) => Number(g.threshold);

const SPECS: Record<string, Spec> = {
  cap: {
    label: "Stake cap",
    value: (g) => (g.pass ? "Under the cap" : "Reached"),
    threshold: (g) => `max ${/\(([^)]*)\)/.exec(String(g.threshold))?.[1] ?? String(g.threshold)}`,
  },
  cooldown_sec_left: {
    label: "Pause between buys",
    value: (g) => (num(g) === null || num(g) === 0 ? "none" : `${Math.ceil(num(g)! / 60)} min left`),
    threshold: () => "none",
  },
  price_usd: {
    label: "Token price",
    value: (g) => (num(g) === null || num(g)! <= 0 ? "Missing" : formatUsdSmall(num(g)!)),
    threshold: () => "needed",
  },
  volume_24h_usd: {
    label: "24h volume",
    value: (g) => (num(g) === null ? na : `${g.source === "swaps_lower_bound" ? "at least " : ""}${formatUsd(num(g)!)}`),
    threshold: (g) => `min ${formatUsd(thr(g))}`,
  },
  holders: {
    label: "Holders",
    value: (g) => (num(g) === null ? na : formatInt(num(g)!)),
    threshold: (g) => `min ${formatInt(thr(g))}`,
  },
  liquidity_usd: {
    label: "Pool liquidity",
    value: (g) => (num(g) === null ? na : formatUsd(num(g)!)),
    threshold: () => "needed",
  },
  slice_lamports: {
    label: "Buy size",
    value: (g) => (num(g) === null ? na : `${solFromLamports(num(g)!)} SOL`),
    threshold: (g) => `min ${solFromLamports(thr(g))} SOL`,
  },
  price_impact: {
    label: "Price impact",
    value: (g) => (num(g) === null ? na : formatFractionPct(num(g)!)),
    threshold: (g) => `max ${formatFractionPct(thr(g))}`,
  },
  spot_over_vwap: {
    label: "Price vs 6h average",
    value: (g) => (num(g) === null ? na : `${Number(num(g)!.toFixed(2))}x`),
    threshold: (g) => `max ${Number(thr(g).toFixed(2))}x the 6h average`,
  },
  usepod_quote_lamports: {
    label: "UsePod check cost",
    value: (g) => (num(g) === null ? na : `${solTiny(num(g)!)} SOL`),
    threshold: (g) => `max ${solTiny(thr(g))} SOL`,
  },
  usepod_verdict: {
    label: "UsePod second opinion",
    value: (g) => (g.value === "buy" ? "Buy" : g.value === "skip" ? "Skip" : String(g.value ?? na)),
    threshold: () => "Buy",
  },
  usepod: {
    label: "UsePod second opinion",
    value: () => "Unavailable",
    threshold: () => "Available",
  },
};

const TRADES = /^swaps_last_(\d+)h$/;

export function gateView(g: Gate): GateView {
  const trades = TRADES.exec(g.name);
  if (trades) {
    const hours = trades[1]!;
    return {
      name: g.name,
      label: `Trades in ${hours} hours`,
      value: num(g) === null ? na : formatInt(num(g)!),
      threshold: `min ${formatInt(thr(g))}`,
      pass: g.pass,
    };
  }
  const spec = SPECS[g.name];
  if (!spec) {
    return { name: g.name, label: g.name.replace(/_/g, " "), value: g.value === null ? na : String(g.value), threshold: String(g.threshold), pass: g.pass };
  }
  return { name: g.name, label: spec.label, value: spec.value(g), threshold: spec.threshold(g), pass: g.pass };
}

export const KNOWN_GATES = [...Object.keys(SPECS), "swaps_last_6h"];

const VERDICT_RULE = "UsePod doesn't flag the trading as circular or concentrated";
const MARKET_RULE = "A live price and pool liquidity";

/**
 * One plain sentence per gate, using the run's own thresholds. Null for gates we don't describe.
 * Several gates can share a sentence (price and liquidity), so callers should dedupe.
 */
export function gateRule(g: Gate): string | null {
  const t = Number(g.threshold);
  const trades = TRADES.exec(g.name);
  if (trades) return `At least ${formatInt(t)} trades in the last ${trades[1]} hours`;
  switch (g.name) {
    case "holders":
      return `At least ${formatInt(t)} holders`;
    case "volume_24h_usd":
      return `At least ${formatUsd(t)} traded in the last 24 hours`;
    case "price_impact":
      return `The buy moves the price less than ${formatFractionPct(t)}`;
    case "spot_over_vwap":
      return `The price is no more than ${Number(t.toFixed(2))}x its 6 hour average`;
    case "slice_lamports":
      return `At least ${solFromLamports(t)} SOL to spend`;
    case "cap": {
      const of = /\(([^)]*)\)/.exec(String(g.threshold))?.[1];
      return of ? `The stake is under ${of}` : "The stake is under the cap";
    }
    case "cooldown_sec_left":
      return "Enough time since the last buy";
    case "price_usd":
    case "liquidity_usd":
      return MARKET_RULE;
    case "usepod_quote_lamports":
      return `UsePod's check costs no more than ${solTiny(t)} SOL`;
    case "usepod_verdict":
    case "usepod":
      return VERDICT_RULE;
    default:
      return null;
  }
}

/**
 * The buy rules, in the order the agent evaluates them. The UsePod verdict is always listed: the agent requires
 * a "buy" verdict (decide.ts, gate "usepod_verdict") but a dry run never pays for it, so it may be missing from the gates.
 */
export function buyRules(gates: Gate[]): string[] {
  const rules: string[] = [];
  for (const g of gates) {
    const r = gateRule(g);
    if (r && !rules.includes(r)) rules.push(r);
  }
  if (!rules.includes(VERDICT_RULE)) rules.push(VERDICT_RULE);
  return rules;
}

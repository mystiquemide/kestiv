export const shortAddress = (a: string, n = 4): string => (a.length <= n * 2 + 1 ? a : `${a.slice(0, n)}…${a.slice(-n)}`);

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 });
const int = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

/** Raw token amount to a compact human number ("1.24M"). */
export function tokensCompact(raw: string, decimals: number): string {
  const v = Number(BigInt(raw)) / 10 ** decimals;
  return v === 0 ? "0" : compact.format(v);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dateUtc(tsSec: number): string {
  const d = new Date(tsSec * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function solFromLamports(lamports: number): string {
  const sol = lamports / 1e9;
  if (sol === 0) return "0";
  return Number(sol.toFixed(sol < 1 ? 4 : 2)).toString();
}

export const formatInt = (n: number): string => int.format(n);

export function formatUsd(n: number): string {
  return n >= 100 ? `$${int.format(n)}` : `$${n.toFixed(2)}`;
}

/** Fraction (0.0164) to percent text ("1.64%"). */
export function formatFractionPct(f: number): string {
  return `${Number((f * 100).toFixed(2))}%`;
}

/** Percent string from the chain view ("1.5000") to two decimals. */
export const formatStakePct = (pct: string): string => `${Number(pct).toFixed(2)}%`;

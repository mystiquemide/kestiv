import type { SwapEvent } from "../chain/swaps.js";

export const SYSTEM_PROMPT = `You review recent trades of a Solana token before an automated buyer adds to the founder's locked stake. You never recommend sizes or prices. Reply with JSON only, no prose: {"verdict":"buy"|"skip","reason":"<at most 20 words>"}. Reply skip if the trading looks circular or concentrated: the same wallets repeatedly buying and selling similar sizes, 3 or fewer wallets making more than half of the SOL volume, or buys and sells alternating in near-identical amounts. Otherwise reply buy.`;

export function buildUserPrompt(mint: string, swaps: SwapEvent[], nowSec: number): string {
  const ordered = [...swaps].sort((a, b) => a.ts - b.ts);
  const ids = new Map<string, string>();
  const rows = ordered.map((s) => {
    if (!ids.has(s.wallet)) ids.set(s.wallet, `w${ids.size + 1}`);
    const minutesAgo = Math.max(0, Math.round((nowSec - s.ts) / 60));
    return `${minutesAgo},${s.side},${(s.solAmount / 1e9).toFixed(4)},${ids.get(s.wallet)}`;
  });
  return `Token ${mint}. Last ${ordered.length} trades, oldest first. Columns: minutes_ago,side,sol,wallet\n${rows.join("\n")}`;
}

export function buildMessages(mint: string, swaps: SwapEvent[], nowSec: number) {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(mint, swaps, nowSec) },
  ];
}

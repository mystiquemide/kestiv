import type { SwapEvent } from "../chain/swaps.js";

export type VolumeSource = "clawpump" | "swaps_24h" | "swaps_lower_bound";

export interface Volume {
  usd: number | null;
  source: VolumeSource | null;
}

const DAY = 86_400;

/**
 * ClawPump's 24h volume when present, otherwise the parsed-swap fallback.
 * The fallback is a lower bound whenever the oldest fetched swap is newer than 24h
 * (the fetch is capped, so older trades may exist that we did not see).
 */
export function resolveVolume(clawpumpUsd: number | null, swaps: SwapEvent[], nowSec: number, solUsd: number): Volume {
  if (clawpumpUsd !== null) return { usd: clawpumpUsd, source: "clawpump" };
  if (swaps.length === 0) return { usd: null, source: null };
  const sinceSec = nowSec - DAY;
  const lamports = swaps.filter((s) => s.ts >= sinceSec && s.ts <= nowSec).reduce((sum, s) => sum + s.solAmount, 0);
  const oldest = Math.min(...swaps.map((s) => s.ts));
  return { usd: (lamports / 1e9) * solUsd, source: oldest > sinceSec ? "swaps_lower_bound" : "swaps_24h" };
}

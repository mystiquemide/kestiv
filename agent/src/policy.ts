import { readFileSync } from "node:fs";
import { z } from "zod";

export interface Policy {
  stakeShareBps: number;
  capBps: number;
  minVolume24hUsd: number;
  minHolders: number;
  minSliceLamports: number;
  liquidityShareBps: number;
  maxPriceImpact: number;
  slippageBps: number;
  vwapWindowSec: number;
  vwapMinSwaps: number;
  maxSpotOverVwap: number;
  cooldownMinSec: number;
  cooldownMaxSec: number;
  opsReserveLamports: number;
  /** SOL reserved for each new lock: rent for its accounts plus the network fee. Measured at about 0.0048 SOL. */
  lockRentLamports: number;
  maxUsepodLamports: number;
  maxPriorityFeeLamports: number;
  swapsForSignals: number;
  swapsForUsepod: number;
}

export const DEFAULT_POLICY: Policy = {
  stakeShareBps: 5000,
  capBps: 700,
  minVolume24hUsd: 2000,
  minHolders: 25,
  minSliceLamports: 50_000_000,
  liquidityShareBps: 100,
  maxPriceImpact: 0.025,
  slippageBps: 100,
  vwapWindowSec: 6 * 3600,
  vwapMinSwaps: 5,
  maxSpotOverVwap: 1.3,
  cooldownMinSec: 30 * 60,
  cooldownMaxSec: 90 * 60,
  opsReserveLamports: 20_000_000,
  lockRentLamports: 6_000_000,
  maxUsepodLamports: 300_000,
  maxPriorityFeeLamports: 1_000_000,
  swapsForSignals: 200,
  swapsForUsepod: 200,
};

const num = z.number().finite();
const overrideSchema = z
  .object({
    stakeShareBps: num.int().min(0).max(10_000),
    capBps: num.int().min(1).max(1500),
    minVolume24hUsd: num.min(0),
    minHolders: num.int().min(0),
    minSliceLamports: num.int().min(1),
    liquidityShareBps: num.int().min(1).max(10_000),
    maxPriceImpact: num.gt(0).max(1),
    slippageBps: num.int().min(1).max(5000),
    vwapWindowSec: num.int().min(60),
    vwapMinSwaps: num.int().min(1),
    maxSpotOverVwap: num.gt(1),
    cooldownMinSec: num.int().min(0),
    cooldownMaxSec: num.int().min(0),
    opsReserveLamports: num.int().min(0),
    lockRentLamports: num.int().min(0),
    maxUsepodLamports: num.int().min(0),
    maxPriorityFeeLamports: num.int().min(0),
    swapsForSignals: num.int().min(1),
    swapsForUsepod: num.int().min(1),
  })
  .partial()
  .strict();

export function loadPolicy(path?: string): Policy {
  if (!path) return { ...DEFAULT_POLICY };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("could not read policy file (missing or not JSON)");
  }
  const parsed = overrideSchema.safeParse(raw);
  if (!parsed.success) {
    const keys = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "(root)"))];
    throw new Error(`invalid policy file: ${keys.join(", ")}`);
  }
  const policy = { ...DEFAULT_POLICY, ...parsed.data };
  if (policy.cooldownMaxSec < policy.cooldownMinSec) throw new Error("invalid policy file: cooldownMaxSec < cooldownMinSec");
  return policy;
}

export type CapCheck = { level: "ok" | "warn" | "reject"; message: string };

export function checkCap(capBps: number): CapCheck {
  if (capBps > 1500) return { level: "reject", message: `cap ${capBps / 100}% is above the 15% hard limit` };
  if (capBps > 1000) return { level: "warn", message: `cap ${capBps / 100}% is above 10%` };
  return { level: "ok", message: "" };
}

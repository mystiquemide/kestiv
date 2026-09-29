import type { Policy } from "../policy.js";

export type Action = "BUY" | "WAIT" | "SKIP" | "CAP_REACHED" | "CONTINUE";

export interface Gate {
  name: string;
  value: number | string | null;
  threshold: number | string;
  pass: boolean;
}

export interface DecideInputs {
  nowSec: number;
  capReached?: boolean;
  capInfo?: { stakeTokens: string; capTokens: string };
  cooldownUntilSec?: number;
  priceUsd?: number | null;
  volume24hUsd?: number | null;
  holders?: number | null;
  liquidityUsd?: number | null;
  swapsInWindow?: number;
  spendableLamports?: number;
  liquidityCapLamports?: number | null;
  capHeadroomLamports?: number | null;
  quote?: { priceImpact: number; spotLamportsPerToken: number };
  vwapLamportsPerToken?: number | null;
  usepod?: { outcome: "ok" | "dry_run_quote_only" | "quote_too_high" | "unavailable"; verdict?: "buy" | "skip"; reason?: string; lamports?: number };
}

export interface Decision {
  action: Action;
  reason: string;
  details: { gates: Gate[]; sliceLamports?: number; note?: string };
}

const defined = <T>(v: T | undefined): v is T => v !== undefined;

export function decide(input: DecideInputs, policy: Policy): Decision {
  const gates: Gate[] = [];
  let failure: { action: Action; reason: string } | undefined;
  const add = (g: Gate, action: Action, reason: string) => {
    gates.push(g);
    if (!g.pass && !failure) failure = { action, reason };
  };
  let sliceLamports: number | undefined;

  if (defined(input.capReached)) {
    add(
      { name: "cap", value: input.capInfo ? `${input.capInfo.stakeTokens} tokens` : String(input.capReached), threshold: input.capInfo ? `${input.capInfo.capTokens} tokens (${policy.capBps / 100}% of supply)` : `${policy.capBps / 100}% of supply`, pass: !input.capReached },
      "CAP_REACHED",
      "cap_reached",
    );
  }

  if (defined(input.cooldownUntilSec)) {
    const left = Math.max(0, input.cooldownUntilSec - input.nowSec);
    add({ name: "cooldown_sec_left", value: left, threshold: 0, pass: left === 0 }, "WAIT", "cooldown");
  }

  if (defined(input.priceUsd) || input.priceUsd === null) {
    add({ name: "price_usd", value: input.priceUsd, threshold: "available", pass: input.priceUsd !== null && input.priceUsd > 0 }, "WAIT", "price_unavailable");
  }

  if (defined(input.volume24hUsd) || input.volume24hUsd === null) {
    const v = input.volume24hUsd;
    add(
      { name: "volume_24h_usd", value: v, threshold: policy.minVolume24hUsd, pass: v !== null && v >= policy.minVolume24hUsd },
      "WAIT",
      v === null ? "volume_unavailable" : "volume_below_min",
    );
  }

  if (defined(input.holders) || input.holders === null) {
    const h = input.holders;
    add(
      { name: "holders", value: h, threshold: policy.minHolders, pass: h !== null && h >= policy.minHolders },
      "WAIT",
      h === null ? "holders_unavailable" : "holders_below_min",
    );
  }

  if (defined(input.liquidityUsd) || input.liquidityUsd === null) {
    add({ name: "liquidity_usd", value: input.liquidityUsd, threshold: "available", pass: input.liquidityUsd !== null && input.liquidityUsd > 0 }, "WAIT", "liquidity_unavailable");
  }

  if (defined(input.swapsInWindow)) {
    add(
      { name: `swaps_last_${policy.vwapWindowSec / 3600}h`, value: input.swapsInWindow, threshold: policy.vwapMinSwaps, pass: input.swapsInWindow >= policy.vwapMinSwaps },
      "WAIT",
      "not_enough_trades",
    );
  }

  if (defined(input.spendableLamports)) {
    const liq = input.liquidityCapLamports ?? Number.POSITIVE_INFINITY;
    const head = input.capHeadroomLamports ?? Number.POSITIVE_INFINITY;
    sliceLamports = Math.floor(Math.min(input.spendableLamports, liq, head));
    if (!Number.isFinite(sliceLamports)) sliceLamports = 0;
    let reason = "budget_below_min_slice";
    if (input.spendableLamports >= policy.minSliceLamports) reason = liq < policy.minSliceLamports ? "liquidity_cap_below_min_slice" : "cap_headroom_below_min_slice";
    add(
      { name: "slice_lamports", value: sliceLamports, threshold: policy.minSliceLamports, pass: sliceLamports >= policy.minSliceLamports },
      "WAIT",
      reason,
    );
  }

  if (input.quote) {
    add(
      { name: "price_impact", value: input.quote.priceImpact, threshold: policy.maxPriceImpact, pass: input.quote.priceImpact <= policy.maxPriceImpact },
      "SKIP",
      "price_impact_too_high",
    );
    if (defined(input.vwapLamportsPerToken) && input.vwapLamportsPerToken !== null) {
      const ratio = input.quote.spotLamportsPerToken / input.vwapLamportsPerToken;
      add(
        { name: "spot_over_vwap", value: Number(ratio.toFixed(4)), threshold: policy.maxSpotOverVwap, pass: ratio <= policy.maxSpotOverVwap },
        "SKIP",
        "price_above_vwap",
      );
    }
  }

  if (input.usepod) {
    const u = input.usepod;
    if (u.outcome === "ok") {
      add({ name: "usepod_verdict", value: u.verdict ?? null, threshold: "buy", pass: u.verdict === "buy" }, "SKIP", "usepod_skip");
    } else if (u.outcome === "quote_too_high") {
      add({ name: "usepod_quote_lamports", value: u.lamports ?? null, threshold: policy.maxUsepodLamports, pass: false }, "SKIP", "usepod_quote_too_high");
    } else if (u.outcome === "unavailable") {
      add({ name: "usepod", value: "unavailable", threshold: "available", pass: false }, "SKIP", "usepod_unavailable");
    } else {
      gates.push({ name: "usepod_quote_lamports", value: u.lamports ?? null, threshold: policy.maxUsepodLamports, pass: true });
    }
  }

  const details = { gates, ...(sliceLamports !== undefined ? { sliceLamports } : {}) };
  if (failure) return { action: failure.action, reason: failure.reason, details };
  const complete = input.usepod && input.usepod.outcome === "ok";
  return complete
    ? { action: "BUY", reason: "all_gates_passed", details }
    : { action: "CONTINUE", reason: "gates_passed_so_far", details };
}

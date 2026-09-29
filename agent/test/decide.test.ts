import { describe, expect, it } from "vitest";
import { computeBudget } from "../src/loop/budget.js";
import { decide, type DecideInputs } from "../src/loop/decide.js";
import { DEFAULT_POLICY as P, checkCap, loadPolicy } from "../src/policy.js";

const base: DecideInputs = {
  nowSec: 1_000_000,
  capReached: false,
  cooldownUntilSec: 0,
  priceUsd: 0.00001,
  volume24hUsd: 5000,
  holders: 100,
  liquidityUsd: 100_000,
  swapsInWindow: 20,
  spendableLamports: 200_000_000,
  liquidityCapLamports: 500_000_000,
  capHeadroomLamports: 900_000_000,
};
const full: DecideInputs = {
  ...base,
  quote: { priceImpact: 0.005, spotLamportsPerToken: 1.1 },
  vwapLamportsPerToken: 1,
  usepod: { outcome: "ok", verdict: "buy" },
};

describe("decide", () => {
  it("returns CONTINUE with a slice when the cheap gates pass", () => {
    const d = decide(base, P);
    expect(d.action).toBe("CONTINUE");
    expect(d.details.sliceLamports).toBe(200_000_000);
  });

  it("BUYs when every gate passes", () => {
    const d = decide(full, P);
    expect(d.action).toBe("BUY");
    expect(d.details.gates.every((g) => g.pass)).toBe(true);
  });

  it.each([
    ["cap", { capReached: true }, "CAP_REACHED", "cap_reached"],
    ["cooldown", { cooldownUntilSec: 1_000_100 }, "WAIT", "cooldown"],
    ["price missing", { priceUsd: null }, "WAIT", "price_unavailable"],
    ["volume low", { volume24hUsd: 1999 }, "WAIT", "volume_below_min"],
    ["volume null", { volume24hUsd: null }, "WAIT", "volume_unavailable"],
    ["holders low", { holders: 24 }, "WAIT", "holders_below_min"],
    ["holders null", { holders: null }, "WAIT", "holders_unavailable"],
    ["liquidity null", { liquidityUsd: null }, "WAIT", "liquidity_unavailable"],
    ["few trades", { swapsInWindow: 4 }, "WAIT", "not_enough_trades"],
    ["budget low", { spendableLamports: 49_999_999 }, "WAIT", "budget_below_min_slice"],
    ["liquidity cap low", { liquidityCapLamports: 10_000_000 }, "WAIT", "liquidity_cap_below_min_slice"],
    ["cap headroom low", { capHeadroomLamports: 10_000_000 }, "WAIT", "cap_headroom_below_min_slice"],
    ["impact", { quote: { priceImpact: 0.0151, spotLamportsPerToken: 1 } }, "SKIP", "price_impact_too_high"],
    ["spot over vwap", { quote: { priceImpact: 0.01, spotLamportsPerToken: 1.31 } }, "SKIP", "price_above_vwap"],
    ["usepod skip", { usepod: { outcome: "ok", verdict: "skip" } }, "SKIP", "usepod_skip"],
    ["usepod quote", { usepod: { outcome: "quote_too_high", lamports: 999_999 } }, "SKIP", "usepod_quote_too_high"],
    ["usepod down", { usepod: { outcome: "unavailable" } }, "SKIP", "usepod_unavailable"],
  ] as [string, Partial<DecideInputs>, string, string][])("%s", (_n, patch, action, reason) => {
    const d = decide({ ...full, ...patch }, P);
    expect(d.action).toBe(action);
    expect(d.reason).toBe(reason);
  });

  it("passes at the exact thresholds", () => {
    const d = decide({ ...full, volume24hUsd: 2000, holders: 25, swapsInWindow: 5, spendableLamports: 50_000_000, quote: { priceImpact: 0.015, spotLamportsPerToken: 1.3 } }, P);
    expect(d.action).toBe("BUY");
  });

  it("slice is the minimum of budget, liquidity cap and cap headroom", () => {
    expect(decide({ ...base, spendableLamports: 900, liquidityCapLamports: 800_000_000, capHeadroomLamports: 300_000_000 }, P).details.sliceLamports).toBe(900);
    expect(decide({ ...base, spendableLamports: 900_000_000, liquidityCapLamports: 800_000_000, capHeadroomLamports: 300_000_000 }, P).details.sliceLamports).toBe(300_000_000);
  });

  it("reports every gate with value and threshold even after a failure", () => {
    const d = decide({ ...full, volume24hUsd: 10, holders: 1 }, P);
    expect(d.reason).toBe("volume_below_min");
    const names = d.details.gates.map((g) => g.name);
    expect(names).toContain("holders");
    expect(names).toContain("usepod_verdict");
  });
});

describe("computeBudget", () => {
  const args = { stakeShareBps: 5000, spentOnSlices: 0, expenses: 0, walletLamports: 1_000_000_000, opsReserveLamports: 20_000_000 };

  it("fees contribute the stake share, seed contributes all", () => {
    const b = computeBudget({ ...args, inflows: [{ lamports: 100_000_000, source: "fee" }, { lamports: 30_000_000, source: "seed" }] });
    expect(b.budgetedLamports).toBe(80_000_000);
    expect(b.spendableLamports).toBe(80_000_000);
  });

  it("subtracts slices and expenses", () => {
    const b = computeBudget({ ...args, spentOnSlices: 50_000_000, expenses: 5_000_000, inflows: [{ lamports: 200_000_000, source: "seed" }] });
    expect(b.remainingLamports).toBe(145_000_000);
  });

  it("never spends below the ops reserve", () => {
    const b = computeBudget({ ...args, walletLamports: 60_000_000, inflows: [{ lamports: 900_000_000, source: "seed" }] });
    expect(b.spendableLamports).toBe(40_000_000);
    expect(computeBudget({ ...args, walletLamports: 10_000_000, inflows: [{ lamports: 900_000_000, source: "seed" }] }).spendableLamports).toBe(0);
  });

  it("never goes negative", () => {
    expect(computeBudget({ ...args, spentOnSlices: 500, inflows: [] }).remainingLamports).toBe(0);
  });
});

describe("policy", () => {
  it("cap check warns above 10% and rejects above 15%", () => {
    expect(checkCap(700).level).toBe("ok");
    expect(checkCap(1000).level).toBe("ok");
    expect(checkCap(1001).level).toBe("warn");
    expect(checkCap(1500).level).toBe("warn");
    expect(checkCap(1501).level).toBe("reject");
  });

  it("defaults match the brief", () => {
    expect(P).toMatchObject({ stakeShareBps: 5000, capBps: 700, minVolume24hUsd: 2000, minHolders: 25, minSliceLamports: 50_000_000, maxPriceImpact: 0.015, slippageBps: 100, opsReserveLamports: 20_000_000, maxUsepodLamports: 300_000 });
    expect(loadPolicy()).toEqual(P);
  });
});

import { describe, expect, it } from "vitest";
import { KNOWN_GATES, gateView, type Gate } from "../lib/gates";

const g = (name: string, value: Gate["value"], threshold: Gate["threshold"], pass = true, source?: string): Gate => ({ name, value, threshold, pass, ...(source ? { source } : {}) });
const v = (x: Gate) => {
  const r = gateView(x);
  return [r.label, r.value, r.threshold, r.pass];
};

describe("gate labels and formatting", () => {
  it("cap", () => {
    expect(v(g("cap", "0 tokens", "69999360800427 tokens (7% of supply)"))).toEqual(["Stake cap", "Under the cap", "max 7% of supply", true]);
    expect(v(g("cap", "70 tokens", "70 tokens (7% of supply)", false))[1]).toBe("Reached");
  });

  it("cooldown shows none or minutes left", () => {
    expect(v(g("cooldown_sec_left", 0, 0))).toEqual(["Pause between buys", "none", "none", true]);
    expect(v(g("cooldown_sec_left", 721, 0, false))[1]).toBe("13 min left");
  });

  it("price, liquidity and volume in dollars", () => {
    expect(v(g("price_usd", 0.000004177, "available"))).toEqual(["Token price", "$0.00000418", "needed", true]);
    expect(v(g("price_usd", null, "available", false))[1]).toBe("Missing");
    expect(v(g("liquidity_usd", 443.9364, "available"))).toEqual(["Pool liquidity", "$444", "needed", true]);
    expect(v(g("volume_24h_usd", 2818.69, 2000, true, "clawpump"))).toEqual(["24h volume", "$2,819", "min $2,000", true]);
  });

  it("volume from swaps lower bound reads 'at least'", () => {
    expect(v(g("volume_24h_usd", 2818.69, 2000, true, "swaps_lower_bound"))[1]).toBe("at least $2,819");
    expect(v(g("volume_24h_usd", 1200, 2000, false, "swaps_24h"))[1]).toBe("$1,200");
    expect(v(g("volume_24h_usd", null, 2000, false))[1]).toBe("n/a");
  });

  it("holders, trades, buy size and price impact", () => {
    expect(v(g("holders", 12345, 25))).toEqual(["Holders", "12,345", "min 25", true]);
    expect(v(g("holders", null, 25, false))[1]).toBe("n/a");
    expect(v(g("swaps_last_6h", 31, 5))).toEqual(["Trades in 6 hours", "31", "min 5", true]);
    expect(v(g("swaps_last_12h", 2, 5, false))[0]).toBe("Trades in 12 hours");
    expect(v(g("slice_lamports", 0, 50_000_000, false))).toEqual(["Buy size", "0 SOL", "min 0.05 SOL", false]);
    expect(v(g("price_impact", 0.016418, 0.025))).toEqual(["Price impact", "1.64%", "max 2.5%", true]);
  });

  it("price against the six hour average", () => {
    expect(v(g("spot_over_vwap", 1.1295, 1.3))).toEqual(["Price vs 6h average", "1.13x", "max 1.3x the 6h average", true]);
  });

  it("UsePod cost in SOL and the verdict", () => {
    expect(v(g("usepod_quote_lamports", 228, 300_000))).toEqual(["UsePod check cost", "0.000000228 SOL", "max 0.0003 SOL", true]);
    expect(v(g("usepod_verdict", "buy", "buy"))).toEqual(["UsePod second opinion", "Buy", "Buy", true]);
    expect(v(g("usepod_verdict", "skip", "buy", false))[1]).toBe("Skip");
    expect(v(g("usepod", "unavailable", "available", false))).toEqual(["UsePod second opinion", "Unavailable", "Available", false]);
  });

  it("falls back to the name with spaces and the raw value for unknown gates", () => {
    expect(v(g("some_new_check", 42, "max 3", false))).toEqual(["some new check", "42", "max 3", false]);
    expect(v(g("another_check", null, 1))[1]).toBe("n/a");
  });

  it("covers every gate name the agent emits", () => {
    for (const name of ["cap", "cooldown_sec_left", "price_usd", "volume_24h_usd", "holders", "liquidity_usd", "swaps_last_6h", "slice_lamports", "price_impact", "spot_over_vwap", "usepod_quote_lamports", "usepod_verdict", "usepod"]) {
      expect(KNOWN_GATES).toContain(name);
      const label = gateView(g(name, 1, 1)).label;
      expect(label).not.toBe(name.replace(/_/g, " "));
    }
  });
});

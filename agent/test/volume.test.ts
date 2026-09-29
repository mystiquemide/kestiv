import { describe, expect, it } from "vitest";
import type { SwapEvent } from "../src/chain/swaps.js";
import { resolveVolume } from "../src/loop/volume.js";

const NOW = 1_000_000;
const DAY = 86_400;
const sw = (ts: number, sol: number): SwapEvent => ({ sig: String(ts), ts, wallet: "w", side: "buy", tokenAmount: 1n, solAmount: sol * 1e9 });

describe("resolveVolume", () => {
  it("prefers ClawPump's figure", () => {
    expect(resolveVolume(1234, [sw(NOW - 10, 5)], NOW, 100)).toEqual({ usd: 1234, source: "clawpump" });
    expect(resolveVolume(0, [], NOW, 100)).toEqual({ usd: 0, source: "clawpump" });
  });

  it("swaps_24h when the fetched swaps reach back at least 24h", () => {
    const v = resolveVolume(null, [sw(NOW - 10, 2), sw(NOW - DAY + 5, 3), sw(NOW - DAY - 50, 40)], NOW, 100);
    expect(v.source).toBe("swaps_24h");
    expect(v.usd).toBeCloseTo(500);
  });

  it("swaps_lower_bound when the oldest fetched swap is newer than 24h", () => {
    const v = resolveVolume(null, [sw(NOW - 10, 2), sw(NOW - 3600, 3)], NOW, 100);
    expect(v).toMatchObject({ source: "swaps_lower_bound" });
    expect(v.usd).toBeCloseTo(500);
  });

  it("an oldest swap exactly 24h old counts as covering the window", () => {
    expect(resolveVolume(null, [sw(NOW - 10, 1), sw(NOW - DAY, 1)], NOW, 100).source).toBe("swaps_24h");
  });

  it("is unavailable only with no swaps and no ClawPump figure", () => {
    expect(resolveVolume(null, [], NOW, 100)).toEqual({ usd: null, source: null });
  });

  it("ignores swaps outside the window when summing", () => {
    expect(resolveVolume(null, [sw(NOW - 10, 1), sw(NOW - DAY - 1, 100)], NOW, 100).usd).toBeCloseTo(100);
  });
});

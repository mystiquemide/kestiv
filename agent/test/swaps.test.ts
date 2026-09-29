import { describe, expect, it } from "vitest";
import { parseSwap, vwap, type SwapEvent } from "../src/chain/swaps.js";
import { loadFixture } from "./fixtures.js";

describe("parseSwap on real mainnet transactions", () => {
  it("parses a pump.fun bonding curve sell", () => {
    const { tx, mint, signature } = loadFixture("bonding-0");
    const s = parseSwap(tx, mint)!;
    expect(s.sig).toBe(signature);
    expect(s.side).toBe("sell");
    expect(s.tokenAmount).toBe(5823655770421n);
    expect(s.solAmount).toBeGreaterThan(1_000_000_000);
    expect(s.ts).toBe(tx.blockTime);
  });

  it("parses a router-driven bonding curve buy", () => {
    const { tx, mint } = loadFixture("bonding-1");
    const s = parseSwap(tx, mint)!;
    expect(s.side).toBe("buy");
    expect(s.tokenAmount).toBe(510541417292n);
    expect(s.solAmount).toBeGreaterThan(100_000_000);
  });

  it("parses PumpSwap trades routed through Jupiter", () => {
    for (const name of ["pumpswap-0", "pumpswap-1"]) {
      const { tx, mint } = loadFixture(name);
      const s = parseSwap(tx, mint)!;
      expect(s.side).toBe("buy");
      expect(s.tokenAmount).toBeGreaterThan(0n);
      expect(s.solAmount).toBeGreaterThan(0);
      expect(s.wallet).toBe(String(tx.transaction.message.accountKeys[0]!.pubkey));
    }
  });

  it("skips transactions where the signer holds no token delta", () => {
    for (const name of ["nonswap-0", "nonswap-1"]) {
      const { tx, mint } = loadFixture(name);
      expect(parseSwap(tx, mint)).toBeNull();
    }
  });

  it("skips failed transactions", () => {
    const { tx, mint } = loadFixture("bonding-0");
    expect(parseSwap({ ...tx, meta: { ...tx.meta!, err: { InstructionError: [0, "x"] } } }, mint)).toBeNull();
  });
});

describe("vwap", () => {
  const sw = (ts: number, sol: number, tok: bigint): SwapEvent => ({
    sig: String(ts),
    ts,
    wallet: "w",
    side: "buy",
    tokenAmount: tok,
    solAmount: sol,
  });

  it("weights by volume inside the window", () => {
    const swaps = [sw(1000, 100, 100n), sw(990, 300, 100n), sw(100, 9999, 1n)];
    expect(vwap(swaps, 60, 1000)).toBe(2);
  });

  it("returns null with no trades in the window", () => {
    expect(vwap([sw(10, 1, 1n)], 60, 1000)).toBeNull();
    expect(vwap([], 60, 1000)).toBeNull();
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePrice } from "../src/clawpump/price.js";
import { parseQuote, parseSwapResponse } from "../src/swap/jupiter.js";
import { assertAllowedPrograms } from "../src/chain/guard.js";
import { ALLOWED_PROGRAMS } from "../src/chain/allowlist.js";

const read = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), "utf8"));

describe("jupiter fixtures (recorded from the live API)", () => {
  it("parses the quote", () => {
    const q = parseQuote(read("jupiter-quote"));
    expect(q.inLamports).toBe(50_000_000n);
    expect(q.outAmount).toBeGreaterThan(0n);
    expect(q.minOutAmount).toBeLessThanOrEqual(q.outAmount);
    expect(q.priceImpact).toBeGreaterThan(0);
    expect(q.priceImpact).toBeLessThan(1);
    expect(q.routeLabels).toContain("Pump.fun");
    expect(q.raw.slippageBps).toBe(100);
  });

  it("parses the swap response into a versioned transaction that passes the allowlist", () => {
    const s = parseSwapResponse(read("jupiter-swap"));
    expect(s.lastValidBlockHeight).toBeGreaterThan(0);
    expect(s.transaction.message.recentBlockhash.length).toBeGreaterThan(30);
    expect(() => assertAllowedPrograms(s.transaction, ALLOWED_PROGRAMS)).not.toThrow();
  });

  it("rejects a malformed quote", () => {
    expect(() => parseQuote({ inAmount: "1" })).toThrow();
  });
});

describe("clawpump fixtures (recorded from the live API)", () => {
  it("parses a token price with null volume and market cap", () => {
    const p = parsePrice(read("clawpump-price-token"));
    expect(p.priceUsd).toBeGreaterThan(0);
    expect(p.liquidityUsd).toBeGreaterThan(0);
    expect(p.volume24hUsd).toBeNull();
    expect(p.marketCapUsd).toBeNull();
  });

  it("parses the SOL price", () => {
    const p = parsePrice(read("clawpump-price-sol"));
    expect(p.priceUsd).toBeGreaterThan(1);
    expect(p.liquidityUsd).toBeNull();
  });

  it("rejects a payload without a mint", () => {
    expect(() => parsePrice({ price: 1 })).toThrow();
  });
});


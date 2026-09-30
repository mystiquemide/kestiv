import { describe, expect, it } from "vitest";
import { DUST_TOKENS, depositForBalance } from "../src/lock/fee.js";

// What the SDK pulls from the sender for a deposit: deposit * (1e6 + fee * 1e4) / 1e6 (calculateTotalAmountToDeposit).
const pulled = (deposit: bigint, feePercent: number) => (deposit * (1_000_000n + BigInt(Math.round(feePercent * 10_000)))) / 1_000_000n;

describe("deposit that leaves room for Streamflow's token fee", () => {
  it("the deposit plus the 0.19% fee never exceeds the balance", () => {
    for (const balance of [1n, 999n, 10_000n, 1_763_352_433_045n, 70_000_000_000_000n, 123_456_789_012_345n]) {
      const d = depositForBalance(balance, 0.19);
      expect(pulled(d, 0.19), String(balance)).toBeLessThanOrEqual(balance);
    }
  });

  it("uses almost all of the balance, leaving only the fee and a rounding unit", () => {
    const balance = 1_763_352_433_045n;
    const d = depositForBalance(balance, 0.19);
    expect(balance - pulled(d, 0.19)).toBeLessThanOrEqual(2n);
    expect(d).toBeLessThan(balance);
    expect(Number(balance - d) / Number(balance)).toBeCloseTo(0.0019, 4);
  });

  it("charges nothing extra where there is no fee (devnet)", () => {
    expect(depositForBalance(1_000_000n, 0)).toBe(999_999n);
  });

  it("never goes negative, and dust is left alone", () => {
    expect(depositForBalance(0n, 0.19)).toBe(0n);
    expect(depositForBalance(1n, 0.19)).toBe(0n);
    expect(DUST_TOKENS).toBe(10_000n);
  });

  it("a bigger fee means a smaller deposit", () => {
    expect(depositForBalance(1_000_000_000n, 0.5)).toBeLessThan(depositForBalance(1_000_000_000n, 0.19));
  });
});

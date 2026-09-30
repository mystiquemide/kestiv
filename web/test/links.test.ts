import { describe, expect, it } from "vitest";
import { pumpFunCoin, solscanAccount, solscanTx, lockUrl } from "../lib/links";
import { isCurrent } from "../lib/nav";

describe("links", () => {
  it("opens a lock on Jupiter Lock on mainnet and on Solscan on devnet", () => {
    expect(lockUrl("ABC", "devnet")).toBe("https://solscan.io/account/ABC?cluster=devnet");
    expect(lockUrl("ABC", "mainnet-beta")).toBe("https://lock.jup.ag/escrow/ABC");
  });

  it("adds the devnet cluster query to Solscan links only on devnet", () => {
    expect(solscanAccount("W", "mainnet-beta")).toBe("https://solscan.io/account/W");
    expect(solscanAccount("W", "devnet")).toBe("https://solscan.io/account/W?cluster=devnet");
    expect(solscanTx("S", "mainnet-beta")).toBe("https://solscan.io/tx/S");
    expect(solscanTx("S", "devnet")).toBe("https://solscan.io/tx/S?cluster=devnet");
  });

  it("builds the pump.fun coin URL", () => {
    expect(pumpFunCoin("M")).toBe("https://pump.fun/coin/M");
  });
});

describe("isCurrent", () => {
  it("matches exact routes and children, never hash links", () => {
    expect(isCurrent("/stake", "/stake")).toBe(true);
    expect(isCurrent("/stake/x", "/stake")).toBe(true);
    expect(isCurrent("/stakes", "/stake")).toBe(false);
    expect(isCurrent("/", "/#faq")).toBe(false);
  });
});

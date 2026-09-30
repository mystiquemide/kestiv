import { describe, expect, it } from "vitest";
import { pumpFunCoin, solscanAccount, solscanTx, streamflowUrl } from "../lib/links";
import { isCurrent } from "../lib/nav";

describe("links", () => {
  it("builds the verified Streamflow contract URL per cluster", () => {
    expect(streamflowUrl("ABC", "devnet")).toBe("https://app.streamflow.finance/contract/solana/devnet/ABC");
    expect(streamflowUrl("ABC", "mainnet-beta")).toBe("https://app.streamflow.finance/contract/solana/mainnet/ABC");
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

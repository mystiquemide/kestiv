import { Keypair } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import { countHolders } from "../src/chain/reads.js";

const mint = Keypair.generate().publicKey;
const respond = (pages: { amount: number | string }[][]) => {
  let i = 0;
  return vi.fn(async () => ({ ok: true, json: async () => ({ result: { token_accounts: pages[i++] ?? [] } }) }) as Response);
};

describe("countHolders", () => {
  it("returns null without a helius rpc", async () => {
    const f = vi.fn();
    expect(await countHolders(mint, { url: "https://api.mainnet-beta.solana.com", kind: "public" }, f as never)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("counts positive balances across pages", async () => {
    const f = respond([[{ amount: 5 }, { amount: 0 }, { amount: "7" }], [{ amount: 1 }]]);
    expect(await countHolders(mint, { url: "https://x", kind: "helius" }, f as never)).toBe(3);
  });

  it("returns null on an rpc error", async () => {
    const f = vi.fn(async () => ({ ok: false }) as Response);
    expect(await countHolders(mint, { url: "https://x", kind: "helius" }, f as never)).toBeNull();
  });
});

import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import { PUMP_PROGRAM_ID } from "../src/chain/allowlist.js";
import { countHolders } from "../src/chain/reads.js";

const mint = Keypair.generate().publicKey;
const helius = { url: "https://x", kind: "helius" as const };
const wallet = () => Keypair.generate().publicKey.toBase58();
const curve = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mint.toBuffer()], new PublicKey(PUMP_PROGRAM_ID))[0].toBase58();

type Acc = { owner?: string; amount: number | string };
const respond = (pages: Acc[][]) => {
  let i = 0;
  return vi.fn(async () => ({ ok: true, json: async () => ({ result: { token_accounts: pages[i++] ?? [] } }) }) as Response) as unknown as typeof fetch;
};

describe("countHolders", () => {
  it("returns null without a helius rpc", async () => {
    const f = vi.fn();
    expect(await countHolders(mint, { url: "https://api.mainnet-beta.solana.com", kind: "public" }, f as never)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("counts distinct owners with a positive balance across pages", async () => {
    const [a, b, c] = [wallet(), wallet(), wallet()];
    const f = respond([[{ owner: a, amount: 5 }, { owner: b, amount: 0 }, { owner: c, amount: "7" }], [{ owner: wallet(), amount: 1 }]]);
    expect(await countHolders(mint, helius, f)).toBe(3);
  });

  it("counts an owner with several token accounts once", async () => {
    const a = wallet();
    const f = respond([[{ owner: a, amount: 5 }, { owner: a, amount: 9 }, { owner: wallet(), amount: 1 }]]);
    expect(await countHolders(mint, helius, f)).toBe(2);
  });

  it("does not count the bonding curve or other PDA owners", async () => {
    const f = respond([[{ owner: curve, amount: "900000000000000" }, { owner: wallet(), amount: 10 }]]);
    expect(await countHolders(mint, helius, f)).toBe(1);
  });

  it("ignores zero-balance and ownerless accounts", async () => {
    const f = respond([[{ owner: wallet(), amount: 0 }, { amount: 4 }, { owner: wallet(), amount: 4 }]]);
    expect(await countHolders(mint, helius, f)).toBe(1);
  });

  it("keeps paging past the first page until an empty page", async () => {
    const page = (n: number) => Array.from({ length: n }, () => ({ owner: wallet(), amount: 1 }));
    const f = respond([page(1000), page(1000), page(5)]);
    expect(await countHolders(mint, helius, f)).toBe(2005);
  });

  it("returns null on an rpc error", async () => {
    const f = vi.fn(async () => ({ ok: false }) as Response) as unknown as typeof fetch;
    expect(await countHolders(mint, helius, f)).toBeNull();
  });
});

import { readFileSync } from "node:fs";
import type { ParsedTransactionWithMeta } from "@solana/web3.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cached, clearChainCache, escrowStep, getStakeView, parseStreamAccount, type FoundStream, type StreamData, type StakeViewDeps } from "../lib/chain";

const fixture = <T>(name: string): T => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8")) as T;

const acct = fixture<{ id: string; data: string }>("devnet-stream");
const FOUNDER = "DC1B96Rw9yftgZN7HYktA47nneFSDbu5mpedkYPxJryB";

describe("parseStreamAccount (real devnet proof contract bytes)", () => {
  const s = parseStreamAccount(acct.id, Buffer.from(acct.data, "base64"));

  it("decodes amounts, schedule and parties", () => {
    expect(s).toMatchObject({
      id: "G28zWX3sniaou4EBCuBBTc1tY4kewyfRU2eT7V65fQiV",
      recipient: FOUNDER,
      mint: "4FsVBoTVt4JvTjiiSuYkiWybdY7f3KjSQ4zByQgLQ8u1",
      depositedAmount: "150000000000",
      withdrawnAmount: "0",
      period: 86_400,
      cliffAmount: "0",
      closed: false,
    });
    expect(s.cliff).toBe(s.start);
    expect(s.end).toBeGreaterThan(s.start);
  });

  it("reads every trust flag, including pausable and canUpdateRate from raw bytes", () => {
    expect(s.flags).toEqual({
      canTopup: true,
      cancelableBySender: false,
      cancelableByRecipient: false,
      transferableBySender: false,
      transferableByRecipient: false,
      automaticWithdrawal: false,
      canUpdateRate: false,
      pausable: false,
    });
  });

  it("reports canUpdateRate and pausable when those bytes are set", () => {
    const data = Buffer.from(acct.data, "base64");
    data[539] = 1;
    data[540] = 1;
    expect(parseStreamAccount(acct.id, data).flags).toMatchObject({ pausable: true, canUpdateRate: true });
  });
});

describe("escrowStep (real devnet create and topup transactions)", () => {
  const s = parseStreamAccount(acct.id, Buffer.from(acct.data, "base64"));
  const tx = (n: string) => fixture<ParsedTransactionWithMeta>(n);

  it("reads the create as 100,000 tokens and the topup as 50,000", () => {
    expect(escrowStep(tx("devnet-create-tx"), s.id, s.escrowTokens)).toEqual({ kind: "create", amount: 100_000_000_000n });
    expect(escrowStep(tx("devnet-topup-tx"), s.id, s.escrowTokens)).toEqual({ kind: "topup", amount: 50_000_000_000n });
  });

  it("ignores transactions that do not touch the escrow or that failed", () => {
    expect(escrowStep(tx("devnet-topup-tx"), s.id, "11111111111111111111111111111111")).toBeNull();
    const failed = { ...tx("devnet-topup-tx"), meta: { ...tx("devnet-topup-tx").meta!, err: { InstructionError: [0, { Custom: 131 }] } } };
    expect(escrowStep(failed as ParsedTransactionWithMeta, s.id, s.escrowTokens)).toBeNull();
  });
});

const baseEnv = { heliusApiKey: "k", cluster: "mainnet-beta" as const, mint: "MINT", wallet: "WALLET", founder: FOUNDER, statusUrl: undefined, repoUrl: undefined };
const stream = (over: Partial<StreamData> = {}): StreamData => ({
  id: "STREAM",
  sender: "WALLET",
  recipient: FOUNDER,
  mint: "MINT",
  escrowTokens: "ESC",
  depositedAmount: "15000000",
  withdrawnAmount: "0",
  start: 2_000,
  cliff: 2_000,
  end: 2_000 + 365 * 86_400,
  period: 86_400,
  amountPerPeriod: "41096",
  cliffAmount: "0",
  createdAt: 1_000,
  closed: false,
  flags: { canTopup: true, cancelableBySender: false, cancelableByRecipient: false, transferableBySender: false, transferableByRecipient: false, automaticWithdrawal: false, canUpdateRate: false, pausable: false },
  ...over,
});
const deps = (found: FoundStream | null, over: Partial<StakeViewDeps> = {}): StakeViewDeps => ({
  env: baseEnv,
  capBps: async () => null,
  nowSec: () => 1_000,
  supply: async () => ({ supply: "1000000000", decimals: 6 }),
  find: async () => found,
  steps: async () => [{ sig: "S1", ts: 1_500, kind: "create", amount: "15000000" }],
  ...over,
});

describe("getStakeView state selection", () => {
  it("not_launched without a mint, without touching the chain", async () => {
    const find = vi.fn();
    const v = await getStakeView({ ...deps(null, { find }), env: { ...baseEnv, mint: undefined } });
    expect(v).toEqual({ state: "not_launched" });
    expect(find).not.toHaveBeenCalled();
  });

  it("no_contract when the mint is set but no stream exists", async () => {
    const v = await getStakeView(deps(null));
    expect(v).toMatchObject({ state: "no_contract", mint: "MINT", supply: "1000000000", decimals: 6, capBps: 700, rpcKind: "helius" });
  });

  it("active with stake percent, vesting numbers and steps", async () => {
    const v = await getStakeView(deps({ stream: stream(), multiple: false }));
    expect(v.state).toBe("active");
    if (v.state !== "active") throw new Error("unreachable");
    expect(v).toMatchObject({ contractId: "STREAM", stakePct: "1.5000", recipient: FOUNDER, locked: "15000000", vested: "0", nextUnlock: 2_000, multiple: false });
    expect(v.steps).toHaveLength(1);
  });

  it("cap_reached when locked stake is at least capBps of supply", async () => {
    const v = await getStakeView(deps({ stream: stream({ depositedAmount: "70000000" }), multiple: false }));
    expect(v.state).toBe("cap_reached");
  });

  it("uses the agent's cap when available and subtracts withdrawals from the stake", async () => {
    const big = stream({ depositedAmount: "90000000", withdrawnAmount: "30000000" });
    expect((await getStakeView(deps({ stream: big, multiple: false }, { capBps: async () => 500 }))).state).toBe("cap_reached");
    expect((await getStakeView(deps({ stream: big, multiple: false }, { capBps: async () => 700 }))).state).toBe("active");
  });

  it("flags multiple contracts", async () => {
    const v = await getStakeView(deps({ stream: stream(), multiple: true }));
    expect(v).toMatchObject({ multiple: true });
  });

  it("returns rpc_error with no partial numbers and never leaks the key", async () => {
    const v = await getStakeView(deps(null, { supply: async () => { throw new Error("boom https://mainnet.helius-rpc.com/?api-key=SECRET123 failed"); } }));
    expect(v).toMatchObject({ state: "rpc_error", rpcKind: "helius" });
    expect(JSON.stringify(v)).not.toContain("SECRET123");
    expect(v).not.toHaveProperty("supply");
  });

  it("reports public rpc kind without a Helius key and errors when wallets are missing", async () => {
    const v = await getStakeView({ ...deps(null), env: { ...baseEnv, heliusApiKey: undefined, wallet: undefined } });
    expect(v).toMatchObject({ state: "rpc_error", rpcKind: "public" });
  });
});

describe("cached", () => {
  beforeEach(() => clearChainCache());

  it("reuses a value for 30 seconds and does not cache failures", async () => {
    let t = 0;
    const fn = vi.fn(async () => "v");
    expect(await cached("k", fn, () => t)).toBe("v");
    t = 29_000;
    await cached("k", fn, () => t);
    expect(fn).toHaveBeenCalledTimes(1);
    t = 31_000;
    await cached("k", fn, () => t);
    expect(fn).toHaveBeenCalledTimes(2);

    const bad = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce("ok");
    await expect(cached("e", bad, () => t)).rejects.toThrow();
    expect(await cached("e", bad, () => t)).toBe("ok");
  });
});

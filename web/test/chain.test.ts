import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cached, clearChainCache, getStakeView, stepsOf, type StakeViewDeps } from "../lib/chain";
import { guaranteesOf, isFounderLock, lockTotals, parseLockAccount, type LockData } from "../lib/lock";

const fixture = <T>(name: string): T => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8")) as T;

const acct = fixture<{ id: string; data: string }>("devnet-lock");
const FOUNDER = "DC1B96Rw9yftgZN7HYktA47nneFSDbu5mpedkYPxJryB";
const DAY = 86_400;

describe("parseLockAccount (real devnet proof lock bytes)", () => {
  const l = parseLockAccount(acct.id, Buffer.from(acct.data, "base64"));

  it("decodes the parties, amounts and schedule", () => {
    expect(l).toMatchObject({
      id: "5hdB38wWZw6THDLvJyYGCHu2oPEutYz7MfmVkifZvb3s",
      recipient: FOUNDER,
      mint: "7DvZoDAQvv1XdcFSauT1LKYjkE8o5DuZiWjbGpZYE37Y",
      creator: "6ML4WUqTnPm8kNrpWCEMSBhrmE2N3zFocdrEPDJGe8Es",
      frequency: DAY,
      periods: 365,
      cliffUnlockAmount: "0",
      amountPerPeriod: "273972602",
      claimed: "0",
      deposited: "99999999730",
      tokenProgramFlag: 1,
    });
    expect(l.cliff - l.start).toBe(90 * DAY);
    expect(l.end).toBe(l.cliff + 365 * DAY);
  });

  it("reads who can cancel and who can change the recipient from the bytes", () => {
    expect(l).toMatchObject({ cancelMode: 0, updateRecipientMode: 0, cancelledAt: 0 });
    expect(guaranteesOf([l])).toEqual({ cancelNobody: true, recipientNobody: true });
    const data = Buffer.from(acct.data, "base64");
    data[138] = 1;
    data[137] = 1;
    expect(guaranteesOf([parseLockAccount(acct.id, data)])).toEqual({ cancelNobody: false, recipientNobody: false });
  });

  it("refuses bytes that are not a Jupiter Lock escrow", () => {
    expect(() => parseLockAccount("x", Buffer.alloc(296))).toThrow(/not a Jupiter Lock escrow/);
    expect(() => parseLockAccount("x", Buffer.from(acct.data, "base64").subarray(0, 200))).toThrow();
  });

  it("counts a lock only when the creator, recipient and mint all match", () => {
    const want = { creator: l.creator, recipient: FOUNDER, mint: l.mint };
    expect(isFounderLock(l, want)).toBe(true);
    expect(isFounderLock(l, { ...want, recipient: "OTHER" })).toBe(false);
    expect(isFounderLock(l, { ...want, creator: "OTHER" })).toBe(false);
    expect(isFounderLock(l, { ...want, mint: "OTHER" })).toBe(false);
  });
});

const lock = (id: string, over: Partial<LockData> = {}): LockData => ({
  id, recipient: FOUNDER, mint: "MINT", creator: "WALLET", updateRecipientMode: 0, cancelMode: 0, tokenProgramFlag: 0,
  cliff: 2_000 + 90 * DAY, frequency: DAY, cliffUnlockAmount: "0", amountPerPeriod: "41096", periods: 365, claimed: "0", start: 2_000, cancelledAt: 0,
  deposited: "15000040", end: 2_000 + 455 * DAY, ...over,
});

describe("lockTotals and stepsOf", () => {
  it("adds up every lock and takes the first cliff and the last end", () => {
    const a = lock("A");
    const b = lock("B", { start: 5_000, cliff: 5_000 + 90 * DAY, end: 5_000 + 455 * DAY, deposited: "30000000" });
    const t = lockTotals([a, b], 1_000);
    expect(t).toMatchObject({ deposited: "45000040", claimed: "0", vested: "0", locked: "45000040", cliff: a.cliff, end: b.end });
    expect(t.nextUnlock).toBe(a.cliff + DAY);
    expect(stepsOf([b, a]).map((s) => s.id)).toEqual(["A", "B"]);
  });
});

const baseEnv = { heliusApiKey: "k", cluster: "mainnet-beta" as const, mint: "MINT", wallet: "WALLET", founder: FOUNDER, statusUrl: undefined, repoUrl: undefined };
const deps = (locks: LockData[], over: Partial<StakeViewDeps> = {}): StakeViewDeps => ({
  env: baseEnv,
  capBps: async () => null,
  nowSec: () => 1_000,
  supply: async () => ({ supply: "1000000000", decimals: 6 }),
  locks: async () => locks,
  ...over,
});

describe("getStakeView state selection", () => {
  it("not_launched without a mint, without touching the chain", async () => {
    const locks = vi.fn();
    const v = await getStakeView({ ...deps([], { locks }), env: { ...baseEnv, mint: undefined } });
    expect(v).toEqual({ state: "not_launched" });
    expect(locks).not.toHaveBeenCalled();
  });

  it("no_lock when the mint is set but nothing is locked", async () => {
    const v = await getStakeView(deps([]));
    expect(v).toMatchObject({ state: "no_lock", mint: "MINT", supply: "1000000000", decimals: 6, capBps: 700, rpcKind: "helius" });
  });

  it("active with stake percent, totals, guarantees and steps", async () => {
    const v = await getStakeView(deps([lock("A")]));
    expect(v.state).toBe("active");
    if (v.state !== "active") throw new Error("unreachable");
    expect(v).toMatchObject({ stakePct: "1.5000", recipient: FOUNDER, sender: "WALLET", locked: "15000040", vested: "0", guarantees: { cancelNobody: true, recipientNobody: true } });
    expect(v.nextUnlock).toBe(lock("A").cliff + DAY);
    expect(v.steps).toEqual([{ id: "A", ts: 2_000, amount: "15000040" }]);
  });

  it("adds every lock into one stake", async () => {
    const v = await getStakeView(deps([lock("A"), lock("B", { start: 3_000 })]));
    if (v.state !== "active") throw new Error("expected active");
    expect(v.stakePct).toBe("3.0000");
    expect(v.steps).toHaveLength(2);
  });

  it("cap_reached when locked stake is at least capBps of supply", async () => {
    const v = await getStakeView(deps([lock("A", { deposited: "70000000" })]));
    expect(v.state).toBe("cap_reached");
  });

  it("uses the agent's cap when available", async () => {
    const big = lock("A", { deposited: "60000000" });
    expect((await getStakeView(deps([big], { capBps: async () => 500 }))).state).toBe("cap_reached");
    expect((await getStakeView(deps([big], { capBps: async () => 700 }))).state).toBe("active");
  });

  it("says so when any lock could be cancelled", async () => {
    const v = await getStakeView(deps([lock("A"), lock("B", { cancelMode: 1 })]));
    if (v.state !== "active") throw new Error("expected active");
    expect(v.guarantees).toEqual({ cancelNobody: false, recipientNobody: true });
  });

  it("returns rpc_error with no partial numbers and never leaks the key", async () => {
    const v = await getStakeView(deps([], { supply: async () => { throw new Error("boom https://mainnet.helius-rpc.com/?api-key=SECRET123 failed"); } }));
    expect(v).toMatchObject({ state: "rpc_error", rpcKind: "helius" });
    expect(JSON.stringify(v)).not.toContain("SECRET123");
    expect(v).not.toHaveProperty("supply");
  });

  it("reports public rpc kind without a Helius key and errors when wallets are missing", async () => {
    const v = await getStakeView({ ...deps([]), env: { ...baseEnv, heliusApiKey: undefined, wallet: undefined } });
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

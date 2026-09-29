import { type VersionedTransaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SwapEvent } from "../src/chain/swaps.js";
import { REQUIRED_FLAGS, type FounderVesting } from "../src/lock/read.js";
import { runOnce } from "../src/loop/run.js";
import type { IncomingTransfer, Ports, SigState } from "../src/loop/types.js";
import { DEFAULT_POLICY } from "../src/policy.js";
import { Store } from "../src/store/index.js";

const NOW = 2_000_000;
const WALLET = "WALLET";
const FOUNDER = "FOUNDER";
const MINT = "MINT";
const FEE_SRC = "CLAWPUMP_FORWARDER";

const swaps = (): SwapEvent[] =>
  Array.from({ length: 10 }, (_, i) => ({ sig: `s${i}`, ts: NOW - 600 * (i + 1), wallet: `w${i % 4}`, side: i % 2 ? "sell" : "buy", tokenAmount: 1_000_000_000n, solAmount: 100_000_000 }));

const vesting = (over: Partial<FounderVesting> = {}, flags: Partial<FounderVesting["flags"]> = {}): FounderVesting => ({
  streamId: "STREAM",
  recipient: FOUNDER,
  sender: WALLET,
  mint: MINT,
  depositedAmount: 0n,
  withdrawnAmount: 0n,
  start: 1,
  end: 2,
  period: 86400,
  amountPerPeriod: 1n,
  cliff: 1,
  cliffAmount: 0n,
  closed: false,
  flags: { ...REQUIRED_FLAGS, ...flags },
  ...over,
});

interface Harness {
  ports: Ports;
  store: Store;
  calls: string[];
  state: { tokens: bigint; sol: number; incoming: IncomingTransfer[]; sig: Record<string, SigState>; height: number; stream: FounderVesting };
}

function harness(over: Partial<Ports> = {}): Harness {
  const store = Store.open(":memory:");
  const calls: string[] = [];
  const state = {
    tokens: 0n,
    sol: 2_000_000_000,
    incoming: [] as IncomingTransfer[],
    sig: {} as Record<string, SigState>,
    height: 100,
    stream: vesting(),
  };
  const ports: Ports = {
    dry: false,
    mint: MINT,
    founder: FOUNDER,
    wallet: WALLET,
    policy: DEFAULT_POLICY,
    store,
    chain: {
      solBalance: async () => state.sol,
      tokenBalance: async () => state.tokens,
      mintInfo: async () => ({ decimals: 6, supply: 1_000_000_000_000_000n, tokenProgram: TOKEN_PROGRAM_ID }),
      holders: async () => 100,
      swaps: async () => swaps(),
      incoming: async () => state.incoming,
      sigStatus: async (s) => state.sig[s] ?? { state: "unknown" },
      blockHeight: async () => state.height,
    },
    price: { token: async () => ({ mint: MINT, priceUsd: 0.00001, volume24hUsd: 5000, liquidityUsd: 100_000, marketCapUsd: null, updatedAt: null }), solUsd: async () => 100 },
    swap: {
      quote: async (l) => ({ inLamports: l, outAmount: l * 10n, minOutAmount: l * 9n, priceImpact: 0.005, routeLabels: ["Pump.fun"], raw: {} as never }),
      build: async () => ({ transaction: { message: { recentBlockhash: "BH" } } as unknown as VersionedTransaction, lastValidBlockHeight: 500 }),
    },
    lock: {
      create: async (a) => {
        calls.push(`lock.create:${a}`);
        state.sol -= 180_000_000;
        return { streamId: "STREAM", signature: "LOCKSIG" };
      },
      topup: async (id, a) => {
        calls.push(`lock.topup:${id}:${a}`);
        return { signature: "TOPSIG" };
      },
      read: async () => state.stream,
      expected: { recipient: FOUNDER, mint: MINT, sender: WALLET },
    },
    usepod: { verdict: async () => ({ outcome: "ok", verdict: "buy", reason: "organic", quote: { quoteId: "q", network: "n", payTo: "p", lamports: 100 } }) },
    send: async (_tx, opts) => {
      await opts.onSigned?.("BUYSIG");
      calls.push("send");
      state.tokens += 5_000_000_000n;
      return "BUYSIG";
    },
    transferSol: async (to, lamports, onSigned) => {
      const sig = `TRANSFER${calls.length}`;
      await onSigned?.(sig);
      calls.push(`transfer:${to}:${lamports}`);
      return sig;
    },
    now: () => NOW,
    random: () => 0.5,
    newId: () => "slice-1",
    ...over,
  };
  return { ports, store, calls, state };
}

let h: Harness;
beforeEach(() => {
  h = harness();
  h.state.incoming = [{ sig: "seed1", lamports: 500_000_000, sender: "SEEDER", ts: NOW - 100 }];
});

describe("runOnce buy path", () => {
  it("buys when every gate passes, then locks in the same run", async () => {
    const r = await runOnce(h.ports);
    expect(r).toMatchObject({ state: "BOUGHT", reason: "bought_and_locked" });
    expect(h.calls).toEqual(["send", "lock.create:5000000000"]);
    expect(h.store.getConfig("contract_id")).toBe("STREAM");
    const slice = h.store.db.prepare("SELECT * FROM slices").get() as { status: string; buy_sig: string; lock_sig: string; sol_in: number; last_valid_height: number };
    expect(slice).toMatchObject({ status: "locked", buy_sig: "BUYSIG", lock_sig: "LOCKSIG", sol_in: 500_000_000, last_valid_height: 500 });
    expect(Number(h.store.getConfig("cooldown_until"))).toBe(NOW + 30 * 60 + Math.floor(0.5 * 60 * 60));
    expect(h.store.lastRun()?.state).toBe("BOUGHT");
  });

  it("tops up an existing contract after re-verifying its terms", async () => {
    h.store.setConfig("contract_id", "STREAM");
    await runOnce(h.ports);
    expect(h.calls).toEqual(["send", "lock.topup:STREAM:5000000000"]);
  });

  it("does not buy a second time inside the cooldown", async () => {
    h.store.setConfig("cooldown_until", String(NOW + 60));
    const r = await runOnce(h.ports);
    expect(r).toMatchObject({ state: "WAITING", reason: "cooldown" });
    expect(h.calls).not.toContain("send");
  });

  it("does not pay UsePod or buy when an earlier gate fails", async () => {
    const verdict = vi.fn();
    h = harness({ usepod: { verdict } });
    h.state.incoming = [{ sig: "seed1", lamports: 500_000_000, sender: "S", ts: NOW }];
    (h.ports.chain as { holders: () => Promise<number | null> }).holders = async () => null;
    const r = await runOnce(h.ports);
    expect(r).toMatchObject({ state: "WAITING", reason: "holders_unavailable" });
    expect(verdict).not.toHaveBeenCalled();
  });

  it("a UsePod skip prevents the buy", async () => {
    h.ports.usepod.verdict = async () => ({ outcome: "ok", verdict: "skip", reason: "circular" });
    const r = await runOnce(h.ports);
    expect(r).toMatchObject({ state: "SKIPPED", reason: "usepod_skip" });
    expect(h.calls).toEqual([]);
  });

  it("reports CAP_REACHED and releases unspent budget to the founder", async () => {
    h.store.setConfig("contract_id", "STREAM");
    h.state.stream = vesting({ depositedAmount: 70_000_000_000_000n });
    const r = await runOnce(h.ports);
    expect(r.state).toBe("CAP_REACHED");
    expect(h.calls.some((c) => c.startsWith(`transfer:${FOUNDER}`))).toBe(true);
    expect(h.calls).not.toContain("send");
  });
});

describe("lock-first", () => {
  it("locks tokens already in the wallet before any buy", async () => {
    h.state.tokens = 123n;
    h.store.setConfig("contract_id", "STREAM");
    const order: string[] = [];
    const send = h.ports.send!;
    h.ports.send = async (...a) => {
      order.push("buy");
      return send(...a);
    };
    const topup = h.ports.lock.topup;
    h.ports.lock.topup = async (...a) => {
      order.push("lock");
      return topup(...a);
    };
    await runOnce(h.ports);
    expect(order[0]).toBe("lock");
    expect(order).toContain("buy");
  });

  it("waits when SOL cannot cover contract creation", async () => {
    h.state.tokens = 10n;
    h.state.sol = 100_000_000;
    const r = await runOnce(h.ports);
    expect(r).toMatchObject({ state: "WAITING", reason: "insufficient_sol_for_contract" });
    expect(h.calls).toEqual([]);
  });

  it("refuses to top up a contract whose terms were tampered with", async () => {
    h.state.tokens = 10n;
    h.store.setConfig("contract_id", "STREAM");
    h.state.stream = vesting({}, { cancelableBySender: true });
    const r = await runOnce(h.ports);
    expect(r).toMatchObject({ state: "ERROR", reason: "lock_terms_violation" });
    expect(h.calls).toEqual([]);
  });

  it("marks bought slices locked after a lock", async () => {
    h.store.setConfig("contract_id", "STREAM");
    h.store.insertPendingSlice("old", 1, 1);
    h.store.setSliceSignature("old", "OLDSIG", 10);
    h.store.updateSlice("old", { status: "bought" });
    h.state.tokens = 5n;
    await runOnce(h.ports);
    expect(h.store.db.prepare("SELECT status, lock_sig FROM slices WHERE id='old'").get()).toEqual({ status: "locked", lock_sig: "TOPSIG" });
  });
});

describe("pending slice recovery", () => {
  const pending = (sig: string | null, lastValid = 200) => {
    h.store.insertPendingSlice("p1", 100, 1);
    if (sig) h.store.setSliceSignature("p1", sig, lastValid);
  };
  const status = () => (h.store.db.prepare("SELECT status, reason FROM slices WHERE id='p1'").get() as { status: string; reason: string | null });

  it("confirmed -> bought, and the run continues (tokens get locked)", async () => {
    pending("SIG");
    h.state.sig.SIG = { state: "confirmed" };
    h.state.tokens = 7n;
    h.store.setConfig("contract_id", "STREAM");
    await runOnce(h.ports);
    expect(status().status).toBe("locked");
    expect(h.calls[0]).toBe("lock.topup:STREAM:7");
  });

  it("failed -> failed with reason", async () => {
    pending("SIG");
    h.state.sig.SIG = { state: "failed", err: "boom" };
    await runOnce(h.ports);
    expect(status()).toEqual({ status: "failed", reason: 'tx_failed: boom' });
  });

  it("unknown and within blockhash validity -> WAIT pending_confirmation, no new slice", async () => {
    pending("SIG", 200);
    h.state.height = 150;
    const r = await runOnce(h.ports);
    expect(r).toMatchObject({ state: "WAITING", reason: "pending_confirmation" });
    expect(status().status).toBe("pending");
    expect(h.calls).not.toContain("send");
    expect(h.store.db.prepare("SELECT COUNT(*) AS n FROM slices").get()).toEqual({ n: 1 });
  });

  it("unknown and past blockhash validity -> failed expired", async () => {
    pending("SIG", 200);
    h.state.height = 201;
    await runOnce(h.ports);
    expect(status()).toEqual({ status: "failed", reason: "expired" });
  });

  it("never signed -> failed not_signed", async () => {
    pending(null);
    await runOnce(h.ports);
    expect(status()).toEqual({ status: "failed", reason: "not_signed" });
  });
});

describe("buy signature persistence", () => {
  it("the slice row exists as pending, and the signature is stored, before broadcast", async () => {
    let rowAtBroadcast: { status: string; buy_sig: string | null } | undefined;
    h.ports.send = async (_tx, opts) => {
      const before = h.store.db.prepare("SELECT status, buy_sig FROM slices WHERE id='slice-1'").get() as { status: string; buy_sig: string | null };
      expect(before).toEqual({ status: "pending", buy_sig: null });
      await opts.onSigned?.("SIGNED");
      rowAtBroadcast = h.store.db.prepare("SELECT status, buy_sig FROM slices WHERE id='slice-1'").get() as typeof rowAtBroadcast;
      throw new Error("network down after broadcast attempt");
    };
    const r = await runOnce(h.ports);
    expect(rowAtBroadcast).toEqual({ status: "pending", buy_sig: "SIGNED" });
    expect(r).toMatchObject({ state: "ERROR", reason: "buy_unconfirmed" });
    expect(h.store.slicesByStatus("pending")).toHaveLength(1);
  });

  it("a send failure before signing marks the slice failed", async () => {
    h.ports.send = async () => {
      throw new Error("guard rejected");
    };
    const r = await runOnce(h.ports);
    expect(r).toMatchObject({ state: "ERROR", reason: "buy_failed" });
    expect(h.store.db.prepare("SELECT status, reason FROM slices").get()).toEqual({ status: "failed", reason: "send_error" });
  });
});

describe("intake", () => {
  const fee = (sig: string, lamports: number): IncomingTransfer => ({ sig, lamports, sender: FEE_SRC, ts: NOW - 50 });

  it("tags by fee_sources, forwards the founder share once, and budgets the stake share", async () => {
    h.store.addFeeSource(FEE_SRC);
    h.state.incoming = [fee("fee1", 400_000_000), { sig: "seed1", lamports: 100_000_000, sender: "X", ts: NOW - 60 }];
    (h.ports.chain as unknown as { swaps: () => Promise<SwapEvent[]> }).swaps = async () => [];
    const first = await runOnce(h.ports);
    expect(h.store.listInflows().map((i) => [i.sig, i.source])).toEqual(expect.arrayContaining([["fee1", "fee"], ["seed1", "seed"]]));
    expect(h.calls.filter((c) => c.startsWith("transfer:"))).toEqual([`transfer:${FOUNDER}:200000000`]);
    expect(first.budget?.budgetedLamports).toBe(200_000_000 + 100_000_000);
    expect(h.store.db.prepare("SELECT lamports FROM forwards").all()).toEqual([{ lamports: 200_000_000 }]);

    h.calls.length = 0;
    await runOnce(h.ports);
    expect(h.calls.filter((c) => c.startsWith("transfer:"))).toEqual([]);
  });

  it("stores an inflow only once even if it is reported again", async () => {
    await runOnce(h.ports);
    await runOnce(h.ports);
    expect(h.store.listInflows()).toHaveLength(1);
  });

  it("records the forward signature before the transfer is broadcast", async () => {
    h.store.addFeeSource(FEE_SRC);
    h.state.incoming = [fee("fee1", 400_000_000)];
    let seen = 0;
    h.ports.transferSol = async (_to, _l, onSigned) => {
      await onSigned?.("FWD");
      seen = (h.store.db.prepare("SELECT COUNT(*) AS n FROM forwards WHERE sig='FWD'").get() as { n: number }).n;
      return "FWD";
    };
    await runOnce(h.ports);
    expect(seen).toBe(1);
  });

  it("retries a forward that never confirmed", async () => {
    h.store.addFeeSource(FEE_SRC);
    h.store.insertInflow({ sig: "fee1", lamports: 400_000_000, source: "fee", ts: 1, sender: FEE_SRC });
    h.store.insertForward("STALE", "fee1", 200_000_000, NOW - 1000);
    await runOnce(h.ports);
    expect(h.store.forwardExists("fee1")).toBe(true);
    expect(h.store.db.prepare("SELECT sig FROM forwards").all()).not.toContainEqual({ sig: "STALE" });
    expect(h.calls.filter((c) => c.startsWith("transfer:"))).toHaveLength(1);
  });

  it("ignores dust", async () => {
    h.state.incoming = [{ sig: "dust", lamports: 500, sender: "X", ts: NOW }];
    await runOnce(h.ports);
    expect(h.store.listInflows()).toHaveLength(0);
  });
});

describe("budget with ops reserve", () => {
  it("waits when the wallet only holds the reserve", async () => {
    h.state.sol = 60_000_000;
    h.state.incoming = [{ sig: "seed1", lamports: 900_000_000, sender: "S", ts: NOW }];
    const r = await runOnce(h.ports);
    expect(r).toMatchObject({ state: "WAITING", reason: "budget_below_min_slice" });
    expect(r.budget?.spendableLamports).toBe(40_000_000);
  });
});

describe("dry run", () => {
  it("evaluates all gates, probes the quote at the minimum slice, and writes nothing to slices, inflows or config", async () => {
    h.ports.dry = true;
    h.ports.send = undefined;
    h.ports.transferSol = undefined;
    h.state.incoming = [];
    h.state.sol = 10_000_000;
    const r = await runOnce(h.ports);
    expect(r.dry).toBe(true);
    expect(r.details.quote).toBeDefined();
    expect(r.details.usepod).toBeDefined();
    expect(r.reason).toBe("budget_below_min_slice");
    expect(h.store.listInflows()).toHaveLength(0);
    expect(h.store.getConfig("inflow_cursor")).toBeUndefined();
    expect(h.store.db.prepare("SELECT COUNT(*) AS n FROM slices").get()).toEqual({ n: 0 });
    expect(h.calls).toEqual([]);
  });

  it("reports WOULD_BUY with the exact action and never sends", async () => {
    h.ports.dry = true;
    h.ports.send = undefined;
    h.ports.transferSol = undefined;
    h.ports.usepod.verdict = async () => ({ outcome: "dry_run_quote_only", quote: { quoteId: "q", network: "n", payTo: "p", lamports: 100 } });
    const r = await runOnce(h.ports);
    expect(r.state).toBe("WOULD_BUY");
    expect(r.details.actions as string[]).toEqual(expect.arrayContaining([expect.stringMatching(/^DRY-RUN would buy 500000000 lamports/)]));
    expect(h.calls).toEqual([]);
    expect(h.store.listInflows()).toHaveLength(0);
  });
});


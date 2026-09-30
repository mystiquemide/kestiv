import { mkdtempSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RunResult } from "../src/loop/types.js";
import { DEFAULT_POLICY } from "../src/policy.js";
import { PublicStatusSchema, buildPublicStatus, readPublicStatus, setNextRunAt, statusPaths, writePublicStatus } from "../src/status/public.js";
import { createStatusServer } from "../src/status/server.js";
import { Store } from "../src/store/index.js";

const SECRET_KEY = "SUPERSECRETHELIUSKEY123";
const SECRET_PATH = "/root/.config/kestiv/kestiv.keypair.json";
const cfg = { SOLANA_CLUSTER: "mainnet-beta", KESTIV_WALLET: "WALLETPUBKEY", FOUNDER_WALLET: "FOUNDERPUBKEY" };

const result = (over: Partial<RunResult> = {}): RunResult => ({
  state: "WAITING",
  reason: "cooldown",
  ts: 1000,
  dry: false,
  txs: ["TX1"],
  budget: { budgetedLamports: 5, spentOnSlicesLamports: 1, expensesLamports: 0, remainingLamports: 4, walletLamports: 9, spendableLamports: 2 },
  details: {
    gates: [{ name: "cooldown_sec_left", value: 60, threshold: 0, pass: false }],
    stake: { stakeTokens: "10", capTokens: "70", supply: "1000" },
    error: `rpc failed https://mainnet.helius-rpc.com/?api-key=${SECRET_KEY} ${SECRET_PATH}`,
    notes: [SECRET_PATH],
    usepod: { outcome: "ok", verdict: "buy", reason: "organic", quoteLamports: 553, paymentSignature: "PAYSIG", model: "deepseek-v4-flash", headers: { "x-pod-route": SECRET_KEY }, payTo: "PAYTO" },
  },
  ...over,
});

function seeded(): Store {
  const s = Store.open(":memory:");
  s.addFeeSource("FEESRC");
  s.insertInflow({ sig: "i1", lamports: 400, source: "fee", ts: 10, sender: "FEESRC" });
  s.insertInflow({ sig: "i2", lamports: 100, source: "seed", ts: 20, sender: "X" });
  s.insertForward("f1", "i1", 200, 11);
  s.insertPendingSlice("a", 50, 100);
  s.setSliceSignature("a", "BUY1", 9);
  s.updateSlice("a", { status: "bought", tokens_out: "777", ts: 101 });
  s.updateSlice("a", { status: "locked", lock_sig: "LOCK1", ts: 102 });
  s.insertPendingSlice("b", 60, 200);
  s.setConfig("contract_id", "STREAM");
  s.insertRun({ state: "WAITING", reason: "old", details: { dry: false, mint: "M", gates: [] }, txs: [], ts: 5 });
  s.insertRun({ state: "SKIPPED", reason: "usepod_skip", details: { dry: true, mint: "M2", gates: [], usepod: { outcome: "ok", verdict: "skip", reason: "circular", quoteLamports: 500, paymentSignature: "P", model: "m" } }, txs: ["T"], ts: 6 });
  return s;
}

const build = (s: Store, over: Partial<RunResult> = {}, nextRunAt?: number | null) =>
  buildPublicStatus({ store: s, result: result(over), cfg, policy: DEFAULT_POLICY, mint: "M", nowSec: 1000, nextRunAt });

describe("buildPublicStatus", () => {
  it("derives every field from the store and round-trips through the schema", () => {
    const s = build(seeded());
    expect(PublicStatusSchema.parse(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(s).toMatchObject({
      version: 1,
      wallet: "WALLETPUBKEY",
      founder: "FOUNDERPUBKEY",
      contractId: "STREAM",
      funding: { feeLamports: "400", seedLamports: "100", forwardedLamports: "200" },
      latest: { buySig: "BUY1", buyTs: 101, lockSig: "LOCK1", lockTs: 102 },
      policy: { capBps: 700, minSliceLamports: 50_000_000, maxPriceImpact: 0.025, stakeShareBps: 5000 },
    });
    expect(s.inflows.map((i) => i.sig)).toEqual(["i2", "i1"]);
    expect(s.slices.map((x) => x.id)).toEqual(["b", "a"]);
    expect(s.slices.find((x) => x.id === "a")).toMatchObject({ status: "locked", lamportsIn: "50", tokensOut: "777", buySig: "BUY1", lockSig: "LOCK1", ts: 100 });
    expect(s.runs.map((r) => r.reason)).toEqual(["usepod_skip", "old"]);
    expect(s.runs[0]).toMatchObject({ dry: true, mint: "M2", usepod: { outcome: "ok", verdict: "skip", reason: "circular", lamports: 500, paymentSig: "P", model: "m" } });
    expect(s.runs[1]?.usepod).toBeNull();
  });

  it("returns nulls and empty lists for a fresh store", () => {
    const s = build(Store.open(":memory:"), { budget: undefined, details: {} });
    expect(s).toMatchObject({ contractId: null, nextRunAt: null, stake: null, budget: null, gates: [], slices: [], inflows: [], runs: [] });
    expect(s.latest).toEqual({ buySig: null, buyTs: null, lockSig: null, lockTs: null });
    expect(s.funding).toEqual({ feeLamports: "0", seedLamports: "0", forwardedLamports: "0" });
  });

  it("keeps runs from before usepod details were persisted as null", () => {
    const st = Store.open(":memory:");
    st.db.prepare("INSERT INTO runs(state, reason, ts) VALUES('WAITING','x',1)").run();
    const s = build(st);
    expect(s.runs[0]).toMatchObject({ usepod: null, gates: [], txs: [], dry: false, mint: "" });
  });

  it("caps history at 50 runs, newest first", () => {
    const st = Store.open(":memory:");
    for (let i = 0; i < 60; i++) st.insertRun({ state: "WAITING", reason: `r${i}`, details: {}, txs: [], ts: i });
    const s = build(st);
    expect(s.runs).toHaveLength(50);
    expect(s.runs[0]?.reason).toBe("r59");
  });

  it("limits inflows to the last 5", () => {
    const st = Store.open(":memory:");
    for (let i = 0; i < 8; i++) st.insertInflow({ sig: `s${i}`, lamports: 1, source: "seed", ts: i, sender: "x" });
    expect(build(st).inflows.map((i) => i.sig)).toEqual(["s7", "s6", "s5", "s4", "s3"]);
  });

  it("uses the loop schedule, else a future cooldown, else null", () => {
    const st = Store.open(":memory:");
    expect(build(st).nextRunAt).toBeNull();
    st.setConfig("cooldown_until", "5000");
    expect(build(st).nextRunAt).toBe(5000);
    expect(build(st, {}, 7000).nextRunAt).toBe(7000);
    st.setConfig("cooldown_until", "500");
    expect(build(st).nextRunAt).toBeNull();
  });

  it("never contains secrets, keypair paths, RPC urls or env values", () => {
    const text = JSON.stringify(build(seeded()));
    for (const banned of [SECRET_KEY, SECRET_PATH, "api-key", "keypair", "HELIUS", "helius-rpc", "x-pod-route", "PAYTO"]) {
      expect(text).not.toContain(banned);
    }
  });
});

describe("quote in the public status", () => {
  const storedQuote = { inLamports: "50000000", outAmount: "1391957525637", minOutAmount: "1", priceImpact: 0.0164, route: ["Pump.fun"], decimals: 6 };
  const publicQuote = { inLamports: "50000000", outAmount: "1391957525637", priceImpact: 0.0164, route: ["Pump.fun"], decimals: 6 };

  it("exposes the latest run's quote at the top level without the internal minOutAmount", () => {
    const s = build(Store.open(":memory:"), { details: { quote: storedQuote } });
    expect(s.quote).toEqual(publicQuote);
    expect(JSON.stringify(s)).not.toContain("minOutAmount");
  });

  it("is null when the run stopped before quoting, at the top level and in history", () => {
    const st = Store.open(":memory:");
    st.insertRun({ state: "WAITING", reason: "cooldown", details: { gates: [] }, txs: [], ts: 1 });
    const s = build(st, { details: {} });
    expect(s.quote).toBeNull();
    expect(s.runs[0]?.quote).toBeNull();
  });

  it("keeps each run's quote through the store round trip, newest first", () => {
    const st = Store.open(":memory:");
    st.insertRun({ state: "WAITING", reason: "a", details: { quote: { ...storedQuote, inLamports: "1" } }, txs: [], ts: 1 });
    st.insertRun({ state: "SKIPPED", reason: "b", details: { quote: storedQuote }, txs: [], ts: 2 });
    st.insertRun({ state: "WAITING", reason: "c", details: {}, txs: [], ts: 3 });
    const s = build(st, { details: {} });
    expect(s.runs.map((r) => r.quote?.inLamports ?? null)).toEqual([null, "50000000", "1"]);
  });

  it("puts liquidityShareBps in the public policy", () => {
    expect(build(Store.open(":memory:")).policy.liquidityShareBps).toBe(100);
  });

  it("still parses status files written before quote and liquidityShareBps existed", () => {
    const { quote: _q, ...rest } = build(Store.open(":memory:")) as Record<string, unknown>;
    const old = { ...rest, policy: { ...(rest.policy as object) }, runs: [] } as Record<string, unknown>;
    delete (old.policy as Record<string, unknown>).liquidityShareBps;
    const parsed = PublicStatusSchema.parse(old);
    expect(parsed.quote).toBeNull();
    expect(parsed.policy.liquidityShareBps).toBe(100);
  });

  it("rejects a malformed quote", () => {
    const good = build(Store.open(":memory:"));
    expect(PublicStatusSchema.safeParse({ ...good, quote: { inLamports: "x" } }).success).toBe(false);
  });
});

describe("status files and server", () => {
  const servers: ReturnType<typeof createStatusServer>[] = [];
  afterEach(() => {
    for (const s of servers.splice(0)) s.close();
  });

  const start = async (paths: { live: string; dry: string }) => {
    const server = createStatusServer(paths);
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };
  const dir = () => mkdtempSync(join(tmpdir(), "kestiv-status-"));

  it("statusPaths puts dry runs in a sibling file", () => {
    expect(statusPaths("./data/status.json")).toEqual({ live: "./data/status.json", dry: "./data/status.dry.json" });
  });

  it("reports missing files as null without errors, and served headers are right", async () => {
    const d = dir();
    const base = await start({ live: join(d, "a.json"), dry: join(d, "b.json") });
    const res = await fetch(`${base}/status`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=15");
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    const body = await res.json();
    expect(body).toMatchObject({ live: null, dry: null, errors: [] });
    expect(typeof body.servedAt).toBe("number");
  });

  it("serves valid files fresh on every request and flags invalid ones", async () => {
    const d = dir();
    const paths = { live: join(d, "status.json"), dry: join(d, "status.dry.json") };
    writePublicStatus(paths.live, build(seeded()));
    writeFileSync(paths.dry, "{ not json");
    const base = await start(paths);
    const first = await (await fetch(`${base}/status`)).json();
    expect(first.live.state).toBe("WAITING");
    expect(first.dry).toBeNull();
    expect(first.errors).toEqual([{ side: "dry", reason: "invalid_json" }]);

    writePublicStatus(paths.live, build(seeded(), { state: "SKIPPED", reason: "x" }));
    writeFileSync(paths.dry, JSON.stringify({ version: 1, state: "x" }));
    const second = await (await fetch(`${base}/status`)).json();
    expect(second.live.state).toBe("SKIPPED");
    expect(second.errors).toEqual([{ side: "dry", reason: "schema_mismatch" }]);
  });

  it("rejects an old unversioned status file", () => {
    const d = dir();
    const p = join(d, "old.json");
    writeFileSync(p, JSON.stringify({ state: "WAITING", reason: "x", ts: 1, dry: false, mint: "M" }));
    expect(readPublicStatus(p)).toEqual({ status: null, error: "schema_mismatch" });
  });

  it("answers /health, 404 and 405", async () => {
    const d = dir();
    const base = await start({ live: join(d, "a"), dry: join(d, "b") });
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ ok: true });
    expect((await fetch(`${base}/nope`)).status).toBe(404);
    const post = await fetch(`${base}/status`, { method: "POST" });
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET");
  });

  it("setNextRunAt patches a valid file and ignores a missing one", () => {
    const d = dir();
    const p = join(d, "status.json");
    writePublicStatus(p, build(seeded()));
    setNextRunAt(p, 9999);
    expect(readPublicStatus(p).status?.nextRunAt).toBe(9999);
    expect(() => setNextRunAt(join(d, "missing.json"), 1)).not.toThrow();
  });
});

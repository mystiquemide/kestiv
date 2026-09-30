import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DevnetProof, StakeView, LockStep } from "../lib/chain";
import { FEED_ERROR_CHAIN, NOT_REPORTED, buyCard, checksCard, feesCard, lockCard, staircase } from "../lib/howItWorks";
import { StatusResponseSchema, type PublicStatus } from "../lib/schema";
import type { AgentStatus } from "../lib/status";

const response = StatusResponseSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/status-response-quote.json", import.meta.url), "utf8")));
const dry = response.dry!;
const NOW = dry.ts + 600;

const ok = (live: PublicStatus | null, d: PublicStatus | null): AgentStatus => ({ ok: true, live, dry: d, fetchedAt: 1 });
const down: AgentStatus = { ok: false, error: "unreachable", fetchedAt: 1 };
// A live run shaped like the real feed, with inflows (there are none on the real feed yet).
const live: PublicStatus = {
  ...dry,
  dry: false,
  mint: "LIVEMINT",
  inflows: [
    { sig: "S3", lamports: "400000000", source: "fee", ts: NOW - 60 },
    { sig: "S2", lamports: "50000000", source: "seed", ts: NOW - 3600 },
    { sig: "S1", lamports: "1234500000", source: "fee", ts: NOW - 7200 },
  ],
  funding: { feeLamports: "1634500000", seedLamports: "50000000", forwardedLamports: "817250000" },
};

describe("fees card", () => {
  it("lists only live inflows with chips, relative time and Solscan links", () => {
    const c = feesCard(ok(live, dry), NOW);
    if (c.kind !== "inflows") throw new Error("expected inflows");
    expect(c.text).toBe("Creator fees land in Kestiv's wallet. 50% funds the stake, the rest goes straight to the founder.");
    expect(c.rows.map((r) => [r.amount, r.source, r.initialAgo])).toEqual([["0.4 SOL", "Fee", "1 min ago"], ["0.05 SOL", "Seed", "1h ago"], ["1.2345 SOL", "Fee", "2h ago"]]);
    expect(c.rows[0]!.href).toBe("https://solscan.io/tx/S3");
    expect(c.totals).toBe("Fees 1.6345 SOL · Seed 0.05 SOL · Sent to founder 0.8173 SOL");
  });

  it("uses the devnet cluster on Solscan links for a devnet status", () => {
    const c = feesCard(ok({ ...live, cluster: "devnet" }, null), NOW);
    if (c.kind !== "inflows") throw new Error("expected inflows");
    expect(c.rows[0]!.href).toBe("https://solscan.io/tx/S3?cluster=devnet");
  });

  it("never shows dry-run inflows", () => {
    const dryWithInflows = { ...dry, inflows: live.inflows };
    const c = feesCard(ok(null, dryWithInflows), NOW);
    expect(c.kind).toBe("empty");
    expect(JSON.stringify(c)).not.toContain("S3");
  });

  it("is empty with no live inflows, and says so in words", () => {
    expect(feesCard(ok({ ...live, inflows: [] }, null), NOW)).toMatchObject({ kind: "empty", message: "No fees yet. They start with the first trade." });
    expect(feesCard(ok(null, null), NOW).kind).toBe("empty");
  });

  it("feed down: generic text and the feed error sentence", () => {
    expect(feesCard(down, NOW)).toEqual({
      kind: "feed_error",
      text: "Creator fees land in Kestiv's wallet. A set share funds the stake, the rest goes to the founder.",
      message: FEED_ERROR_CHAIN,
    });
  });
});

describe("checks card", () => {
  it("shows every gate of the dry run with its label and the dry label", () => {
    const c = checksCard(ok(null, dry));
    if (c.kind !== "run") throw new Error("expected run");
    expect(c.text).toBe("11 checks before any buy: holders, trading volume, price impact, price against its 6 hour average, and a UsePod second opinion.");
    expect(c.gates).toHaveLength(11);
    expect(c.dryLabel).toEqual({ token: "6N49…pump", href: `https://solscan.io/token/${dry.mint}` });
    const vol = c.gates.find((g) => g.name === "volume_24h_usd")!;
    expect(vol).toMatchObject({ label: "24h volume", value: "at least $1,989", pass: false });
    expect(c.gates.find((g) => g.name === "cooldown_sec_left")!.value).toBe("none");
  });

  it("prefers live and has no dry label", () => {
    const c = checksCard(ok(live, dry));
    if (c.kind !== "run") throw new Error("expected run");
    expect(c.dryLabel).toBeNull();
  });

  it("says Eleven when there is no run, and handles empty and feed down", () => {
    const empty = checksCard(ok(null, null));
    expect(empty).toMatchObject({ kind: "empty", message: NOT_REPORTED });
    expect(empty.text.startsWith("Eleven checks before any buy")).toBe(true);
    expect(checksCard(down)).toMatchObject({ kind: "feed_error", message: FEED_ERROR_CHAIN });
  });
});

describe("buy card", () => {
  it("formats the real dry-run quote", () => {
    const c = buyCard(ok(null, dry));
    if (c.kind !== "quote") throw new Error("expected quote");
    expect(c.text).toBe("At least 0.05 SOL, never more than 1% of the pool's liquidity, routed through Jupiter.");
    expect(c).toMatchObject({ pays: "0.05 SOL", receives: "1.4M tokens", impact: "0.38%", route: "Pump.fun" });
    expect(c.dryLabel?.token).toBe("6N49…pump");
  });

  it("joins multiple route labels", () => {
    const c = buyCard(ok(null, { ...dry, quote: { ...dry.quote!, route: ["Meteora", "Pump.fun"] } }));
    if (c.kind !== "quote") throw new Error("expected quote");
    expect(c.route).toBe("Meteora → Pump.fun");
  });

  it("uses the fallback decimals when the quote has none, and says no quote without them", () => {
    const old = { ...dry, quote: { ...dry.quote!, decimals: null } };
    const c = buyCard(ok(null, old), 6);
    if (c.kind !== "quote") throw new Error("expected quote");
    expect(c.receives).toBe("1.4M tokens");
    expect(buyCard(ok(null, old), null).kind).toBe("no_quote");
  });

  it("no quote: written message", () => {
    const c = buyCard(ok({ ...live, quote: null }, null));
    expect(c).toMatchObject({ kind: "no_quote", message: "No quote yet. The agent quotes a buy once there are fees to spend." });
  });

  it("feed down: generic text and the error", () => {
    expect(buyCard(down)).toMatchObject({ kind: "feed_error", message: FEED_ERROR_CHAIN });
  });
});

describe("staircase", () => {
  const steps: LockStep[] = [
    { id: "SECOND", ts: 1_000_200, amount: "50000000000" },
    { id: "FIRST", ts: 1_000_000, amount: "100000000000" },
  ];

  it("orders deposits by time and plots cumulative totals", () => {
    const s = staircase(steps, 6)!;
    expect(s.points.map((p) => [p.id, p.amount, p.cumulative])).toEqual([
      ["FIRST", "100000000000", "100000000000"],
      ["SECOND", "50000000000", "150000000000"],
    ]);
    expect(s.total).toBe("150,000");
  });

  it("x is deposit order: equal treads whatever the time between deposits", () => {
    const close = staircase(steps, 6)!;
    const far = staircase([steps[1]!, { ...steps[0]!, ts: 1_000_000 + 90 * 86_400 }], 6)!;
    expect(close.points.map((p) => p.x)).toEqual([16, 300]);
    expect(far.points.map((p) => p.x)).toEqual(close.points.map((p) => p.x));
    expect(close.treadWidth).toBe(284);
  });

  it("heights follow the cumulative total from zero, rising left to right", () => {
    const s = staircase(steps, 6)!;
    expect(s.points.map((p) => p.y)).toEqual([80, 36]);
  });

  it("draws horizontal then vertical runs and ends flat at the right edge", () => {
    expect(staircase(steps, 6)!.path).toBe("M16,80 H300 V36 H584");
  });

  it("N deposits draw N equal treads", () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ id: `S${i}`, ts: 1000 + i, amount: "1000000" }));
    const s = staircase(five, 6)!;
    const xs = s.points.map((p) => p.x);
    expect(xs.slice(1).map((x, i) => Math.round((x - xs[i]!) * 100) / 100)).toEqual([113.6, 113.6, 113.6, 113.6]);
    expect(s.points.map((p) => p.y)).toEqual([...s.points.map((p) => p.y)].sort((a, b) => b - a));
    expect(s.ariaLabel).toBe("5 locks, from 1 to 5 tokens");
  });

  it("a single step is one tread spanning the whole width at full height", () => {
    const s = staircase([steps[1]!], 6)!;
    expect(s.points).toHaveLength(1);
    expect(s.points[0]).toMatchObject({ x: 16, y: 36 });
    expect(s.treadWidth).toBe(568);
    expect(s.path).toBe("M16,36 H584");
    expect(s.ariaLabel).toBe("1 lock of 100,000 tokens");
  });

  it("writes an aria label from the real values", () => {
    expect(staircase(steps, 6)!.ariaLabel).toBe("2 locks, from 100,000 to 150,000 tokens");
  });

  it("has no chart for no steps", () => {
    expect(staircase([], 6)).toBeNull();
  });

  it("formats first and last dates in UTC", () => {
    const s = staircase([{ id: "A", ts: 1_790_759_384, amount: "1000000" }, { id: "B", ts: 1_791_000_000, amount: "1000000" }], 6)!;
    expect(s.firstDate).toBe("30 Sep 2026");
    expect(s.lastDate).toBe("3 Oct 2026");
  });
});

describe("lock card", () => {
  const proof = (over: Partial<DevnetProof> = {}): DevnetProof => ({
    cluster: "devnet",
    mint: "DEVMINT",
    locks: [],
    guarantees: { cancelNobody: true, recipientNobody: true },
    steps: [
      { id: "C", ts: 1_000_000, amount: "100000000000" },
      { id: "T", ts: 1_000_002, amount: "50000000000" },
    ],
    sigs: { locks: ["C", "T"], cancel: "X" },
    cancel: null,
    ...over,
  });
  const active = (): StakeView =>
    ({ state: "active", mint: "M", cluster: "mainnet-beta", supply: "1", decimals: 6, capBps: 700, rpcKind: "helius", steps: [{ id: "LIVE1", ts: 1_000_000, amount: "2000000" }] }) as unknown as StakeView;

  it("uses the devnet proof, labelled, when the stake isn't live", () => {
    const c = lockCard({ state: "not_launched" }, proof(), null, 6);
    if (c.kind !== "chart") throw new Error("expected chart");
    expect(c.label).toBe("Devnet proof");
    expect(c.list.map((l) => [l.title, l.amount, l.href])).toEqual([
      ["Lock 1", "100,000 tokens", "https://solscan.io/account/C?cluster=devnet"],
      ["Lock 2", "50,000 tokens", "https://solscan.io/account/T?cluster=devnet"],
    ]);
    expect(c.chart.ariaLabel).toBe("2 locks, from 100,000 to 150,000 tokens");
  });

  it("uses the live locks, unlabelled, when active", () => {
    const c = lockCard(active(), proof(), { decimals: 6 }, 6);
    if (c.kind !== "chart") throw new Error("expected chart");
    expect(c.label).toBeNull();
    expect(c.list[0]).toMatchObject({ title: "Lock 1", amount: "2 tokens", href: "https://lock.jup.ag/escrow/LIVE1" });
  });

  it("writes an error when the devnet read or decimals fail", () => {
    expect(lockCard({ state: "not_launched" }, null, null, 6)).toMatchObject({ kind: "error", message: "We couldn't load the lock history just now. This page checks again every minute." });
    expect(lockCard({ state: "not_launched" }, proof(), null, null).kind).toBe("error");
    expect(lockCard({ state: "not_launched" }, proof({ steps: [] }), null, 6).kind).toBe("error");
  });
});

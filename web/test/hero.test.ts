import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DevnetProof, StakeView, StreamFlags } from "../lib/chain";
import { dateUtc, formatFractionPct, formatInt, formatStakePct, formatUsd, shortAddress, solFromLamports, tokensCompact } from "../lib/format";
import { REASON_CODES, agentPanel, flagCells, lockPanel, reasonText, stakePanel } from "../lib/hero";
import { StatusResponseSchema, type PublicStatus } from "../lib/schema";
import type { AgentStatus } from "../lib/status";
import { timeAgo } from "../lib/time";

const response = StatusResponseSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/status-response.json", import.meta.url), "utf8")));
const dry = response.dry!;
const NOW = dry.ts + 240; // four minutes after the recorded run
const FOUNDER = "DC1B96Rw9yftgZN7HYktA47nneFSDbu5mpedkYPxJryB";

const okStatus = (live: PublicStatus | null, d: PublicStatus | null): AgentStatus => ({ ok: true, live, dry: d, fetchedAt: 1 });
const base = { mint: "MINT", cluster: "mainnet-beta" as const, supply: "1000000000000000", decimals: 6, capBps: 700, rpcKind: "helius" as const };
const flags = (over: Partial<StreamFlags> = {}): StreamFlags => ({
  canTopup: true, cancelableBySender: false, cancelableByRecipient: false, transferableBySender: false,
  transferableByRecipient: false, automaticWithdrawal: false, canUpdateRate: false, pausable: false, ...over,
});
const activeView = (over: Record<string, unknown> = {}): StakeView =>
  ({
    state: "active", ...base, contractId: "STREAM", recipient: FOUNDER, sender: "S", multiple: false, stakePct: "1.2400",
    deposited: "1240000000000", withdrawn: "0", locked: "1240000000000", vested: "0", nextUnlock: 1_798_000_000, start: 1, cliff: 1, end: 2,
    period: 86400, amountPerPeriod: "1", flags: flags(), steps: [], ...over,
  }) as StakeView;

const stakeInput = (stake: StakeView, status: AgentStatus = okStatus(null, dry)) => ({ stake, status, founder: FOUNDER, cluster: "mainnet-beta" as const });

describe("format helpers", () => {
  it("formats addresses, amounts, dates and percentages", () => {
    expect(shortAddress(FOUNDER)).toBe("DC1B…JryB");
    expect(tokensCompact("1240000000000", 6)).toBe("1.24M");
    expect(tokensCompact("0", 6)).toBe("0");
    expect(dateUtc(1_798_502_400)).toBe("29 Dec 2026");
    expect(solFromLamports(50_000_000)).toBe("0.05");
    expect(solFromLamports(0)).toBe("0");
    expect(solFromLamports(2_500_000_000)).toBe("2.5");
    expect(formatInt(129)).toBe("129");
    expect(formatInt(12345)).toBe("12,345");
    expect(formatUsd(2818.69)).toBe("$2,819");
    expect(formatUsd(2000)).toBe("$2,000");
    expect(formatUsd(12.5)).toBe("$12.50");
    expect(formatFractionPct(0.0164181)).toBe("1.64%");
    expect(formatFractionPct(0.025)).toBe("2.5%");
    expect(formatStakePct("1.2400")).toBe("1.24%");
    expect(formatStakePct("0.0000")).toBe("0.00%");
  });

  it("writes relative time", () => {
    expect(timeAgo(100, 130)).toBe("just now");
    expect(timeAgo(100, 100 + 4 * 60)).toBe("4 min ago");
    expect(timeAgo(100, 100 + 3 * 3600 + 5)).toBe("3h ago");
    expect(timeAgo(100, 100 + 72 * 3600)).toBe("3d ago");
  });
});

describe("stake panel", () => {
  it("not_launched: headline, text, recipient and cap from the agent policy", () => {
    const m = stakePanel(stakeInput({ state: "not_launched" }));
    expect(m).toMatchObject({ kind: "not_launched", headline: "Not live yet", text: "$KESTIV launches on pump.fun. The first lock opens after launch." });
    expect(m.rows).toEqual([
      { label: "Fees to stake", value: "50%" },
      { label: "Unlocks", value: "After 90 days, then daily" },
      { label: "Founder", value: "DC1B…JryB", mono: true, href: `https://solscan.io/account/${FOUNDER}` },
      { label: "Cap", value: "7% of supply" },
    ]);
  });

  it("not_launched without an agent status falls back to the default cap and omits a missing recipient", () => {
    const m = stakePanel({ stake: { state: "not_launched" }, status: { ok: false, error: "unconfigured", fetchedAt: 1 }, cluster: "mainnet-beta" });
    expect(m.rows).toEqual([{ label: "Unlocks", value: "After 90 days, then daily" }, { label: "Cap", value: "7% of supply" }]);
    expect(m.rows.map((r) => r.label)).not.toContain("Fees to stake");
  });

  it("no_contract: 0.00% with the waiting rows", () => {
    const m = stakePanel(stakeInput({ state: "no_contract", ...base }));
    expect(m).toMatchObject({ kind: "no_contract", headline: "0.00%" });
    expect(m.rows.map((r) => [r.label, r.value])).toEqual([["Locked", "0"], ["Next unlock", "After the first lock"], ["Fees to stake", "50%"], ["Unlocks", "After 90 days, then daily"], ["Founder", "DC1B…JryB"], ["Cap", "7% of supply"]]);
  });

  it("active: percent, brass locked amount and a UTC unlock date", () => {
    const m = stakePanel(stakeInput(activeView({ nextUnlock: 1_798_502_400 })));
    expect(m).toMatchObject({ kind: "active", headline: "1.24%" });
    expect(m.rows[0]).toEqual({ label: "Locked", value: "1.24M", mono: true, tone: "brass" });
    expect(m.rows[1]).toMatchObject({ label: "Next unlock", value: "29 Dec 2026", mono: true });
    expect(m.rows.map((r) => r.label)).toEqual(["Locked", "Next unlock", "Fees to stake", "Unlocks", "Founder", "Cap"]);
    expect((m as { note?: string }).note).toBeUndefined();
  });

  it("active with nothing left to unlock says so", () => {
    const m = stakePanel(stakeInput(activeView({ nextUnlock: null })));
    expect(m.rows[1]?.value).toBe("Fully unlocked");
  });

  it("cap_reached adds the cap line using the agent's cap", () => {
    const m = stakePanel(stakeInput(activeView({ state: "cap_reached" })));
    expect(m).toMatchObject({ kind: "cap_reached", note: "Cap reached at 7%. Fees now go straight to the founder." });
  });

  it("rpc_error: no numbers, founder row stays because it comes from config", () => {
    const m = stakePanel(stakeInput({ state: "rpc_error", rpcKind: "helius", error: "x" }));
    expect(m).toMatchObject({ kind: "error", message: "We couldn't read the chain just now. This page checks again every minute." });
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0]?.label).toBe("Founder");
    expect(JSON.stringify(m)).not.toMatch(/\d\.\d\d%/);
  });
});

describe("agent panel", () => {
  it("shows the dry run with its token and never presents it as a $KESTIV run", () => {
    const m = agentPanel(okStatus(null, dry), NOW);
    if (m.kind !== "run") throw new Error("expected run");
    expect(m.source).toBe("dry");
    expect(m.dryLabel).toEqual({ token: "6N49…pump", href: `https://solscan.io/token/${dry.mint}` });
    expect(m).toMatchObject({ state: "WAITING", initialAgo: "4 min ago", stale: null });
    expect(m.reason).toBe("Not enough fees yet for a 0.05 SOL buy.");
  });

  it("prefers the live run over the dry run and has no dry label", () => {
    const live = { ...dry, dry: false, state: "BOUGHT", reason: "bought_and_locked", ts: dry.ts + 100 };
    const m = agentPanel(okStatus(live, dry), NOW);
    if (m.kind !== "run") throw new Error("expected run");
    expect(m.source).toBe("live");
    expect(m.dryLabel).toBeNull();
    expect(m).toMatchObject({ state: "BOUGHT", reason: "Bought and locked." });
  });

  it("formats the four checks from the real gates", () => {
    const m = agentPanel(okStatus(null, dry), NOW);
    if (m.kind !== "run") throw new Error("expected run");
    expect(m.checks.map((c) => c.label)).toEqual(["Holders", "24h volume", "Price impact", "Buy size"]);
    const byLabel = Object.fromEntries(m.checks.map((c) => [c.label, c]));
    expect(byLabel["Holders"]).toEqual({ label: "Holders", value: "129", threshold: "min 25", pass: true });
    expect(byLabel["24h volume"]).toEqual({ label: "24h volume", value: "at least $2,819", threshold: "min $2,000", pass: true });
    expect(byLabel["Price impact"]).toEqual({ label: "Price impact", value: "1.64%", threshold: "max 2.5%", pass: true });
    expect(byLabel["Buy size"]).toEqual({ label: "Buy size", value: "0 SOL", threshold: "min 0.05 SOL", pass: false });
    expect(m.total).toBe(11);
    expect(m.passed).toBe(10);
  });

  it("skips checks that are missing from the run and shows n/a for null values", () => {
    const run = { ...dry, gates: [{ name: "holders", value: null, threshold: 25, pass: false }, { name: "price_impact", value: 0.01, threshold: 0.025, pass: true }] };
    const m = agentPanel(okStatus(null, run), NOW);
    if (m.kind !== "run") throw new Error("expected run");
    expect(m.checks.map((c) => c.label)).toEqual(["Holders", "Price impact"]);
    expect(m.checks[0]).toMatchObject({ value: "Unavailable", pass: false });
    expect(m).toMatchObject({ passed: 1, total: 2 });
  });

  it("marks runs older than two hours as stale and keeps the data", () => {
    const m = agentPanel(okStatus(null, dry), dry.ts + 3 * 3600 + 10);
    if (m.kind !== "run") throw new Error("expected run");
    expect(m.stale).toBe("Agent last reported 3h ago.");
    expect(m.checks).toHaveLength(4);
    const fresh = agentPanel(okStatus(null, dry), dry.ts + 2 * 3600);
    if (fresh.kind !== "run") throw new Error("expected run");
    expect(fresh.stale).toBeNull();
  });

  it("says the agent hasn't run when both sides are empty", () => {
    expect(agentPanel(okStatus(null, null), NOW)).toEqual({ kind: "empty", message: "The agent hasn't reported yet. Its first check appears here within a few minutes." });
  });

  it.each(["unconfigured", "unreachable", "invalid"] as const)("maps the %s feed error to the written state", (error) => {
    expect(agentPanel({ ok: false, error, fetchedAt: 1 }, NOW)).toEqual({
      kind: "feed_error",
      message: "We can't reach the agent's reports right now. Try again in a minute. Numbers from the chain are unaffected.",
    });
  });
});

describe("reason text", () => {
  it("has plain words for every reason code the agent can emit", () => {
    for (const code of REASON_CODES) {
      const t = reasonText(code, 50_000_000);
      expect(t, code).not.toBe(code.replace(/_/g, " "));
      expect(t).not.toContain("—");
      expect(t).not.toContain("_");
    }
  });

  it("uses the policy's minimum buy in the copy", () => {
    expect(reasonText("budget_below_min_slice", 100_000_000)).toBe("Not enough fees yet for a 0.1 SOL buy.");
  });

  it("falls back to the visible code for unknown reasons", () => {
    expect(reasonText("some_new_reason", 1)).toBe("Reason: some_new_reason");
  });
});

describe("lock panel", () => {
  const proof = (over: Partial<DevnetProof> = {}): DevnetProof => ({
    cluster: "devnet",
    stream: { id: "G28z", flags: flags() } as DevnetProof["stream"],
    steps: [],
    sigs: { create: "C", topup: "T", cancel: "CANCELSIG" },
    cancel: { sig: "CANCELSIG", slot: 1, ts: 1, err: { InstructionError: [0, { Custom: 131 }] }, customCode: 131 },
    ...over,
  });

  it("maps flags to Nobody and Off", () => {
    expect(flagCells(flags()).map((c) => [c.label, c.value, c.tone])).toEqual([
      ["Cancel", "Nobody", "default"], ["Transfer", "Nobody", "default"], ["Rate changes", "Off", "default"], ["Pause", "Off", "default"],
    ]);
  });

  it("flags anything that could move the stake as Allowed or On in the refusal colour", () => {
    const cells = flagCells(flags({ cancelableByRecipient: true, transferableBySender: true, canUpdateRate: true, pausable: true }));
    expect(cells.map((c) => [c.value, c.tone])).toEqual([["Allowed", "refusal"], ["Allowed", "refusal"], ["On", "refusal"], ["On", "refusal"]]);
  });

  it("uses the live contract when the stake is active, with no cancel attempt row", () => {
    const m = lockPanel(activeView({ flags: flags() }), proof());
    expect(m).toMatchObject({ label: "Live", cancelAttemptHref: null, streamflowHref: "https://app.streamflow.finance/contract/solana/mainnet/STREAM" });
  });

  it("uses the devnet proof otherwise, with the failed cancel link on the devnet cluster", () => {
    for (const stake of [{ state: "not_launched" }, { state: "rpc_error", rpcKind: "public", error: "x" }] as StakeView[]) {
      const m = lockPanel(stake, proof());
      expect(m.label).toBe("Devnet proof");
      expect(m.cancelAttemptHref).toBe("https://solscan.io/tx/CANCELSIG?cluster=devnet");
      expect(m.streamflowHref).toBe("https://app.streamflow.finance/contract/solana/devnet/G28zWX3sniaou4EBCuBBTc1tY4kewyfRU2eT7V65fQiV");
    }
  });

  it("omits the cancel row when the attempt has no error", () => {
    expect(lockPanel({ state: "not_launched" }, proof({ cancel: null })).cancelAttemptHref).toBeNull();
  });

  it("writes an error when the devnet proof can't be read and there is no live contract", () => {
    const m = lockPanel({ state: "no_contract", ...base }, null);
    expect(m).toMatchObject({ label: "Devnet proof", error: "We couldn't load the devnet proof just now. This page checks again every minute.", cells: [], streamflowHref: null });
  });
});

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DevnetProof, StakeView } from "../lib/chain";
import { buyRules, gateRule, type Gate } from "../lib/gates";
import { CANCEL_TEXT, protectionModel } from "../lib/protection";
import { StatusResponseSchema } from "../lib/schema";
import type { AgentStatus } from "../lib/status";
import { nextTabIndex } from "../lib/tabs";
import { ProtectionTabs } from "../components/protect/ProtectionTabs";

const response = StatusResponseSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/status-response-quote.json", import.meta.url), "utf8")));
const dry = response.dry!;
const ok = (live: typeof dry | null, d: typeof dry | null): AgentStatus => ({ ok: true, live, dry: d, fetchedAt: 1 });
const g = (name: string, value: Gate["value"], threshold: Gate["threshold"], pass = true): Gate => ({ name, value, threshold, pass });

const flags = { canTopup: true, cancelableBySender: false, cancelableByRecipient: false, transferableBySender: false, transferableByRecipient: false, automaticWithdrawal: false, canUpdateRate: false, pausable: false };
const proof = { cluster: "devnet", stream: { id: "G28z", mint: "M", flags }, steps: [], sigs: { create: "C", topup: "T", cancel: "X" }, cancel: null } as unknown as DevnetProof;
const active = { state: "active", cluster: "mainnet-beta", contractId: "STREAM", flags } as unknown as StakeView;

describe("gateRule", () => {
  it("writes a sentence for each gate from its own threshold", () => {
    expect(gateRule(g("holders", 128, 25))).toBe("At least 25 holders");
    expect(gateRule(g("volume_24h_usd", 1, 2000))).toBe("At least $2,000 traded in the last 24 hours");
    expect(gateRule(g("price_impact", 0.01, 0.025))).toBe("The buy moves the price less than 2.5%");
    expect(gateRule(g("spot_over_vwap", 1, 1.3))).toBe("The price is no more than 1.3x its 6 hour average");
    expect(gateRule(g("slice_lamports", 0, 50_000_000))).toBe("At least 0.05 SOL to spend");
    expect(gateRule(g("cap", "0 tokens", "69999360800427 tokens (7% of supply)"))).toBe("The stake is under 7% of supply");
    expect(gateRule(g("cooldown_sec_left", 0, 0))).toBe("Enough time since the last buy");
    expect(gateRule(g("price_usd", 1, "available"))).toBe("A live price and pool liquidity");
    expect(gateRule(g("liquidity_usd", 1, "available"))).toBe("A live price and pool liquidity");
    expect(gateRule(g("swaps_last_6h", 9, 5))).toBe("At least 5 trades in the last 6 hours");
    expect(gateRule(g("usepod_quote_lamports", 228, 300_000))).toBe("UsePod's check costs no more than 0.0003 SOL");
    expect(gateRule(g("usepod_verdict", "buy", "buy"))).toBe("UsePod doesn't flag the trading as circular or concentrated");
  });

  it("takes thresholds from the data, not constants", () => {
    expect(gateRule(g("holders", 1, 40))).toBe("At least 40 holders");
    expect(gateRule(g("price_impact", 0, 0.015))).toBe("The buy moves the price less than 1.5%");
  });

  it("returns null for unknown gates", () => {
    expect(gateRule(g("mystery", 1, 2))).toBeNull();
  });
});

describe("buyRules", () => {
  it("dedupes shared sentences and keeps the evaluation order", () => {
    const rules = buyRules(dry.gates);
    expect(rules.filter((r) => r === "A live price and pool liquidity")).toHaveLength(1);
    expect(rules[0]).toBe("The stake is under 7% of supply");
    expect(rules).toContain("At least 25 holders");
  });

  it("always lists the UsePod verdict, even when the run never paid for it", () => {
    expect(dry.gates.some((x) => x.name === "usepod_verdict")).toBe(false);
    expect(buyRules(dry.gates).at(-1)).toBe("UsePod doesn't flag the trading as circular or concentrated");
  });

  it("does not list the verdict twice when the gate is present", () => {
    const rules = buyRules([...dry.gates, g("usepod_verdict", "buy", "buy")]);
    expect(rules.filter((r) => r.startsWith("UsePod doesn't"))).toHaveLength(1);
  });

  it("skips unknown gates", () => {
    expect(buyRules([g("mystery", 1, 2)])).toEqual(["UsePod doesn't flag the trading as circular or concentrated"]);
  });
});

describe("protection model", () => {
  it("reuses the lock panel: live flags and Streamflow link when active", () => {
    const m = protectionModel({ status: ok(null, dry), stake: active, proof });
    expect(m.cancel.lock.label).toBe("Live");
    expect(m.cancel.lock.cells.map((c) => c.value)).toEqual(["Nobody", "Nobody", "Off", "Off"]);
    expect(m.cancel.lock.streamflowHref).toBe("https://app.streamflow.finance/contract/solana/mainnet/STREAM");
  });

  it("uses the devnet proof otherwise, and has no link when neither can be read", () => {
    expect(protectionModel({ status: ok(null, dry), stake: { state: "not_launched" }, proof }).cancel.lock.label).toBe("Devnet proof");
    const none = protectionModel({ status: ok(null, dry), stake: { state: "not_launched" }, proof: null });
    expect(none.cancel.lock.error).toBe("Couldn't load the devnet proof right now.");
    expect(none.cancel.lock.streamflowHref).toBeNull();
  });

  it("claims only what was verified about the flags", () => {
    expect(CANCEL_TEXT).not.toMatch(/nobody can switch them back on/i);
    expect(CANCEL_TEXT).toContain("Cancel, pause and rate changes");
    expect(CANCEL_TEXT).toContain("Kestiv's signer refuses the one Streamflow instruction that could turn it on");
  });

  it("shows the code link only when a repo URL is set", () => {
    expect(protectionModel({ status: ok(null, dry), stake: active, proof }).sells.repoHref).toBeNull();
    expect(protectionModel({ status: ok(null, dry), stake: active, proof, repoUrl: "https://github.com/x/kestiv" }).sells.repoHref).toBe("https://github.com/x/kestiv");
  });

  it("lists rules from the latest run, live before dry", () => {
    const live = { ...dry, dry: false, gates: [g("holders", 9, 40)] };
    const m = protectionModel({ status: ok(live, dry), stake: active, proof });
    if (m.checks.kind !== "rules") throw new Error("expected rules");
    expect(m.checks.rules[0]).toBe("At least 40 holders");
  });

  it("feed down: the written message and no rules", () => {
    const m = protectionModel({ status: { ok: false, error: "unreachable", fetchedAt: 1 }, stake: active, proof });
    expect(m.checks).toMatchObject({ kind: "feed_error", message: "The agent's status feed isn't answering, so the live thresholds can't be shown right now." });
    expect(JSON.stringify(m.checks)).not.toContain("rules");
  });

  it("no run yet: says so", () => {
    expect(protectionModel({ status: ok(null, null), stake: active, proof }).checks.kind).toBe("empty");
  });
});

describe("tab keyboard behaviour", () => {
  it("moves with arrows and wraps, Home and End jump, other keys are ignored", () => {
    expect(nextTabIndex("ArrowRight", 0, 3)).toBe(1);
    expect(nextTabIndex("ArrowRight", 2, 3)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(nextTabIndex("ArrowLeft", 2, 3)).toBe(1);
    expect(nextTabIndex("Home", 2, 3)).toBe(0);
    expect(nextTabIndex("End", 0, 3)).toBe(2);
    expect(nextTabIndex("Enter", 0, 3)).toBeNull();
    expect(nextTabIndex("ArrowRight", 0, 0)).toBeNull();
  });
});

describe("tabs markup", () => {
  const html = renderToStaticMarkup(
    <ProtectionTabs
      photo={<span>photo</span>}
      tabs={[
        { id: "a", label: "First", content: <p>one</p> },
        { id: "b", label: "Second", content: <p>two</p> },
        { id: "c", label: "Third", content: <p>three</p> },
      ]}
    />,
  );

  it("has a tablist, roving tabindex, aria-selected and aria-controls", () => {
    expect(html).toContain('role="tablist"');
    expect((html.match(/role="tab"/g) ?? []).length).toBe(3);
    expect((html.match(/aria-selected="true"/g) ?? []).length).toBe(1);
    expect((html.match(/tabindex="0"/g) ?? []).length).toBe(1);
    expect((html.match(/tabindex="-1"/g) ?? []).length).toBe(2);
    expect((html.match(/aria-controls="/g) ?? []).length).toBe(3);
  });

  it("renders every panel on the server and hides the inactive ones", () => {
    expect(html).toContain("one");
    expect(html).toContain("two");
    expect(html).toContain("three");
    expect((html.match(/role="tabpanel"[^>]*hidden/g) ?? []).length).toBe(2);
  });
});

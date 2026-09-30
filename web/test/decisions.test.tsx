import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DECISIONS_EMPTY, decisionsModel, kindOf } from "../lib/decisions";
import { LIVE_ROUTES } from "../lib/routes";
import { StatusResponseSchema } from "../lib/schema";
import type { AgentStatus } from "../lib/status";
import { DecisionList } from "../components/decisions/DecisionList";

const base = StatusResponseSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/status-response-quote.json", import.meta.url), "utf8"))).dry!;
const r0 = base.runs[0]!;
const mkRun = (over: object) => ({ ...r0, ...over });
const dryOnly = (runs: object[]): AgentStatus => ({ ok: true, live: null, dry: { ...base, runs: runs as never }, fetchedAt: 1 });
const down = { ok: false, error: "x" } as unknown as AgentStatus;

describe("decisions model", () => {
  it("is a live route", () => expect(LIVE_ROUTES).toContain("/decisions"));

  it("lists every run newest first with a date and a plain reason", () => {
    const m = decisionsModel(dryOnly([mkRun({ id: 1, ts: 1000 }), mkRun({ id: 2, ts: 3000 }), mkRun({ id: 3, ts: 2000 })]));
    if (m.kind !== "rows") throw new Error("rows");
    expect(m.rows.map((r) => r.key)).toEqual(["d-2", "d-3", "d-1"]);
    expect(m.rows[0]!.date).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4} \d\d:\d\d UTC$/);
    expect(m.rows[0]!.dry).toBe(true);
    expect(m.counts.all).toBe(3);
  });

  it("maps states to filters and counts them", () => {
    expect(["BOUGHT", "SKIPPED", "WAITING", "CAP_REACHED", "WOULD_BUY", "ERROR"].map(kindOf)).toEqual(["bought", "skipped", "waiting", "waiting", "waiting", "error"]);
    const m = decisionsModel(dryOnly([mkRun({ id: 1, state: "SKIPPED" }), mkRun({ id: 2, state: "WAITING" }), mkRun({ id: 3, state: "WAITING" }), mkRun({ id: 4, state: "ERROR", gates: [] })]));
    if (m.kind !== "rows") throw new Error("rows");
    expect(m.counts).toEqual({ all: 4, bought: 0, skipped: 1, waiting: 2, error: 1 });
  });

  it("merges live and dry runs without duplicating and labels dry runs", () => {
    const live = { ...base, dry: false, slices: [{ id: "a", status: "locked", lamportsIn: "1", tokensOut: "1", buySig: "BUYSIG", lockSig: "LOCKSIG", ts: 5000 }], runs: [mkRun({ id: 1, dry: false, ts: 5000, state: "BOUGHT", txs: ["BUYSIG", "LOCKSIG"] })] as never };
    const m = decisionsModel({ ok: true, live, dry: { ...base, runs: [mkRun({ id: 1, dry: true, ts: 4000 })] as never }, fetchedAt: 1 });
    if (m.kind !== "rows") throw new Error("rows");
    expect(m.rows.map((r) => r.key)).toEqual(["l-1", "d-1"]);
    expect(m.rows[0]!.txs.map((t) => t.label)).toEqual(["Buy transaction", "Lock transaction"]);
    expect(m.rows[0]!.txs[0]!.href).toContain("solscan.io/tx/BUYSIG");
  });

  it("shows each check with its value and limit, and marks the failing one", () => {
    const m = decisionsModel(dryOnly([mkRun({ id: 1 })]));
    if (m.kind !== "rows") throw new Error("rows");
    const fail = m.rows[0]!.gates.filter((g) => !g.pass);
    expect(fail.length).toBeGreaterThan(0);
    expect(m.rows[0]!.gates.some((g) => g.label === "Holders")).toBe(true);
  });

  it("UsePod: a dry run says quote only, a verdict shows its reason and payment link", () => {
    const quoteOnly = decisionsModel(dryOnly([mkRun({ id: 1, usepod: { outcome: "dry_run_quote_only", verdict: null, reason: null, lamports: 228, paymentSig: null, model: "m" } })]));
    if (quoteOnly.kind !== "rows") throw new Error("rows");
    expect(quoteOnly.rows[0]!.usepod!.line).toBe("Quote only, practice run (quote 228 lamports)");
    const verdict = decisionsModel(dryOnly([mkRun({ id: 2, dry: false, usepod: { outcome: "paid", verdict: "skip", reason: "recent trades look circular", lamports: 300, paymentSig: "PAY", model: "m" } })]));
    if (verdict.kind !== "rows") throw new Error("rows");
    expect(verdict.rows[0]!.usepod!.line).toBe('Skip: "recent trades look circular"');
    expect(verdict.rows[0]!.usepod!.paidHref).toContain("solscan.io/tx/PAY");
  });

  it("empty and feed-down states", () => {
    expect(decisionsModel({ ok: true, live: null, dry: null, fetchedAt: 1 })).toEqual({ kind: "empty", message: DECISIONS_EMPTY });
    expect(decisionsModel(down).kind).toBe("error");
  });
});

describe("decision list markup", () => {
  const m = decisionsModel(dryOnly([mkRun({ id: 1, state: "SKIPPED" }), mkRun({ id: 2, state: "WAITING" })]));
  if (m.kind !== "rows") throw new Error("rows");
  const html = renderToStaticMarkup(<DecisionList rows={m.rows} counts={m.counts} />);

  it("has filter buttons with real counts, closed native details and real tables", () => {
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("All");
    expect(html).toContain("Skipped");
    expect(html).not.toContain("Bought");
    expect(html.match(/<details/g)).toHaveLength(2);
    expect(html).not.toContain("<details open");
    expect(html).toContain('scope="col"');
  });

  it("no em dash, safe external links", () => {
    expect(html).not.toContain("\u2014");
    for (const a of html.match(/<a [^>]*href="https?:[^>]*>/g) ?? []) expect(a).toContain('rel="noopener noreferrer"');
  });
});

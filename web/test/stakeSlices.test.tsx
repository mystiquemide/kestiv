import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StakeView } from "../lib/chain";
import { StatusResponseSchema } from "../lib/schema";
import type { AgentStatus } from "../lib/status";
import { slicesModel } from "../lib/stakeSlices";
import { StakeSlices } from "../components/stake/StakeSlices";

const run = StatusResponseSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/status-response-quote.json", import.meta.url), "utf8"))).dry!;
const T = 1_790_000_000;
const slice = (over: object) => ({ id: "a", status: "locked", lamportsIn: "50000000", tokensOut: "412000000000", buySig: "BUY1", lockSig: "LOCK1", ts: T, ...over });
const liveWith = (slices: object[]): AgentStatus => ({ ok: true, live: { ...run, dry: false, cluster: "mainnet-beta", slices } as never, dry: run, fetchedAt: 1 });
const active = { state: "active", decimals: 6 } as unknown as StakeView;
const down = { ok: false, error: "x" } as unknown as AgentStatus;

describe("slices model", () => {
  it("one row per buy, newest first, numbered from the oldest", () => {
    const m = slicesModel({ status: liveWith([slice({ id: "a", ts: T }), slice({ id: "b", ts: T + 3600, buySig: "BUY2", lockSig: "LOCK2", lamportsIn: "60000000", tokensOut: "500000000" })]), stake: active });
    expect(m.kind).toBe("rows");
    if (m.kind !== "rows") return;
    expect(m.rows.map((r) => r.n)).toEqual([2, 1]);
    expect(m.rows[0]).toMatchObject({ sol: "0.06", tokens: "500", buyHref: expect.stringContaining("solscan.io/tx/BUY2"), lockHref: expect.stringContaining("LOCK2") });
    expect(m.rows[1]!.tokens).toBe("412,000");
    expect(m.rows[1]!.date).toMatch(/^\d{1,2} [A-Z][a-z]{2} 2026 \d\d:\d\d UTC$/);
    expect(m.rows[0]!.buyHref).not.toContain("devnet");
  });

  it("a slice bought but not locked yet says so and has no lock link", () => {
    const m = slicesModel({ status: liveWith([slice({ status: "bought", lockSig: null })]), stake: active });
    if (m.kind !== "rows") throw new Error("rows");
    expect(m.rows[0]!.status).toBe("bought");
    expect(m.rows[0]!.lockHref).toBeNull();
    const html = renderToStaticMarkup(<StakeSlices model={m} />);
    expect(html).toContain("Bought, lock pending");
    expect(html).toContain("Lock pending");
  });

  it("says Amount not recorded rather than guessing tokens", () => {
    const m = slicesModel({ status: liveWith([slice({ tokensOut: null })]), stake: active });
    if (m.kind !== "rows") throw new Error("rows");
    expect(m.rows[0]!.tokens).toBe("Amount not recorded");
  });

  it("dry runs never count: no live slices means the empty state", () => {
    const m = slicesModel({ status: { ok: true, live: null, dry: run, fetchedAt: 1 }, stake: { state: "not_launched" } });
    expect(m.kind).toBe("empty");
    expect(liveWith([]) && slicesModel({ status: liveWith([]), stake: active }).kind).toBe("empty");
  });

  it("feed down is an error, not an empty table", () => {
    expect(slicesModel({ status: down, stake: active }).kind).toBe("error");
  });

  it("renders a real table and a phone list, external links are safe, no em dash", () => {
    const m = slicesModel({ status: liveWith([slice({})]), stake: active });
    const html = renderToStaticMarkup(<StakeSlices model={m} />);
    expect(html).toContain("<table");
    expect(html).toContain('scope="col"');
    expect(html).toContain("md:hidden");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("\u2014");
    expect(renderToStaticMarkup(<StakeSlices model={{ kind: "empty", message: "No slices yet." }} />)).toContain("No slices yet.");
  });
});

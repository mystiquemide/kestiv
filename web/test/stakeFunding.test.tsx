import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { agentPanel } from "../lib/hero";
import { StatusResponseSchema } from "../lib/schema";
import type { AgentStatus } from "../lib/status";
import { FUNDING_EMPTY, fundingModel } from "../lib/stakeFunding";
import { StakeAgentLine } from "../components/stake/StakeAgentLine";
import { StakeFunding } from "../components/stake/StakeFunding";

const run = StatusResponseSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/status-response-quote.json", import.meta.url), "utf8"))).dry!;
const live = (funding: object): AgentStatus => ({ ok: true, live: { ...run, dry: false, funding } as never, dry: run, fetchedAt: 1 });
const down = { ok: false, error: "x" } as unknown as AgentStatus;

describe("funding model", () => {
  it("splits fees and seed by exact share", () => {
    const m = fundingModel(live({ feeLamports: "412000000", seedLamports: "250000000", forwardedLamports: "206000000" }));
    expect(m).toEqual({ kind: "split", fee: { sol: "0.412", pct: 62.23 }, seed: { sol: "0.25", pct: 37.77 }, total: "0.662", forwarded: "0.206" });
  });

  it("all fees: seed share is zero and forwarded is hidden when none was sent", () => {
    const m = fundingModel(live({ feeLamports: "1000000000", seedLamports: "0", forwardedLamports: "0" }));
    if (m.kind !== "split") throw new Error("split");
    expect(m.fee.pct).toBe(100);
    expect(m.seed.pct).toBe(0);
    expect(m.forwarded).toBeNull();
  });

  it("nothing in yet, no live agent, or a dry run only: empty, never a made-up split", () => {
    expect(fundingModel(live({ feeLamports: "0", seedLamports: "0", forwardedLamports: "0" }))).toEqual({ kind: "empty", message: FUNDING_EMPTY });
    expect(fundingModel({ ok: true, live: null, dry: run, fetchedAt: 1 }).kind).toBe("empty");
  });

  it("feed down is an error", () => {
    expect(fundingModel(down).kind).toBe("error");
  });

  it("renders an accessible bar with both legends and no em dash", () => {
    const html = renderToStaticMarkup(<StakeFunding model={fundingModel(live({ feeLamports: "412000000", seedLamports: "250000000", forwardedLamports: "0" }))} />);
    expect(html).toContain('role="img"');
    expect(html).toContain("Creator fees");
    expect(html).toContain("Founder seed");
    expect(html).toContain("width:62.23%");
    expect(html).not.toContain("Sent on to the founder");
    expect(html).not.toContain("—");
    expect(renderToStaticMarkup(<StakeFunding model={{ kind: "empty", message: FUNDING_EMPTY }} />)).toContain("No money has come in yet");
  });
});

describe("agent line", () => {
  const now = run.ts + 720;
  it("shows when the agent reported, its state and reason, and says a dry run bought nothing", () => {
    const html = renderToStaticMarkup(<StakeAgentLine model={agentPanel({ ok: true, live: null, dry: run, fetchedAt: 1 }, now)} />);
    expect(html).toContain("reported");
    expect(html).toContain("12 min ago");
    expect(html).toContain("practice run, nothing bought");
    expect(html).not.toContain("—");
  });

  it("links to decisions because that page exists", () => {
    const html = renderToStaticMarkup(<StakeAgentLine model={agentPanel({ ok: true, live: null, dry: run, fetchedAt: 1 }, now)} />);
    expect(html).toContain('href="/decisions"');
  });

  it("says so when the feed is down or the agent never ran", () => {
    expect(renderToStaticMarkup(<StakeAgentLine model={agentPanel(down, now)} />)).toContain("status feed isn");
    expect(renderToStaticMarkup(<StakeAgentLine model={agentPanel({ ok: true, live: null, dry: null, fetchedAt: 1 }, now)} />)).toContain("hasn&#x27;t run yet");
  });

  it("flags a stale report", () => {
    const html = renderToStaticMarkup(<StakeAgentLine model={agentPanel({ ok: true, live: null, dry: run, fetchedAt: 1 }, run.ts + 3 * 3600)} />);
    expect(html).toContain("3h ago");
    expect(html).toContain("older than 2 hours");
  });
});

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STATE_GUIDE, decisionsModel } from "../lib/decisions";
import { StatusResponseSchema } from "../lib/schema";
import type { AgentStatus } from "../lib/status";
import { NextSteps } from "../components/NextSteps";
import { PageNote } from "../components/PageNote";
import { SkipLink } from "../components/SkipLink";
import { RunHero } from "../components/run/RunHero";
import { DecisionList } from "../components/decisions/DecisionList";

const base = StatusResponseSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/status-response-quote.json", import.meta.url), "utf8"))).dry!;
const mk = (over: object) => ({ ...base.runs[0]!, ...over });
const dry = (runs: object[]): AgentStatus => ({ ok: true, live: null, dry: { ...base, runs: runs as never }, fetchedAt: 1 });

describe("page endings", () => {
  it("next steps render real links", () => {
    const html = renderToStaticMarkup(<NextSteps title="Keep going" steps={[{ label: "See the live stake", href: "/stake", text: "x" }, { label: "Run it", href: "/run", text: "y" }]} />);
    expect(html).toContain('href="/stake"');
    expect(html).toContain('href="/run"');
    expect(html).toContain("<h2");
  });

  it("the page note carries the disclaimer and X, and GitHub only with a repo url", () => {
    const off = renderToStaticMarkup(<PageNote />);
    expect(off).toContain("Nothing here is financial advice.");
    expect(off).toContain('aria-label="X @Kestiv_xyz"');
    expect(off).not.toContain('aria-label="GitHub"');
    expect(renderToStaticMarkup(<PageNote repoUrl="https://github.com/x/kestiv" />)).toContain('aria-label="GitHub"');
    expect(off).toContain('rel="noopener noreferrer"');
  });

  it("run hero always has an action and no longer repeats the install line", () => {
    const html = renderToStaticMarkup(<RunHero repoUrl={undefined} />);
    expect(html).toContain('href="/stake"');
    expect(html).toContain('href="/decisions"');
    expect(html).not.toContain("install command shows here");
    expect(renderToStaticMarkup(<RunHero repoUrl="https://github.com/x/kestiv" />)).toContain("Get the code");
  });

  it("skip link is the first, keyboard-reachable stop and points at #main", () => {
    const html = renderToStaticMarkup(<SkipLink />);
    expect(html).toContain('href="#main"');
    expect(html).toContain("Skip to content");
    expect(html).toContain("sr-only");
  });
});

describe("decisions explainer", () => {
  it("explains dry runs once, not on every row", () => {
    const m = decisionsModel(dry([mk({ id: 1 }), mk({ id: 2 })]));
    if (m.kind !== "rows") throw new Error("rows");
    expect(m.mixed).toBe(false);
    expect(m.note).toMatch(/^Every run below is a practice run on .+\. Nothing was signed or bought\./);
    const html = renderToStaticMarkup(<DecisionList rows={m.rows} counts={m.counts} mixed={m.mixed} />);
    expect(html).not.toContain("Practice run<");
  });

  it("a mix of live and practice runs marks only the practice rows", () => {
    const live = { ...base, dry: false, runs: [mk({ id: 1, dry: false, state: "BOUGHT" })] as never };
    const m = decisionsModel({ ok: true, live, dry: { ...base, runs: [mk({ id: 1, dry: true })] as never }, fetchedAt: 1 });
    if (m.kind !== "rows") throw new Error("rows");
    expect(m.mixed).toBe(true);
    expect(m.note).toMatch(/^Rows marked Practice run are practice runs on/);
    const html = renderToStaticMarkup(<DecisionList rows={m.rows} counts={m.counts} mixed={m.mixed} />);
    expect((html.match(/>Practice run</g) ?? []).length).toBe(1);
  });

  it("no note when there are no practice runs", () => {
    const live = { ...base, dry: false, runs: [mk({ id: 1, dry: false })] as never };
    const m = decisionsModel({ ok: true, live, dry: null, fetchedAt: 1 });
    if (m.kind !== "rows") throw new Error("rows");
    expect(m.note).toBeNull();
  });

  it("names the states in plain words", () => {
    expect(STATE_GUIDE.map((g) => g.state)).toEqual(["Waiting", "Skipped", "Bought"]);
    expect(STATE_GUIDE.map((g) => g.text).join(" ")).not.toContain("—");
  });

  it("an error row explains itself", () => {
    const m = decisionsModel(dry([mk({ id: 1, state: "ERROR", reason: "run_failed", gates: [] })]));
    if (m.kind !== "rows") throw new Error("rows");
    const html = renderToStaticMarkup(<DecisionList rows={m.rows} counts={m.counts} mixed={m.mixed} />);
    expect(html).toContain("nothing was bought or signed");
    expect(html).toContain("tries again on its next run");
  });
});

describe("microcopy", () => {
  it("the feed error has a next step and only claims chain numbers where they are shown", async () => {
    const { FEED_ERROR, FEED_ERROR_CHAIN } = await import("../lib/howItWorks");
    expect(FEED_ERROR).toBe("We can't reach the agent's reports right now. Try again in a minute.");
    expect(FEED_ERROR_CHAIN).toContain("Numbers from the chain are unaffected.");
    expect(FEED_ERROR).not.toMatch(/status feed|stake numbers/i);
  });

  it("UsePod's skip reason is in plain words", async () => {
    const { reasonText } = await import("../lib/hero");
    expect(reasonText("usepod_skip", 1)).not.toMatch(/circular|concentrated/i);
    expect(reasonText("run_failed", 1)).toContain("tries again on its next run");
    expect(reasonText("lock_terms_violation", 1)).toContain("Check the lock on Jupiter Lock");
  });

  it("the copy button announces Copied through a live region and keeps a steady label", async () => {
    const { CopyButton } = await import("../components/CopyButton");
    const html = renderToStaticMarkup(<CopyButton value="x" label="Copy loop command" />);
    expect(html).toContain('aria-label="Copy loop command"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("uses on chain, practice run and no em dashes in the visible labels", async () => {
    const { readFileSync } = await import("node:fs");
    const files = ["../components/hero/LockPanel.tsx", "../components/how/HowItWorks.tsx", "../components/decisions/DecisionList.tsx"];
    for (const f of files) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      expect(src, f).not.toMatch(/onchain/i);
      expect(src, f).not.toContain("—");
    }
  });
});

describe("loading state", () => {
  it("shows placeholder blocks and a status for screen readers, never a blank screen", async () => {
    const Loading = (await import("../app/loading")).default;
    const html = renderToStaticMarkup(<Loading />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading");
    expect((html.match(/class="skeleton /g) ?? []).length).toBeGreaterThan(3);
  });
});

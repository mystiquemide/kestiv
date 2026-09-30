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
    expect(html).not.toContain("Dry run");
  });

  it("a mix of live and practice runs marks only the practice rows", () => {
    const live = { ...base, dry: false, runs: [mk({ id: 1, dry: false, state: "BOUGHT" })] as never };
    const m = decisionsModel({ ok: true, live, dry: { ...base, runs: [mk({ id: 1, dry: true })] as never }, fetchedAt: 1 });
    if (m.kind !== "rows") throw new Error("rows");
    expect(m.mixed).toBe(true);
    expect(m.note).toMatch(/^Rows marked Dry run are practice runs on/);
    const html = renderToStaticMarkup(<DecisionList rows={m.rows} counts={m.counts} mixed={m.mixed} />);
    expect((html.match(/>Dry run</g) ?? []).length).toBe(1);
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

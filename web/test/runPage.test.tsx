import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusResponseSchema } from "../lib/schema";
import type { AgentStatus } from "../lib/status";
import { ENV_ROWS, NEVER, TERMINAL_FALLBACK, costRows, dryRunTranscript, initBlock, installCommands, terminalPreview } from "../lib/runPage";
import { LIVE_ROUTES } from "../lib/routes";
import { RunFacts } from "../components/run/RunFacts";
import { RunHero } from "../components/run/RunHero";
import { RunSteps } from "../components/run/RunSteps";

const run = StatusResponseSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/status-response-quote.json", import.meta.url), "utf8"))).dry!;
const status: AgentStatus = { ok: true, live: null, dry: run, fetchedAt: 1 };
const down = { ok: false, error: "x" } as unknown as AgentStatus;
const skill = readFileSync(new URL("../../skill/kestiv/SKILL.md", import.meta.url), "utf8");

describe("run page content", () => {
  it("is a live route", () => {
    expect(LIVE_ROUTES).toContain("/run");
  });

  it("lists exactly the skill's required variables as needed, and the rest as optional", () => {
    const required = [...skill.matchAll(/- name: (\w+)\n(?:(?!- name:).*\n)*?/g)].map((m) => m[1]!);
    const optional = [...skill.matchAll(/- name: (\w+)\n(?:    .*\n)*?    optional: true/g)].map((m) => m[1]!);
    const needed = required.filter((n) => !optional.includes(n));
    expect(ENV_ROWS.filter((r) => r.needed).map((r) => r.name).sort()).toEqual(needed.sort());
    expect(ENV_ROWS.filter((r) => !r.needed).map((r) => r.name).sort()).toEqual(optional.sort());
  });

  it("shows the install command only when there is a public repo url", () => {
    expect(installCommands(undefined)).toBeNull();
    expect(installCommands("https://github.com/x/kestiv")![0]).toBe("git clone https://github.com/x/kestiv kestiv");
  });

  it("the init block uses the agent's real policy", () => {
    expect(initBlock({ stakeShareBps: 5000, capBps: 700 })).toContain("Fee share    50% to stake, 50% to founder");
    expect(initBlock({ stakeShareBps: 5000, capBps: 700 })).toContain("Cap          7% of supply");
    expect(initBlock({ stakeShareBps: 3000, capBps: 500 })).toContain("Fee share    30% to stake, 70% to founder");
    expect(initBlock(null).join("\n")).toContain("90-day cliff, then 365 days linear");
  });

  it("the dry-run transcript is the real run printed like the CLI", () => {
    const t = dryRunTranscript(status);
    if (t.kind !== "run") throw new Error("run");
    expect(t.lines[0]).toBe(`DRY-RUN ${run.state} ${run.reason}`);
    expect(t.lines.filter((l) => l.includes(" gate ")).length).toBe(run.gates.length);
    expect(t.lines.some((l) => /gate (PASS|FAIL)  holders  value=/.test(l))).toBe(true);
    expect(t.caption).toMatch(/^Real output from the agent's practice run on \d{1,2} [A-Z][a-z]{2} 2026\. Nothing was signed\.$/);
  });

  it("transcript states: feed down and no run yet", () => {
    expect(dryRunTranscript(down).kind).toBe("error");
    expect(dryRunTranscript({ ok: true, live: null, dry: null, fetchedAt: 1 }).kind).toBe("empty");
  });

  it("costs come from the agent's own numbers, with a fallback", () => {
    const rows = costRows(status);
    expect(rows[0]!.value).toBe("About 0.006 SOL per lock");
    expect(rows[1]!.value).toBe("None");
    expect(rows[2]!.value).toMatch(/lamports/);
    expect(costRows(down)[2]!.value).toBe("A few hundred lamports per check");
  });
});

describe("run page markup", () => {
  const html = renderToStaticMarkup(<RunSteps repoUrl={undefined} policy={{ stakeShareBps: 5000, capBps: 700 }} transcript={dryRunTranscript(status)} />);

  it("has six ordered steps, copy buttons and labelled code", () => {
    expect(html.match(/<li /g)).toHaveLength(6);
    expect(html).toContain("<ol");
    expect(html).toContain('aria-label="Copy wallet commands"');
    expect(html).toContain("solana-keygen new --outfile kestiv.json");
    expect(html).toContain("npm run kestiv -- loop");
  });

  it("without a public repo, says the install command comes later and shows no clone command", () => {
    expect(html).toContain("The install command shows here as soon as the code is public.");
    expect(html).not.toContain("git clone");
  });

  it("with a repo url it shows the clone command", () => {
    const withRepo = renderToStaticMarkup(<RunSteps repoUrl="https://github.com/x/kestiv" policy={null} transcript={dryRunTranscript(status)} />);
    expect(withRepo).toContain("git clone https://github.com/x/kestiv kestiv");
  });

  it("never prints a secret value and has no em dash", () => {
    expect(html).not.toMatch(/sk-|Bearer|api[_-]?key=/i);
    expect(html).not.toContain("—");
    const all = renderToStaticMarkup(<RunFacts costs={costRows(status)} />) + renderToStaticMarkup(<RunHero repoUrl={undefined} />);
    expect(all).not.toContain("—");
  });

  it("hero has one h1 and the code button only with a repo", () => {
    expect(renderToStaticMarkup(<RunHero repoUrl={undefined} />).match(/<h1/g)).toHaveLength(1);
    expect(renderToStaticMarkup(<RunHero repoUrl={undefined} />)).not.toContain("Get the code");
    expect(renderToStaticMarkup(<RunHero repoUrl="https://github.com/x/kestiv" />)).toContain("Get the code");
  });

  it("promises nothing the code doesn't do", () => {
    expect(NEVER.map((n) => n.label)).toEqual(["Sell", "Cancel or move locked tokens", "Let a model pick the amount"]);
    const facts = renderToStaticMarkup(<RunFacts costs={costRows(status)} />);
    expect(facts).not.toMatch(/unmovable|will (profit|earn)/i);
  });
});

describe("run hero terminal", () => {
  it("shows the real command and the agent's real output, not a photo", () => {
    const lines = terminalPreview(status);
    expect(lines[0]).toBe("$ npm run kestiv -- run-once --dry-run");
    expect(lines).toContain(`DRY-RUN ${run.state} ${run.reason}`);
    expect(lines.some((l) => /^… \d+ more lines$/.test(l))).toBe(true);
    expect(lines.at(-1)).toBe("$ npm run kestiv -- loop");
    const html = renderToStaticMarkup(<RunHero repoUrl={undefined} terminal={lines} />);
    expect(html).toContain('aria-label="kestiv in a terminal"');
    expect(html).toContain("DRY-RUN");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("—");
  });

  it("falls back to the three commands when the feed is down", () => {
    expect(terminalPreview(down)).toEqual(TERMINAL_FALLBACK);
    expect(renderToStaticMarkup(<RunHero repoUrl={undefined} />)).toContain("run-once --dry-run");
  });
});

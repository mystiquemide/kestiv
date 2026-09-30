import { readFileSync, existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { decisionsModel } from "../lib/decisions";
import { SIGNER_ROWS, signerLines } from "../lib/signerScreen";
import { StatusResponseSchema } from "../lib/schema";
import type { AgentStatus } from "../lib/status";
import { DecisionsBand } from "../components/band/DecisionsBand";
import { ProtectionTabs } from "../components/protect/ProtectionTabs";
import { TerminalPanel } from "../components/run/TerminalPanel";

const run = StatusResponseSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/status-response-quote.json", import.meta.url), "utf8"))).dry!;
const status: AgentStatus = { ok: true, live: null, dry: run, fetchedAt: 1 };
const allow = readFileSync(new URL("../../agent/src/chain/allowlist.ts", import.meta.url), "utf8");
const jup = readFileSync(new URL("../../agent/src/lock/jupiter.ts", import.meta.url), "utf8");

describe("no stock photos", () => {
  it("the photo files and their module are gone", () => {
    expect(existsSync(new URL("../public/photos", import.meta.url))).toBe(false);
    expect(existsSync(new URL("../lib/photos.ts", import.meta.url))).toBe(false);
  });

  it("no component imports next/image for a photo or mentions Unsplash", () => {
    for (const f of ["../components/protect/Protection.tsx", "../components/band/DecisionsBand.tsx", "../components/ErrorPage.tsx", "../components/run/RunHero.tsx"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      expect(src, f).not.toMatch(/next\/image|unsplash|photos/i);
    }
  });
});

describe("signer screen", () => {
  it("shows the allowed discriminators that the agent really allows", () => {
    for (const r of SIGNER_ROWS.filter((x) => x.verdict === "allowed" && x.detail)) expect(allow + jup, r.name).toContain(r.detail);
  });

  it("shows the refused discriminators that Jupiter Lock really uses for those instructions", () => {
    const upd = SIGNER_ROWS.find((r) => r.name === "Jupiter Lock change recipient")!;
    const can = SIGNER_ROWS.find((r) => r.name === "Jupiter Lock cancel")!;
    expect(jup).toContain(`"${upd.detail}"`);
    expect(jup).toContain(`"${can.detail}"`);
  });

  it("renders as a terminal with refusals marked and no sell, cancel or transfer allowed", () => {
    const lines = signerLines();
    expect(lines.join("\n")).toMatch(/Jupiter Lock cancel\s+refused/);
    expect(lines.some((l) => /allowed/.test(l) && /sell|cancel|transfer/i.test(l))).toBe(false);
    const html = renderToStaticMarkup(<TerminalPanel lines={lines} title="kestiv signer" compact />);
    expect(html).toContain('aria-label="kestiv signer in a terminal"');
    expect(html).toContain("text-[#E58F7B]");
    expect(html).not.toContain("—");
  });
});

describe("product screens in the protection tabs and the closing band", () => {
  it("each tab has its own visual and only the active one is shown", () => {
    const html = renderToStaticMarkup(
      <ProtectionTabs tabs={[{ id: "a", label: "A", content: <p>a</p> }, { id: "b", label: "B", content: <p>b</p> }]} visuals={{ a: <i>visual-a</i>, b: <i>visual-b</i> }} />,
    );
    expect(html).toContain("visual-a");
    expect(html).toContain("visual-b");
    expect(html.match(/hidden=""/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("the band shows the agent's latest decisions from the feed, three at most", () => {
    const html = renderToStaticMarkup(<DecisionsBand model={decisionsModel(status)} />);
    expect(html).toContain("Latest decisions");
    expect(html).toContain("Every buy adds a step. No step can be taken away.");
    expect((html.match(/<li /g) ?? []).length).toBeLessThanOrEqual(3);
    expect(html).toContain("Practice runs");
    expect(html).toContain('href="/decisions"');
  });

  it("the band says so when the agent has not reported", () => {
    const html = renderToStaticMarkup(<DecisionsBand model={decisionsModel({ ok: true, live: null, dry: null, fetchedAt: 1 })} />);
    expect(html).toContain("hasn&#x27;t reported yet");
  });
});

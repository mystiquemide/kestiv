import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StakeView } from "../lib/chain";
import { LIVE_ROUTES } from "../lib/routes";
import { StatusResponseSchema } from "../lib/schema";
import type { AgentStatus } from "../lib/status";
import { LOCKED_LINE, budgetText, firstLockBudget, lockLine, stakeHero } from "../lib/stakePage";
import { StakeHero } from "../components/stake/StakeHero";

const response = StatusResponseSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/status-response-quote.json", import.meta.url), "utf8")));
const run = response.dry!;
const withRun: AgentStatus = { ok: true, live: null, dry: run, fetchedAt: 1 };
const down = { ok: false, error: "down" } as unknown as AgentStatus;
const env = { cluster: "mainnet-beta" as const, wallet: "HXqExLdZuPYAqaP6vS87yr6ZEm6Q1KtudFx1nzYwKzs4", founder: "DC1B96Rw9yftgZN7HYktA47nneFSDbu5mpedkYPxJryB" };
const off = { cancelableBySender: false, cancelableByRecipient: false, pausable: false, canUpdateRate: false, transferableBySender: false, transferableByRecipient: false };
const active = (over: Partial<StakeView> = {}) =>
  ({ state: "active", mint: "M", cluster: "mainnet-beta", supply: "1000", decimals: 6, capBps: 700, rpcKind: "helius", contractId: "STREAM", recipient: env.founder, sender: "S", stakePct: "1.84", flags: off, ...over }) as unknown as StakeView;

describe("stake page route", () => {
  it("is listed as live so the buttons that point at it show", () => {
    expect(LIVE_ROUTES).toContain("/stake");
  });
});

describe("stake hero model", () => {
  it("not launched: says so, no lock line, wallet link only", () => {
    const m = stakeHero({ stake: { state: "not_launched" }, status: down, proof: null, env });
    expect(m.state).toBe("not_launched");
    expect(m.headline).toBe("Not live yet");
    expect(m.lockLine).toBeNull();
    expect(m.links.map((l) => l.label)).toEqual(["Kestiv wallet on Solscan"]);
  });

  it("active: percentage, founder, Streamflow first, and the lock line from the flags", () => {
    const m = stakeHero({ stake: active(), status: withRun, proof: null, env });
    expect(m.headline).toBe("1.84%");
    expect(m.recipient?.short).toBe("DC1B…JryB");
    expect(m.lockLine).toBe(LOCKED_LINE);
    expect(m.links[0]!.href).toContain("streamflow.finance/contract/solana/mainnet/STREAM");
  });

  it("never claims more than the contract shows", () => {
    expect(lockLine({ ...off, transferableByRecipient: true })).toMatch(/Switched on.*transfer/);
    expect(lockLine({ ...off, pausable: true, canUpdateRate: true })).toMatch(/pause, rate change/);
    const m = stakeHero({ stake: active({ flags: { ...off, cancelableBySender: true } } as never), status: withRun, proof: null, env });
    expect(m.lockLine).not.toBe(LOCKED_LINE);
  });

  it("cap reached: says fees go to the founder", () => {
    const m = stakeHero({ stake: active({ state: "cap_reached" } as never), status: withRun, proof: null, env });
    expect(m.state).toBe("cap_reached");
    expect(m.lead).toMatch(/Cap reached at 7%\. Fees now go straight to the founder/);
  });

  it("no contract: 0.00% with the first-lock budget from the agent's own numbers", () => {
    const m = stakeHero({ stake: { state: "no_contract", mint: "M", cluster: "mainnet-beta", supply: "1", decimals: 6, capBps: 700, rpcKind: "helius" } as StakeView, status: withRun, proof: null, env });
    expect(m.headline).toBe("0.00%");
    expect(m.budget).not.toBeNull();
    const b = firstLockBudget(withRun)!;
    expect(b.neededLamports).toBe(b.parts.reduce((a, p) => a + p.lamports, 0));
    expect(b.haveLamports).toBe(run.budget!.walletLamports);
    expect(b.progress).toBeGreaterThanOrEqual(0);
    expect(b.progress).toBeLessThanOrEqual(1);
    expect(budgetText(b)).toMatch(/^The first lock needs about .* SOL: contract .*, first slice .*, reserve .*\. Kestiv has .* SOL\.$/);
  });

  it("no budget when the agent feed is down", () => {
    expect(firstLockBudget(down)).toBeNull();
  });

  it("chain error: says so and keeps the founder", () => {
    const m = stakeHero({ stake: { state: "rpc_error", rpcKind: "public", error: "x" }, status: down, proof: null, env });
    expect(m.state).toBe("error");
    expect(m.recipient?.full).toBe(env.founder);
  });
});

describe("stake hero markup", () => {
  it("renders one h1, a copy button, a safe external primary link and no em dash", () => {
    const html = renderToStaticMarkup(<StakeHero model={stakeHero({ stake: active(), status: withRun, proof: null, env })} />);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Copy founder address"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("View on Streamflow");
    expect(html).not.toContain("—");
  });

  it("shows the progress bar with an accessible value when there is no contract", () => {
    const m = stakeHero({ stake: { state: "no_contract", mint: "M", cluster: "mainnet-beta", supply: "1", decimals: 6, capBps: 700, rpcKind: "helius" } as StakeView, status: withRun, proof: null, env });
    const html = renderToStaticMarkup(<StakeHero model={m} />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("aria-valuetext");
  });
});

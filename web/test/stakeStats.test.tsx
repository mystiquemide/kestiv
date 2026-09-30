import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DevnetProof, StakeView } from "../lib/chain";
import { StatusResponseSchema } from "../lib/schema";
import type { AgentStatus } from "../lib/status";
import { stakeStats } from "../lib/stakeStats";
import { StakeStats } from "../components/stake/StakeStats";

const DAY = 86_400;
const T0 = 1_790_000_000;
const run = StatusResponseSchema.parse(JSON.parse(readFileSync(new URL("./fixtures/status-response-quote.json", import.meta.url), "utf8"))).dry!;
const status: AgentStatus = { ok: true, live: null, dry: run, fetchedAt: 1 };
const down = { ok: false, error: "x" } as unknown as AgentStatus;
const terms = { depositedAmount: "150000000", withdrawnAmount: "0", cliff: T0 + 90 * DAY, cliffAmount: "0", end: T0 + 455 * DAY, period: DAY, amountPerPeriod: "410959" };
const lock = {
  id: "L", recipient: "R", mint: "M", creator: "C", updateRecipientMode: 0, cancelMode: 0, tokenProgramFlag: 1, cliff: terms.cliff, frequency: DAY,
  cliffUnlockAmount: "0", amountPerPeriod: terms.amountPerPeriod, periods: 365, claimed: "0", start: T0, cancelledAt: 0, deposited: "150000035", end: terms.end,
};
const proof = { locks: [lock] } as unknown as DevnetProof;
const live = (over = {}) =>
  ({ state: "active", decimals: 6, stakePct: "1.84", locked: "18400000000000", vested: "0", nextUnlock: T0 + 90 * DAY, capBps: 700, ...over }) as unknown as StakeView;
const get = (m: ReturnType<typeof stakeStats>, l: string) => m.cells.find((c) => c.label === l)!;

describe("stake stats", () => {
  it("live locks: locked, vested, next unlock and cap, no Devnet label", () => {
    const m = stakeStats({ stake: live(), status, proof: null, devnetDecimals: null, now: T0 });
    expect(m.label).toBeNull();
    expect(m.cells.map((c) => c.label)).toEqual(["Locked", "Vested so far", "Next unlock", "Cap"]);
    expect(get(m, "Locked").value).toBe("18,400,000");
    expect(get(m, "Vested so far").value).toBe("0");
    expect(get(m, "Next unlock").value).toBe("20 Dec 2026");
    expect(get(m, "Cap").value).toBe("7% of supply");
    expect(get(m, "Cap").sub).toBe("Stake is 1.84% now");
  });

  it("says fully unlocked when there is no next unlock", () => {
    const m = stakeStats({ stake: live({ nextUnlock: null }), status, proof: null, devnetDecimals: null, now: T0 });
    expect(get(m, "Next unlock").value).toBe("Fully unlocked");
  });

  it("before launch: numbers come from the labelled devnet proof", () => {
    const m = stakeStats({ stake: { state: "not_launched" }, status, proof, devnetDecimals: 6, now: T0 + 3600 });
    expect(m.label).toBe("Devnet proof");
    expect(get(m, "Locked").value).toBe("150");
    expect(get(m, "Vested so far").value).toBe("0");
    expect(get(m, "Next unlock").value).toBe("21 Dec 2026");
    expect(get(m, "Cap").sub).toBe("Buying stops at the cap");
  });

  it("proof past the cliff shows vested growing and locked shrinking", () => {
    const m = stakeStats({ stake: { state: "not_launched" }, status, proof, devnetDecimals: 6, now: terms.cliff + 10 * DAY });
    expect(get(m, "Vested so far").value).toBe("4.11");
    expect(get(m, "Locked").value).toBe("145.89");
  });

  it("nothing to show: says nothing locked yet, and still gives the cap", () => {
    const m = stakeStats({ stake: { state: "not_launched" }, status: down, proof: null, devnetDecimals: null, now: T0 });
    expect(get(m, "Locked").value).toBe("Nothing locked yet");
    expect(get(m, "Next unlock").value).toBe("After the first lock");
    expect(get(m, "Cap").value).toBe("7% of supply");
  });

  it("renders a definition list with the Devnet pill and no em dash", () => {
    const html = renderToStaticMarkup(<StakeStats model={stakeStats({ stake: { state: "not_launched" }, status, proof, devnetDecimals: 6, now: T0 })} />);
    expect(html).toContain("<dl");
    expect(html.match(/<dt/g)).toHaveLength(4);
    expect(html).toContain("Devnet proof");
    expect(html).not.toContain("—");
  });
});

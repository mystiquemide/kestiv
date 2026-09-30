import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DevnetProof, StakeView, StreamStep } from "../lib/chain";
import { stakeChart, stakeChartCard } from "../lib/stakeChart";
import { StakeLock } from "../components/stake/StakeLock";

const DAY = 86_400;
const T0 = 1_790_000_000;
const steps: StreamStep[] = [
  { sig: "SIG1", ts: T0, kind: "create", amount: "100000000" },
  { sig: "SIG2", ts: T0 + 3600, kind: "topup", amount: "50000000" },
];
const terms = { depositedAmount: "150000000", withdrawnAmount: "0", cliff: T0 + 90 * DAY, cliffAmount: "0", end: T0 + 90 * DAY + 365 * DAY, period: DAY, amountPerPeriod: "410959" };
const build = (over: Partial<Parameters<typeof stakeChart>[0]> = {}) =>
  stakeChart({ steps, decimals: 6, terms, cluster: "devnet", label: "Devnet proof", now: T0 + 7200, ...over })!;

describe("stake chart model", () => {
  it("draws one point per deposit, equal width, rising cumulative", () => {
    const c = build();
    expect(c.points).toHaveLength(2);
    expect(c.points[0]!.x).toBe(0);
    expect(c.points[1]!.x).toBeCloseTo(0.12, 5);
    expect(c.points[0]!.y).toBeGreaterThan(c.points[1]!.y);
    expect(c.points.map((p) => p.cumulative)).toEqual(["100", "150"]);
    expect(c.points[1]!.href).toContain("solscan.io/tx/SIG2?cluster=devnet");
  });

  it("puts a cliff line, dated ticks and a token axis on the chart", () => {
    const c = build();
    expect(c.cliff).not.toBeNull();
    expect(c.cliff!.x).toBeGreaterThan(0.24);
    expect(c.cliff!.x).toBeLessThan(1);
    expect(c.xTicks.map((t) => t.sub)).toEqual(["First deposit", "Today", "Unlocks begin", "Unlocks end"]);
    expect(c.yTicks.map((t) => t.label)).toEqual(["150", "0"]);
    expect(c.ariaLabel).toMatch(/^2 deposits locking 150 tokens\. Nothing unlocks before /);
  });

  it("schedules daily unlocks that end at zero, flat until the cliff", () => {
    const c = build();
    expect(c.faint.startsWith("M240,")).toBe(true);
    expect(c.faint.endsWith("V1000")).toBe(true);
    expect((c.faint.match(/V/g) ?? []).length).toBeGreaterThan(300);
    expect((c.faint.match(/V/g) ?? []).length).toBeLessThanOrEqual(402);
  });

  it("drops the cliff line once it is in the past and starts from what is still locked", () => {
    const c = build({ now: terms.cliff + 10 * DAY });
    expect(c.cliff).toBeNull();
    expect(c.xTicks.map((t) => t.sub)).toEqual(["First deposit", "Today", "Unlocks end"]);
    expect(c.faint).not.toMatch(/^M240,80 /);
  });

  it("returns null with no deposits and never exceeds the stride cap on tiny periods", () => {
    expect(stakeChart({ steps: [], decimals: 6, terms, cluster: "devnet", label: "Live", now: T0 })).toBeNull();
    const fast = build({ terms: { ...terms, period: 1 } });
    expect((fast.faint.match(/V/g) ?? []).length).toBeLessThanOrEqual(402);
  });
});

describe("stake chart card", () => {
  const proof = { cluster: "devnet", stream: { mint: "M", depositedAmount: terms.depositedAmount, withdrawnAmount: "0", cliff: terms.cliff, cliffAmount: "0", end: terms.end, period: DAY, amountPerPeriod: terms.amountPerPeriod }, steps, sigs: { create: "C", topup: "T", cancel: "X" }, cancel: null } as unknown as DevnetProof;
  const live = { state: "active", cluster: "mainnet-beta", decimals: 6, deposited: terms.depositedAmount, withdrawn: "0", cliff: terms.cliff, end: terms.end, period: DAY, amountPerPeriod: terms.amountPerPeriod, steps } as unknown as StakeView;

  it("uses the labelled devnet proof before launch", () => {
    const card = stakeChartCard({ stake: { state: "not_launched" }, proof, devnetDecimals: 6, now: T0 + 7200 });
    expect(card.kind === "chart" && card.chart.label).toBe("Devnet proof");
  });

  it("uses the live contract when there is one", () => {
    const card = stakeChartCard({ stake: live, proof, devnetDecimals: 6, now: T0 + 7200 });
    expect(card.kind === "chart" && card.chart.label).toBe("Live");
    expect(card.kind === "chart" && card.chart.points[0]!.href).toContain("solscan.io/tx/SIG1");
    expect(card.kind === "chart" && card.chart.points[0]!.href).not.toContain("devnet");
  });

  it("says so when there is nothing to draw", () => {
    const card = stakeChartCard({ stake: { state: "not_launched" }, proof: null, devnetDecimals: null, now: 1 });
    expect(card.kind).toBe("empty");
  });

  it("renders an accessible chart, a Devnet pill, a copy of the legend and no em dash", () => {
    const html = renderToStaticMarkup(<StakeLock card={stakeChartCard({ stake: { state: "not_launched" }, proof, devnetDecimals: 6, now: T0 + 7200 })} />);
    expect(html).toContain('role="img"');
    expect(html).toContain("Devnet proof");
    expect(html).toContain("Every buy adds a step");
    expect(html).toContain("Each brass square is one deposit");
    expect(html.match(/aria-pressed/g)).toHaveLength(2);
    expect(html).not.toContain("—");
  });
});

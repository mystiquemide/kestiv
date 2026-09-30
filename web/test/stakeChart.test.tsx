import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DevnetProof, LockStep, StakeView } from "../lib/chain";
import type { LockData } from "../lib/lock";
import { lockTerms } from "../lib/lock";
import { stakeChart, stakeChartCard } from "../lib/stakeChart";
import { StakeLock } from "../components/stake/StakeLock";

const DAY = 86_400;
const T0 = 1_790_000_000;

const lockAt = (id: string, start: number, periods: number, perPeriod: string): LockData => ({
  id, recipient: "R", mint: "M", creator: "C", updateRecipientMode: 0, cancelMode: 0, tokenProgramFlag: 1,
  cliff: start + 90 * DAY, frequency: DAY, cliffUnlockAmount: "0", amountPerPeriod: perPeriod, periods, claimed: "0", start, cancelledAt: 0,
  deposited: (BigInt(periods) * BigInt(perPeriod)).toString(), end: start + 90 * DAY + periods * DAY,
});
const locks = [lockAt("LOCK1", T0, 365, "274000"), lockAt("LOCK2", T0 + 3600, 365, "137000")];
const steps: LockStep[] = locks.map((l) => ({ id: l.id, ts: l.start, amount: l.deposited }));
const schedules = locks.map(lockTerms);
const build = (over: Partial<Parameters<typeof stakeChart>[0]> = {}) =>
  stakeChart({ steps, decimals: 6, schedules, cluster: "devnet", label: "Devnet proof", now: T0 + 7200, ...over })!;

describe("stake chart model", () => {
  it("draws one point per lock, equal width, rising cumulative", () => {
    const c = build();
    expect(c.points).toHaveLength(2);
    expect(c.points[0]!.x).toBe(0);
    expect(c.points[0]!.y).toBeGreaterThan(c.points[1]!.y);
    expect(c.points.map((p) => p.label)).toEqual(["Lock 1", "Lock 2"]);
    expect(c.points.map((p) => p.cumulative)).toEqual(["100.01", "150.02"]);
    expect(c.points[1]!.href).toBe("https://solscan.io/account/LOCK2?cluster=devnet");
  });

  it("puts a cliff line, dated ticks and a token axis on the chart", () => {
    const c = build();
    expect(c.cliff).not.toBeNull();
    expect(c.cliff!.x).toBeGreaterThan(0.2);
    expect(c.cliff!.x).toBeLessThan(1);
    expect(c.xTicks.map((t) => t.sub)).toEqual(["First lock", "Today", "Unlocks begin", "Unlocks end"]);
    expect(c.yTicks.map((t) => t.label)).toEqual(["150.02", "0"]);
    expect(c.ariaLabel).toMatch(/^2 locks holding 150.02 tokens\. Nothing unlocks before /);
  });

  it("schedules daily unlocks that end at zero, flat until the cliff", () => {
    const c = build();
    expect(c.faint.endsWith("V1000")).toBe(true);
    expect((c.faint.match(/V/g) ?? []).length).toBeGreaterThan(300);
    expect((c.faint.match(/V/g) ?? []).length).toBeLessThanOrEqual(402);
  });

  it("drops the cliff line once it is in the past", () => {
    const c = build({ now: schedules[1]!.cliff + 10 * DAY });
    expect(c.cliff).toBeNull();
    expect(c.xTicks.map((t) => t.sub)).toEqual(["First lock", "Today", "Unlocks end"]);
  });

  it("returns null with no locks and never exceeds the stride cap on tiny periods", () => {
    expect(stakeChart({ steps: [], decimals: 6, schedules, cluster: "devnet", label: "Live", now: T0 })).toBeNull();
    const fast = build({ schedules: schedules.map((s) => ({ ...s, period: 1, end: s.cliff + 365 })) });
    expect((fast.faint.match(/V/g) ?? []).length).toBeLessThanOrEqual(402);
  });
});

describe("stake chart card", () => {
  const proof = { cluster: "devnet", mint: "M", locks, steps, guarantees: { cancelNobody: true, recipientNobody: true }, sigs: { locks: ["A", "B"], cancel: "X" }, cancel: null } as unknown as DevnetProof;
  const live = { state: "active", cluster: "mainnet-beta", decimals: 6, locks, steps } as unknown as StakeView;

  it("uses the labelled devnet proof before launch", () => {
    const card = stakeChartCard({ stake: { state: "not_launched" }, proof, devnetDecimals: 6, now: T0 + 7200 });
    expect(card.kind === "chart" && card.chart.label).toBe("Devnet proof");
  });

  it("uses the live locks when there are any", () => {
    const card = stakeChartCard({ stake: live, proof, devnetDecimals: 6, now: T0 + 7200 });
    expect(card.kind === "chart" && card.chart.label).toBe("Live");
    expect(card.kind === "chart" && card.chart.points[0]!.href).toBe("https://lock.jup.ag/escrow/LOCK1");
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
    expect(html).toContain("Each brass square is one lock");
    expect(html.match(/aria-pressed/g)).toHaveLength(2);
    expect(html).not.toContain("—");
  });
});

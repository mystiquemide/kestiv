import type { DevnetProof, LockStep, StakeView } from "./chain";
import { dateUtc, tokensCompact, tokensFull } from "./format";
import { lockTerms } from "./lock";
import { lockUrl, type LinkCluster } from "./links";
import { vestingNow, type VestingTerms } from "./vesting";

export interface ChartPoint {
  /** 0 to 1 across the plot, 0 to 1 down it. */
  x: number;
  y: number;
  /** "Lock 1", "Lock 2", ... in the order they were made. */
  label: string;
  date: string;
  amount: string;
  cumulative: string;
  href: string;
}

export interface StakeChartModel {
  label: "Live" | "Devnet proof";
  /** Paths in a 1000 x 1000 box, meant to be stretched with non-scaling strokes. */
  solid: string;
  faint: string;
  cliff: { x: number; date: string } | null;
  points: ChartPoint[];
  xTicks: { x: number; label: string; sub: string; align: "left" | "center" | "right" }[];
  yTicks: { y: number; label: string }[];
  ariaLabel: string;
  legend: string;
}

/** Every deposit gets the same width left of "now", then the axis switches to real time until the unlock ends. */
const TREAD = 0.12;
const MAX_LEFT = 0.4;
const TOP = 0.08;
const MAX_STEPS = 400;

const r = (n: number) => Math.round(n * 1000 * 100) / 100;

export function stakeChart(args: {
  steps: LockStep[];
  decimals: number;
  /** One schedule per lock, in any order. */
  schedules: VestingTerms[];
  cluster: LinkCluster;
  label: "Live" | "Devnet proof";
  now: number;
}): StakeChartModel | null {
  const { steps, decimals, schedules, cluster, label, now } = args;
  if (steps.length === 0) return null;

  const sorted = [...steps].sort((a, b) => a.ts - b.ts);
  let run = 0n;
  const cum = sorted.map((s) => (run += BigInt(s.amount)));
  const total = cum[cum.length - 1]!;
  if (total <= 0n) return null;

  const n = sorted.length;
  const a = Math.min(MAX_LEFT, n * TREAD);
  const tread = a / n;
  const tB0 = Math.max(now, sorted[n - 1]!.ts);
  const lastEnd = Math.max(...schedules.map((x) => x.end));
  const firstCliff = Math.min(...schedules.map((x) => x.cliff));
  const end = Math.max(lastEnd, tB0 + 1);
  const X = (t: number) => a + ((t - tB0) / (end - tB0)) * (1 - a);
  const Y = (v: bigint) => TOP + (1 - TOP) * (1 - Number(v) / Number(total));

  const points: ChartPoint[] = sorted.map((s, i) => ({
    x: i * tread,
    y: Y(cum[i]!),
    label: `Lock ${i + 1}`,
    date: dateUtc(s.ts),
    amount: tokensFull(s.amount, decimals),
    cumulative: tokensFull(cum[i]!.toString(), decimals),
    href: lockUrl(s.id, cluster),
  }));

  let solid = `M${r(points[0]!.x)},${r(points[0]!.y)}`;
  for (let i = 1; i < n; i++) solid += ` H${r(points[i]!.x)} V${r(points[i]!.y)}`;
  solid += ` H${r(a)}`;

  // The daily unlocks the locks have scheduled, added together, assuming nothing else is locked.
  const lockedAt = (t: number) => schedules.reduce((sum, sc) => sum + BigInt(vestingNow(sc, t).locked), 0n);
  const totalDeposited = schedules.reduce((sum, sc) => sum + BigInt(sc.depositedAmount), 0n);
  const times = [
    ...new Set(
      schedules.flatMap((sc) => {
        const out: number[] = [];
        if (BigInt(sc.cliffAmount) > 0n && sc.cliff > now) out.push(sc.cliff);
        const periods = sc.period > 0 ? Math.round((sc.end - sc.cliff) / sc.period) : 0;
        for (let k = 1; k <= periods; k++) {
          const t = sc.cliff + k * sc.period;
          if (t > now) out.push(t);
        }
        return out;
      }),
    ),
  ].sort((x, y) => x - y);
  let faint = `M${r(a)},${r(Y(lockedAt(now)))}`;
  if (now < firstCliff) faint += ` H${r(X(firstCliff))}`;
  const stride = Math.max(1, Math.ceil(times.length / MAX_STEPS));
  for (let k = 0; k < times.length; k += stride) {
    const t = times[k]!;
    const locked = lockedAt(t);
    faint += ` H${r(X(t))} V${r(Y(locked > totalDeposited ? totalDeposited : locked))}`;
  }
  faint += ` H1 V${r(Y(0n))}`;

  const cliffX = firstCliff >= tB0 ? X(firstCliff) : null;
  const cliff = cliffX === null ? null : { x: cliffX, date: dateUtc(firstCliff) };

  // With a single lock the first-lock and today ticks sit almost on top of each other, so they share one label.
  const firstDate = dateUtc(sorted[0]!.ts);
  const todayDate = dateUtc(tB0);
  const xTicks: StakeChartModel["xTicks"] = a <= TREAD
    ? [{ x: 0, label: firstDate, sub: firstDate === todayDate ? "First lock, today" : `First lock, today is ${todayDate}`, align: "left" }]
    : [
        { x: 0, label: firstDate, sub: "First lock", align: "left" },
        { x: a, label: todayDate, sub: "Today", align: "center" },
      ];
  if (cliff) xTicks.push({ x: cliff.x, label: cliff.date, sub: "Unlocks begin", align: "center" });
  xTicks.push({ x: 1, label: dateUtc(lastEnd), sub: "Unlocks end", align: "right" });

  const yTicks = [
    { y: Y(total), label: tokensCompact(total.toString(), decimals) },
    { y: Y(0n), label: "0" },
  ];

  const tokens = tokensFull(total.toString(), decimals);
  const ariaLabel =
    `${n} ${n === 1 ? "lock" : "locks"} holding ${tokens} tokens. ` +
    (cliff ? `Nothing unlocks before ${cliff.date}, then a little each day until ${dateUtc(lastEnd)}.` : `Unlocks end ${dateUtc(lastEnd)}.`);

  const legend =
    "Each brass square is one lock, and each gets the same width. Right of Today the axis is real time. The faint line is the daily unlock the locks have scheduled, if nothing else is locked.";

  return { label, solid, faint, cliff, points, xTicks, yTicks, ariaLabel, legend };
}

export type StakeChartCard =
  | { kind: "chart"; chart: StakeChartModel }
  | { kind: "empty"; message: string };

const EMPTY = "$KESTIV has no lock yet, and the devnet proof couldn't be loaded. The staircase appears with the first lock.";

/** The live locks when there are any, otherwise the labelled devnet proof. */
export function stakeChartCard(args: {
  stake: StakeView;
  proof: DevnetProof | null;
  devnetDecimals: number | null;
  now: number;
}): StakeChartCard {
  const { stake, proof, devnetDecimals, now } = args;
  if (stake.state === "active" || stake.state === "cap_reached") {
    const chart = stakeChart({
      steps: stake.steps,
      decimals: stake.decimals,
      schedules: stake.locks.map(lockTerms),
      cluster: stake.cluster === "devnet" ? "devnet" : "mainnet-beta",
      label: "Live",
      now,
    });
    if (chart) return { kind: "chart", chart };
  }
  if (proof && devnetDecimals !== null) {
    const chart = stakeChart({
      steps: proof.steps,
      decimals: devnetDecimals,
      schedules: proof.locks.map(lockTerms),
      cluster: "devnet",
      label: "Devnet proof",
      now,
    });
    if (chart) return { kind: "chart", chart };
  }
  return { kind: "empty", message: EMPTY };
}

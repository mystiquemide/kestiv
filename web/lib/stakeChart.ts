import type { DevnetProof, StakeView, StreamStep } from "./chain";
import { dateUtc, tokensCompact, tokensFull } from "./format";
import { solscanTx, type LinkCluster } from "./links";
import { vestingNow, type VestingTerms } from "./vesting";

export interface ChartPoint {
  /** 0 to 1 across the plot, 0 to 1 down it. */
  x: number;
  y: number;
  kind: "create" | "topup";
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
  steps: StreamStep[];
  decimals: number;
  terms: VestingTerms;
  cluster: LinkCluster;
  label: "Live" | "Devnet proof";
  now: number;
}): StakeChartModel | null {
  const { steps, decimals, terms, cluster, label, now } = args;
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
  const end = Math.max(terms.end, tB0 + 1);
  const X = (t: number) => a + ((t - tB0) / (end - tB0)) * (1 - a);
  const Y = (v: bigint) => TOP + (1 - TOP) * (1 - Number(v) / Number(total));

  const points: ChartPoint[] = sorted.map((s, i) => ({
    x: i * tread,
    y: Y(cum[i]!),
    kind: s.kind,
    date: dateUtc(s.ts),
    amount: tokensFull(s.amount, decimals),
    cumulative: tokensFull(cum[i]!.toString(), decimals),
    href: solscanTx(s.sig, cluster),
  }));

  let solid = `M${r(points[0]!.x)},${r(points[0]!.y)}`;
  for (let i = 1; i < n; i++) solid += ` H${r(points[i]!.x)} V${r(points[i]!.y)}`;
  solid += ` H${r(a)}`;

  // Unlocks the contract has scheduled, assuming nothing else is deposited.
  const deposited = BigInt(terms.depositedAmount);
  const lockedNow = BigInt(vestingNow(terms, now).locked);
  let faint = `M${r(a)},${r(Y(lockedNow))}`;
  const first = now < terms.cliff ? terms.cliff : terms.cliff + (Math.floor((now - terms.cliff) / terms.period) + 1) * terms.period;
  if (now < terms.cliff) faint += ` H${r(X(terms.cliff))}`;
  if (terms.period > 0) {
    const count = Math.max(0, Math.floor((terms.end - first) / terms.period) + 1);
    const stride = Math.max(1, Math.ceil(count / MAX_STEPS));
    for (let k = 0; k < count; k += stride) {
      const t = Math.min(first + k * terms.period, terms.end);
      const locked = BigInt(vestingNow(terms, t).locked);
      faint += ` H${r(X(t))} V${r(Y(locked > deposited ? deposited : locked))}`;
    }
  }
  faint += ` H1 V${r(Y(0n))}`;

  const cliffX = terms.cliff >= tB0 ? X(terms.cliff) : null;
  const cliff = cliffX === null ? null : { x: cliffX, date: dateUtc(terms.cliff) };

  const xTicks: StakeChartModel["xTicks"] = [
    { x: 0, label: dateUtc(sorted[0]!.ts), sub: "First deposit", align: "left" },
    { x: a, label: dateUtc(tB0), sub: "Today", align: "center" },
  ];
  if (cliff) xTicks.push({ x: cliff.x, label: cliff.date, sub: "Unlocks begin", align: "center" });
  xTicks.push({ x: 1, label: dateUtc(terms.end), sub: "Unlocks end", align: "right" });

  const yTicks = [
    { y: Y(total), label: tokensCompact(total.toString(), decimals) },
    { y: Y(0n), label: "0" },
  ];

  const tokens = tokensFull(total.toString(), decimals);
  const ariaLabel =
    `${n} ${n === 1 ? "deposit" : "deposits"} locking ${tokens} tokens. ` +
    (cliff ? `Nothing unlocks before ${cliff.date}, then a little each day until ${dateUtc(terms.end)}.` : `Unlocks end ${dateUtc(terms.end)}.`);

  const legend =
    "Each brass square is one deposit, and each gets the same width. Right of Today the axis is real time. The faint line is the daily unlock the contract has scheduled, if nothing else is added.";

  return { label, solid, faint, cliff, points, xTicks, yTicks, ariaLabel, legend };
}

export type StakeChartCard =
  | { kind: "chart"; chart: StakeChartModel }
  | { kind: "empty"; message: string };

const EMPTY = "$KESTIV has no lock yet, and the devnet proof couldn't be loaded. The staircase appears with the first lock.";

/** The live contract when there is one, otherwise the labelled devnet proof. */
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
      terms: { depositedAmount: stake.deposited, withdrawnAmount: stake.withdrawn, cliff: stake.cliff, cliffAmount: "0", end: stake.end, period: stake.period, amountPerPeriod: stake.amountPerPeriod },
      cluster: stake.cluster === "devnet" ? "devnet" : "mainnet-beta",
      label: "Live",
      now,
    });
    if (chart) return { kind: "chart", chart };
  }
  if (proof && devnetDecimals !== null) {
    const s = proof.stream;
    const chart = stakeChart({
      steps: proof.steps,
      decimals: devnetDecimals,
      terms: { depositedAmount: s.depositedAmount, withdrawnAmount: s.withdrawnAmount, cliff: s.cliff, cliffAmount: s.cliffAmount, end: s.end, period: s.period, amountPerPeriod: s.amountPerPeriod },
      cluster: "devnet",
      label: "Devnet proof",
      now,
    });
    if (chart) return { kind: "chart", chart };
  }
  return { kind: "empty", message: EMPTY };
}

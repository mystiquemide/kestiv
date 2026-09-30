import type { DevnetProof, StakeView, StreamStep } from "./chain";
import { dateUtc, formatFractionPct, shortAddress, solFromLamports, tokensCompact, tokensFull } from "./format";
import { gateView, type GateView } from "./gates";
import { solscanTx, type LinkCluster } from "./links";
import type { PublicStatus } from "./schema";
import type { AgentStatus } from "./status";
import { timeAgo } from "./time";

export const FEED_ERROR = "The agent's status feed isn't answering. The stake numbers come straight from the chain.";

const clusterOf = (s: PublicStatus): LinkCluster => (s.cluster === "devnet" ? "devnet" : "mainnet-beta");

/** Latest run shown in the cards: live if present, else dry. */
function pick(status: AgentStatus): { run: PublicStatus; source: "live" | "dry" } | null {
  if (!status.ok) return null;
  if (status.live) return { run: status.live, source: "live" };
  if (status.dry) return { run: status.dry, source: "dry" };
  return null;
}

const solscanToken = (mint: string) => `https://solscan.io/token/${mint}`;
const dryLabelOf = (run: PublicStatus, source: "live" | "dry") =>
  source === "dry" ? { token: shortAddress(run.mint, 4), href: solscanToken(run.mint) } : null;

// ---------- card 1: fees ----------

export type FeesCard =
  | { kind: "feed_error"; text: string; message: string }
  | { kind: "empty"; text: string; message: string }
  | {
      kind: "inflows";
      text: string;
      rows: { amount: string; source: "Fee" | "Seed"; ts: number; initialAgo: string; href: string }[];
      totals: string;
    };

export function feesCard(status: AgentStatus, nowSec: number): FeesCard {
  const any = status.ok ? (status.live ?? status.dry) : null;
  const text = any
    ? `Creator fees land in Kestiv's wallet. ${Number((any.policy.stakeShareBps / 100).toFixed(2))}% funds the stake, the rest goes straight to the founder.`
    : "Creator fees land in Kestiv's wallet. A set share funds the stake, the rest goes to the founder.";
  if (!status.ok) return { kind: "feed_error", text, message: FEED_ERROR };

  const live = status.live;
  if (!live || live.inflows.length === 0) return { kind: "empty", text, message: "No fees yet. They start with the first trade." };

  const cluster = clusterOf(live);
  const sol = (l: string) => solFromLamports(Number(l));
  return {
    kind: "inflows",
    text,
    rows: live.inflows.slice(0, 5).map((i) => ({
      amount: `${sol(i.lamports)} SOL`,
      source: i.source === "fee" ? "Fee" : "Seed",
      ts: i.ts,
      initialAgo: timeAgo(i.ts, nowSec),
      href: solscanTx(i.sig, cluster),
    })),
    totals: `Fees ${sol(live.funding.feeLamports)} SOL · Seed ${sol(live.funding.seedLamports)} SOL · Sent to founder ${sol(live.funding.forwardedLamports)} SOL`,
  };
}

// ---------- card 2: checks ----------

const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];

export type ChecksCard =
  | { kind: "feed_error"; text: string; message: string }
  | { kind: "empty"; text: string; message: string }
  | { kind: "run"; text: string; dryLabel: { token: string; href: string } | null; gates: GateView[] };

export function checksCard(status: AgentStatus): ChecksCard {
  const tail = "before any buy: holders, trading volume, price impact, price against its 6 hour average, and a UsePod second opinion.";
  const picked = pick(status);
  const total = picked ? picked.run.gates.length : 0;
  const text = `${total > 0 ? total : WORDS[11]} checks ${tail}`;
  if (!status.ok) return { kind: "feed_error", text, message: FEED_ERROR };
  if (!picked) return { kind: "empty", text, message: "The agent hasn't run yet." };
  return { kind: "run", text, dryLabel: dryLabelOf(picked.run, picked.source), gates: picked.run.gates.map(gateView) };
}

// ---------- card 3: the buy ----------

export type BuyCard =
  | { kind: "feed_error"; text: string; message: string }
  | { kind: "no_quote"; text: string; message: string; dryLabel: { token: string; href: string } | null }
  | {
      kind: "quote";
      text: string;
      dryLabel: { token: string; href: string } | null;
      pays: string;
      receives: string;
      impact: string;
      route: string;
    };

export function buyCard(status: AgentStatus, decimalsFallback: number | null = null): BuyCard {
  const picked = pick(status);
  const text = picked
    ? `At least ${solFromLamports(picked.run.policy.minSliceLamports)} SOL, never more than ${Number((picked.run.policy.liquidityShareBps / 100).toFixed(2))}% of the pool's liquidity, routed through Jupiter.`
    : "A small slice each time, never more than a fraction of the pool's liquidity, routed through Jupiter.";
  if (!status.ok) return { kind: "feed_error", text, message: FEED_ERROR };
  const noQuote = "No quote yet. The agent quotes a buy once there are fees to spend.";
  if (!picked) return { kind: "no_quote", text, message: noQuote, dryLabel: null };

  const { run, source } = picked;
  const dryLabel = dryLabelOf(run, source);
  const q = run.quote;
  const decimals = q?.decimals ?? decimalsFallback;
  if (!q || decimals === null) return { kind: "no_quote", text, message: noQuote, dryLabel };
  return {
    kind: "quote",
    text,
    dryLabel,
    pays: `${solFromLamports(Number(q.inLamports))} SOL`,
    receives: `${tokensCompact(q.outAmount, decimals)} tokens`,
    impact: formatFractionPct(q.priceImpact),
    route: q.route.join(" → "),
  };
}

// ---------- card 4: the staircase ----------

export interface StaircasePoint {
  /** Start of this deposit's tread. */
  x: number;
  y: number;
  sig: string;
  ts: number;
  kind: "create" | "topup";
  amount: string;
  cumulative: string;
}

export interface Staircase {
  width: number;
  height: number;
  treadWidth: number;
  points: StaircasePoint[];
  path: string;
  firstDate: string;
  lastDate: string;
  total: string;
  ariaLabel: string;
}

const PAD = { left: 16, right: 16, top: 36, bottom: 12 };

/**
 * Step chart of cumulative deposits. x is deposit order, never time: every deposit is one tread of equal width,
 * and its height is the cumulative total from zero.
 */
export function staircase(steps: StreamStep[], decimals: number, width = 600, height = 180): Staircase | null {
  if (steps.length === 0) return null;
  const sorted = [...steps].sort((a, b) => a.ts - b.ts);
  let running = 0n;
  const cum = sorted.map((s) => (running += BigInt(s.amount)));
  const total = cum[cum.length - 1]!;

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const tread = plotW / sorted.length;
  const round = (v: number) => Math.round(v * 100) / 100;
  const Y = (c: bigint) => PAD.top + plotH - (Number(c) / Number(total)) * plotH;

  const points: StaircasePoint[] = sorted.map((s, i) => ({
    x: round(PAD.left + i * tread),
    y: round(Y(cum[i]!)),
    sig: s.sig,
    ts: s.ts,
    kind: s.kind,
    amount: s.amount,
    cumulative: cum[i]!.toString(),
  }));

  let path = `M${points[0]!.x},${points[0]!.y}`;
  for (let i = 1; i < points.length; i++) path += ` H${points[i]!.x} V${points[i]!.y}`;
  path += ` H${round(width - PAD.right)}`;

  const tokens = (raw: string | bigint) => tokensFull(raw.toString(), decimals);
  const n = sorted.length;
  const ariaLabel =
    n === 1
      ? `1 deposit of ${tokens(sorted[0]!.amount)} tokens`
      : `${n} deposits, from ${tokens(cum[0]!)} to ${tokens(total)} tokens`;

  return {
    width,
    height,
    treadWidth: round(tread),
    points,
    path,
    firstDate: dateUtc(sorted[0]!.ts),
    lastDate: dateUtc(sorted[n - 1]!.ts),
    total: tokens(total),
    ariaLabel,
  };
}

export type LockCard =
  | { kind: "error"; text: string; message: string; label: "Devnet proof" }
  | {
      kind: "chart";
      text: string;
      label: "Live" | "Devnet proof" | null;
      chart: Staircase;
      list: { title: "Created" | "Top-up"; amount: string; date: string; href: string }[];
    };

const LOCK_TEXT = "One Streamflow contract holds the whole stake. Every buy tops it up. Nothing can pull tokens out early.";

export function lockCard(
  stake: StakeView,
  proof: DevnetProof | null,
  live: { decimals: number } | null,
  devnetDecimals: number | null,
): LockCard {
  let steps: StreamStep[];
  let decimals: number;
  let cluster: LinkCluster;
  let label: "Live" | "Devnet proof" | null;

  if ((stake.state === "active" || stake.state === "cap_reached") && live) {
    steps = stake.steps;
    decimals = live.decimals;
    cluster = stake.cluster;
    label = null;
  } else if (proof && devnetDecimals !== null) {
    steps = proof.steps;
    decimals = devnetDecimals;
    cluster = "devnet";
    label = "Devnet proof";
  } else {
    return { kind: "error", text: LOCK_TEXT, message: "Couldn't load the contract history right now.", label: "Devnet proof" };
  }

  const chart = staircase(steps, decimals);
  if (!chart) return { kind: "error", text: LOCK_TEXT, message: "Couldn't load the contract history right now.", label: "Devnet proof" };

  return {
    kind: "chart",
    text: LOCK_TEXT,
    label,
    chart,
    list: chart.points.map((p) => ({
      title: p.kind === "create" ? "Created" : "Top-up",
      amount: `${tokensFull(p.amount, decimals)} tokens`,
      date: dateUtc(p.ts),
      href: solscanTx(p.sig, cluster),
    })),
  };
}


import type { DevnetProof, StakeView, StreamFlags } from "./chain";
import { DEVNET_PROOF } from "./chain";
import { solscanAccount, solscanTx, streamflowUrl, type LinkCluster } from "./links";
import { dateUtc, formatStakePct, shortAddress, solFromLamports, tokensCompact } from "./format";
import { gateView } from "./gates";
import type { PublicStatus } from "./schema";
import type { AgentStatus } from "./status";
import { STALE_AFTER_SEC, timeAgo } from "./time";
import { DEFAULT_CAP_BPS } from "./vesting";

// ---------- shared ----------

export interface Row {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "default" | "brass" | "refusal";
  href?: string;
}

const solscanToken = (mint: string) => `https://solscan.io/token/${mint}`;

export function capText(capBps: number): string {
  return `${Number((capBps / 100).toFixed(2))}% of supply`;
}

// ---------- reasons ----------

export function reasonText(reason: string, minSliceLamports: number): string {
  const min = `${solFromLamports(minSliceLamports)} SOL`;
  const map: Record<string, string> = {
    cap_reached: "Cap reached. Fees now go straight to the founder.",
    cooldown: "Waiting between buys. Kestiv spaces them out.",
    price_unavailable: "No price for the token yet.",
    volume_unavailable: "No trading volume data for the token yet.",
    volume_below_min: "Trading volume is below the minimum.",
    holders_unavailable: "The holder count isn't available yet.",
    holders_below_min: "Too few holders so far.",
    liquidity_unavailable: "No liquidity data for the token yet.",
    not_enough_trades: "Not enough recent trades to judge the price.",
    budget_below_min_slice: `Not enough fees yet for a ${min} buy.`,
    liquidity_cap_below_min_slice: `The pool is too thin for a ${min} buy.`,
    cap_headroom_below_min_slice: `Too close to the cap for a ${min} buy.`,
    price_impact_too_high: "The buy would move the price too much.",
    price_above_vwap: "The price is well above its 6 hour average.",
    usepod_skip: "UsePod flagged the recent trading as circular or concentrated.",
    usepod_quote_too_high: "UsePod's check cost more than Kestiv will pay.",
    usepod_unavailable: "The UsePod second opinion wasn't available, so Kestiv skipped.",
    all_gates_passed: "Every check passed.",
    gates_passed_so_far: "Every check so far passed.",
    all_evaluated_gates_passed: "Every check Kestiv could run passed.",
    insufficient_sol_for_contract: "Not enough SOL to open the vesting contract yet.",
    pending_confirmation: "Waiting for the last buy to confirm.",
    lock_terms_violation: "The vesting contract's terms changed. Kestiv stopped.",
    run_failed: "The run hit an error and stopped.",
    buy_unconfirmed: "A buy was sent but isn't confirmed yet.",
    buy_failed: "The buy didn't go through.",
    bought_lock_deferred: "Bought. The lock finishes on the next run.",
    bought_and_locked: "Bought and locked.",
  };
  return map[reason] ?? reason.replace(/_/g, " ");
}

export const REASON_CODES = [
  "cap_reached", "cooldown", "price_unavailable", "volume_unavailable", "volume_below_min", "holders_unavailable",
  "holders_below_min", "liquidity_unavailable", "not_enough_trades", "budget_below_min_slice", "liquidity_cap_below_min_slice",
  "cap_headroom_below_min_slice", "price_impact_too_high", "price_above_vwap", "usepod_skip", "usepod_quote_too_high",
  "usepod_unavailable", "all_gates_passed", "gates_passed_so_far", "all_evaluated_gates_passed", "insufficient_sol_for_contract",
  "pending_confirmation", "lock_terms_violation", "run_failed", "buy_unconfirmed", "buy_failed", "bought_lock_deferred", "bought_and_locked",
] as const;

export function stateLabel(state: string): string {
  return state.replace(/_/g, " ");
}

// ---------- stake panel ----------

export type StakePanelModel =
  | { kind: "not_launched"; headline: string; text: string; rows: Row[] }
  | { kind: "no_contract" | "active" | "cap_reached"; headline: string; note?: string; rows: Row[] }
  | { kind: "error"; message: string; rows: Row[] };

export interface StakePanelInput {
  stake: StakeView;
  status: AgentStatus;
  founder?: string;
  cluster: LinkCluster;
}

function agentRun(status: AgentStatus): { run: PublicStatus; source: "live" | "dry" } | null {
  if (!status.ok) return null;
  if (status.live) return { run: status.live, source: "live" };
  if (status.dry) return { run: status.dry, source: "dry" };
  return null;
}

export function stakePanel({ stake, status, founder, cluster }: StakePanelInput): StakePanelModel {
  const agent = status.ok ? (status.live ?? status.dry) : null;
  const capBps =
    agent?.policy.capBps ?? ("capBps" in stake ? stake.capBps : DEFAULT_CAP_BPS);

  const recipientValue = stake.state === "active" || stake.state === "cap_reached" ? stake.recipient : founder;
  const recipient: Row[] = recipientValue
    ? [{ label: "Founder", value: shortAddress(recipientValue), mono: true, href: solscanAccount(recipientValue, cluster) }]
    : [];
  const cap: Row = { label: "Cap", value: capText(capBps) };
  const feeShare: Row[] = agent
    ? [{ label: "Fees to stake", value: `${Number((agent.policy.stakeShareBps / 100).toFixed(2))}%` }]
    : [];
  // Mirrors FOUNDER_TERMS in agent/src/lock/terms.ts: 90 day cliff, then daily periods.
  const unlocks: Row = { label: "Unlocks", value: "After 90 days, then daily" };
  const config = [...feeShare, unlocks];

  switch (stake.state) {
    case "not_launched":
      return {
        kind: "not_launched",
        headline: "Not live yet",
        text: "$KESTIV launches on pump.fun. The first lock opens after launch.",
        rows: [...config, ...recipient, cap],
      };
    case "rpc_error":
      return {
        kind: "error",
        message: "Couldn't read the chain right now. This refreshes every minute.",
        rows: recipient,
      };
    case "no_contract":
      return {
        kind: "no_contract",
        headline: "0.00%",
        rows: [{ label: "Locked", value: "0", mono: true }, { label: "Next unlock", value: "After the first lock" }, ...config, ...recipient, cap],
      };
    case "active":
    case "cap_reached": {
      const rows: Row[] = [
        { label: "Locked", value: tokensCompact(stake.locked, stake.decimals), mono: true, tone: "brass" },
        { label: "Next unlock", value: stake.nextUnlock === null ? "Fully unlocked" : dateUtc(stake.nextUnlock), mono: stake.nextUnlock !== null },
        ...config,
        ...recipient,
        cap,
      ];
      return {
        kind: stake.state,
        headline: formatStakePct(stake.stakePct),
        note: stake.state === "cap_reached" ? `Cap reached at ${Number((capBps / 100).toFixed(2))}%. Fees now go straight to the founder.` : undefined,
        rows,
      };
    }
  }
}

// ---------- agent panel ----------

export interface CheckRow {
  label: string;
  value: string;
  threshold: string;
  pass: boolean;
}

export type AgentPanelModel =
  | { kind: "feed_error"; message: string }
  | { kind: "empty"; message: string }
  | {
      kind: "run";
      source: "live" | "dry";
      ts: number;
      initialAgo: string;
      dryLabel: { token: string; href: string } | null;
      state: string;
      reason: string;
      checks: CheckRow[];
      passed: number;
      total: number;
      stale: string | null;
    };

const HERO_CHECKS = ["holders", "volume_24h_usd", "price_impact", "slice_lamports"];

export function agentPanel(status: AgentStatus, nowSec: number): AgentPanelModel {
  if (!status.ok) {
    return {
      kind: "feed_error",
      message: "The agent's status feed isn't answering. The stake numbers come straight from the chain.",
    };
  }
  const picked = agentRun(status);
  if (!picked) return { kind: "empty", message: "The agent hasn't run yet." };

  const { run, source } = picked;
  const checks: CheckRow[] = [];
  for (const name of HERO_CHECKS) {
    const g = run.gates.find((x) => x.name === name);
    if (!g) continue;
    const v = gateView(g);
    checks.push({ label: v.label, value: v.value, threshold: v.threshold, pass: v.pass });
  }
  const passed = run.gates.filter((g) => g.pass).length;
  const age = nowSec - run.ts;

  return {
    kind: "run",
    source,
    ts: run.ts,
    initialAgo: timeAgo(run.ts, nowSec),
    dryLabel: source === "dry" ? { token: shortAddress(run.mint, 4), href: solscanToken(run.mint) } : null,
    state: stateLabel(run.state),
    reason: reasonText(run.reason, run.policy.minSliceLamports),
    checks,
    passed,
    total: run.gates.length,
    stale: age > STALE_AFTER_SEC ? `Agent last reported ${timeAgo(run.ts, nowSec)}.` : null,
  };
}

// ---------- lock panel ----------

export interface LockPanelModel {
  label: "Live" | "Devnet proof";
  error: string | null;
  cells: { label: string; value: string; tone: "default" | "refusal" }[];
  cancelAttemptHref: string | null;
  streamflowHref: string | null;
}

const cell = (label: string, value: string, bad: boolean) => ({ label, value, tone: bad ? ("refusal" as const) : ("default" as const) });

export function flagCells(f: StreamFlags) {
  return [
    cell("Cancel", f.cancelableBySender || f.cancelableByRecipient ? "Allowed" : "Nobody", f.cancelableBySender || f.cancelableByRecipient),
    cell("Transfer", f.transferableBySender || f.transferableByRecipient ? "Allowed" : "Nobody", f.transferableBySender || f.transferableByRecipient),
    cell("Rate changes", f.canUpdateRate ? "On" : "Off", f.canUpdateRate),
    cell("Pause", f.pausable ? "On" : "Off", f.pausable),
  ];
}

export function lockPanel(stake: StakeView, proof: DevnetProof | null): LockPanelModel {
  if (stake.state === "active" || stake.state === "cap_reached") {
    return {
      label: "Live",
      error: null,
      cells: flagCells(stake.flags),
      cancelAttemptHref: null,
      streamflowHref: streamflowUrl(stake.contractId, stake.cluster),
    };
  }
  if (!proof) {
    return {
      label: "Devnet proof",
      error: "Couldn't load the devnet proof right now.",
      cells: [],
      cancelAttemptHref: null,
      streamflowHref: null,
    };
  }
  return {
    label: "Devnet proof",
    error: null,
    cells: flagCells(proof.stream.flags),
    cancelAttemptHref: proof.cancel?.err ? solscanTx(proof.cancel.sig, "devnet") : null,
    streamflowHref: streamflowUrl(DEVNET_PROOF.contractId, "devnet"),
  };
}


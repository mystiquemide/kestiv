import type { StakeView } from "./chain";
import { dateUtc, solFromLamports, tokensFull } from "./format";
import { FEED_ERROR } from "./howItWorks";
import { solscanTx, type LinkCluster } from "./links";
import type { AgentStatus } from "./status";

export interface SliceRow {
  n: number;
  date: string;
  sol: string;
  tokens: string;
  status: "locked" | "bought" | "pending" | "failed";
  buyHref: string | null;
  lockHref: string | null;
}

export type SlicesModel =
  | { kind: "rows"; rows: SliceRow[] }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string };

export const STATUS_TEXT: Record<SliceRow["status"], string | null> = {
  locked: null,
  bought: "Bought, lock pending",
  pending: "Buy pending",
  failed: "Failed",
};

const time = (ts: number) => {
  const d = new Date(ts * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
};

const EMPTY =
  "No slices yet. Each buy the agent makes shows up here with its buy and lock transaction.";

/**
 * One row per buy the agent made, newest first, numbered from the first. Only the live agent's slices count:
 * a dry run buys nothing. Several slices can share one lock transaction, so tokens come from each slice's own record.
 */
export function slicesModel(args: { status: AgentStatus; stake: StakeView }): SlicesModel {
  const { status, stake } = args;
  if (!status.ok) return { kind: "error", message: FEED_ERROR };
  const live = status.live;
  if (!live || live.slices.length === 0) return { kind: "empty", message: EMPTY };

  const decimals = stake.state === "active" || stake.state === "cap_reached" || stake.state === "no_contract" ? stake.decimals : null;
  const cluster: LinkCluster = live.cluster === "devnet" ? "devnet" : "mainnet-beta";
  const oldestFirst = [...live.slices].sort((a, b) => a.ts - b.ts);
  const rows = oldestFirst
    .map<SliceRow>((s, i) => ({
      n: i + 1,
      date: `${dateUtc(s.ts)} ${time(s.ts)}`,
      sol: solFromLamports(Number(s.lamportsIn)),
      tokens: s.tokensOut && decimals !== null ? tokensFull(s.tokensOut, decimals) : "Amount not recorded",
      status: (["locked", "bought", "pending", "failed"] as const).find((x) => x === s.status) ?? "pending",
      buyHref: s.buySig ? solscanTx(s.buySig, cluster) : null,
      lockHref: s.lockSig ? solscanTx(s.lockSig, cluster) : null,
    }))
    .reverse();
  return { kind: "rows", rows };
}

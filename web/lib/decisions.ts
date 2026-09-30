import { dateTimeUtc, shortAddress } from "./format";
import { gateView, type GateView } from "./gates";
import { reasonText, stateLabel } from "./hero";
import { FEED_ERROR } from "./howItWorks";
import { solscanTx, type LinkCluster } from "./links";
import type { PublicStatus } from "./schema";
import type { AgentStatus } from "./status";

export type Kind = "bought" | "skipped" | "waiting" | "error";

export interface UsepodView {
  verdict: "buy" | "skip" | null;
  line: string;
  model: string | null;
  paidHref: string | null;
}

export interface DecisionRow {
  key: string;
  ts: number;
  date: string;
  state: string;
  kind: Kind;
  reason: string;
  dry: boolean;
  token: string;
  gates: GateView[];
  usepod: UsepodView | null;
  txs: { label: string; href: string }[];
}

export type DecisionsModel =
  | { kind: "rows"; rows: DecisionRow[]; counts: Record<"all" | Kind, number>; note: string | null; mixed: boolean }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string };

export const DECISIONS_EMPTY = "No runs yet. The first check shows up here within a few minutes of the agent starting.";

export const kindOf = (state: string): Kind => {
  switch (state) {
    case "BOUGHT":
      return "bought";
    case "SKIPPED":
      return "skipped";
    case "ERROR":
      return "error";
    default:
      return "waiting";
  }
};

function usepodView(u: PublicStatus["runs"][number]["usepod"], dry: boolean, cluster: LinkCluster): UsepodView | null {
  if (!u) return null;
  const paidHref = u.paymentSig ? solscanTx(u.paymentSig, cluster) : null;
  if (u.verdict) {
    return { verdict: u.verdict, line: `${u.verdict === "buy" ? "Buy" : "Skip"}${u.reason ? `: "${u.reason}"` : ""}`, model: u.model, paidHref };
  }
  const quote = u.lamports !== null ? ` (quote ${u.lamports} lamports)` : "";
  return { verdict: null, line: dry ? `Quote only, dry run${quote}` : `${u.outcome.replace(/_/g, " ")}${quote}`, model: u.model, paidHref };
}

const list = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : `${xs[0]}, ${xs[1]} and ${xs.length - 2} more`);

/** Says once what dry runs are, instead of repeating it on every row. Null when there are none. */
function practiceNote(dry: DecisionRow[], mixed: boolean): string | null {
  if (dry.length === 0) return null;
  const tokens = list([...new Set(dry.map((r) => r.token))]);
  return mixed
    ? `Rows marked Dry run are practice runs on ${tokens}. Nothing was signed or bought in them.`
    : `Every run below is a practice run on ${tokens}. Nothing was signed or bought. Runs that buy and lock appear here once the agent starts buying.`;
}

/** What each state means, from the agent's own docs. */
export const STATE_GUIDE = [
  { state: "Waiting", text: "A rule isn't met yet, such as too little trading volume or too little in the wallet. Nothing is bought." },
  { state: "Skipped", text: "Every rule passed, then a final check said no, such as price impact or the UsePod second opinion." },
  { state: "Bought", text: "The agent bought a slice and locked it in the stake contract." },
] as const;

/** Every run the agent reported, newest first. Dry runs and live runs are both listed, and every dry run says so. */
export function decisionsModel(status: AgentStatus): DecisionsModel {
  if (!status.ok) return { kind: "error", message: FEED_ERROR };
  const sources = [status.live, status.dry].filter((s): s is PublicStatus => s !== null);
  const seen = new Set<string>();
  const rows: DecisionRow[] = [];
  for (const s of sources) {
    const cluster: LinkCluster = s.cluster === "devnet" ? "devnet" : "mainnet-beta";
    for (const r of s.runs) {
      const key = `${r.dry ? "d" : "l"}-${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        key,
        ts: r.ts,
        date: dateTimeUtc(r.ts),
        state: stateLabel(r.state),
        kind: kindOf(r.state),
        reason: reasonText(r.reason, s.policy.minSliceLamports),
        dry: r.dry,
        token: shortAddress(r.mint, 4),
        gates: r.gates.map(gateView),
        usepod: usepodView(r.usepod, r.dry, cluster),
        txs: r.txs.map((sig, i) => ({ label: r.txs.length > 1 ? `Transaction ${i + 1}` : "Transaction", href: solscanTx(sig, cluster) })),
      });
    }
  }
  if (rows.length === 0) return { kind: "empty", message: DECISIONS_EMPTY };
  rows.sort((a, b) => b.ts - a.ts);
  const counts = { all: rows.length, bought: 0, skipped: 0, waiting: 0, error: 0 };
  for (const r of rows) counts[r.kind]++;
  const dry = rows.filter((r) => r.dry);
  const mixed = dry.length > 0 && dry.length < rows.length;
  return { kind: "rows", rows, counts, mixed, note: practiceNote(dry, mixed) };
}

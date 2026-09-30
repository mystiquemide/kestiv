import { solFromLamports } from "./format";
import { FEED_ERROR } from "./howItWorks";
import type { AgentStatus } from "./status";
import { dateUtc } from "./format";

export interface EnvRow {
  name: string;
  what: string;
  needed: boolean;
}

/** From skill/kestiv/SKILL.md. Secrets are never shown, only their names. */
export const ENV_ROWS: EnvRow[] = [
  { name: "KESTIV_WALLET", what: "Kestiv's public address", needed: true },
  { name: "FOUNDER_WALLET", what: "Where the stake vests to", needed: true },
  { name: "KESTIV_MINT", what: "Your token's mint address", needed: true },
  { name: "KESTIV_KEYPAIR_PATH", what: "Path to the Kestiv keypair file, read only by real runs", needed: true },
  { name: "CLAWPUMP_API_KEY", what: "Your ClawPump partner key", needed: true },
  { name: "HELIUS_API_KEY", what: "Enables the holder count and a reliable RPC", needed: false },
  { name: "SOLANA_RPC_URL", what: "Your own RPC, the public one rate-limits", needed: false },
  { name: "USEPOD_MODEL", what: "Model for the trade-quality veto", needed: false },
];

export const WALLET_COMMANDS = ["solana-keygen new --outfile kestiv.json", "chmod 600 kestiv.json"];
export const CLI = "npm run kestiv --";

// Mirrors FOUNDER_TERMS in agent/src/lock/terms.ts.
const CLIFF_DAYS = 90;
const VEST_DAYS = 365;

export function installCommands(repoUrl: string | undefined): string[] | null {
  if (!repoUrl) return null;
  return [`git clone ${repoUrl} kestiv`, "cd kestiv", "npm install", "npm run build -w agent"];
}

export function initBlock(policy: { stakeShareBps: number; capBps: number } | null): string[] {
  const share = policy ? policy.stakeShareBps / 100 : 50;
  const cap = policy ? policy.capBps / 100 : 7;
  return [
    "Token        your token's mint",
    "Founder      your founder wallet",
    `Fee share    ${share}% to stake, ${100 - share}% to founder`,
    `Cap          ${cap}% of supply`,
    `Vesting      ${CLIFF_DAYS}-day cliff, then ${VEST_DAYS} days linear`,
    "Contract     cannot be cancelled, transferred or edited",
    "Type the mint's last 4 characters to confirm:",
  ];
}

export type Transcript =
  | { kind: "run"; caption: string; lines: string[] }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string };

const fmt = (v: unknown): string => (v === null || v === undefined ? "n/a" : typeof v === "number" ? String(Number(v.toPrecision(6))) : String(v));

/** The agent's latest dry run, printed the way the CLI prints it. It comes from the status feed, so it is real. */
export function dryRunTranscript(status: AgentStatus): Transcript {
  if (!status.ok) return { kind: "error", message: FEED_ERROR };
  const run = status.dry ?? status.live;
  if (!run) return { kind: "empty", message: "The agent hasn't done a dry run yet. Its first one appears here." };
  const p = "DRY-RUN ";
  const lines = [`${p}${run.state} ${run.reason}`];
  for (const g of run.gates) {
    lines.push(`${p}gate ${g.pass ? "PASS" : "FAIL"}  ${g.name}  value=${fmt(g.value)}${g.source ? ` (${g.source})` : ""}  threshold=${fmt(g.threshold)}`);
  }
  if (run.quote) {
    lines.push(`${p}quote    ${run.quote.inLamports} lamports -> ${run.quote.outAmount} out, impact ${(run.quote.priceImpact * 100).toFixed(3)}%, route ${run.quote.route.join(">")}`);
  }
  const usepod = run.runs[0]?.usepod ?? null;
  if (usepod) lines.push(`${p}usepod   outcome=${usepod.outcome}${usepod.lamports !== null ? ` quote=${usepod.lamports} lamports` : ""}`);
  const when = dateUtc(run.ts);
  return { kind: "run", caption: `Real output from the agent's ${run.dry ? "dry run" : "run"} on ${when}. Nothing was signed.`, lines };
}

export interface CostRow {
  label: string;
  value: string;
}

export function costRows(status: AgentStatus): CostRow[] {
  const run = status.ok ? (status.live ?? status.dry) : null;
  const contract = run ? `About ${solFromLamports(run.policy.contractCreationLamports)} SOL, once` : "About 0.18 SOL, once";
  const lastQuote = run?.runs[0]?.usepod?.lamports ?? null;
  const usepod = lastQuote !== null ? `${lastQuote} lamports on the last check` : "A few hundred lamports per check";
  return [
    { label: "Streamflow contract", value: contract },
    { label: "Streamflow fee", value: "0.19% of the tokens locked" },
    { label: "UsePod check", value: usepod },
  ];
}

export const NEVER = [
  { label: "Sell", text: "There is no sell code. Kestiv only buys and locks." },
  { label: "Cancel or move locked tokens", text: "Its signer refuses every Streamflow instruction except creating the contract and topping it up." },
  { label: "Let a model pick the amount", text: "Policy sets the slice. UsePod can only say no." },
] as const;

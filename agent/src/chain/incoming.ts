import type { Connection, ParsedInstruction, ParsedTransactionWithMeta, PartiallyDecodedInstruction, PublicKey } from "@solana/web3.js";
import type { IncomingTransfer, SigState } from "../loop/types.js";

type AnyIx = ParsedInstruction | PartiallyDecodedInstruction;

const isSystemTransfer = (ix: AnyIx): ix is ParsedInstruction =>
  "parsed" in ix && ix.program === "system" && (ix.parsed as { type?: string })?.type === "transfer";

/** Sums system transfers into `wallet` (top level and inner) for one transaction. Sender is the largest contributor. */
export function extractIncoming(tx: ParsedTransactionWithMeta, wallet: string, sig: string): IncomingTransfer | null {
  if (!tx.meta || tx.meta.err) return null;
  const ixs: AnyIx[] = [
    ...tx.transaction.message.instructions,
    ...(tx.meta.innerInstructions ?? []).flatMap((g) => g.instructions),
  ];
  const bySender = new Map<string, number>();
  for (const ix of ixs) {
    if (!isSystemTransfer(ix)) continue;
    const info = ix.parsed.info as { source: string; destination: string; lamports: number };
    if (info.destination !== wallet || info.source === wallet) continue;
    bySender.set(info.source, (bySender.get(info.source) ?? 0) + info.lamports);
  }
  if (bySender.size === 0) return null;
  let sender = "";
  let best = -1;
  let total = 0;
  for (const [s, l] of bySender) {
    total += l;
    if (l > best) {
      best = l;
      sender = s;
    }
  }
  return { sig, lamports: total, sender, ts: tx.blockTime ?? 0 };
}

export async function incomingTransfers(connection: Connection, wallet: PublicKey, untilSig?: string, limit = 100): Promise<IncomingTransfer[]> {
  const infos = await connection.getSignaturesForAddress(wallet, { until: untilSig, limit }, "confirmed");
  const out: IncomingTransfer[] = [];
  const opts = { maxSupportedTransactionVersion: 0, commitment: "confirmed" as const };
  for (const info of infos) {
    if (info.err) continue;
    const tx = await connection.getParsedTransaction(info.signature, opts).catch(() => null);
    const t = tx ? extractIncoming(tx, wallet.toBase58(), info.signature) : null;
    if (t) out.push(t);
  }
  return out;
}

export async function signatureState(connection: Connection, sig: string): Promise<SigState> {
  const res = await connection.getSignatureStatuses([sig], { searchTransactionHistory: true });
  const v = res.value[0];
  if (!v) return { state: "unknown" };
  if (v.err) return { state: "failed", err: JSON.stringify(v.err) };
  if (v.confirmationStatus === "confirmed" || v.confirmationStatus === "finalized") return { state: "confirmed" };
  return { state: "unknown" };
}

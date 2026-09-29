import { PublicKey, type Connection, type ParsedTransactionWithMeta } from "@solana/web3.js";

export interface SwapEvent {
  sig: string;
  ts: number;
  wallet: string;
  side: "buy" | "sell";
  tokenAmount: bigint;
  solAmount: number;
}

const WSOL_MINT = "So11111111111111111111111111111111111111112";

type Balances = NonNullable<NonNullable<ParsedTransactionWithMeta["meta"]>["preTokenBalances"]>;

const sumRaw = (list: Balances | null | undefined, owner: string, mint: string): bigint =>
  (list ?? [])
    .filter((b) => b.owner === owner && b.mint === mint)
    .reduce((acc, b) => acc + BigInt(b.uiTokenAmount.amount), 0n);

/**
 * Derives the fee payer's swap of `mint` from balance changes.
 * Token delta = signer-owned token accounts of the mint. SOL delta = lamport change of the
 * signer (fee added back) plus change in signer-owned wSOL accounts, so wrapped-SOL routes count.
 * Returns null when the signer has no token delta or the SOL leg has the wrong sign.
 */
export function parseSwap(tx: ParsedTransactionWithMeta, mint: string): SwapEvent | null {
  const meta = tx.meta;
  if (!meta || meta.err) return null;
  const keys = tx.transaction.message.accountKeys;
  const signerIdx = keys.findIndex((k) => k.signer);
  const signerKey = keys[signerIdx];
  if (!signerKey) return null;
  const wallet = signerKey.pubkey.toString();

  const tokenDelta = sumRaw(meta.postTokenBalances, wallet, mint) - sumRaw(meta.preTokenBalances, wallet, mint);
  if (tokenDelta === 0n) return null;

  const lamports = (meta.postBalances[signerIdx] ?? 0) - (meta.preBalances[signerIdx] ?? 0) + (signerIdx === 0 ? meta.fee : 0);
  const wsol = sumRaw(meta.postTokenBalances, wallet, WSOL_MINT) - sumRaw(meta.preTokenBalances, wallet, WSOL_MINT);
  const solDelta = lamports + Number(wsol);

  const side = tokenDelta > 0n ? "buy" : "sell";
  if (side === "buy" ? solDelta >= 0 : solDelta <= 0) return null;

  return {
    sig: tx.transaction.signatures[0] ?? "",
    ts: tx.blockTime ?? 0,
    wallet,
    side,
    tokenAmount: tokenDelta < 0n ? -tokenDelta : tokenDelta,
    solAmount: Math.abs(solDelta),
  };
}

const CHUNK = 25;

async function fetchChunk(connection: Connection, sigs: string[]): Promise<(ParsedTransactionWithMeta | null)[]> {
  const opts = { maxSupportedTransactionVersion: 0, commitment: "confirmed" as const };
  try {
    return await connection.getParsedTransactions(sigs, opts);
  } catch {
    return Promise.all(sigs.map((s) => connection.getParsedTransaction(s, opts).catch(() => null)));
  }
}

export async function recentSwaps(connection: Connection, mint: PublicKey, limit: number): Promise<SwapEvent[]> {
  const infos = await connection.getSignaturesForAddress(mint, { limit }, "confirmed");
  const sigs = infos.filter((i) => !i.err).map((i) => i.signature);
  const out: SwapEvent[] = [];
  for (let i = 0; i < sigs.length; i += CHUNK) {
    const txs = await fetchChunk(connection, sigs.slice(i, i + CHUNK));
    for (const tx of txs) {
      const swap = tx ? parseSwap(tx, mint.toBase58()) : null;
      if (swap) out.push(swap);
    }
  }
  return out;
}

/** Volume-weighted price in lamports per raw token unit over the last `windowSec`, or null if no trades. */
export function vwap(swaps: SwapEvent[], windowSec: number, nowSec: number): number | null {
  let sol = 0;
  let tokens = 0n;
  for (const s of swaps) {
    if (s.ts < nowSec - windowSec || s.ts > nowSec) continue;
    sol += s.solAmount;
    tokens += s.tokenAmount;
  }
  return tokens === 0n ? null : sol / Number(tokens);
}

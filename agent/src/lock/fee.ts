import type { Connection, PublicKey } from "@solana/web3.js";
import { DEFAULT_STREAMFLOW_FEE, SolanaStreamClient } from "@streamflow/stream";
import type { Cluster } from "../config.js";
import { streamflowCluster, streamflowProgramId } from "./env.js";

/** The SDK charges the token fee on top of the deposit: it pulls deposit * (1 + fee) from the sender (see calculateTotalAmountToDeposit). */
const SCALE = 1_000_000n;
const PER_PERCENT = 10_000;

/** Tokens below this are dust: locking them would cost more in network fees than they are worth, so they wait for the next buy. */
export const DUST_TOKENS = 10_000n;

/** The largest deposit whose deposit plus Streamflow's token fee still fits in `balance`. One raw unit is kept back for rounding. */
export function depositForBalance(balance: bigint, feePercent: number): bigint {
  if (balance <= 0n) return 0n;
  const extra = BigInt(Math.round(feePercent * PER_PERCENT));
  const deposit = (balance * SCALE) / (SCALE + extra) - 1n;
  return deposit > 0n ? deposit : 0n;
}

/** Streamflow's current token fee for this sender, read from its fee oracle. Falls back to the published 0.19% if the read fails. */
export async function streamflowTokenFeePercent(connection: Connection, cluster: Cluster, sender: PublicKey): Promise<number> {
  try {
    const client = new SolanaStreamClient(connection.rpcEndpoint, streamflowCluster(cluster), "confirmed", streamflowProgramId(cluster).toBase58());
    const fee = await client.getTotalFee({ address: sender.toBase58() });
    return Number.isFinite(fee) && fee >= 0 ? fee : DEFAULT_STREAMFLOW_FEE;
  } catch {
    return DEFAULT_STREAMFLOW_FEE;
  }
}

import BN from "bn.js";
import { Keypair } from "@solana/web3.js";
import { buildTransaction, topup } from "@streamflow/stream";
import { signAndSend } from "../chain/send.js";
import { allowlistOf, sdkEnv, type LockContext } from "./env.js";
import { assertLockTerms, readFounderVesting } from "./read.js";

export interface TopupFounderVestingParams extends LockContext {
  sender: Keypair;
  streamId: string;
  amount: bigint;
  expected: { recipient: string; mint: string };
}

export async function topupFounderVesting(p: TopupFounderVestingParams): Promise<{ signature: string }> {
  if (p.amount <= 0n) throw new Error("topup amount must be positive");
  const stream = await readFounderVesting(p.connection, p.cluster, p.streamId);
  assertLockTerms(stream, { ...p.expected, sender: p.sender.publicKey.toBase58() });

  const env = sdkEnv(p);
  const built = await topup({ id: p.streamId, amount: new BN(p.amount.toString()) }, { publicKey: p.sender.publicKey }, env);
  const { transaction, blockhashWithExpiryBlockHeight } = await buildTransaction(
    built.instructions,
    { feePayer: p.sender.publicKey },
    env,
  );
  const signature = await signAndSend(transaction, p.sender, p.connection, allowlistOf(p), {
    blockhash: blockhashWithExpiryBlockHeight,
  });
  return { signature };
}

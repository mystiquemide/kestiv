import {
  Transaction,
  type BlockhashWithExpiryBlockHeight,
  type Connection,
  type Keypair,
  type VersionedTransaction,
} from "@solana/web3.js";
import type { Allowlist } from "./allowlist.js";
import { assertAllowedPrograms } from "./guard.js";

export interface SendOptions {
  extraSigners?: Keypair[];
  blockhash?: BlockhashWithExpiryBlockHeight;
  skipPreflight?: boolean;
}

export async function signAndSend(
  tx: VersionedTransaction | Transaction,
  signer: Keypair,
  connection: Connection,
  allowlist: Allowlist,
  opts: SendOptions = {},
): Promise<string> {
  assertAllowedPrograms(tx, allowlist);

  const signers = [signer, ...(opts.extraSigners ?? [])];
  if (tx instanceof Transaction) tx.partialSign(...signers);
  else tx.sign(signers);

  const raw = tx.serialize();
  const signature = await connection.sendRawTransaction(raw, {
    skipPreflight: opts.skipPreflight ?? false,
    preflightCommitment: "confirmed",
  });

  const hash = opts.blockhash ?? (await connection.getLatestBlockhash("confirmed"));
  const result = await connection.confirmTransaction(
    { signature, blockhash: hash.blockhash, lastValidBlockHeight: hash.lastValidBlockHeight },
    "confirmed",
  );
  if (result.value.err) {
    throw new Error(`transaction ${signature} failed: ${JSON.stringify(result.value.err)}`);
  }
  return signature;
}

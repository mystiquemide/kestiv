import bs58 from "bs58";
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
  onSigned?: (signature: string) => void | Promise<void>;
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

  const signed = tx instanceof Transaction ? tx.signature : tx.signatures[0];
  if (!signed) throw new Error("transaction has no signature after signing");
  await opts.onSigned?.(bs58.encode(signed));

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

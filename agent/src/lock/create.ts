import { Transaction, type Connection, type Keypair, type PublicKey } from "@solana/web3.js";
import { signAndSend } from "../chain/send.js";
import type { Allowlist } from "../chain/allowlist.js";
import { ALLOWED_PROGRAMS } from "../chain/allowlist.js";
import { buildLock } from "./jupiter.js";
import { founderLockParams } from "./terms.js";

export interface CreateFounderLockParams {
  connection: Connection;
  sender: Keypair;
  mint: PublicKey;
  tokenProgram: PublicKey;
  recipient: PublicKey;
  /** Every token the wallet holds. The lock takes at most 364 raw units less, because the daily share rounds down. */
  amount: bigint;
  nowSec?: number;
  allowlist?: Allowlist;
}

/** Locks `amount` tokens in a NEW Jupiter lock for the founder. A lock cannot be topped up, so every buy gets its own. */
export async function createFounderLock(p: CreateFounderLockParams): Promise<{ lockId: string; signature: string; deposited: bigint }> {
  const params = founderLockParams(p.nowSec ?? Math.floor(Date.now() / 1000), p.amount);
  const built = buildLock({ sender: p.sender.publicKey, mint: p.mint, tokenProgram: p.tokenProgram, recipient: p.recipient, params });
  const blockhash = await p.connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: p.sender.publicKey, ...blockhash }).add(...built.instructions);
  const signature = await signAndSend(tx, p.sender, p.connection, p.allowlist ?? ALLOWED_PROGRAMS, {
    extraSigners: [built.base],
    blockhash,
  });
  return { lockId: built.escrow.toBase58(), signature, deposited: built.deposited };
}

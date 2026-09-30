// Devnet proof of the founder lock, through the exact code path the agent uses. Sends devnet transactions only.
// run: KESTIV_ENV_FILE=/path/to/env npx tsx scripts/devnet-lock-check.ts [--classic]
// By default the test token is a Token-2022 mint with a metadata pointer and on-mint metadata, like a pump.fun token.
// --classic uses the original SPL Token program instead.
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  AuthorityType,
  ExtensionType,
  LENGTH_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TYPE_SIZE,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getMintLen,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  setAuthority,
} from "@solana/spl-token";
import { createInitializeInstruction, pack } from "@solana/spl-token-metadata";
import { readEnv } from "../src/config.js";
import { createChain } from "../src/chain/connection.js";
import { loadKeypair } from "../src/chain/keys.js";
import { createFounderLock } from "../src/lock/create.js";
import { CANCEL_VESTING_ESCROW, LOCKER_PROGRAM_ID, eventAuthority, unlockedAt } from "../src/lock/jupiter.js";
import { assertLockTerms, readFounderLock } from "../src/lock/read.js";
import { FOUNDER_TERMS } from "../src/lock/terms.js";

const KEY_PATH = join(homedir(), ".config/kestiv/devnet.keypair.json");
const DECIMALS = 6;
const UNIT = 10n ** BigInt(DECIMALS);
const tx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) process.exitCode = 1;
};

const classic = process.argv.includes("--classic");
const program = classic ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;

const env = readEnv();
if (!env.FOUNDER_WALLET) throw new Error("FOUNDER_WALLET is not set");
const recipient = new PublicKey(env.FOUNDER_WALLET);

if (!existsSync(KEY_PATH)) {
  execFileSync("solana-keygen", ["new", "--no-bip39-passphrase", "--silent", "--outfile", KEY_PATH]);
  chmodSync(KEY_PATH, 0o600);
}
const payer = loadKeypair(KEY_PATH);
const chain = createChain({ SOLANA_CLUSTER: "devnet", SOLANA_RPC_URL: process.env.SOLANA_RPC_URL, HELIUS_API_KEY: env.HELIUS_API_KEY });
const { connection } = chain;
console.log(`devnet wallet ${payer.publicKey.toBase58()} (rpc: ${chain.rpcKind})`);
console.log(`recipient     ${recipient.toBase58()}`);

async function ensureFunds(minSol: number) {
  if ((await connection.getBalance(payer.publicKey)) >= minSol * LAMPORTS_PER_SOL) return;
  let lastError = "";
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const sig = await connection.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL);
      const bh = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
      console.log(`airdrop 1 SOL: ${tx(sig)}`);
      if ((await connection.getBalance(payer.publicKey)) >= minSol * LAMPORTS_PER_SOL) return;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.log(`airdrop attempt ${attempt} failed: ${lastError.slice(0, 200)}`);
      await sleep(2000 * 2 ** attempt);
    }
  }
  throw new Error(`devnet airdrop failed after retries: ${lastError}`);
}

async function makeMint(): Promise<PublicKey> {
  if (classic) return createMint(connection, payer, payer.publicKey, null, DECIMALS, undefined, { commitment: "confirmed" }, TOKEN_PROGRAM_ID);
  const mintKp = Keypair.generate();
  const meta = { mint: mintKp.publicKey, name: "Kestiv Test", symbol: "KTEST", uri: "https://kestiv.midelabs.xyz/", additionalMetadata: [] as [string, string][], updateAuthority: payer.publicKey };
  const mintLen = getMintLen([ExtensionType.MetadataPointer]);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + TYPE_SIZE + LENGTH_SIZE + pack(meta).length);
  const initTx = new Transaction().add(
    SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: mintKp.publicKey, space: mintLen, lamports, programId: TOKEN_2022_PROGRAM_ID }),
    createInitializeMetadataPointerInstruction(mintKp.publicKey, payer.publicKey, mintKp.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(mintKp.publicKey, DECIMALS, payer.publicKey, null, TOKEN_2022_PROGRAM_ID),
    createInitializeInstruction({ programId: TOKEN_2022_PROGRAM_ID, mint: mintKp.publicKey, metadata: mintKp.publicKey, name: meta.name, symbol: meta.symbol, uri: meta.uri, mintAuthority: payer.publicKey, updateAuthority: payer.publicKey }),
  );
  await sendAndConfirmTransaction(connection, initTx, [payer, mintKp], { commitment: "confirmed" });
  return mintKp.publicKey;
}

/** Sends a cancel straight to the chain on purpose, past Kestiv's own signer (which refuses it), to show the chain itself refuses. */
async function attemptCancel(lock: Awaited<ReturnType<typeof readFounderLock>>, mint: PublicKey) {
  const escrow = new PublicKey(lock.escrow);
  // The program checks its accounts before it checks who is asking, so the recipient's token account has to exist.
  // Without it the chain answers 'account not initialised' (3012) and never reaches the permission check we want to show.
  await getOrCreateAssociatedTokenAccount(connection, payer, mint, recipient, true, "confirmed", undefined, program);
  const meta = (pubkey: PublicKey, isWritable: boolean, isSigner = false) => ({ pubkey, isSigner, isWritable });
  const ix = new TransactionInstruction({
    programId: LOCKER_PROGRAM_ID,
    keys: [
      meta(escrow, true),
      meta(mint, true),
      meta(getAssociatedTokenAddressSync(mint, escrow, true, program), true),
      meta(getAssociatedTokenAddressSync(mint, payer.publicKey, false, program), true),
      meta(getAssociatedTokenAddressSync(mint, recipient, true, program), true),
      meta(payer.publicKey, true),
      meta(payer.publicKey, true, true),
      meta(new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"), false),
      meta(program, false),
      meta(eventAuthority(), false),
      meta(LOCKER_PROGRAM_ID, false),
    ],
    data: Buffer.concat([CANCEL_VESTING_ESCROW, Buffer.from([0])]),
  });
  const bh = await connection.getLatestBlockhash("confirmed");
  const t = new Transaction({ feePayer: payer.publicKey, ...bh }).add(ix);
  t.sign(payer);
  const signature = await connection.sendRawTransaction(t.serialize(), { skipPreflight: true });
  console.log(`cancel attempt (skipPreflight, sent onchain): ${tx(signature)}`);
  let landed: Awaited<ReturnType<typeof connection.getTransaction>> = null;
  for (let i = 0; i < 20 && !landed; i++) {
    landed = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (!landed) await sleep(1500);
  }
  if (!landed) throw new Error(`cancel tx ${signature} never appeared onchain, stopping`);
  const err = landed.meta?.err as { InstructionError?: [number, { Custom?: number }] } | null | undefined;
  console.log(`  onchain err: ${JSON.stringify(err)}`);
  check(err?.InstructionError?.[1]?.Custom === 6005, "cancel landed onchain and failed with Custom(6005), not permitted");
  const after = await readFounderLock(connection, lock.escrow);
  check(after.cancelledAt === 0n && after.deposited === lock.deposited && after.recipient === lock.recipient, "lock unchanged after the attempt");
  return signature;
}

await ensureFunds(1);
console.log(`balance ${(await connection.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL} SOL`);

const mint = await makeMint();
const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey, false, "confirmed", undefined, program);
const mintSig = await mintTo(connection, payer, mint, ata.address, payer, 1_000_000n * UNIT, [], { commitment: "confirmed" }, program);
if (!classic) await setAuthority(connection, payer, mint, payer, AuthorityType.MintTokens, null, [], { commitment: "confirmed" }, program);
console.log(`mint ${mint.toBase58()} (${classic ? "SPL Token" : "Token-2022"})  minted 1,000,000: ${tx(mintSig)}`);

const expected = { recipient: recipient.toBase58(), mint: mint.toBase58(), sender: payer.publicKey.toBase58() };
const locks: { id: string; sig: string }[] = [];
for (const tokens of [100_000n, 50_000n]) {
  const before = (await getAccount(connection, ata.address, "confirmed", program)).amount;
  const solBefore = await connection.getBalance(payer.publicKey);
  const t0 = Math.floor(Date.now() / 1000);
  const { lockId, signature, deposited } = await createFounderLock({ connection, sender: payer, mint, tokenProgram: program, recipient, amount: tokens * UNIT });
  const solSpent = (solBefore - (await connection.getBalance(payer.publicKey))) / LAMPORTS_PER_SOL;
  console.log(`lock ${lockId}: ${tx(signature)}  (${solSpent} SOL: rent + network, no protocol fee)`);
  locks.push({ id: lockId, sig: signature });

  const lock = await readFounderLock(connection, lockId);
  let terms = true;
  try {
    assertLockTerms(lock, expected);
  } catch (e) {
    terms = false;
    console.log(String(e));
  }
  check(terms, "recipient, mint, creator match, cancel and change-recipient are both nobody, schedule is the founder schedule");
  check(lock.deposited === deposited && deposited <= tokens * UNIT && tokens * UNIT - deposited < 365n, `holds ${deposited} raw units (at most 364 short of ${tokens * UNIT})`);
  check((await getAccount(connection, getAssociatedTokenAddressSync(mint, new PublicKey(lockId), true, program), "confirmed", program)).amount === deposited, "the lock's own token account holds exactly that");
  check((await getAccount(connection, ata.address, "confirmed", program)).amount === before - deposited, "the wallet gave up exactly that");
  check(Math.abs(Number(lock.cliffTime) - (t0 + FOUNDER_TERMS.cliffSeconds)) < 120 && lock.frequency === 86_400n && lock.numberOfPeriod === 365n, "cliff 90 days out, 365 daily periods");
  check(unlockedAt(lock, BigInt(t0)) === 0n && unlockedAt(lock, lock.cliffTime + 86_400n * 365n) === deposited, "nothing unlocked now, everything after the last period");
  check(lock.tokenProgramFlag === (classic ? 0 : 1), `token program flag is ${classic ? "classic" : "Token-2022"}`);
}

const first = await readFounderLock(connection, locks[0]!.id);
const cancelSig = await attemptCancel(first, mint);

console.log("\nproof summary (devnet):");
console.log(JSON.stringify({ mint: mint.toBase58(), locks, cancelSig }, null, 1));
console.log(process.exitCode ? "\nRESULT: FAILED" : "\nRESULT: OK");

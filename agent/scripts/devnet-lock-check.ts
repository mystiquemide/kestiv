// Devnet proof of the founder vesting lock. Sends devnet transactions only.
// run: KESTIV_ENV_FILE=/path/to/env npx tsx scripts/devnet-lock-check.ts
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { buildTransaction, cancel } from "@streamflow/stream";
import { readEnv } from "../src/config.js";
import { createChain } from "../src/chain/connection.js";
import { ALLOWED_PROGRAMS } from "../src/chain/allowlist.js";
import { loadKeypair } from "../src/chain/keys.js";
import { signAndSend } from "../src/chain/send.js";
import { createFounderVesting } from "../src/lock/create.js";
import { sdkEnv } from "../src/lock/env.js";
import { assertLockTerms, readFounderVesting, type FounderVesting } from "../src/lock/read.js";
import { founderSchedule } from "../src/lock/terms.js";
import { topupFounderVesting } from "../src/lock/topup.js";

const KEY_PATH = join(homedir(), ".config/kestiv/devnet.keypair.json");
const DECIMALS = 6;
const UNIT = 10n ** BigInt(DECIMALS);
const localRpc = process.env.SOLANA_RPC_URL?.includes("127.0.0.1") ?? false;
const tx = (sig: string) =>
  localRpc ? `[local validator] ${sig}` : `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) process.exitCode = 1;
};

const env = readEnv();
const founder = env.FOUNDER_WALLET;
if (!founder) throw new Error("FOUNDER_WALLET is not set");
const recipient = new PublicKey(founder);

if (!existsSync(KEY_PATH)) {
  execFileSync("solana-keygen", ["new", "--no-bip39-passphrase", "--silent", "--outfile", KEY_PATH]);
  chmodSync(KEY_PATH, 0o600);
}
const payer = loadKeypair(KEY_PATH);
const chain = createChain({
  SOLANA_CLUSTER: "devnet",
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
  HELIUS_API_KEY: env.HELIUS_API_KEY,
});
const { connection } = chain;
console.log(`devnet wallet ${payer.publicKey.toBase58()} (rpc: ${chain.rpcKind})`);
console.log(`recipient     ${recipient.toBase58()}`);

async function ensureFunds(minSol: number) {
  let bal = await connection.getBalance(payer.publicKey);
  if (bal >= minSol * LAMPORTS_PER_SOL) return;
  let lastError = "";
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const sig = await connection.requestAirdrop(payer.publicKey, 1 * LAMPORTS_PER_SOL);
      const bh = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
      console.log(`airdrop 1 SOL: ${tx(sig)}`);
      bal = await connection.getBalance(payer.publicKey);
      if (bal >= minSol * LAMPORTS_PER_SOL) return;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.log(`airdrop attempt ${attempt} failed: ${lastError.slice(0, 200)}`);
      await sleep(2000 * 2 ** attempt);
    }
  }
  throw new Error(`devnet airdrop failed after retries: ${lastError}`);
}

await ensureFunds(1);
console.log(`balance ${(await connection.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL} SOL`);

const mint = await createMint(connection, payer, payer.publicKey, null, DECIMALS, undefined, { commitment: "confirmed" }, TOKEN_PROGRAM_ID);
const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey, false, "confirmed");
const mintSig = await mintTo(connection, payer, mint, ata.address, payer, 1_000_000n * UNIT, [], { commitment: "confirmed" });
console.log(`mint ${mint.toBase58()}  minted 1,000,000: ${tx(mintSig)}`);

const ctx = { connection, cluster: chain.cluster };
const amount = 100_000n * UNIT;
const before = Math.floor(Date.now() / 1000);
const { streamId, signature: createSig } = await createFounderVesting({
  ...ctx,
  sender: payer,
  mint,
  tokenProgram: TOKEN_PROGRAM_ID,
  amount,
  recipient,
});
console.log(`create: ${tx(createSig)}`);
console.log(`stream ${streamId}`);
console.log(`streamflow app (link format assumed, not exposed by the SDK): https://app.streamflow.finance/contract/solana/devnet/${streamId}`);

const expected = { recipient: recipient.toBase58(), mint: mint.toBase58(), sender: payer.publicKey.toBase58() };
const s1 = await readFounderVesting(connection, chain.cluster, streamId);
let termsOk = true;
try {
  assertLockTerms(s1, expected);
} catch (e) {
  termsOk = false;
  console.log(String(e));
}
check(termsOk, "flags, recipient, mint, sender match founder terms");
const sched = founderSchedule(before, amount);
check(s1.depositedAmount === amount, `deposited == ${amount}`);
check(s1.period === 86_400, "period 86400");
check(s1.cliffAmount === 0n, "cliffAmount 0");
check(Math.abs(s1.cliff - sched.cliff) < 300 && s1.start === s1.cliff, "start == cliff == creation + 90d");
check(s1.amountPerPeriod === BigInt(sched.amountPerPeriod.toString()), `amountPerPeriod ${s1.amountPerPeriod}`);
check(s1.withdrawnAmount === 0n, "nothing withdrawn");
console.log(`  start ${new Date(s1.start * 1000).toISOString()}  end ${new Date(s1.end * 1000).toISOString()}  flags ${JSON.stringify(s1.flags)}`);

const { signature: topupSig } = await topupFounderVesting({
  ...ctx,
  sender: payer,
  streamId,
  amount: 50_000n * UNIT,
  expected: { recipient: expected.recipient, mint: expected.mint },
});
console.log(`topup: ${tx(topupSig)}`);
const s2: FounderVesting = await readFounderVesting(connection, chain.cluster, streamId);
check(s2.depositedAmount === amount + 50_000n * UNIT, `deposited increased to ${s2.depositedAmount}`);
check(s2.end > s1.end, `end moved later (${new Date(s2.end * 1000).toISOString()})`);
check(JSON.stringify(s2.flags) === JSON.stringify(s1.flags), "flags unchanged");
check(s2.recipient === s1.recipient && s2.start === s1.start && s2.amountPerPeriod === s1.amountPerPeriod, "recipient, start, rate unchanged");

// cancel must fail
try {
  const built = await cancel({ id: streamId }, { publicKey: payer.publicKey }, sdkEnv(ctx));
  const { transaction, blockhashWithExpiryBlockHeight } = await buildTransaction(built.instructions, { feePayer: payer.publicKey }, sdkEnv(ctx));
  const sig = await signAndSend(transaction, payer, connection, ALLOWED_PROGRAMS, { blockhash: blockhashWithExpiryBlockHeight });
  check(false, `cancel unexpectedly succeeded: ${tx(sig)}`);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  const logs = (e as { logs?: string[] }).logs?.filter((l) => /error|failed|custom program/i.test(l)).slice(0, 4);
  console.log(`cancel rejected: ${msg.slice(0, 300)}`);
  if (logs?.length) console.log(`  program logs: ${logs.join(" | ")}`);
  check(true, "cancel by sender is rejected");
}

// layout probe: confirm the offsets used for canUpdateRate / pausable by creating a stream that enables them
if (process.argv.includes("--probe-flags")) {
  const { create } = await import("@streamflow/stream");
  const { founderStreamData } = await import("../src/lock/create.js");
  const data = { ...founderStreamData({ mint, tokenProgram: TOKEN_PROGRAM_ID, amount: 1_000n * UNIT, recipient, nowSec: before }), canUpdateRate: true, canPause: true };
  const built = await create(data, { publicKey: payer.publicKey }, sdkEnv(ctx));
  const { transaction, blockhashWithExpiryBlockHeight } = await buildTransaction(built.instructions, { feePayer: payer.publicKey }, sdkEnv(ctx));
  const sig = await signAndSend(transaction, payer, connection, ALLOWED_PROGRAMS, { extraSigners: built.signers ?? [], blockhash: blockhashWithExpiryBlockHeight });
  const probe = await readFounderVesting(connection, chain.cluster, built.metadataPubKey!.toBase58());
  console.log(`probe stream ${built.metadataPubKey!.toBase58()}: ${tx(sig)}`);
  check(probe.flags.canUpdateRate && probe.flags.pausable, "layout probe reads canUpdateRate and pausable as true");
  let rejected = false;
  try {
    assertLockTerms(probe, expected);
  } catch {
    rejected = true;
  }
  check(rejected, "assertLockTerms rejects the probe stream");
}

console.log(process.exitCode ? "\nRESULT: FAILED" : "\nRESULT: OK");

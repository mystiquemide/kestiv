// Records real mainnet swap transactions (read-only) as JSON test fixtures.
// usage: tsx scripts/record-fixtures.ts <name>=<mint> ...
import { writeFileSync } from "node:fs";
import { Connection, PublicKey } from "@solana/web3.js";

const conn = new Connection(process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

for (const arg of process.argv.slice(2)) {
  const [name, mint] = arg.split("=");
  const sigs = await conn.getSignaturesForAddress(new PublicKey(mint!), { limit: 60 });
  await sleep(1200);
  let n = 0;
  for (const s of sigs) {
    if (s.err) continue;
    const tx = await conn
      .getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" })
      .catch(() => null);
    await sleep(1200);
    if (!tx?.meta) continue;
    const signer = tx.transaction.message.accountKeys.find((k) => k.signer)!.pubkey.toBase58();
    const bal = (list: typeof tx.meta.preTokenBalances) =>
      BigInt((list ?? []).filter((b) => b.mint === mint && b.owner === signer).reduce((a, b) => a + Number(b.uiTokenAmount.amount), 0));
    if (bal(tx.meta.postTokenBalances) === bal(tx.meta.preTokenBalances)) continue;
    writeFileSync(`test/fixtures/${name}-${n}.json`, JSON.stringify({ mint, signature: s.signature, tx }, null, 1));
    console.log(`${name}-${n}`, s.signature);
    if (++n >= 2) break;
  }
}

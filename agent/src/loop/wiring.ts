import { randomUUID } from "node:crypto";
import { PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, type Keypair } from "@solana/web3.js";
import { ALLOWED_PROGRAMS } from "../chain/allowlist.js";
import { createChain } from "../chain/connection.js";
import { incomingTransfers, signatureState } from "../chain/incoming.js";
import { loadKeypair } from "../chain/keys.js";
import { countHolders, getMintInfo, getSolBalance, getTokenBalance, type MintInfo } from "../chain/reads.js";
import { signAndSend } from "../chain/send.js";
import { recentSwaps } from "../chain/swaps.js";
import { fetchPrice, fetchSolUsd } from "../clawpump/price.js";
import type { DryRunConfig } from "../config.js";
import { createFounderVesting } from "../lock/create.js";
import { depositForBalance, streamflowTokenFeePercent } from "../lock/fee.js";
import { readFounderVesting } from "../lock/read.js";
import { topupFounderVesting } from "../lock/topup.js";
import type { Policy } from "../policy.js";
import type { Store } from "../store/index.js";
import { createJupiter } from "../swap/jupiter.js";
import { usepodVerdict } from "../usepod/client.js";
import { buildMessages } from "../usepod/prompt.js";
import type { Ports } from "./types.js";

export interface WiringOptions {
  cfg: DryRunConfig;
  policy: Policy;
  store: Store;
  dry: boolean;
  mint: string;
}

export function buildPorts(o: WiringOptions): Ports {
  const { cfg, policy, store, dry } = o;
  const chain = createChain(cfg);
  const { connection } = chain;
  const wallet = new PublicKey(cfg.KESTIV_WALLET);
  const mint = new PublicKey(o.mint);
  const founder = new PublicKey(cfg.FOUNDER_WALLET);

  let keypair: Keypair | undefined;
  if (!dry) {
    if (!cfg.KESTIV_KEYPAIR_PATH) throw new Error("KESTIV_KEYPAIR_PATH is required for a real run");
    keypair = loadKeypair(cfg.KESTIV_KEYPAIR_PATH);
    if (!keypair.publicKey.equals(wallet)) throw new Error("keypair does not match KESTIV_WALLET, refusing to run");
  }

  let mintInfo: Promise<MintInfo> | undefined;
  const getMint = () => (mintInfo ??= getMintInfo(connection, mint));
  const jupiter = createJupiter({ apiKey: cfg.JUPITER_API_KEY, maxPriorityFeeLamports: policy.maxPriorityFeeLamports });

  const transferSol: Ports["transferSol"] = keypair
    ? async (to, lamports, onSigned) => {
        const kp = keypair!;
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        const tx = new VersionedTransaction(
          new TransactionMessage({
            payerKey: kp.publicKey,
            recentBlockhash: blockhash,
            instructions: [SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: new PublicKey(to), lamports })],
          }).compileToV0Message(),
        );
        return signAndSend(tx, kp, connection, ALLOWED_PROGRAMS, { blockhash: { blockhash, lastValidBlockHeight }, onSigned });
      }
    : undefined;

  return {
    dry,
    mint: o.mint,
    founder: cfg.FOUNDER_WALLET,
    wallet: cfg.KESTIV_WALLET,
    policy,
    store,
    chain: {
      solBalance: () => getSolBalance(connection, wallet),
      tokenBalance: () => getTokenBalance(connection, wallet, mint),
      mintInfo: getMint,
      holders: () => countHolders(mint, { url: chain.rpcUrl, kind: chain.rpcKind }),
      swaps: (limit) =>
        recentSwaps(connection, mint, limit, chain.rpcKind === "custom" ? {} : chain.rpcKind === "helius" ? { chunkSize: 10, delayMs: 600 } : { chunkSize: 10, delayMs: 1500 }),
      incoming: (until) => incomingTransfers(connection, wallet, until),
      sigStatus: (sig) => signatureState(connection, sig),
      blockHeight: () => connection.getBlockHeight("confirmed"),
    },
    price: {
      token: () => fetchPrice(o.mint, cfg.CLAWPUMP_API_KEY),
      solUsd: () => fetchSolUsd(cfg.CLAWPUMP_API_KEY),
    },
    swap: {
      quote: (lamports) => jupiter.quote(mint, lamports, policy.slippageBps),
      build: (quote) => jupiter.buildSwap(quote, wallet),
    },
    lock: {
      // `available` is every token the wallet holds. Streamflow charges its token fee on top of the deposit,
      // so deposit only what leaves room for it, otherwise the transaction would fail for lack of tokens.
      create: async (available) => {
        const sender = requireKeypair(keypair);
        const fee = await streamflowTokenFeePercent(connection, chain.cluster, sender.publicKey);
        return createFounderVesting({
          connection,
          cluster: chain.cluster,
          sender,
          mint,
          tokenProgram: (await getMint()).tokenProgram,
          amount: depositForBalance(available, fee),
          recipient: founder,
        });
      },
      topup: async (streamId, available) => {
        const sender = requireKeypair(keypair);
        const fee = await streamflowTokenFeePercent(connection, chain.cluster, sender.publicKey);
        return topupFounderVesting({
          connection,
          cluster: chain.cluster,
          sender,
          streamId,
          amount: depositForBalance(available, fee),
          expected: { recipient: cfg.FOUNDER_WALLET, mint: o.mint },
        });
      },
      read: (streamId) => readFounderVesting(connection, chain.cluster, streamId),
      expected: { recipient: cfg.FOUNDER_WALLET, mint: o.mint, sender: cfg.KESTIV_WALLET },
    },
    usepod: {
      verdict: (swaps, nowSec) =>
        usepodVerdict({
          model: cfg.USEPOD_MODEL,
          messages: buildMessages(o.mint, swaps, nowSec),
          payer: cfg.KESTIV_WALLET,
          maxLamports: policy.maxUsepodLamports,
          dryRun: dry,
          pay: async (payTo, lamports) => {
            if (!transferSol) throw new Error("no signer available to pay UsePod");
            return transferSol(payTo, lamports, (sig) => store.addExpense(sig, "usepod", lamports, nowSec));
          },
        }),
    },
    send: keypair
      ? (tx, opts) => signAndSend(tx, keypair!, connection, ALLOWED_PROGRAMS, opts)
      : undefined,
    transferSol,
    now: () => Math.floor(Date.now() / 1000),
    random: Math.random,
    newId: randomUUID,
  };
}

function requireKeypair(kp: Keypair | undefined): Keypair {
  if (!kp) throw new Error("no signer available in dry-run");
  return kp;
}

import type { Transaction, VersionedTransaction } from "@solana/web3.js";
import type { TokenPrice } from "../clawpump/price.js";
import type { MintInfo } from "../chain/reads.js";
import type { SwapEvent } from "../chain/swaps.js";
import type { FounderLock } from "../lock/read.js";
import type { Policy } from "../policy.js";
import type { Store } from "../store/index.js";
import type { BuiltSwap, SwapQuote } from "../swap/jupiter.js";
import type { UsepodResult } from "../usepod/client.js";

export interface IncomingTransfer {
  sig: string;
  lamports: number;
  sender: string;
  ts: number;
}

export type SigState = { state: "confirmed" | "failed" | "unknown"; err?: string };

export interface ChainPort {
  solBalance(): Promise<number>;
  tokenBalance(): Promise<bigint>;
  mintInfo(): Promise<MintInfo>;
  holders(): Promise<number | null>;
  swaps(limit: number): Promise<SwapEvent[]>;
  incoming(untilSig?: string): Promise<IncomingTransfer[]>;
  sigStatus(sig: string): Promise<SigState>;
  blockHeight(): Promise<number>;
}

export interface SendOpts {
  blockhash: { blockhash: string; lastValidBlockHeight: number };
  onSigned?: (signature: string) => void | Promise<void>;
}

export interface LockPort {
  /** Locks `amount` tokens in a new lock for the founder. A lock cannot be topped up, so every buy gets its own. */
  create(amount: bigint): Promise<{ lockId: string; signature: string; deposited: bigint }>;
  read(lockId: string): Promise<FounderLock>;
  expected: { recipient: string; mint: string; sender: string };
}

export interface Ports {
  dry: boolean;
  mint: string;
  founder: string;
  wallet: string;
  policy: Policy;
  store: Store;
  chain: ChainPort;
  price: { token(): Promise<TokenPrice>; solUsd(): Promise<number> };
  swap: { quote(lamports: bigint): Promise<SwapQuote>; build(quote: SwapQuote): Promise<BuiltSwap> };
  lock: LockPort;
  usepod: { verdict(swaps: SwapEvent[], nowSec: number): Promise<UsepodResult> };
  send?: (tx: VersionedTransaction | Transaction, opts: SendOpts) => Promise<string>;
  transferSol?: (to: string, lamports: number, onSigned?: (sig: string) => void | Promise<void>) => Promise<string>;
  now(): number;
  random(): number;
  newId(): string;
}

export type RunState = "WAITING" | "SKIPPED" | "BOUGHT" | "CAP_REACHED" | "ERROR" | "WOULD_BUY";

export interface RunResult {
  state: RunState;
  reason: string;
  details: Record<string, unknown>;
  txs: string[];
  ts: number;
  dry: boolean;
  budget?: import("./budget.js").Budget;
}

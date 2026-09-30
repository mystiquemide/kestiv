import "server-only";
import { Connection, PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";
import {
  PROGRAM_ID,
  STREAM_STRUCT_OFFSET_MINT,
  STREAM_STRUCT_OFFSET_RECIPIENT,
  STREAM_STRUCT_OFFSET_SENDER,
  decodeStream,
} from "@streamflow/stream";
import { redact, rpcFor, serverEnv, type Cluster, type RpcKind } from "./env";
import { getAgentStatus } from "./status";
import { DEFAULT_CAP_BPS, isCapReached, percentString, vestingNow, type VestingNow } from "./vesting";

// Offsets of two flags the SDK's decoded stream omits. Same constants as agent/src/lock/read.ts
// (derived from the stream account layout in @streamflow/stream 13.4.0).
const OFFSET_PAUSABLE = 539;
const OFFSET_CAN_UPDATE_RATE = 540;

const CACHE_MS = 30_000;

export interface StreamFlags {
  canTopup: boolean;
  cancelableBySender: boolean;
  cancelableByRecipient: boolean;
  transferableBySender: boolean;
  transferableByRecipient: boolean;
  automaticWithdrawal: boolean;
  canUpdateRate: boolean;
  pausable: boolean;
}

export interface StreamData {
  id: string;
  sender: string;
  recipient: string;
  mint: string;
  escrowTokens: string;
  depositedAmount: string;
  withdrawnAmount: string;
  start: number;
  cliff: number;
  end: number;
  period: number;
  amountPerPeriod: string;
  cliffAmount: string;
  createdAt: number;
  closed: boolean;
  flags: StreamFlags;
}

export interface StreamStep {
  sig: string;
  ts: number;
  kind: "create" | "topup";
  amount: string;
}

export interface MintSupply {
  supply: string;
  decimals: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const cache = new Map<string, { at: number; value: Promise<unknown> }>();

export function cached<T>(key: string, fn: () => Promise<T>, now: () => number = Date.now): Promise<T> {
  const hit = cache.get(key);
  if (hit && now() - hit.at < CACHE_MS) return hit.value as Promise<T>;
  const value = fn().catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, { at: now(), value });
  return value;
}

export function clearChainCache(): void {
  cache.clear();
}

const connections = new Map<string, Connection>();

export function connectionFor(cluster: Cluster): { connection: Connection; rpcKind: RpcKind } {
  const { heliusApiKey } = serverEnv();
  const rpc = rpcFor(cluster, heliusApiKey);
  const key = `${cluster}:${rpc.kind}`;
  let connection = connections.get(key);
  if (!connection) {
    connection = new Connection(rpc.url, "confirmed");
    connections.set(key, connection);
  }
  return { connection, rpcKind: rpc.kind };
}

const sdkCluster = (cluster: Cluster) => (cluster === "devnet" ? "devnet" : "mainnet");
const programId = (cluster: Cluster) => new PublicKey(PROGRAM_ID[sdkCluster(cluster)]);

export function parseStreamAccount(id: string, data: Buffer): StreamData {
  const s = decodeStream(data);
  return {
    id,
    sender: s.sender.toBase58(),
    recipient: s.recipient.toBase58(),
    mint: s.mint.toBase58(),
    escrowTokens: s.escrowTokens.toBase58(),
    depositedAmount: s.depositedAmount.toString(),
    withdrawnAmount: s.withdrawnAmount.toString(),
    start: s.start.toNumber(),
    cliff: s.cliff.toNumber(),
    end: s.end.toNumber(),
    period: s.period.toNumber(),
    amountPerPeriod: s.amountPerPeriod.toString(),
    cliffAmount: s.cliffAmount.toString(),
    createdAt: s.createdAt.toNumber(),
    closed: s.closed,
    flags: {
      canTopup: s.canTopup,
      cancelableBySender: s.cancelableBySender,
      cancelableByRecipient: s.cancelableByRecipient,
      transferableBySender: s.transferableBySender,
      transferableByRecipient: s.transferableByRecipient,
      automaticWithdrawal: s.automaticWithdrawal,
      canUpdateRate: data[OFFSET_CAN_UPDATE_RATE] !== 0,
      pausable: data[OFFSET_PAUSABLE] !== 0,
    },
  };
}

export async function getMintSupply(mint: string, cluster: Cluster = serverEnv().cluster): Promise<MintSupply> {
  return cached(`supply:${cluster}:${mint}`, async () => {
    const { connection } = connectionFor(cluster);
    const res = await connection.getTokenSupply(new PublicKey(mint), "confirmed");
    return { supply: res.value.amount, decimals: res.value.decimals };
  });
}

export async function readStream(id: string, cluster: Cluster = serverEnv().cluster): Promise<StreamData> {
  return cached(`stream:${cluster}:${id}`, async () => {
    const { connection } = connectionFor(cluster);
    const info = await connection.getAccountInfo(new PublicKey(id), "confirmed");
    if (!info) throw new Error(`stream ${id} not found`);
    if (!info.owner.equals(programId(cluster))) throw new Error(`stream ${id} is not a Streamflow contract on ${cluster}`);
    return parseStreamAccount(id, info.data);
  });
}

export interface FoundStream {
  stream: StreamData;
  multiple: boolean;
}

export async function findFounderStream(p: {
  mint: string;
  sender: string;
  recipient: string;
  cluster?: Cluster;
}): Promise<FoundStream | null> {
  const cluster = p.cluster ?? serverEnv().cluster;
  return cached(`find:${cluster}:${p.mint}:${p.sender}:${p.recipient}`, async () => {
    const { connection } = connectionFor(cluster);
    const accounts = await connection.getProgramAccounts(programId(cluster), {
      commitment: "confirmed",
      filters: [
        { memcmp: { offset: STREAM_STRUCT_OFFSET_SENDER, bytes: p.sender } },
        { memcmp: { offset: STREAM_STRUCT_OFFSET_RECIPIENT, bytes: p.recipient } },
        { memcmp: { offset: STREAM_STRUCT_OFFSET_MINT, bytes: p.mint } },
      ],
    });
    const streams = accounts.map((a) => parseStreamAccount(a.pubkey.toBase58(), a.account.data));
    const open = streams.filter((s) => !s.closed);
    const pool = open.length > 0 ? open : streams;
    if (pool.length === 0) return null;
    const oldest = [...pool].sort((a, b) => a.createdAt - b.createdAt)[0]!;
    return { stream: oldest, multiple: pool.length > 1 };
  });
}

type TokenBalances = NonNullable<NonNullable<ParsedTransactionWithMeta["meta"]>["preTokenBalances"]>;

const keyOf = (k: { pubkey: { toString(): string } }) => k.pubkey.toString();

/** Net tokens moved into the escrow by one transaction, and whether it created the stream account. */
export function escrowStep(
  tx: ParsedTransactionWithMeta,
  streamId: string,
  escrowTokens: string,
): { kind: "create" | "topup"; amount: bigint } | null {
  const meta = tx.meta;
  if (!meta || meta.err) return null;
  const keys = tx.transaction.message.accountKeys.map(keyOf);
  const streamIdx = keys.indexOf(streamId);
  const escrowIdx = keys.indexOf(escrowTokens);
  if (streamIdx < 0 || escrowIdx < 0) return null;
  const at = (list: TokenBalances | null | undefined) =>
    BigInt((list ?? []).find((b) => b.accountIndex === escrowIdx)?.uiTokenAmount.amount ?? "0");
  const delta = at(meta.postTokenBalances) - at(meta.preTokenBalances);
  if (delta <= 0n) return null;
  return { kind: (meta.preBalances[streamIdx] ?? 0) === 0 ? "create" : "topup", amount: delta };
}

async function fetchParsed(connection: Connection, sigs: string[]): Promise<(ParsedTransactionWithMeta | null)[]> {
  const opts = { maxSupportedTransactionVersion: 0, commitment: "confirmed" as const };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await connection.getParsedTransactions(sigs, opts);
    } catch {
      await sleep(600 * attempt);
    }
  }
  const out: (ParsedTransactionWithMeta | null)[] = [];
  for (const s of sigs) {
    out.push(await connection.getParsedTransaction(s, opts));
    await sleep(120);
  }
  return out;
}

export async function streamSteps(id: string, cluster: Cluster = serverEnv().cluster): Promise<StreamStep[]> {
  return cached(`steps:${cluster}:${id}`, async () => {
    const { connection } = connectionFor(cluster);
    const stream = await readStream(id, cluster);
    const infos = await connection.getSignaturesForAddress(new PublicKey(id), { limit: 200 }, "confirmed");
    const sigs = infos.filter((i) => !i.err).map((i) => i.signature);
    const steps: StreamStep[] = [];
    for (let i = 0; i < sigs.length; i += 10) {
      const chunk = sigs.slice(i, i + 10);
      const txs = await fetchParsed(connection, chunk);
      txs.forEach((tx, j) => {
        if (!tx) return;
        const step = escrowStep(tx, id, stream.escrowTokens);
        if (step) steps.push({ sig: chunk[j]!, ts: tx.blockTime ?? 0, kind: step.kind, amount: step.amount.toString() });
      });
    }
    return steps.sort((a, b) => a.ts - b.ts);
  });
}

export { vestingNow };
export type { VestingNow };

export type StakeView =
  | { state: "not_launched" }
  | { state: "rpc_error"; rpcKind: RpcKind; error: string }
  | ({ state: "no_contract" } & StakeBase)
  | ({ state: "active" | "cap_reached" } & StakeBase & StakeContract);

interface StakeBase {
  mint: string;
  cluster: Cluster;
  supply: string;
  decimals: number;
  capBps: number;
  rpcKind: RpcKind;
}

interface StakeContract {
  contractId: string;
  recipient: string;
  sender: string;
  multiple: boolean;
  stakePct: string;
  deposited: string;
  withdrawn: string;
  locked: string;
  vested: string;
  nextUnlock: number | null;
  start: number;
  cliff: number;
  end: number;
  period: number;
  amountPerPeriod: string;
  flags: StreamFlags;
  steps: StreamStep[];
}

export interface StakeViewDeps {
  env?: ReturnType<typeof serverEnv>;
  capBps?: () => Promise<number | null>;
  nowSec?: () => number;
  supply?: (mint: string, cluster: Cluster) => Promise<MintSupply>;
  find?: typeof findFounderStream;
  steps?: typeof streamSteps;
}

async function agentCapBps(): Promise<number | null> {
  try {
    const s = await getAgentStatus();
    return s.ok ? (s.live?.policy.capBps ?? null) : null;
  } catch {
    return null;
  }
}

export async function getStakeView(deps: StakeViewDeps = {}): Promise<StakeView> {
  const env = deps.env ?? serverEnv();
  if (!env.mint) return { state: "not_launched" };
  const rpcKind: RpcKind = env.heliusApiKey ? "helius" : "public";
  try {
    if (!env.wallet || !env.founder) throw new Error("KESTIV_WALLET and FOUNDER_WALLET must be set");
    const now = deps.nowSec ? deps.nowSec() : Math.floor(Date.now() / 1000);
    const [supply, found, capBps] = await Promise.all([
      (deps.supply ?? getMintSupply)(env.mint, env.cluster),
      (deps.find ?? findFounderStream)({ mint: env.mint, sender: env.wallet, recipient: env.founder, cluster: env.cluster }),
      (deps.capBps ?? agentCapBps)().then((v) => v ?? DEFAULT_CAP_BPS),
    ]);
    const base: StakeBase = { mint: env.mint, cluster: env.cluster, supply: supply.supply, decimals: supply.decimals, capBps, rpcKind };
    if (!found) return { state: "no_contract", ...base };

    const { stream, multiple } = found;
    const steps = await (deps.steps ?? streamSteps)(stream.id, env.cluster);
    const v = vestingNow(stream, now);
    const stake = BigInt(stream.depositedAmount) - BigInt(stream.withdrawnAmount);
    const supplyBig = BigInt(supply.supply);
    return {
      state: isCapReached(stake, supplyBig, capBps) ? "cap_reached" : "active",
      ...base,
      contractId: stream.id,
      recipient: stream.recipient,
      sender: stream.sender,
      multiple,
      stakePct: percentString(stake, supplyBig),
      deposited: stream.depositedAmount,
      withdrawn: stream.withdrawnAmount,
      locked: v.locked,
      vested: v.vested,
      nextUnlock: v.nextUnlock,
      start: stream.start,
      cliff: stream.cliff,
      end: stream.end,
      period: stream.period,
      amountPerPeriod: stream.amountPerPeriod,
      flags: stream.flags,
      steps,
    };
  } catch (e) {
    return { state: "rpc_error", rpcKind, error: redact(e instanceof Error ? e.message : "chain read failed") };
  }
}

export const DEVNET_PROOF = {
  contractId: "G28zWX3sniaou4EBCuBBTc1tY4kewyfRU2eT7V65fQiV",
  createSig: "4YYCodAuKZ66YKBYFpRMXya9JUWW2E8w9TCCc2GW14NjsiWy6xVjceHEjaszmnnA4BK39nVqB4izEkgtTUoi5nY5",
  topupSig: "2D6TKcEkNGLb6uPwPE87Hy4PYekwjq5MyizzX1GMXSLfHsBKDtHuCBvwG5DF5u472LpAJqYQSaW8Mvcm4zwLsLXD",
  cancelSig: "2crG6A3DAjrtAou2Uyfpw7cP5WZHVUFzRjbnqidL8bRHJxbti7EXmPLUG32aYiAembQVF5GqScqzs8enJF9eDef5",
} as const;

export interface CancelAttempt {
  sig: string;
  slot: number;
  ts: number | null;
  err: unknown;
  customCode: number | null;
}

export interface DevnetProof {
  cluster: "devnet";
  stream: StreamData;
  steps: StreamStep[];
  sigs: { create: string; topup: string; cancel: string };
  cancel: CancelAttempt | null;
}

export async function getCancelAttempt(sig: string, cluster: Cluster): Promise<CancelAttempt | null> {
  return cached(`tx:${cluster}:${sig}`, async () => {
    const { connection } = connectionFor(cluster);
    const tx = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (!tx?.meta) return null;
    const err = tx.meta.err as { InstructionError?: [number, { Custom?: number } | string] } | null;
    const detail = err?.InstructionError?.[1];
    const customCode = detail && typeof detail === "object" && typeof detail.Custom === "number" ? detail.Custom : null;
    return { sig, slot: tx.slot, ts: tx.blockTime ?? null, err, customCode };
  });
}

export async function getDevnetProof(): Promise<DevnetProof> {
  const [stream, steps, cancel] = await Promise.all([
    readStream(DEVNET_PROOF.contractId, "devnet"),
    streamSteps(DEVNET_PROOF.contractId, "devnet"),
    getCancelAttempt(DEVNET_PROOF.cancelSig, "devnet"),
  ]);
  return {
    cluster: "devnet",
    stream,
    steps,
    sigs: { create: DEVNET_PROOF.createSig, topup: DEVNET_PROOF.topupSig, cancel: DEVNET_PROOF.cancelSig },
    cancel,
  };
}

export { percentString };

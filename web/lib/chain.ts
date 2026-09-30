import "server-only";
import { Connection, PublicKey } from "@solana/web3.js";
import { redact, rpcFor, serverEnv, type Cluster, type RpcKind } from "./env";
import {
  ESCROW_ACCOUNT_SIZE,
  LOCKER_PROGRAM_ID,
  OFFSET_CREATOR,
  OFFSET_MINT,
  OFFSET_RECIPIENT,
  guaranteesOf,
  isFounderLock,
  lockTotals,
  parseLockAccount,
  type LockData,
  type LockGuarantees,
} from "./lock";
import { getAgentStatus } from "./status";
import { DEFAULT_CAP_BPS, isCapReached, percentString } from "./vesting";

const CACHE_MS = 30_000;

/** One step of the staircase: a lock, when it started and how much it holds. */
export interface LockStep {
  id: string;
  ts: number;
  amount: string;
}

export interface MintSupply {
  supply: string;
  decimals: number;
}

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

export async function getMintSupply(mint: string, cluster: Cluster = serverEnv().cluster): Promise<MintSupply> {
  return cached(`supply:${cluster}:${mint}`, async () => {
    const { connection } = connectionFor(cluster);
    const res = await connection.getTokenSupply(new PublicKey(mint), "confirmed");
    return { supply: res.value.amount, decimals: res.value.decimals };
  });
}

export async function readLocks(ids: string[], cluster: Cluster = serverEnv().cluster): Promise<LockData[]> {
  if (ids.length === 0) return [];
  return cached(`locks:${cluster}:${ids.join(",")}`, async () => {
    const { connection } = connectionFor(cluster);
    const out: LockData[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const infos = await connection.getMultipleAccountsInfo(chunk.map((id) => new PublicKey(id)), "confirmed");
      infos.forEach((info, j) => {
        if (!info || info.owner.toBase58() !== LOCKER_PROGRAM_ID) return;
        try {
          out.push(parseLockAccount(chunk[j]!, info.data));
        } catch {
          // not an escrow, so it cannot be one of the founder's locks
        }
      });
    }
    return out;
  });
}

/** Finds the founder's locks straight from the chain. Used when the agent's report is unavailable. */
export async function findFounderLocks(p: { mint: string; creator: string; recipient: string; cluster?: Cluster }): Promise<LockData[]> {
  const cluster = p.cluster ?? serverEnv().cluster;
  return cached(`find:${cluster}:${p.mint}:${p.creator}:${p.recipient}`, async () => {
    const { connection } = connectionFor(cluster);
    const accounts = await connection.getProgramAccounts(new PublicKey(LOCKER_PROGRAM_ID), {
      commitment: "confirmed",
      filters: [
        { dataSize: ESCROW_ACCOUNT_SIZE },
        { memcmp: { offset: OFFSET_MINT, bytes: p.mint } },
        { memcmp: { offset: OFFSET_CREATOR, bytes: p.creator } },
        { memcmp: { offset: OFFSET_RECIPIENT, bytes: p.recipient } },
      ],
    });
    const locks: LockData[] = [];
    for (const a of accounts) {
      try {
        locks.push(parseLockAccount(a.pubkey.toBase58(), a.account.data));
      } catch {
        // skip anything that does not parse
      }
    }
    return locks;
  });
}

/** Addresses of the locks the agent says it created, or null when its report can't be reached. */
async function listedLockIds(): Promise<string[] | null> {
  try {
    const s = await getAgentStatus();
    if (!s.ok) return null;
    const run = s.live ?? s.dry;
    return run ? run.locks.map((l) => l.escrow) : [];
  } catch {
    return null;
  }
}

export type StakeView =
  | { state: "not_launched" }
  | { state: "rpc_error"; rpcKind: RpcKind; error: string }
  | ({ state: "no_lock" } & StakeBase)
  | ({ state: "active" | "cap_reached" } & StakeBase & StakeLocks);

interface StakeBase {
  mint: string;
  cluster: Cluster;
  supply: string;
  decimals: number;
  capBps: number;
  rpcKind: RpcKind;
}

interface StakeLocks {
  /** Every lock that checked out on chain as the founder's. */
  locks: LockData[];
  recipient: string;
  sender: string;
  stakePct: string;
  deposited: string;
  withdrawn: string;
  locked: string;
  vested: string;
  nextUnlock: number | null;
  /** First cliff and last unlock across all locks. */
  cliff: number;
  end: number;
  guarantees: LockGuarantees;
  steps: LockStep[];
}

export interface StakeViewDeps {
  env?: ReturnType<typeof serverEnv>;
  capBps?: () => Promise<number | null>;
  nowSec?: () => number;
  supply?: (mint: string, cluster: Cluster) => Promise<MintSupply>;
  /** The founder's locks. Defaults to the agent's list, read and checked on chain, or a chain search when the report is down. */
  locks?: (p: { mint: string; creator: string; recipient: string; cluster: Cluster }) => Promise<LockData[]>;
}

async function agentCapBps(): Promise<number | null> {
  try {
    const s = await getAgentStatus();
    return s.ok ? (s.live?.policy.capBps ?? null) : null;
  } catch {
    return null;
  }
}

async function founderLocks(p: { mint: string; creator: string; recipient: string; cluster: Cluster }): Promise<LockData[]> {
  const listed = await listedLockIds();
  const found = listed ? await readLocks(listed, p.cluster) : await findFounderLocks(p);
  return found.filter((l) => isFounderLock(l, p));
}

export const stepsOf = (locks: LockData[]): LockStep[] => locks.map((l) => ({ id: l.id, ts: l.start, amount: l.deposited })).sort((a, b) => a.ts - b.ts);

export async function getStakeView(deps: StakeViewDeps = {}): Promise<StakeView> {
  const env = deps.env ?? serverEnv();
  if (!env.mint) return { state: "not_launched" };
  const rpcKind: RpcKind = env.heliusApiKey ? "helius" : "public";
  try {
    if (!env.wallet || !env.founder) throw new Error("KESTIV_WALLET and FOUNDER_WALLET must be set");
    const now = deps.nowSec ? deps.nowSec() : Math.floor(Date.now() / 1000);
    const [supply, locks, capBps] = await Promise.all([
      (deps.supply ?? getMintSupply)(env.mint, env.cluster),
      (deps.locks ?? founderLocks)({ mint: env.mint, creator: env.wallet, recipient: env.founder, cluster: env.cluster }),
      (deps.capBps ?? agentCapBps)().then((v) => v ?? DEFAULT_CAP_BPS),
    ]);
    const base: StakeBase = { mint: env.mint, cluster: env.cluster, supply: supply.supply, decimals: supply.decimals, capBps, rpcKind };
    if (locks.length === 0) return { state: "no_lock", ...base };

    const t = lockTotals(locks, now);
    const stake = BigInt(t.deposited) - BigInt(t.claimed);
    const supplyBig = BigInt(supply.supply);
    return {
      state: isCapReached(stake, supplyBig, capBps) ? "cap_reached" : "active",
      ...base,
      locks,
      recipient: env.founder,
      sender: env.wallet,
      stakePct: percentString(stake, supplyBig),
      deposited: t.deposited,
      withdrawn: t.claimed,
      locked: t.locked,
      vested: t.vested,
      nextUnlock: t.nextUnlock,
      cliff: t.cliff ?? 0,
      end: t.end ?? 0,
      guarantees: guaranteesOf(locks),
      steps: stepsOf(locks),
    };
  } catch (e) {
    return { state: "rpc_error", rpcKind, error: redact(e instanceof Error ? e.message : "chain read failed") };
  }
}

/** Two real locks made with the agent's own code on devnet, and the failed cancel against the first (scripts/devnet-lock-check.ts). */
export const DEVNET_PROOF = {
  mint: "7DvZoDAQvv1XdcFSauT1LKYjkE8o5DuZiWjbGpZYE37Y",
  locks: [
    { id: "5hdB38wWZw6THDLvJyYGCHu2oPEutYz7MfmVkifZvb3s", sig: "5TMFLNcoeiTm6Nm1ECaukmr5bvyg3wF5bLYQaNyafzLcxiz9UhpEMKXyAF3VPtj16VNAbWR6sUojYkey2jFrpyXv" },
    { id: "FVqiRjqZppGRtXdRgXxEwX5wGwt5f6wkHjjZeJyRLwrW", sig: "3fc1TogWaCNDZcWr3MHZXSkdeX5bVhD82onVznoq45UTdxTH6jsxE4MQbeQozbGdusVr2uBceADkmhpQLzxqx5DG" },
  ],
  cancelSig: "4dBNaHwraKzc1pw2tgX2TLqoaC326qJ7SQG6eMMSq9dfGuufhKf8PKpJzb5z1nzAZVPCNCuppY4D9MmDbNidgmtC",
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
  mint: string;
  locks: LockData[];
  steps: LockStep[];
  guarantees: LockGuarantees;
  /** Creation transaction of each lock, in the same order. */
  sigs: { locks: string[]; cancel: string };
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
  const [locks, cancel] = await Promise.all([
    readLocks(DEVNET_PROOF.locks.map((l) => l.id), "devnet"),
    getCancelAttempt(DEVNET_PROOF.cancelSig, "devnet"),
  ]);
  if (locks.length !== DEVNET_PROOF.locks.length) throw new Error("the devnet proof locks could not be read");
  return {
    cluster: "devnet",
    mint: DEVNET_PROOF.mint,
    locks,
    steps: stepsOf(locks),
    guarantees: guaranteesOf(locks),
    sigs: { locks: DEVNET_PROOF.locks.map((l) => l.sig), cancel: DEVNET_PROOF.cancelSig },
    cancel,
  };
}

export { percentString };

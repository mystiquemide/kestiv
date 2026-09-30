import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import type { Policy } from "../policy.js";
import type { Store } from "../store/index.js";
import type { RunResult } from "../loop/types.js";

const lamports = z.string().regex(/^\d+$/);
const gate = z.object({
  name: z.string(),
  value: z.union([z.string(), z.number()]).nullable(),
  threshold: z.union([z.string(), z.number()]),
  pass: z.boolean(),
  source: z.string().optional(),
});
const quote = z.object({
  inLamports: lamports,
  outAmount: lamports,
  priceImpact: z.number(),
  route: z.array(z.string()),
  decimals: z.number().nullable().default(null),
});
const usepod = z.object({
  outcome: z.string(),
  verdict: z.enum(["buy", "skip"]).nullable(),
  reason: z.string().nullable(),
  lamports: z.number().nullable(),
  paymentSig: z.string().nullable(),
  model: z.string().nullable(),
});

export const PublicStatusSchema = z.object({
  version: z.literal(1),
  state: z.string(),
  reason: z.string(),
  ts: z.number(),
  dry: z.boolean(),
  mint: z.string(),
  cluster: z.string(),
  gates: z.array(gate),
  stake: z.object({ stakeTokens: z.string(), capTokens: z.string(), supply: z.string() }).nullable(),
  budget: z
    .object({
      budgetedLamports: z.number(),
      spentOnSlicesLamports: z.number(),
      expensesLamports: z.number(),
      remainingLamports: z.number(),
      walletLamports: z.number(),
      spendableLamports: z.number(),
    })
    .nullable(),
  txs: z.array(z.string()),
  quote: quote.nullable().default(null),
  wallet: z.string(),
  founder: z.string(),
  contractId: z.string().nullable(),
  nextRunAt: z.number().nullable(),
  policy: z.object({
    capBps: z.number(),
    minSliceLamports: z.number(),
    opsReserveLamports: z.number(),
    contractCreationLamports: z.number(),
    maxPriceImpact: z.number(),
    minHolders: z.number(),
    minVolume24hUsd: z.number(),
    stakeShareBps: z.number(),
    liquidityShareBps: z.number().default(100),
  }),
  latest: z.object({
    buySig: z.string().nullable(),
    buyTs: z.number().nullable(),
    lockSig: z.string().nullable(),
    lockTs: z.number().nullable(),
  }),
  funding: z.object({ feeLamports: lamports, seedLamports: lamports, forwardedLamports: lamports }),
  inflows: z.array(z.object({ sig: z.string(), lamports, source: z.enum(["fee", "seed"]), ts: z.number() })),
  slices: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      lamportsIn: lamports,
      tokensOut: z.string().nullable(),
      buySig: z.string().nullable(),
      lockSig: z.string().nullable(),
      ts: z.number(),
    }),
  ),
  runs: z.array(
    z.object({
      id: z.number(),
      ts: z.number(),
      state: z.string(),
      reason: z.string(),
      dry: z.boolean(),
      mint: z.string(),
      gates: z.array(gate),
      txs: z.array(z.string()),
      quote: quote.nullable().default(null),
      usepod: usepod.nullable(),
    }),
  ),
});

export type PublicStatus = z.infer<typeof PublicStatusSchema>;

export interface StatusPaths {
  live: string;
  dry: string;
}

export function statusPaths(base = "./data/status.json"): StatusPaths {
  return { live: base, dry: base.replace(/\.json$/, "") + ".dry.json" };
}

const RUN_LIMIT = 50;
const INFLOW_LIMIT = 5;

const parseJson = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const nullable = <T>(v: T | null | undefined): T | null => (v === undefined ? null : v);

interface StoredQuote {
  inLamports?: string;
  outAmount?: string;
  priceImpact?: number;
  route?: string[];
  decimals?: number;
}

const toQuote = (q: StoredQuote | undefined) =>
  q && q.inLamports !== undefined && q.outAmount !== undefined && typeof q.priceImpact === "number" && Array.isArray(q.route)
    ? { inLamports: q.inLamports, outAmount: q.outAmount, priceImpact: q.priceImpact, route: q.route, decimals: q.decimals ?? null }
    : null;

interface StoredUsepod {
  outcome?: string;
  verdict?: "buy" | "skip";
  reason?: string;
  quoteLamports?: number;
  paymentSignature?: string;
  model?: string;
}

export interface BuildInput {
  store: Store;
  result: RunResult;
  cfg: { SOLANA_CLUSTER: string; KESTIV_WALLET: string; FOUNDER_WALLET: string };
  policy: Policy;
  mint: string;
  nowSec: number;
  nextRunAt?: number | null;
}

export function buildPublicStatus(i: BuildInput): PublicStatus {
  const { store, result, policy } = i;
  const details = result.details as { gates?: unknown; stake?: unknown; quote?: StoredQuote };

  const slices = store.allSlices();
  const lastBuy = slices.find((s) => s.buy_sig);
  const lastLock = slices.find((s) => s.lock_sig);
  const totals = store.inflowTotals();

  const cooldown = Number(store.getConfig("cooldown_until") ?? 0);
  const nextRunAt = i.nextRunAt ?? (cooldown > i.nowSec ? cooldown : null);

  const runs = store.recentRuns(RUN_LIMIT).map((r) => {
    const d = parseJson<{ dry?: boolean; mint?: string; gates?: unknown; quote?: StoredQuote; usepod?: StoredUsepod }>(r.details, {});
    const u = d.usepod;
    return {
      id: r.id,
      ts: r.ts ?? 0,
      state: r.state ?? "",
      reason: r.reason ?? "",
      dry: Boolean(d.dry),
      mint: d.mint ?? "",
      gates: Array.isArray(d.gates) ? d.gates : [],
      txs: parseJson<string[]>(r.txs, []),
      quote: toQuote(d.quote),
      usepod: u?.outcome
        ? {
            outcome: u.outcome,
            verdict: nullable(u.verdict),
            reason: nullable(u.reason),
            lamports: nullable(u.quoteLamports),
            paymentSig: nullable(u.paymentSignature),
            model: nullable(u.model),
          }
        : null,
    };
  });

  return PublicStatusSchema.parse({
    version: 1,
    state: result.state,
    reason: result.reason,
    ts: result.ts,
    dry: result.dry,
    mint: i.mint,
    cluster: i.cfg.SOLANA_CLUSTER,
    gates: Array.isArray(details.gates) ? details.gates : [],
    stake: details.stake ?? null,
    budget: result.budget ?? null,
    txs: result.txs,
    quote: toQuote(details.quote),
    wallet: i.cfg.KESTIV_WALLET,
    founder: i.cfg.FOUNDER_WALLET,
    contractId: store.getConfig("contract_id") ?? null,
    nextRunAt,
    policy: {
      capBps: policy.capBps,
      minSliceLamports: policy.minSliceLamports,
      opsReserveLamports: policy.opsReserveLamports,
      contractCreationLamports: policy.contractCreationLamports,
      maxPriceImpact: policy.maxPriceImpact,
      minHolders: policy.minHolders,
      minVolume24hUsd: policy.minVolume24hUsd,
      stakeShareBps: policy.stakeShareBps,
      liquidityShareBps: policy.liquidityShareBps,
    },
    latest: {
      buySig: lastBuy?.buy_sig ?? null,
      buyTs: lastBuy?.bought_ts ?? null,
      lockSig: lastLock?.lock_sig ?? null,
      lockTs: lastLock?.locked_ts ?? null,
    },
    funding: {
      feeLamports: String(totals.fee),
      seedLamports: String(totals.seed),
      forwardedLamports: String(store.forwardedTotal()),
    },
    inflows: store.recentInflows(INFLOW_LIMIT).map((f) => ({ sig: f.sig, lamports: String(f.lamports), source: f.source, ts: f.ts })),
    slices: slices.map((s) => ({
      id: s.id,
      status: s.status,
      lamportsIn: String(s.sol_in ?? 0),
      tokensOut: s.tokens_out,
      buySig: s.buy_sig,
      lockSig: s.lock_sig,
      ts: s.created_ts ?? 0,
    })),
    runs,
  });
}

export function writePublicStatus(path: string, status: PublicStatus): void {
  writeFileSync(path, JSON.stringify(status, null, 2));
}

export type ReadResult =
  | { status: PublicStatus; error?: undefined }
  | { status: null; error?: "unreadable" | "invalid_json" | "schema_mismatch" };

export function readPublicStatus(path: string): ReadResult {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "ENOENT" ? { status: null } : { status: null, error: "unreadable" };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { status: null, error: "invalid_json" };
  }
  const parsed = PublicStatusSchema.safeParse(json);
  return parsed.success ? { status: parsed.data } : { status: null, error: "schema_mismatch" };
}

export function setNextRunAt(path: string, nextRunAt: number): void {
  const current = readPublicStatus(path);
  if (current.status) writePublicStatus(path, { ...current.status, nextRunAt });
}

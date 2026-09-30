// Mirrors agent/src/status/public.ts (PublicStatusSchema). Kept as a copy on purpose: web never imports from agent/.
import { z } from "zod";

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
  locks: z.array(z.object({ escrow: z.string(), sig: z.string(), amount: lamports, ts: z.number() })).default([]),
  nextRunAt: z.number().nullable(),
  policy: z.object({
    capBps: z.number(),
    minSliceLamports: z.number(),
    opsReserveLamports: z.number(),
    lockRentLamports: z.number().default(6_000_000),
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

export const StatusResponseSchema = z.object({
  live: PublicStatusSchema.nullable(),
  dry: PublicStatusSchema.nullable(),
  servedAt: z.number(),
  errors: z.array(z.object({ side: z.enum(["live", "dry"]), reason: z.string() })).default([]),
});

export type StatusResponse = z.infer<typeof StatusResponseSchema>;

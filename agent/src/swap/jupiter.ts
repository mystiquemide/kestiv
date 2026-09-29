import { Buffer } from "node:buffer";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { z } from "zod";

export const WSOL_MINT = "So11111111111111111111111111111111111111112";
export const JUPITER_BASE_URL = "https://api.jup.ag/swap/v1";

const quoteSchema = z
  .object({
    inputMint: z.string(),
    outputMint: z.string(),
    inAmount: z.string(),
    outAmount: z.string(),
    otherAmountThreshold: z.string(),
    slippageBps: z.number(),
    priceImpactPct: z.string(),
    routePlan: z.array(z.object({ swapInfo: z.object({ label: z.string().optional() }).passthrough() }).passthrough()),
  })
  .passthrough();

export type JupiterQuoteResponse = z.infer<typeof quoteSchema>;

export interface SwapQuote {
  inLamports: bigint;
  outAmount: bigint;
  minOutAmount: bigint;
  priceImpact: number;
  routeLabels: string[];
  raw: JupiterQuoteResponse;
}

export interface BuiltSwap {
  transaction: VersionedTransaction;
  lastValidBlockHeight: number;
}

export function parseQuote(json: unknown): SwapQuote {
  const raw = quoteSchema.parse(json);
  return {
    inLamports: BigInt(raw.inAmount),
    outAmount: BigInt(raw.outAmount),
    minOutAmount: BigInt(raw.otherAmountThreshold),
    priceImpact: Number(raw.priceImpactPct),
    routeLabels: raw.routePlan.map((r) => r.swapInfo.label ?? "unknown"),
    raw,
  };
}

const swapSchema = z.object({ swapTransaction: z.string(), lastValidBlockHeight: z.number() }).passthrough();

export function parseSwapResponse(json: unknown): BuiltSwap {
  const r = swapSchema.parse(json);
  return {
    transaction: VersionedTransaction.deserialize(Buffer.from(r.swapTransaction, "base64")),
    lastValidBlockHeight: r.lastValidBlockHeight,
  };
}

export interface JupiterOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  maxPriorityFeeLamports: number;
}

export function createJupiter(opts: JupiterOptions) {
  const base = opts.baseUrl ?? JUPITER_BASE_URL;
  const f = opts.fetchFn ?? fetch;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.apiKey) headers["x-api-key"] = opts.apiKey;

  return {
    async quote(mint: PublicKey, lamports: bigint, slippageBps: number): Promise<SwapQuote> {
      const url = `${base}/quote?inputMint=${WSOL_MINT}&outputMint=${mint.toBase58()}&amount=${lamports}&slippageBps=${slippageBps}`;
      const res = await f(url, { headers });
      if (!res.ok) throw new Error(`jupiter quote failed (${res.status})`);
      return parseQuote(await res.json());
    },

    async buildSwap(quote: SwapQuote, user: PublicKey): Promise<BuiltSwap> {
      const res = await f(`${base}/swap`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          quoteResponse: quote.raw,
          userPublicKey: user.toBase58(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: {
            priorityLevelWithMaxLamports: { maxLamports: opts.maxPriorityFeeLamports, priorityLevel: "high" },
          },
        }),
      });
      if (!res.ok) throw new Error(`jupiter swap build failed (${res.status})`);
      return parseSwapResponse(await res.json());
    },
  };
}

export type Jupiter = ReturnType<typeof createJupiter>;

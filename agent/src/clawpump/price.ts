import { z } from "zod";

const BASE = "https://clawpump.tech/api/v1/price";

const nullableNum = z.number().finite().nullable().optional();
const priceSchema = z.object({
  mint: z.string(),
  price: z.number().finite().nullable().optional(),
  volume24h: nullableNum,
  liquidity: nullableNum,
  marketCap: nullableNum,
  updatedAt: z.string().nullable().optional(),
});

export interface TokenPrice {
  mint: string;
  priceUsd: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  updatedAt: string | null;
}

export function parsePrice(json: unknown): TokenPrice {
  const p = priceSchema.parse(json);
  return {
    mint: p.mint,
    priceUsd: p.price ?? null,
    volume24hUsd: p.volume24h ?? null,
    liquidityUsd: p.liquidity ?? null,
    marketCapUsd: p.marketCap ?? null,
    updatedAt: p.updatedAt ?? null,
  };
}

export async function fetchPrice(mint: string, apiKey: string, fetchFn: typeof fetch = fetch): Promise<TokenPrice> {
  const res = await fetchFn(`${BASE}?mint=${encodeURIComponent(mint)}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`clawpump price request failed (${res.status})`);
  return parsePrice(await res.json());
}

export async function fetchSolUsd(apiKey: string, fetchFn: typeof fetch = fetch): Promise<number> {
  const p = await fetchPrice("SOL", apiKey, fetchFn);
  if (!p.priceUsd || p.priceUsd <= 0) throw new Error("clawpump returned no SOL price");
  return p.priceUsd;
}

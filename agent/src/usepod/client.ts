import { z } from "zod";

export const USEPOD_URL = "https://api.usepod.ai/proxy/x402/v1/chat/completions";

const quoteSchema = z
  .object({
    quote_id: z.string(),
    accepts: z.array(
      z
        .object({
          asset: z.string(),
          network: z.string(),
          pay_to: z.string(),
          amount_microunits: z.number(),
          expires_at: z.string().optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export type UsepodQuote = z.infer<typeof quoteSchema>;

export interface SolQuote {
  quoteId: string;
  network: string;
  payTo: string;
  lamports: number;
  expiresAt?: string;
}

const verdictSchema = z.object({ verdict: z.enum(["buy", "skip"]), reason: z.string() });

export type UsepodOutcome =
  | "ok"
  | "dry_run_quote_only"
  | "quote_too_high"
  | "unavailable";

export interface UsepodResult {
  outcome: UsepodOutcome;
  verdict?: "buy" | "skip";
  reason?: string;
  quote?: SolQuote;
  paymentSignature?: string;
  headers?: Record<string, string>;
  error?: string;
}

export function parseQuoteHeader(b64: string): SolQuote {
  const quote = quoteSchema.parse(JSON.parse(Buffer.from(b64, "base64").toString("utf8")));
  const sol = quote.accepts.find((a) => a.asset === "SOL" && a.network.startsWith("solana:"));
  if (!sol) throw new Error("no native SOL entry in quote");
  return {
    quoteId: quote.quote_id,
    network: sol.network,
    payTo: sol.pay_to,
    lamports: sol.amount_microunits,
    expiresAt: sol.expires_at,
  };
}

export function parseVerdict(responseJson: unknown): { verdict: "buy" | "skip"; reason: string } {
  const content = (responseJson as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("no completion content");
  return verdictSchema.parse(JSON.parse(content.trim()));
}

const pickHeaders = (h: Headers): Record<string, string> => {
  const out: Record<string, string> = {};
  h.forEach((v, k) => {
    if (k.startsWith("x-pod-") || k === "payment-response") out[k] = v;
  });
  return out;
};

export interface UsepodOptions {
  model: string;
  messages: { role: string; content: string }[];
  payer: string;
  maxLamports: number;
  dryRun: boolean;
  pay: (payTo: string, lamports: number) => Promise<string>;
  fetchFn?: typeof fetch;
  url?: string;
}

export async function usepodVerdict(o: UsepodOptions): Promise<UsepodResult> {
  const f = o.fetchFn ?? fetch;
  const url = o.url ?? USEPOD_URL;
  const body = JSON.stringify({ model: o.model, max_tokens: 120, temperature: 0, messages: o.messages });
  const post = (extra: Record<string, string> = {}) =>
    f(url, { method: "POST", headers: { "content-type": "application/json", ...extra }, body });

  let quote: SolQuote | undefined;
  try {
    const first = await post();
    if (first.status !== 402) return { outcome: "unavailable", error: `expected 402, got ${first.status}` };
    const header = first.headers.get("payment-required");
    if (!header) return { outcome: "unavailable", error: "402 without PAYMENT-REQUIRED header" };
    quote = parseQuoteHeader(header);

    if (quote.lamports > o.maxLamports) return { outcome: "quote_too_high", quote };
    if (o.dryRun) return { outcome: "dry_run_quote_only", quote };

    const signature = await o.pay(quote.payTo, quote.lamports);
    const proof = Buffer.from(
      JSON.stringify({
        quote_id: quote.quoteId,
        network: quote.network,
        asset: "SOL",
        payer_wallet: o.payer,
        signature,
      }),
    ).toString("base64");

    const second = await post({ "payment-signature": proof });
    const headers = pickHeaders(second.headers);
    if (second.status !== 200) {
      return { outcome: "unavailable", quote, paymentSignature: signature, headers, error: `status ${second.status}` };
    }
    const parsed = parseVerdict(await second.json());
    return { outcome: "ok", ...parsed, quote, paymentSignature: signature, headers };
  } catch (e) {
    return { outcome: "unavailable", quote, error: e instanceof Error ? e.message.slice(0, 200) : "error" };
  }
}

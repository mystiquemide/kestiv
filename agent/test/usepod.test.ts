import { describe, expect, it, vi } from "vitest";
import type { SwapEvent } from "../src/chain/swaps.js";
import { parseQuoteHeader, usepodVerdict, type UsepodOptions } from "../src/usepod/client.js";
import { SYSTEM_PROMPT, buildMessages, buildUserPrompt } from "../src/usepod/prompt.js";
import { readFileSync } from "node:fs";

const quoteJson = readFileSync(new URL("./fixtures/usepod-402.json", import.meta.url), "utf8");
const header = Buffer.from(quoteJson).toString("base64");
const solLamports = 161;

const res = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
const completion = (content: string) => ({ choices: [{ message: { content } }] });

const messages = [{ role: "user", content: "x" }];
const opts = (fetchFn: typeof fetch, over: Partial<UsepodOptions> = {}): UsepodOptions => ({
  model: "deepseek-v4-flash",
  messages,
  payer: "PAYER",
  maxLamports: 300_000,
  dryRun: false,
  pay: vi.fn().mockResolvedValue("PAYSIG"),
  fetchFn,
  ...over,
});
const flow = (second: Response) =>
  vi
    .fn()
    .mockResolvedValueOnce(res(402, {}, { "payment-required": header }))
    .mockResolvedValueOnce(second) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

describe("usepod x402", () => {
  it("parses the real recorded 402 quote and picks the native SOL entry", () => {
    const q = parseQuoteHeader(header);
    expect(q.lamports).toBe(solLamports);
    expect(q.payTo).toBe("GXfqVnZENHzvim8rNN8TPwqxWXQe8EBbxhcEMYE8Z7BS");
    expect(q.network.startsWith("solana:")).toBe(true);
  });

  it("402 -> pay -> 200 happy path with identical body and correct proof", async () => {
    const f = flow(res(200, completion('{"verdict":"buy","reason":"organic"}'), { "x-pod-route": "r1", "x-pod-provider-id": "p1", "x-pod-cost": "0.001" }));
    const o = opts(f);
    const r = await usepodVerdict(o);
    expect(r).toMatchObject({ outcome: "ok", verdict: "buy", reason: "organic", paymentSignature: "PAYSIG" });
    expect(r.headers).toMatchObject({ "x-pod-route": "r1", "x-pod-provider-id": "p1" });
    expect(o.pay).toHaveBeenCalledWith("GXfqVnZENHzvim8rNN8TPwqxWXQe8EBbxhcEMYE8Z7BS", solLamports);
    const calls = f.mock.calls as [string, RequestInit][];
    expect(calls[0]![1].body).toBe(calls[1]![1].body);
    const proof = JSON.parse(Buffer.from((calls[1]![1].headers as Record<string, string>)["payment-signature"]!, "base64").toString());
    expect(proof).toEqual({ quote_id: "df257f22-7135-429c-9f11-bf76df892056", network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", asset: "SOL", payer_wallet: "PAYER", signature: "PAYSIG" });
    const body = JSON.parse(calls[0]![1].body as string);
    expect(body).toMatchObject({ model: "deepseek-v4-flash", max_tokens: 120, temperature: 0 });
  });

  it("refuses to pay a quote above the cap", async () => {
    const f = flow(res(200, {}));
    const o = opts(f, { maxLamports: 100 });
    const r = await usepodVerdict(o);
    expect(r.outcome).toBe("quote_too_high");
    expect(o.pay).not.toHaveBeenCalled();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("dry run makes only the unpaid call", async () => {
    const f = flow(res(200, {}));
    const o = opts(f, { dryRun: true });
    const r = await usepodVerdict(o);
    expect(r).toMatchObject({ outcome: "dry_run_quote_only", quote: { lamports: solLamports } });
    expect(o.pay).not.toHaveBeenCalled();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["bad json content", res(200, completion("sure, buy it"))],
    ["wrong verdict value", res(200, completion('{"verdict":"maybe","reason":"x"}'))],
    ["missing reason", res(200, completion('{"verdict":"buy"}'))],
    ["fenced json", res(200, completion('```json\n{"verdict":"buy","reason":"x"}\n```'))],
    ["5xx", res(503, "down")],
    ["no choices", res(200, {})],
  ])("%s becomes unavailable", async (_n, second) => {
    const r = await usepodVerdict(opts(flow(second)));
    expect(r.outcome).toBe("unavailable");
    expect(r.verdict).toBeUndefined();
  });

  it("skip verdict is passed through", async () => {
    const r = await usepodVerdict(opts(flow(res(200, completion('{"verdict":"skip","reason":"circular"}')))));
    expect(r).toMatchObject({ outcome: "ok", verdict: "skip", reason: "circular" });
  });

  it("network errors and a missing 402 header become unavailable", async () => {
    const boom = vi.fn().mockRejectedValue(new Error("boom")) as unknown as typeof fetch;
    expect((await usepodVerdict(opts(boom))).outcome).toBe("unavailable");
    const ok200 = vi.fn().mockResolvedValue(res(200, {})) as unknown as typeof fetch;
    expect((await usepodVerdict(opts(ok200))).outcome).toBe("unavailable");
  });

  it("a failing payment becomes unavailable", async () => {
    const f = flow(res(200, {}));
    const r = await usepodVerdict(opts(f, { pay: vi.fn().mockRejectedValue(new Error("no funds")) }));
    expect(r.outcome).toBe("unavailable");
  });
});

describe("prompt builder", () => {
  const sw = (ts: number, wallet: string, side: "buy" | "sell", sol: number): SwapEvent => ({ sig: String(ts), ts, wallet, side, tokenAmount: 1n, solAmount: sol });

  it("uses the exact system text", () => {
    expect(SYSTEM_PROMPT.startsWith("You review recent trades of a Solana token before an automated buyer adds to the founder's locked stake.")).toBe(true);
    expect(SYSTEM_PROMPT.endsWith("Otherwise reply buy.")).toBe(true);
    expect(SYSTEM_PROMPT).toContain('{"verdict":"buy"|"skip","reason":"<at most 20 words>"}');
  });

  it("builds the exact user template, oldest first, stable wallet ids", () => {
    const now = 10_000;
    const swaps = [sw(9_940, "B", "sell", 250_000_000), sw(9_700, "A", "buy", 1_234_567_890), sw(9_880, "A", "sell", 500_000_000)];
    expect(buildUserPrompt("MINT1", swaps, now)).toBe(
      ["Token MINT1. Last 3 trades, oldest first. Columns: minutes_ago,side,sol,wallet", "5,buy,1.2346,w1", "2,sell,0.5000,w1", "1,sell,0.2500,w2"].join("\n"),
    );
  });

  it("assembles system and user messages", () => {
    const m = buildMessages("M", [], 0);
    expect(m.map((x) => x.role)).toEqual(["system", "user"]);
    expect(m[0]!.content).toBe(SYSTEM_PROMPT);
  });
});

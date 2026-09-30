import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { PublicStatusSchema, StatusResponseSchema } from "../lib/schema";
import { getAgentStatus } from "../lib/status";

const sample = JSON.parse(readFileSync(new URL("./fixtures/public-status.sample.json", import.meta.url), "utf8"));
const res = (body: unknown, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
const okBody = { live: null, dry: sample, servedAt: 10, errors: [] };

describe("PublicStatus schema (sample written by the real agent)", () => {
  it("accepts the agent's output", () => {
    const p = PublicStatusSchema.parse(sample);
    expect(p.version).toBe(1);
    expect(Array.isArray(p.runs)).toBe(true);
  });

  it("rejects wrong versions and missing fields", () => {
    expect(PublicStatusSchema.safeParse({ ...sample, version: 2 }).success).toBe(false);
    const { wallet: _w, ...rest } = sample;
    expect(PublicStatusSchema.safeParse(rest).success).toBe(false);
    expect(PublicStatusSchema.safeParse({ ...sample, funding: { ...sample.funding, feeLamports: "-1" } }).success).toBe(false);
  });

  it("validates the server envelope", () => {
    expect(StatusResponseSchema.safeParse(okBody).success).toBe(true);
    expect(StatusResponseSchema.safeParse({ live: {}, dry: null, servedAt: 1 }).success).toBe(false);
  });
});

describe("getAgentStatus", () => {
  const now = () => 123;

  it("is unconfigured without a url", async () => {
    vi.stubEnv("KESTIV_STATUS_URL", "");
    expect(await getAgentStatus({ now })).toEqual({ ok: false, error: "unconfigured", fetchedAt: 123 });
    vi.unstubAllEnvs();
  });

  it("returns live and dry when the body validates", async () => {
    const fetchFn = vi.fn(async () => res(okBody)) as unknown as typeof fetch;
    const r = await getAgentStatus({ url: "http://127.0.0.1:8787", fetchFn, now });
    expect(r).toMatchObject({ ok: true, fetchedAt: 123, live: null });
    expect(fetchFn).toHaveBeenCalledWith("http://127.0.0.1:8787/status", expect.objectContaining({ signal: expect.anything() }));
  });

  it("maps network errors, timeouts and non-200 to unreachable", async () => {
    for (const fetchFn of [
      vi.fn(async () => { throw new Error("ECONNREFUSED"); }),
      vi.fn(async () => { throw new DOMException("timeout", "TimeoutError"); }),
      vi.fn(async () => res("nope", 502)),
    ]) {
      expect(await getAgentStatus({ url: "http://x", fetchFn: fetchFn as unknown as typeof fetch, now })).toEqual({ ok: false, error: "unreachable", fetchedAt: 123 });
    }
  });

  it("maps bad json and schema mismatches to invalid", async () => {
    expect(await getAgentStatus({ url: "http://x", fetchFn: (async () => res("{bad")) as unknown as typeof fetch, now })).toMatchObject({ ok: false, error: "invalid" });
    expect(await getAgentStatus({ url: "http://x", fetchFn: (async () => res({ live: { version: 1 }, dry: null, servedAt: 1 })) as unknown as typeof fetch, now })).toMatchObject({ ok: false, error: "invalid" });
  });
});

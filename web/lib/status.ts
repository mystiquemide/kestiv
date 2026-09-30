import "server-only";
import { serverEnv } from "./env";
import { StatusResponseSchema, type PublicStatus } from "./schema";

export type AgentStatus =
  | { ok: true; live: PublicStatus | null; dry: PublicStatus | null; fetchedAt: number }
  | { ok: false; error: "unconfigured" | "unreachable" | "invalid"; fetchedAt: number };

export interface AgentStatusOptions {
  url?: string;
  fetchFn?: typeof fetch;
  now?: () => number;
}

export async function getAgentStatus(opts: AgentStatusOptions = {}): Promise<AgentStatus> {
  const fetchedAt = (opts.now ?? Date.now)();
  const base = opts.url ?? serverEnv().statusUrl;
  if (!base) return { ok: false, error: "unconfigured", fetchedAt };

  let body: unknown;
  try {
    const res = await (opts.fetchFn ?? fetch)(`${base}/status`, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(5000),
      headers: { accept: "application/json" },
    } as RequestInit);
    if (!res.ok) return { ok: false, error: "unreachable", fetchedAt };
    body = await res.json();
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    return { ok: false, error: name === "SyntaxError" ? "invalid" : "unreachable", fetchedAt };
  }

  const parsed = StatusResponseSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: "invalid", fetchedAt };
  return { ok: true, live: parsed.data.live, dry: parsed.data.dry, fetchedAt };
}

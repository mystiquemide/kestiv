import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readPublicStatus, type PublicStatus, type StatusPaths } from "./public.js";

export interface StatusBody {
  live: PublicStatus | null;
  dry: PublicStatus | null;
  servedAt: number;
  errors: { side: "live" | "dry"; reason: string }[];
}

export function statusBody(paths: StatusPaths, nowSec = Math.floor(Date.now() / 1000)): StatusBody {
  const errors: StatusBody["errors"] = [];
  const side = (which: "live" | "dry") => {
    const r = readPublicStatus(paths[which]);
    if (r.error) errors.push({ side: which, reason: r.error });
    return r.status;
  };
  const live = side("live");
  const dry = side("dry");
  return { live, dry, servedAt: nowSec, errors };
}

const HEADERS = { "content-type": "application/json", "cache-control": "public, max-age=15" };

function send(res: ServerResponse, code: number, body: unknown, extra: Record<string, string> = {}): void {
  res.writeHead(code, { ...HEADERS, ...extra });
  res.end(JSON.stringify(body));
}

export function createStatusServer(paths: StatusPaths): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "GET") return send(res, 405, { error: "method_not_allowed" }, { allow: "GET" });
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/health") return send(res, 200, { ok: true });
    if (path === "/status") return send(res, 200, statusBody(paths));
    return send(res, 404, { error: "not_found" });
  });
}

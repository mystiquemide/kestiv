import "server-only";

export type Cluster = "mainnet-beta" | "devnet";

export interface ServerEnv {
  heliusApiKey: string | undefined;
  cluster: Cluster;
  mint: string | undefined;
  wallet: string | undefined;
  founder: string | undefined;
  statusUrl: string | undefined;
  repoUrl: string | undefined;
}

const clean = (v: string | undefined): string | undefined => (v && v.trim() !== "" ? v.trim() : undefined);

const httpsUrl = (v: string | undefined): string | undefined => (v && /^https:\/\/[^\s]+$/.test(v) ? v : undefined);

export function serverEnv(env: Record<string, string | undefined> = process.env): ServerEnv {
  const cluster = clean(env.SOLANA_CLUSTER);
  if (cluster !== undefined && cluster !== "mainnet-beta" && cluster !== "devnet") {
    throw new Error("SOLANA_CLUSTER must be mainnet-beta or devnet");
  }
  return {
    heliusApiKey: clean(env.HELIUS_API_KEY),
    cluster: cluster ?? "mainnet-beta",
    mint: clean(env.KESTIV_MINT),
    wallet: clean(env.KESTIV_WALLET),
    founder: clean(env.FOUNDER_WALLET),
    statusUrl: clean(env.KESTIV_STATUS_URL)?.replace(/\/+$/, ""),
    repoUrl: httpsUrl(clean(env.KESTIV_REPO_URL)),
  };
}

export type RpcKind = "helius" | "public";

export function rpcFor(cluster: Cluster, heliusApiKey: string | undefined): { url: string; kind: RpcKind } {
  if (heliusApiKey) {
    const host = cluster === "devnet" ? "devnet" : "mainnet";
    return { url: `https://${host}.helius-rpc.com/?api-key=${heliusApiKey}`, kind: "helius" };
  }
  return { url: cluster === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com", kind: "public" };
}

export const redact = (message: string): string =>
  message.replace(/api-key=[^&\s"']+/gi, "api-key=<redacted>").slice(0, 300);

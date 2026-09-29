import { Connection } from "@solana/web3.js";
import { resolveRpc, type Cluster, type Config, type RpcKind } from "../config.js";

export interface Chain {
  connection: Connection;
  cluster: Cluster;
  rpcKind: RpcKind;
  rpcUrl: string;
}

export function createChain(
  cfg: Pick<Config, "SOLANA_CLUSTER" | "SOLANA_RPC_URL" | "HELIUS_API_KEY">,
): Chain {
  const rpc = resolveRpc(cfg);
  return {
    connection: new Connection(rpc.url, "confirmed"),
    cluster: cfg.SOLANA_CLUSTER,
    rpcKind: rpc.kind,
    rpcUrl: rpc.url,
  };
}

export const createConnection = (
  cfg: Pick<Config, "SOLANA_CLUSTER" | "SOLANA_RPC_URL" | "HELIUS_API_KEY">,
): Connection => createChain(cfg).connection;

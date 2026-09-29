import { PublicKey, type Connection } from "@solana/web3.js";
import { ICluster, PROGRAM_ID } from "@streamflow/stream";
import type { Cluster } from "../config.js";
import { ALLOWED_PROGRAMS, type Allowlist } from "../chain/allowlist.js";

export interface LockContext {
  connection: Connection;
  cluster: Cluster;
  allowlist?: Allowlist;
}

export const streamflowCluster = (cluster: Cluster): ICluster =>
  cluster === "devnet" ? ICluster.Devnet : ICluster.Mainnet;

export const streamflowProgramId = (cluster: Cluster): PublicKey =>
  new PublicKey(PROGRAM_ID[streamflowCluster(cluster)]);

export const sdkEnv = (ctx: LockContext) => ({
  connection: ctx.connection,
  cluster: streamflowCluster(ctx.cluster),
  programId: streamflowProgramId(ctx.cluster),
  commitment: "confirmed" as const,
});

export const allowlistOf = (ctx: LockContext): Allowlist => ctx.allowlist ?? ALLOWED_PROGRAMS;

import { PublicKey, type Connection } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import type { RpcKind } from "../config.js";

export interface MintInfo {
  decimals: number;
  supply: bigint;
  tokenProgram: PublicKey;
}

export async function getSolBalance(connection: Connection, pubkey: PublicKey): Promise<number> {
  return connection.getBalance(pubkey, "confirmed");
}

export async function getTokenProgramForMint(connection: Connection, mint: PublicKey): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint, "confirmed");
  if (!info) throw new Error(`mint account ${mint.toBase58()} not found`);
  if (info.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  throw new Error(`account ${mint.toBase58()} is not owned by a token program`);
}

export async function getMintInfo(connection: Connection, mint: PublicKey): Promise<MintInfo> {
  const tokenProgram = await getTokenProgramForMint(connection, mint);
  const m = await getMint(connection, mint, "confirmed", tokenProgram);
  return { decimals: m.decimals, supply: m.supply, tokenProgram };
}

export async function getTokenBalance(connection: Connection, owner: PublicKey, mint: PublicKey): Promise<bigint> {
  const tokenProgram = await getTokenProgramForMint(connection, mint);
  const ata = getAssociatedTokenAddressSync(mint, owner, true, tokenProgram);
  try {
    return (await getAccount(connection, ata, "confirmed", tokenProgram)).amount;
  } catch (e) {
    if (e instanceof Error && (e.name === "TokenAccountNotFoundError" || e.name === "TokenInvalidAccountOwnerError")) return 0n;
    throw e;
  }
}

interface DasAccount {
  owner?: string;
  amount?: number | string;
}

interface DasResponse {
  result?: { token_accounts?: DasAccount[] };
  error?: unknown;
}

/**
 * Distinct wallet owners with a non-zero balance, via Helius DAS getTokenAccounts (paginated).
 * Off-curve owners (PDAs: the pump.fun bonding curve, AMM pools, program vaults) are not holders.
 * Returns null unless a Helius RPC is configured or the lookup fails.
 */
export async function countHolders(
  mint: PublicKey,
  rpc: { url: string; kind: RpcKind },
  fetchFn: typeof fetch = fetch,
): Promise<number | null> {
  if (rpc.kind !== "helius") return null;
  const owners = new Set<string>();
  for (let page = 1; page <= 1000; page++) {
    let json: DasResponse;
    try {
      const res = await fetchFn(rpc.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "kestiv",
          method: "getTokenAccounts",
          params: { mint: mint.toBase58(), page, limit: 1000 },
        }),
      });
      if (!res.ok) return null;
      json = (await res.json()) as DasResponse;
    } catch {
      return null;
    }
    const accounts = json.result?.token_accounts;
    if (json.error || !accounts) return null;
    if (accounts.length === 0) return owners.size;
    for (const a of accounts) {
      if (!a.owner || BigInt(a.amount ?? 0) <= 0n) continue;
      let onCurve = false;
      try {
        onCurve = PublicKey.isOnCurve(new PublicKey(a.owner).toBytes());
      } catch {
        continue;
      }
      if (onCurve) owners.add(a.owner);
    }
  }
  return null;
}

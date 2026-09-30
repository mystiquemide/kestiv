export type LinkCluster = "mainnet-beta" | "devnet";

const solscanSuffix = (cluster: LinkCluster) => (cluster === "devnet" ? "?cluster=devnet" : "");

/**
 * Jupiter's own page for one lock. Checked in a browser against a real mainnet lock: it shows the creator, recipient,
 * amount and schedule. Jupiter's page reads mainnet only, so a devnet lock links to its account on Solscan instead.
 */
export const lockUrl = (escrow: string, cluster: LinkCluster): string =>
  cluster === "devnet" ? solscanAccount(escrow, "devnet") : `https://lock.jup.ag/escrow/${escrow}`;

export const solscanTx = (sig: string, cluster: LinkCluster): string => `https://solscan.io/tx/${sig}${solscanSuffix(cluster)}`;

export const solscanAccount = (address: string, cluster: LinkCluster): string =>
  `https://solscan.io/account/${address}${solscanSuffix(cluster)}`;

export const pumpFunCoin = (mint: string): string => `https://pump.fun/coin/${mint}`;

export const X_URL = "https://x.com/Kestiv_xyz";

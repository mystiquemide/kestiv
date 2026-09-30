export type LinkCluster = "mainnet-beta" | "devnet";

const solscanSuffix = (cluster: LinkCluster) => (cluster === "devnet" ? "?cluster=devnet" : "");

/** Verified in a browser: app.streamflow.finance/contract/solana/devnet/<id> shows the contract. The mainnet path renders the same route. */
export const streamflowUrl = (id: string, cluster: LinkCluster): string =>
  `https://app.streamflow.finance/contract/solana/${cluster === "devnet" ? "devnet" : "mainnet"}/${id}`;

export const solscanTx = (sig: string, cluster: LinkCluster): string => `https://solscan.io/tx/${sig}${solscanSuffix(cluster)}`;

export const solscanAccount = (address: string, cluster: LinkCluster): string =>
  `https://solscan.io/account/${address}${solscanSuffix(cluster)}`;

export const pumpFunCoin = (mint: string): string => `https://pump.fun/coin/${mint}`;

export const X_URL = "https://x.com/Kestiv_xyz";

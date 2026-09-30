export interface FaqItem {
  q: string;
  a: string;
}

/** Numbers here match agent/src/lock/terms.ts and agent/src/policy.ts defaults. Costs are on-chain rent and UsePod docs. */
export const FAQ: FaqItem[] = [
  {
    q: "What is Kestiv?",
    a: "An agent that turns a token's creator fees into a founder stake. It buys the token with part of the fees and locks every token it buys in its own Jupiter lock for the founder.",
  },
  {
    q: "Can the founder sell the locked tokens?",
    a: "Not early. Nothing unlocks for the first 90 days. After that the stake unlocks a little every day for a year. Each lock has cancel and change-recipient set to nobody.",
  },
  {
    q: "Can Kestiv sell?",
    a: "No. The agent's code only swaps SOL into the token and locks what it buys. Kestiv's signing key also refuses every Jupiter Lock instruction except creating a lock.",
  },
  {
    q: "Where does the money come from?",
    a: "From the token's creator fees, which are paid to Kestiv's wallet. By default half funds the stake and the other half is forwarded to the founder. The founder sets that share and the cap on the stake.",
  },
  {
    q: "What stops it buying at a bad price?",
    a: "The agent checks holders, trading volume, price impact and the pool before every buy, and asks UsePod for a second opinion. If any check fails it waits and buys nothing. Each run and its checks are public.",
  },
  {
    q: "What happens if the agent stops?",
    a: "It stops buying, and fees wait in Kestiv's wallet until it runs again. The founder's share is forwarded by the agent, so it waits too. The stake already locked keeps unlocking on schedule and can't be cancelled.",
  },
  {
    q: "What does it cost?",
    a: "Jupiter Lock charges no fee. Each lock costs about 0.004 to 0.005 SOL in rent and network fees, and every buy gets its own lock. Each UsePod check costs a fraction of a cent. The UsePod figure comes from its docs.",
  },
  {
    q: "Is this financial advice?",
    a: "No. Kestiv shows what a founder holds and what the agent did. It doesn't tell anyone to buy or sell anything.",
  },
];

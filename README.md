# Kestiv

[![CI](https://github.com/mystiquemide/kestiv/actions/workflows/ci.yml/badge.svg)](https://github.com/mystiquemide/kestiv/actions/workflows/ci.yml)

Turn a token's creator fees into a founder stake that nobody can cancel.

Live: https://kestiv.midelabs.xyz · X: [@Kestiv_xyz](https://x.com/Kestiv_xyz)

Built for AnsemHack Clawrena, in the ClawPump x pump.fun and UsePod Inference Markets tracks.

## The story

ClawPump looked at 7,215 of its own launches. The median founder ended up with 0.004 SOL of their own token, about 0.01% of supply. Two thirds took nothing at all. Their own conclusion: [nothing in the product has ever let builders buy into their own token later](https://clawpump.tech/experiments/founder-allocation).

I launch tokens too, and I have the same problem. Creator fees trickle in and get spent. Buying a stake by hand invites front-running, and any dev buy looks like a rug until it is locked.

Kestiv is the fix I wanted: an agent that spends part of the fees buying the founder's own token and locks every token it buys in its own Jupiter lock, on chain, where anyone can check it.
There is no mainnet receipt yet because $KESTIV has not launched. What exists today is two devnet locks, the agent's practice runs, and the site reading all of it live. Links are below.

## What it is

I did not build a launchpad, a staking dashboard, or a lockup you have to trust. I built an agent that can only buy and lock. It has no sell code, and its signer refuses every Jupiter Lock instruction except "create".

## How it works

1. Creator fees land in the Kestiv wallet. It is set as the token's payout wallet at launch.
2. The agent forwards the founder's share (50% by default). The rest is the buy budget.
3. Before each buy it checks holders, 24h volume, price impact, pool liquidity and price against the 6 hour average. Then UsePod gives a paid second opinion: buy or skip. Any "no" means it waits.
4. If everything passes, it swaps SOL for the token on Jupiter (small slices, at most 1% of pool liquidity) and locks the tokens in a new Jupiter lock for the founder.
5. Each lock is created with cancel and change-recipient set to nobody. Nothing unlocks for 90 days, then a little each day for a year.

| Action | Result |
|---|---|
| Fees arrive | Split by the agent: founder share forwarded, rest budgeted |
| Buy | Only after every check passes |
| Lock | Same run, one new lock per buy. Bought tokens are locked before any new buy |
| Cancel or change the recipient | Set to nobody at creation and fixed for good. The signer also refuses those instructions |
| Stake reaches the cap (7% of supply, 15% is rejected) | Buying stops, fees go to the founder |

## How it fits the hackathon

| What the judges look at | Where Kestiv stands |
|---|---|
| Onchain volume | Every slice is a real Jupiter swap of the token, signed by the agent. None yet: the token launches on 1 Oct |
| Builders onboarded | Any ClawPump builder can run it on their own token. There is a [six-step guide](https://kestiv.midelabs.xyz/run) and a Hermes skill in [`skill/kestiv`](skill/kestiv/SKILL.md). The pull request to Clawpump/agents-skills is [open](https://github.com/Clawpump/agents-skills/pull/16) |
| Attention | Every decision, skip and lock is public on the [decisions page](https://kestiv.midelabs.xyz/decisions) and on X |
| Deploy early | Site, agent and devnet proof are live since 30 Sep 2026 |

| Sponsor | What it does in Kestiv |
|---|---|
| ClawPump | Launches the token with Kestiv's wallet as payout wallet, so fees land in the agent. Its `/price` data feeds the checks |
| pump.fun | The token, its curve or pool, and its creator fees |
| UsePod | Paid per call over x402 from Kestiv's wallet. It reads recent trades and can only say buy or skip. It cannot raise the amount |
| Jupiter Lock | The only place tokens are held. One lock per slice, no protocol fee, audited |
| Helius | Holder counts and parsed swap history |
| Jupiter | Quotes and swaps, and the lock program |

## Try it

- Open the site: [stake](https://kestiv.midelabs.xyz/stake), [decisions](https://kestiv.midelabs.xyz/decisions), [run it](https://kestiv.midelabs.xyz/run). Every number is read from the chain or from the agent's public report, and pages say when one is unavailable.
- Before launch the stake page shows the devnet proof, labelled Devnet.
- Run the agent's checks against any live token without signing anything: `npm run kestiv -- run-once --dry-run --mint <MINT>` (set up in the [run guide](https://kestiv.midelabs.xyz/run)).

## Ways I tried to break it

| Attempt | Outcome | Proof |
|---|---|---|
| Cancel a lock | Rejected on chain (error 6005) | [devnet tx](https://solscan.io/tx/4dBNaHwraKzc1pw2tgX2TLqoaC326qJ7SQG6eMMSq9dfGuufhKf8PKpJzb5z1nzAZVPCNCuppY4D9MmDbNidgmtC?cluster=devnet) |
| Sign any Jupiter Lock instruction except create | Refused before signing | [test](agent/test/jupiter-lock.test.ts) |
| Build a lock that differs from the reference client | Byte-for-byte match, for classic and Token-2022 mints | [test](agent/test/jupiter-lock.test.ts) |
| Sign a transaction to an unlisted program | Refused before signing | [test](agent/test/guard.test.ts) |
| Kill the process mid-send, run again | One buy, then waits for confirmation | [test](agent/test/run.test.ts) |
| Bought but the lock fails | Locked on the next run, before any new buy | [test](agent/test/run.test.ts) |
| Every limit fails one at a time | Each gives its own skip reason and value | [test](agent/test/decide.test.ts) |
| UsePod says skip, is down, or quotes too high | No buy | [test](agent/test/run.test.ts), [test](agent/test/usepod.test.ts) |
| A lock does not have the terms Kestiv set | Kestiv stops buying | [test](agent/test/run.test.ts) |
| Cap reached | Buying stops, unspent budget goes to the founder | [test](agent/test/run.test.ts) |
| Site shows a stake number | Equals the direct chain read | [test](web/test/live.test.ts) |
| A sell path in the agent | None exists. Swaps are SOL to token only | `agent/src/swap/jupiter.ts` |

## Addresses and proof

| Item | Value |
|---|---|
| Lock 1 (devnet proof) | [`5hdB38...vb3s`](https://solscan.io/account/5hdB38wWZw6THDLvJyYGCHu2oPEutYz7MfmVkifZvb3s?cluster=devnet) |
| Lock 2 (devnet proof) | [`FVqiRj...LwrW`](https://solscan.io/account/FVqiRjqZppGRtXdRgXxEwX5wGwt5f6wkHjjZeJyRLwrW?cluster=devnet) |
| Lock program | [`LocpQg...qjn`](https://solscan.io/account/LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn) |
| Kestiv wallet | [`HXqExL...Kzs4`](https://solscan.io/account/HXqExLdZuPYAqaP6vS87yr6ZEm6Q1KtudFx1nzYwKzs4) |
| Founder wallet | [`DC1B96...JryB`](https://solscan.io/account/DC1B96Rw9yftgZN7HYktA47nneFSDbu5mpedkYPxJryB) |
| $KESTIV mint | Pending launch |

## Real usage

None on mainnet yet. The agent has run practice runs against a live pump.fun token, and each one is on the [decisions page](https://kestiv.midelabs.xyz/decisions). No tokens have been bought or locked for $KESTIV.

## How this differs

| Alternative | What it does | Difference |
|---|---|---|
| Locking tokens by hand | One lock, once, by the founder | Kestiv builds the stake from earned fees over time, one lock per buy, and nobody can cancel any of them |
| A dev buy at launch | One large buy, often sold later | Small buys from earned fees, locked in the same run |
| Trading agents | Buy and sell for profit | Kestiv never sells and has no strategy to tune |
| Founder allocation at launch | Needs capital up front, reads as rug risk above 15% | No capital up front, capped at 7% by default |

## Honest limitations

- Unaudited hackathon code. Do not put in more than you can lose.
- The Kestiv key is a hot key. It holds fees between arrival and the next buy. It cannot move locked tokens.
- If the agent stops, fees wait in the Kestiv wallet, including the founder's share, until it runs again. Locked tokens keep unlocking on schedule.
- The volume check can only use swaps it can fetch, so on quiet tokens it reports a lower bound.
- Every buy opens its own lock, which costs about 0.004 to 0.005 SOL in rent and network fees. Jupiter Lock charges no protocol fee, but small slices still carry that fixed cost.
- UsePod is a third party. If it is down, Kestiv skips the buy.
- Jupiter's price impact on pump.fun includes the curve fee of about 1.25%, so small pools hit the 2.5% limit quickly.
- ClawPump fixes the payout wallet at launch, so the Kestiv wallet must exist before the token does.

## What's real

Real: the devnet locks and their transactions, the chain reads, the agent's checks, the practice runs against a live token, the site, and the tests. Pending: the mainnet token, live buys and locks, paid UsePod verdicts, and the agents-skills pull request being merged. There are no mocked numbers on the site.

Tests: 178 in `agent/`, 242 in `web/`. Run `npm test` from the root.

## Run locally

```bash
git clone https://github.com/mystiquemide/kestiv.git && cd kestiv
npm install
npm run build -w agent
cp .env.example .env   # fill in your own values, never commit them
npm run kestiv -- status
```

The website: `npm run dev -w web`.
Architecture notes are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

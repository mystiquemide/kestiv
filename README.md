# Kestiv

Turn a token's creator fees into a founder stake that nobody can cancel.

Live site: https://kestiv.midelabs.xyz

## The story

Founders on pump.fun earn creator fees but hold nothing traders can check. "The dev won't dump" is a promise, not a fact.
Kestiv makes it a fact. It spends part of the fees buying the founder's own token and locks every token it buys in one vesting contract on Solana.
There is no dramatic receipt yet: $KESTIV has not launched, and the proof today is a devnet contract and the agent's practice runs, all linked below.

## What it is

I did not build a launchpad, a staking dashboard, or a lockup you have to trust. I built an agent that can only buy and lock. It has no sell code, and its signer refuses every vesting instruction except "create" and "top up".

## How it works

1. Creator fees land in the Kestiv wallet.
2. Half is forwarded to the founder. The rest is the buy budget.
3. Before each buy the agent checks holders, volume, price impact, liquidity and recent trades, then asks UsePod for a second opinion. Any "no" means it waits.
4. If every check passes, it swaps SOL for the token on Jupiter and tops up one Streamflow contract for the founder.
5. The contract is created with cancel, transfer, pause and rate changes off. Nothing unlocks for 90 days, then a little each day for a year.

| Action | Result |
|---|---|
| Fees arrive | Split by the agent: founder share forwarded, rest budgeted |
| Buy | Only after every check passes, capped at 1% of liquidity |
| Lock | Same run, same contract, tokens never sit unlocked |
| Cancel, transfer, pause | Off at creation, refused by the signer |
| Stake reaches the cap (7% of supply) | Buying stops, fees go to the founder |

## Try it

- Open the site: [stake](https://kestiv.midelabs.xyz/stake), [decisions](https://kestiv.midelabs.xyz/decisions), [run it](https://kestiv.midelabs.xyz/run). Every number is read from the chain or the agent's public report.
- Run the agent's checks against any live token without signing anything: see the six steps on the [run page](https://kestiv.midelabs.xyz/run).

## Ways I tried to break it

| Attempt | Outcome | Proof |
|---|---|---|
| Founder or Kestiv cancels the lock | Rejected on chain | [devnet tx](https://solscan.io/tx/2crG6A3DAjrtAou2Uyfpw7cP5WZHVUFzRjbnqidL8bRHJxbti7EXmPLUG32aYiAembQVF5GqScqzs8enJF9eDef5?cluster=devnet) |
| Turn cancel or sender-transfer on after creation | Failed on chain (`InvalidArgument`) | probe stream `E6hHAUuXsMxz2bK14hmFzXAvXBtKWachnTtEScq68kSP` on devnet |
| Turn recipient-transfer on after creation | Possible in Streamflow, so the signer refuses the instruction | [test](agent/test/streamflow-guard.test.ts) |
| Sign a transaction to an unlisted program | Refused before signing | [test](agent/test/guard.test.ts) |
| Send anything but "create" or "top up" to Streamflow | Refused before signing | [test](agent/test/streamflow-guard.test.ts) |
| Buy when volume, holders or price impact fail | Skipped with a recorded reason | [test](agent/test/decide.test.ts) |
| Sell path in the agent | None exists: swaps are SOL to token only | `agent/src/swap/jupiter.ts` |

## Addresses and proof

| Item | Value |
|---|---|
| Vesting contract (devnet proof) | [`G28zWX3s...QiV`](https://app.streamflow.finance/contract/solana/devnet/G28zWX3sniaou4EBCuBBTc1tY4kewyfRU2eT7V65fQiV) |
| Create tx (devnet) | [`4YYCod...i5nY5`](https://solscan.io/tx/4YYCodAuKZ66YKBYFpRMXya9JUWW2E8w9TCCc2GW14NjsiWy6xVjceHEjaszmnnA4BK39nVqB4izEkgtTUoi5nY5?cluster=devnet) |
| Top-up tx (devnet) | [`2D6TKc...LsLXD`](https://solscan.io/tx/2D6TKcEkNGLb6uPwPE87Hy4PYekwjq5MyizzX1GMXSLfHsBKDtHuCBvwG5DF5u472LpAJqYQSaW8Mvcm4zwLsLXD?cluster=devnet) |
| Kestiv wallet | [`HXqExL...Kzs4`](https://solscan.io/account/HXqExLdZuPYAqaP6vS87yr6ZEm6Q1KtudFx1nzYwKzs4) |
| Founder wallet | [`DC1B96...JryB`](https://solscan.io/account/DC1B96Rw9yftgZN7HYktA47nneFSDbu5mpedkYPxJryB) |
| $KESTIV mint | Pending launch |

## Real usage

None on mainnet yet. The agent has run practice runs against a live pump.fun token, and every one is listed on the [decisions page](https://kestiv.midelabs.xyz/decisions). No tokens have been bought or locked for $KESTIV.

## How this differs

| Alternative | What it does | Difference |
|---|---|---|
| Locking tokens by hand on Streamflow | One lock, one time, by the founder | Kestiv builds the stake from fees over time, and the founder cannot touch the contract |
| Creator dev buy at launch | One large buy, often sold later | Small buys from earned fees, locked the same run |
| Trading agents | Buy and sell for profit | Kestiv never sells and has no strategy to tune |

## Honest limitations

- Unaudited hackathon code. Do not put more into it than you can lose.
- The Kestiv key is a hot key. It holds fees between arrival and the next buy. It cannot move locked tokens.
- If the agent stops, fees wait in the Kestiv wallet, including the founder's share, until it runs again. Locked tokens keep unlocking on schedule.
- The volume check can only use swaps it can fetch, so on quiet tokens it reports a lower bound.
- UsePod is a third-party second opinion. If it is down, Kestiv skips the buy.
- ClawPump fixes the payout wallet at launch, so the Kestiv wallet must exist before the token does.
- Before launch the site shows the devnet proof, labelled Devnet.

## What's real

The devnet contract, its transactions, the on-chain reads, the agent's checks and the practice runs are real. The mainnet token, live buys and the live stake are pending. There are no mocked numbers on the site: each one comes from the chain or the agent's report, or says it is unavailable.

Tests: 180 in `agent/`, 230 in `web/`. Run `npm test` from the root.

## Run locally

```bash
git clone https://github.com/mystiquemide/kestiv.git && cd kestiv
npm install
npm run build -w agent
cp .env.example .env   # fill in your own values, never commit them
npm run kestiv -- status
```

The website: `npm run dev -w web`.
The skill for Hermes agents is in [`skill/kestiv`](skill/kestiv/SKILL.md). Design notes are in [`docs/`](docs).

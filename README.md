# NoVC — Back startups, together.

> The fundraising layer for the Monad ecosystem. Founders raise from their own community at the same clearing price for everyone. No gatekeepers. No warm intros. No board seats.

---

## The problem

- **VCs reject 99.98% of founders.** Only 0.02% receive funding, leaving thousands of viable teams without capital.
- **Angel investing is a private club.** The best early-stage deals go to people with warm introductions. Retail investors are locked out of primary allocations entirely and forced to buy at inflated prices on secondary markets.
- **Accelerators take 3–6 months and 5–15% equity** before founders can access a first check.
- **No existing protocol combines** continuous price discovery (Uniswap v4 CCA), universal USDC inflows and community-governed capital allocatio (Angel Pools).

## The solution

NoVC lets a founder raise from their own community in one afternoon. Backers bid blind, the market discovers a single clearing price, and every participant — a $20 public bidder, an angel in a pooled Angel Pool, a whale — pays the same price. No insider discount. It only works because the auction runs onchain.

Three flows, three audiences:

**1. Founders** — Launch a Continuous Clearing Auction on Monad, backed by Uniswap v4. Accept USDC Get verified through a multi-factor pre-screen. Auto-bootstrap Uniswap v4 liquidity after the auction so tokens trade immediately.

**2. Public backers** — Bid on any open round with USDC. Back a company you actually use, at the same price as everyone else. Get real tokens when the round closes.

**3. Angel Pools** — Pool capital with other angels, vote on which rounds to back with weighted governance, and share the upside proportionally. Thirty percent of the pool earns yield from Uniswap v4 swap fees while it waits to deploy. Sixty percent yes-votes triggers an automatic bid.


---

## Features

- **Continuous Clearing Auctions** — Fair price discovery via Uniswap v4
- **Angel Pools** — Collective investment with weighted on-chain voting
- **Auto-LP Bootstrapping** — Instant Uniswap v4 liquidity post-auction
- **Verified Badges** — Pre-screening via multi-factor KYC/KYB to reduce scams
- **Pyth Oracle Integration** — Real-time MON/USD and USDC/USD price feeds for swap validation
- **Post-Auction Settlement** — Dedicated page for claims, exits and sweeps

---

## Architecture


<img src="novc.png" alt="User Flow Diagram" width="800" style="max-width: 100%; height: auto;">

### Data Flow

```
Founder creates auction
        │
        ▼
CCA Factory deploys auction contract
        │
        ▼
Bidders deposit USDC ◄──── Circle CCTP 
        │
        ▼
Continuous price discovery (clearing price updates each block)
        │
        ▼
Auction ends → Settlement
        │
        ├── Bidders: claimTokens() or exitBid()
        ├── Founders: sweepCurrency() or sweepUnsoldTokens() 
        └── Auto-LP: Bootstrap Uniswap v4 pool
```

---

## User Flows

### 1. Founders (Companies Raising Capital)

```
Connect Wallet → Pre-Screening Verification → Configure Auction → Deploy
```

1. Connect wallet via RainbowKit (MetaMask, WalletConnect, etc.)
2. Complete pre-screening form (KYC/KYB, 10K+ X followers, GitHub, accelerator backing)
3. Configure auction parameters:
   - Token address and supply amount
   - Floor price and tick spacing
   - Start block, end block, claim block
   - Funds recipient address
4. Approve token transfer to factory
5. Factory deploys a new CCA contract
6. Monitor live auction (clearing price, bids, blocks remaining)
7. Post-auction: sweep raised USDC and/or unsold tokens via `/settle` 

### 2. Public Backers (Individual Investors)

```
Connect Wallet → Bridge USDC (optional) → Place Bid → Settle
```

1. Connect wallet on Monad Testnet
2. Select an active auction
3. Place bid with max price and amount
4. Monitor bid status and clearing price in real-time
5. Post-auction: claim tokens or exit bid for USDC refund via `/settle`

### 3. Angel Pool Investors (Pooled Capital)

```
Connect Wallet → Deposit USDC → Vote on Proposals → Earn Returns
```

1. Connect wallet and navigate to Angel Pool tab
2. Deposit USDC into the pool (auto-allocates 30% APY / 70% Auction slices)
3. View pool stats: total value, your share percentage, slice breakdown
4. **Propose** auction investments (specify auction address + amount from auction slice)
5. **Vote** on proposals (60% threshold required to pass)
6. Pool executes approved investments collectively
7. Withdraw USDC or MON at any time (cascades through idle → auction → apy → active slices)

---

## Deployed Contracts (Monad Testnet)

- **NoVC Angel Hook** | `0xD242803aE1840bB5FaC91EcbBC03B26BcB2eFFF0` https://testnet.monadscan.com/address/0xD242803aE1840bB5FaC91EcbBC03B26BcB2eFFF0| Angel Pool with deposit/withdraw/vote + Uniswap v4 hook (beforeSwap/afterSwap)
- **pool id** | `0x9b0bd1da49fd50cb2dc1c4f3cb6231e3f1f35b20683ed1d73c7d76ce86893194` 
- **Mock Token (RocketClaw)/Test ERC20 for auctions** | `0x8699FC6ec5E9976fc5D6D3A8f23AAf8bA9ec0b65` 
- **Continious Clearing Auction Factory** | `0x7899770762d96c1F63cED8383C8B8C2dA16cD1b6` 
- **PoolSwapTest** | `0xc4006B415D3625047E039e16C13766483CEE42cD` 

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Blockchain** | Monad testnet, Uniswap v4, Circle CCTP |
| **Smart Contracts** | Solidity ^0.8.26, Foundry, OpenZeppelin (ReentrancyGuard, ERC20) |
| **Frontend** | Next.js 15, React 18, TypeScript, Tailwind CSS |
| **Web3** | Wagmi 2.x, Viem 2.x, RainbowKit |
| **Oracle** | Pyth Network (Hermes API for real-time price feeds), Pyth Pro subscription |
| **State** | Zustand (client-side auction/pool state) |
| **Infra** | Alchemy (Monad testnet RPC) |

---

## Revenue Streams

NoVC takes a fee on the round itself, not on the tokens.


| Stream               | Fee                                         | 
|----------------------|---------------------------------------------|
| Auction creation     | 0.1% of target raise (min $100, max $1,000) |
| Successful raise     | 1% of funds raised                          |
| Bid submission       | 0.5% of bid amount (capped at $50)          |
| v4 pool fee capture  | 20% of the pool's swap fees                 |
---


## Quick Start

### Prerequisites

- Node.js 18+ and npm
- MetaMask or Web3 wallet
- Monad testnet MON (for gas)
- USDC on any supported testnet chain

### Installation

```bash
git clone https://github.com/tatdz/novc_m
cd frontend
npm install
cp .env.local.template .env.local
npm run dev
```

The app runs on `http://localhost:5000`.

### Environment Variables

See `.env.example` for required variables. Key ones:

- 'ALCHEMY_API_KEY'
- `PRIVATE_KEY` — Deployer wallet private key (for contract deployment only)
- PYTH_PRO_API_KEY -your_circle_app_id


---

## Key Technical Details

### Gas Estimation
All contract interactions use dynamic gas estimation via `getGasParams()` — fetches real-time baseFee from chain, applies 150% buffer + priority fee. Explicit gas limits per tx type (100K approvals, 3M factory, 500K bids, 800K withdrawals).

### Angel Pool Slice Allocation
On deposit, funds auto-allocate: 30% APY slice / 70% Auction slice. Withdrawals cascade through idle → auction → apy → activeLiquidity slices (V2 fix prevents underflow).

### beforeSwap Hook (Pyth Oracle)
The NoVC Angel Hook validates swap prices against Pyth oracle feeds (ETH/USD, USDC/USD) in the `beforeSwap` callback, rejecting swaps that deviate beyond acceptable bounds.

---

## License

MIT

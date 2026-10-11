# NoVC — Skip the VCs. Raise Onchain.

> Public angels funding the next wave of startups through fair, transparent, onchain auctions.

---

## Problem Statement

- **VCs reject 99.98% of founders** — only 0.02% receive funding, leaving thousands of viable startups without capital
- **Retail investors are completely excluded** from primary allocations, forced to buy at inflated prices on secondary markets
- **No existing protocol combines** universal USDC inflows (CCTP across 10+ chains) with continuous price discovery (Uniswap CCA)
- **Accelerators and incubators take 3–6 months** and equity before founders can even access capital

## Solution

NoVC enables founders to:

1. **Launch a Continuous Clearing Auction** on Monad Testnet using Uniswap v4 CCA
2. **Accept USDC bids from any chain b** via Circle CCTP (10+ chains supported) 
4. **Auto-bootstrap Uniswap v4 liquidity** post-auction for immediate trading
5. **Get verified** through multi-factor approach to protect investors from scams

---

## Features

- **Continuous Clearing Auctions** — Fair price discovery via Uniswap v4
- **Universal USDC** — Bid from any chain via Circle CCTP 
- **Angel Pools** — Collective investment with democratic voting
- **Auto-LP Bootstrapping** — Instant Uniswap v4 liquidity post-auction
- **Verified Badges** — Pre-screening via NoVC KYC/KYB to prevent scams
- **Pyth Oracle Integration** — Real-time ETH/USD and USDC/USD price feeds for swap validation
- **Post-Auction Settlement** — Dedicated settlement page for claims, exits, and sweeps


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
Bidders deposit USDC ◄──── Circle CCTP (from any chain)
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

### 2. Public Bidders (Individual Investors)

```
Connect Wallet → Bridge USDC (optional) → Place Bid → Settle
```

1. Connect wallet on Monad Testnet
2. (Optional) Bridge USDC from any supported chain via Circle CCTP
3. Select an active auction
4. Place bid with max price and amount
5. Monitor bid status and clearing price in real-time
6. Post-auction: claim tokens or exit bid for USDC refund via `/settle`

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
7. Withdraw USDC or ETH at any time (cascades through idle → auction → apy → active slices)

---

## Deployed Contracts (Monad Testnet)

| **NoVC Angel Hook** | `0x3F3571A37e3398FdE31DcdC1138458E2D7C9BfF0` | Angel Pool with deposit/withdraw/vote + Uniswap v4 hook (beforeSwap/afterSwap) **pool id** | `0x002b8ad258154f5e44e8f2960e2aa0671f88b857037c8e089d8c463e7b1150f5` |
| **Mock Token (RocketClaw)** | `0x2355d9cfe6b97Ca5258EFE392a295682AB8dF5c6` | Test ERC20 token for auctions |


### Supported CCTP Chains

Monad testnet, Ethereum Sepolia, Arbitrum Sepolia, Base Sepolia, Optimism Sepolia, Polygon Amoy 
---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Blockchain** | Monad testnet, Uniswap v4, Circle CCTP |
| **Smart Contracts** | Solidity ^0.8.26, Foundry, OpenZeppelin (ReentrancyGuard, ERC20) |
| **Frontend** | Next.js 15, React 18, TypeScript, Tailwind CSS |
| **Web3** | Wagmi 2.x, Viem 2.x, RainbowKit |
| **Oracle** | Pyth Network (Hermes API for real-time price feeds) |
| **State** | Zustand (client-side auction/pool state) |
| **Infra** | Alchemy (Monad testnet RPC) |

---

## Revenue Streams

| Stream | Calculation | Projected ARR |
|--------|-------------|---------------|
| Auction Fees | 1% x $100B annual volume | $1.0B |
| v4 Pool Fees | 20% capture of pool fees | $200M |
| Data API | Milestone probability oracles | $100M |

### Fee Structure

| Action | Fee | Bounds |
|--------|-----|--------|
| Auction creation | 0.1% of target raise | Min $100, Max $1,000 |
| Successful raise | 1% of funds raised | — |
| Bid submission | 0.5% of bid amount | Capped at $50 |

---


## Quick Start

### Prerequisites

- Node.js 18+ and npm
- MetaMask or Web3 wallet
- Monad testnet MON (for gas)
- USDC on any supported testnet chain

### Installation

```bash
git clone https://github.com/tatdz/novc_a
cd frontend
npm install
cp .env.local.template .env.local
npm run dev
```

The app runs on `http://localhost:3000`.

### Environment Variables

See `.env.example` for required variables. Key ones:

- 'ALCHEMY_API_KEY'
- `PRIVATE_KEY` — Deployer wallet private key (for contract deployment only)
- CIRCLE_API_KEY=your_circle_api_key
- CIRCLE_ENTITY_SECRET=your_circle_entity_secret
- NEXT_PUBLIC_CIRCLE_APP_ID=your_circle_app_id


---

## Key Technical Details

### Gas Estimation
All contract interactions use dynamic gas estimation via `getGasParams()` — fetches real-time baseFee from chain, applies 150% buffer + priority fee. Explicit gas limits per tx type (100K approvals, 3M factory, 500K bids, 800K withdrawals).

### Monad Block Times 
Monad blocks are ~5 second (not 12s like Ethereum mainnet). Transaction confirmations streamed every 200-250 milliseconds via partial block updates

### Bridging with CCTP 
CCTP depositForBurn (Monad → Arc, domain 10 → 26)
  → Circle Iris API attestation (~20s Fast Transfer)
  → receiveMessage on Arc → USDC minted to user's Wallet
Attestation times: Polygon/Avax/Arc/Monad fast (~1-8s), others can take up to ~15 min depending on the chain

### Angel Pool Slice Allocation
On deposit, funds auto-allocate: 30% APY slice / 70% Auction slice. Withdrawals cascade through idle → auction → apy → activeLiquidity slices (V2 fix prevents underflow).

### beforeSwap Hook (Pyth Oracle)
The NoVC Angel Hook validates swap prices against Pyth oracle feeds (ETH/USD, USDC/USD) in the `beforeSwap` callback, rejecting swaps that deviate beyond acceptable bounds.

---

## License

MIT

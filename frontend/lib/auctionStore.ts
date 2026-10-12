// lib/auctionStore.ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { formatEther, parseEther, type Address } from 'viem'

interface StoredBid {
  id: string
  bidder: string
  amount: string
  price: string
  timestamp: number
  auctionAddress: string
  txHash?: string
  onchainBidId?: string
}

interface Bid {
  id: string
  bidder: Address
  amount: bigint
  price: bigint
  timestamp: number
  auctionAddress: Address
  txHash?: string
  onchainBidId?: string
}

interface StoredAuction {
  address: string
  creator: string
  floorPrice: string
  tickSpacing: string
  startBlock: number
  endBlock: number
  createdAt: number
  jobId?: string
  ensName?: string
  ensSubdomain?: string
  ensFullName?: string
  // ── Listing metadata ──
  name?: string
  ticker?: string
  tagline?: string
  roundType?: string
  category?: string
  description?: string
  color?: string
}

interface Auction {
  address: Address
  creator: Address
  floorPrice: bigint
  tickSpacing: bigint
  startBlock: number
  endBlock: number
  createdAt: number
  jobId?: bigint
  ensName?: string
  ensSubdomain?: string
  ensFullName?: string
  // ── Listing metadata ──
  name?: string
  ticker?: string
  tagline?: string
  roundType?: string
  category?: string
  description?: string
  color?: string
}

interface AuctionStoreState {
  bids: StoredBid[]
  auctions: StoredAuction[]
  addBid: (bid: Omit<Bid, 'id' | 'timestamp'>) => void
  clearBids: (auctionAddress: Address) => void
  getBidsForAuction: (auctionAddress: Address) => Bid[]
  getTotalETHForAuction: (auctionAddress: Address) => bigint
  getBidderCountForAuction: (auctionAddress: Address) => number
  createTestBids: (auctionAddress: Address, count?: number) => void
  addAuction: (auction: Omit<Auction, 'createdAt'>) => void
  getAuction: (address: Address) => Auction | null
  getAllAuctions: () => Auction[]
  removeAuction: (address: Address) => void
  resetAllAuctions: () => void
}

const bidToStored = (bid: Omit<Bid, 'id' | 'timestamp'> & { id?: string, timestamp?: number }): StoredBid => {
  return {
    id: bid.id || `${bid.auctionAddress}-${Date.now()}-${Math.random()}`,
    bidder: bid.bidder,
    amount: bid.amount.toString(),
    price: bid.price.toString(),
    timestamp: bid.timestamp || Date.now(),
    auctionAddress: bid.auctionAddress,
    txHash: bid.txHash,
    onchainBidId: bid.onchainBidId
  }
}

const storedToBid = (stored: StoredBid): Bid => {
  return {
    id: stored.id,
    bidder: stored.bidder as Address,
    amount: BigInt(stored.amount),
    price: BigInt(stored.price),
    timestamp: stored.timestamp,
    auctionAddress: stored.auctionAddress as Address,
    txHash: stored.txHash,
    onchainBidId: stored.onchainBidId
  }
}

const auctionToStored = (auction: Omit<Auction, 'createdAt'> & { createdAt?: number }): StoredAuction => {
  return {
    address: auction.address,
    creator: auction.creator,
    floorPrice: auction.floorPrice.toString(),
    tickSpacing: auction.tickSpacing.toString(),
    startBlock: auction.startBlock,
    endBlock: auction.endBlock,
    createdAt: auction.createdAt || Date.now(),
    jobId: auction.jobId?.toString(),
    ensName: auction.ensName,
    ensSubdomain: auction.ensSubdomain,
    ensFullName: auction.ensFullName,
    name: auction.name,
    ticker: auction.ticker,
    tagline: auction.tagline,
    roundType: auction.roundType,
    category: auction.category,
    description: auction.description,
    color: auction.color,
  }
}

const storedToAuction = (stored: StoredAuction): Auction => {
  return {
    address: stored.address as Address,
    creator: stored.creator as Address,
    floorPrice: BigInt(stored.floorPrice),
    tickSpacing: BigInt(stored.tickSpacing),
    startBlock: stored.startBlock,
    endBlock: stored.endBlock,
    createdAt: stored.createdAt,
    jobId: stored.jobId ? BigInt(stored.jobId) : undefined,
    ensName: stored.ensName,
    ensSubdomain: stored.ensSubdomain,
    ensFullName: stored.ensFullName,
    name: stored.name,
    ticker: stored.ticker,
    tagline: stored.tagline,
    roundType: stored.roundType,
    category: stored.category,
    description: stored.description,
    color: stored.color,
  }
}

export const useAuctionStore = create<AuctionStoreState>()(
  persist(
    (set, get) => ({
      bids: [],
      auctions: [],

      addBid: (bidData) => {
        const storedBid = bidToStored({
          ...bidData,
          id: `${bidData.auctionAddress}-${Date.now()}-${Math.random()}`,
          timestamp: Date.now()
        })

        set((state) => {
          const newBids = [...state.bids, storedBid]
          console.log('📊 Bid added to store:', {
            bidder: bidData.bidder,
            amount: formatEther(bidData.amount),
            auction: bidData.auctionAddress
          })
          return { bids: newBids }
        })
      },

      clearBids: (auctionAddress) => {
        const addressStr = auctionAddress
        set((state) => {
          const filteredBids = state.bids.filter(b => b.auctionAddress !== addressStr)
          return { bids: filteredBids }
        })
      },

      getBidsForAuction: (auctionAddress) => {
        const addressStr = auctionAddress
        return get().bids
          .filter(bid => bid.auctionAddress === addressStr)
          .map(storedToBid)
      },

      getTotalETHForAuction: (auctionAddress) => {
        const addressStr = auctionAddress
        return get().bids
          .filter(bid => bid.auctionAddress === addressStr)
          .reduce((sum, storedBid) => sum + BigInt(storedBid.amount), 0n)
      },

      getBidderCountForAuction: (auctionAddress) => {
        const addressStr = auctionAddress
        const auctionBids = get().bids.filter(bid => bid.auctionAddress === addressStr)
        const uniqueBidders = new Set(auctionBids.map(b => b.bidder.toLowerCase()))
        return uniqueBidders.size
      },

      createTestBids: (auctionAddress, count = 10) => {
        const store = get()
        const testBidders: Address[] = [
          '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
          '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
          '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
          '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
          '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
          '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
          '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
        ].map(a => a as Address)

        const amounts = [
          parseEther('0.04'),
          parseEther('0.03'),
          parseEther('0.025'),
          parseEther('0.02'),
          parseEther('0.015'),
          parseEther('0.01'),
          parseEther('0.008'),
          parseEther('0.007'),
          parseEther('0.006'),
          parseEther('0.005'),
        ]

        for (let i = 0; i < Math.min(count, 10); i++) {
          const bidder = testBidders[i % testBidders.length]
          const amount = amounts[i % amounts.length]

          store.addBid({
            bidder,
            amount,
            price: parseEther('0.000001'),
            auctionAddress,
            txHash: `0xtest${i}`
          })
        }

        console.log(`✅ Created ${Math.min(count, 10)} test bids for auction ${auctionAddress}`)
      },

      addAuction: (auctionData) => {
        const storedAuction = auctionToStored({
          ...auctionData,
          createdAt: Date.now()
        })

        set((state) => {
          // Replace if the address already exists, otherwise append.
          // This makes re-creating with updated metadata idempotent.
          const existingIdx = state.auctions.findIndex(
            a => a.address.toLowerCase() === storedAuction.address.toLowerCase()
          )
          const newAuctions = existingIdx >= 0
            ? state.auctions.map((a, i) => (i === existingIdx ? storedAuction : a))
            : [...state.auctions, storedAuction]

          console.log('🏛️ Auction added to store:', {
            address: auctionData.address,
            creator: auctionData.creator,
            name: auctionData.name,
            roundType: auctionData.roundType,
            startBlock: auctionData.startBlock,
            endBlock: auctionData.endBlock,
          })
          return { auctions: newAuctions }
        })
      },

      getAuction: (address) => {
        const addressStr = address.toLowerCase()
        const stored = get().auctions.find(a => a.address.toLowerCase() === addressStr)
        return stored ? storedToAuction(stored) : null
      },

      getAllAuctions: () => {
        return get().auctions.map(storedToAuction)
      },

      removeAuction: (address) => {
        const addressStr = address.toLowerCase()
        set((state) => {
          const filteredAuctions = state.auctions.filter(a => a.address.toLowerCase() !== addressStr)
          return { auctions: filteredAuctions }
        })
      },

      resetAllAuctions: () => {
        set({ auctions: [], bids: [] })
        console.log('🧹 All auctions and bids cleared from store')
      }
    }),
    {
      name: 'novc-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
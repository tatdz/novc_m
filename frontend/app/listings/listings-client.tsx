// app/listings/listings-client.tsx
'use client'

import { useState, useMemo, useEffect } from 'react'
import { useAccount, useChainId, usePublicClient } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAuctionStore } from '@/lib/auctionStore'
import { SUPPORTED_CHAINS } from '@/lib/contracts'
import { getActualContractBlockNumber } from '@/lib/contract-interactions'
import { CCA_ABI } from '@/lib/abis'
import Link from 'next/link'
import { formatUnits } from 'viem'

// Demo content. Marked as EXAMPLE so judges and users know they are not real.
const DUMMY_LISTINGS = [
  {
    id: 'demo-1',
    isExample: true,
    name: 'Lumina Protocol',
    ticker: 'LUMI',
    tagline: 'Decentralized AI inference marketplace',
    category: 'AI / DePIN',
    status: 'live',
    verified: true,
    raised: '420,000',
    target: '1,000,000',
    investors: 87,
    floorPrice: '0.05',
    endTime: '2h 14m left',
    team: [
      { role: 'CEO', credential: 'Ex-Google AI, Stanford PhD' },
      { role: 'CTO', credential: 'Ex-Chainlink, 10+ yrs distributed systems' },
    ],
    screening: {
      kyb: true,
      xFollowers: '42K',
      github: 'github.com/lumina-protocol',
      accelerator: 'a16z CSX S24',
    },
    description: 'Lumina connects GPU providers with AI developers through a permissionless marketplace. Smart contracts handle job routing, payment escrow, and slashing. Built on Arbitrum with Uniswap v4 hooks for dynamic pricing.',
    color: '#60A5FA',
  },
  {
    id: 'demo-2',
    isExample: true,
    name: 'VaultFi',
    ticker: 'VFI',
    tagline: 'Institutional-grade DeFi yield strategies',
    category: 'DeFi',
    status: 'live',
    verified: true,
    raised: '215,000',
    target: '500,000',
    investors: 42,
    floorPrice: '0.10',
    endTime: '18h 30m left',
    team: [
      { role: 'CEO', credential: 'Ex-Goldman Sachs, Wharton MBA' },
      { role: 'CTO', credential: 'Ex-Aave core contributor' },
    ],
    screening: {
      kyb: true,
      xFollowers: '18K',
      github: 'github.com/vaultfi-labs',
      accelerator: 'Binance Labs',
    },
    description: 'VaultFi brings institutional risk management to DeFi. Auto-rebalancing vaults with Pyth oracle-powered stop losses, cross-chain yield aggregation via CCTP, and audited Solidity contracts.',
    color: '#A78BFA',
  },
  {
    id: 'demo-3',
    isExample: true,
    name: 'GreenLedger',
    ticker: 'GRN',
    tagline: 'On-chain carbon credit verification',
    category: 'RWA / Climate',
    status: 'upcoming',
    verified: false,
    raised: '0',
    target: '750,000',
    investors: 0,
    floorPrice: '0.02',
    endTime: 'Starts in 3 days',
    team: [
      { role: 'CEO', credential: 'Climate tech founder, YC W22' },
      { role: 'CTO', credential: 'Ex-Polygon, Rust/Solidity' },
    ],
    screening: {
      kyb: false,
      xFollowers: '8.2K',
      github: 'github.com/greenledger-xyz',
      accelerator: 'Gitcoin Grants',
    },
    description: 'GreenLedger tokenizes verified carbon credits using satellite data oracles. Each credit is backed by real-world verification from Gold Standard methodology, tradeable on Uniswap v4.',
    color: '#4ADE80',
  },
  {
    id: 'demo-4',
    isExample: true,
    name: 'Nexus ID',
    ticker: 'NXD',
    tagline: 'Self-sovereign identity for Web3',
    category: 'Identity / ZK',
    status: 'ended',
    verified: true,
    raised: '890,000',
    target: '800,000',
    investors: 156,
    floorPrice: '0.08',
    endTime: 'Closed at $0.12',
    team: [
      { role: 'CEO', credential: 'Ex-Worldcoin, MIT Cryptography' },
      { role: 'CTO', credential: 'ZK researcher, published 12 papers' },
    ],
    screening: {
      kyb: true,
      xFollowers: '95K',
      github: 'github.com/nexus-id',
      accelerator: 'Paradigm',
    },
    description: 'Zero-knowledge identity verification without exposing personal data. Poseidon hash commitments enable private KYC compliance. Integrated with Uniswap CCA for token distribution.',
    color: '#F59E0B',
  },
]

type FilterType = 'all' | 'live' | 'upcoming' | 'ended'

function NoVCLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', flexShrink: 0 }} aria-label="NoVC" role="img">
      <defs>
        <linearGradient id="listNovcBillGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4ADE80" />
          <stop offset="45%" stopColor="#22C55E" />
          <stop offset="100%" stopColor="#15803D" />
        </linearGradient>
        <linearGradient id="listNovcBillEdge" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#86EFAC" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#14532D" stopOpacity="0.9" />
        </linearGradient>
        <pattern id="listNovcDollarTile" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
          <text x="11" y="15" fontFamily="-apple-system, sans-serif" fontSize="14" fontWeight="900" fill="#F0FDF4" textAnchor="middle" opacity="0.22">$</text>
        </pattern>
        <radialGradient id="listNovcShine" cx="30%" cy="25%" r="75%">
          <stop offset="0%" stopColor="#BBF7D0" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#22C55E" stopOpacity="0" />
          <stop offset="100%" stopColor="#14532D" stopOpacity="0.5" />
        </radialGradient>
        <linearGradient id="listNovcGhostGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#94A3B8" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>
        <radialGradient id="listNovcPelletGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#F59E0B" />
        </radialGradient>
        <path id="listNovcNoVCPath" d="M 42 76 A 65 65 0 0 1 98 32" fill="none" />
        <path id="listNovcPacBody" d="M 95 100 L 165 55 A 65 65 0 1 0 165 145 Z" />
        <path id="listNovcPacMouth" d="M 95 100 L 165 55 A 65 65 0 0 1 165 145 Z" />
      </defs>
      <g>
        <use href="#listNovcPacBody" fill="url(#listNovcBillGrad)" />
        <use href="#listNovcPacBody" fill="url(#listNovcDollarTile)" />
        <use href="#listNovcPacBody" fill="url(#listNovcShine)" />
        <use href="#listNovcPacBody" fill="none" stroke="url(#listNovcBillEdge)" strokeWidth="1.5" />
        <use href="#listNovcPacMouth" fill="#0a0a14" />
        <circle cx="122" cy="72" r="6.5" fill="#0a0a14" />
        <circle cx="124" cy="70" r="2.5" fill="#F8FAFC" opacity="0.9" />
        <text fontFamily="-apple-system, sans-serif" fontSize="20" fontWeight="900" fill="#F8FAFC" letterSpacing="0.5" paintOrder="stroke" stroke="#14532D" strokeWidth="0.75" strokeLinejoin="round">
          <textPath href="#listNovcNoVCPath" startOffset="0%">NoVC</textPath>
        </text>
      </g>
      <g transform="translate(140, 92)">
        <path d="M 0 0 A 18 18 0 0 1 36 0 L 36 28 L 30 22 L 24 28 L 18 22 L 12 28 L 6 22 L 0 28 Z" fill="url(#listNovcGhostGrad)" opacity="0.95" />
        <ellipse cx="11" cy="8" rx="3.5" ry="4.5" fill="#0a0a14" />
        <ellipse cx="25" cy="8" rx="3.5" ry="4.5" fill="#0a0a14" />
        <circle cx="12" cy="7" r="1.5" fill="#F8FAFC" />
        <circle cx="26" cy="7" r="1.5" fill="#F8FAFC" />
        <text x="18" y="22" fontFamily="-apple-system, sans-serif" fontSize="9" fontWeight="800" fill="#0a0a14" textAnchor="middle" opacity="0.85">VC</text>
      </g>
      <circle cx="185" cy="100" r="3" fill="url(#listNovcPelletGrad)" />
      <circle cx="182" cy="82" r="2" fill="url(#listNovcPelletGrad)" opacity="0.7" />
      <circle cx="182" cy="118" r="2" fill="url(#listNovcPelletGrad)" opacity="0.7" />
      <g opacity="0.55" stroke="#4ADE80" strokeWidth="1.5" strokeLinecap="round">
        <line x1="150" y1="55" x2="170" y2="45" />
        <line x1="150" y1="145" x2="170" y2="155" />
      </g>
    </svg>
  )
}

// Deterministic gradient avatar from an address or bidder string.
// No images, no network. Same input → same colors, always.
const AVATAR_COLORS = [
  ['#8B5CF6', '#6366F1'],
  ['#60A5FA', '#3B82F6'],
  ['#4ADE80', '#22C55E'],
  ['#FBBF24', '#F59E0B'],
  ['#F472B6', '#DB2777'],
  ['#22D3EE', '#0891B2'],
  ['#A78BFA', '#7C3AED'],
  ['#FB923C', '#EA580C'],
]

function avatarGradient(seed: string): [string, string] {
  if (!seed) return AVATAR_COLORS[0] as [string, string]
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length] as [string, string]
}

// Small stack of backer avatars + count. Display-only.
// `backers` is a list of seeds (addresses). If empty, renders nothing.
function BackerStack({ backers, total }: { backers: string[]; total: number }) {
  if (!backers || backers.length === 0) return null
  const shown = backers.slice(0, 4)
  const remaining = Math.max(0, (total || backers.length) - shown.length)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {shown.map((seed, i) => {
          const [c1, c2] = avatarGradient(seed)
          return (
            <div
              key={i}
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${c1}, ${c2})`,
                border: '1.5px solid #0f0f1a',
                marginLeft: i === 0 ? 0 : '-7px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.35)',
              }}
            />
          )
        })}
      </div>
      <span style={{ fontSize: '10px', color: '#94A3B8' }}>
        {total || backers.length} backed{remaining > 0 ? ` · +${remaining} more` : ''}
      </span>
    </div>
  )
}

// Demo backer seeds for example listings — deterministic, so the avatars
// are consistent across renders but are not tied to any real wallet.
function exampleBackers(id: string, count: number): string[] {
  const out: string[] = []
  for (let i = 0; i < Math.min(count, 8); i++) out.push(`${id}-backer-${i}`)
  return out
}

// Convert a stored on-chain round into the listing card shape.
function roundToListing(a: any, opts: { isEnded: boolean; currencyRaised?: bigint; backers?: string[] }) {
  const name = a.name || `${a.address.slice(0, 8)}...${a.address.slice(-4)}`
  const ticker = a.ticker || name.split(/\s+/).map((w: string) => w[0]).join('').slice(0, 4).toUpperCase()
  const floorPriceStr = formatUnits(BigInt(a.floorPrice?.toString?.() || '0'), 6)
  const floorPriceNum = parseFloat(floorPriceStr) || 0

  const tokenAmount = Number(a.auctionTokenAmount || 0)
  const targetNum = tokenAmount > 0 ? floorPriceNum * tokenAmount : 0
  const targetStr = targetNum > 0 ? targetNum.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0'

  const raisedNum = opts.currencyRaised
    ? Number(formatUnits(opts.currencyRaised, 6))
    : 0
  const raisedStr = raisedNum > 0 ? raisedNum.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0'

  const tagline = a.tagline || 'Community-backed round'
  const category = a.category || 'Startup'
  const description = a.description || 'This round is running on NoVC. Backers bid blind, everyone pays the same clearing price.'
  const color = a.color || '#8B5CF6'

  return {
    id: `chain-${a.address.toLowerCase()}`,
    isOnchain: true,
    isExample: false,
    address: a.address as string,
    name,
    ticker,
    tagline,
    category,
    status: opts.isEnded ? 'ended' : 'live',
    verified: false,
    raised: raisedStr,
    target: targetStr,
    investors: (opts.backers || []).length,
    backers: opts.backers || [],
    floorPrice: floorPriceStr,
    endTime: opts.isEnded ? 'Ended' : 'Live now',
    roundType: a.roundType || '',
    team: [
      { role: 'Founder', credential: a.creator ? `${a.creator.slice(0, 6)}...${a.creator.slice(-4)}` : 'On-chain creator' },
    ],
    screening: {
      kyb: false,
      xFollowers: '—',
      github: '—',
      accelerator: '',
    },
    description,
    color,
  }
}

export default function ListingsClient() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { getAllAuctions } = useAuctionStore()
  const [filter, setFilter] = useState<FilterType>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [contractBlock, setContractBlock] = useState<number>(0)
  const [raisedByRound, setRaisedByRound] = useState<Record<string, bigint>>({})
  const [backersByRound, setBackersByRound] = useState<Record<string, string[]>>({})

  const chainName = SUPPORTED_CHAINS.find(c => c.id === chainId)?.name || 'Unknown'

  const onchainAuctions = useMemo(() => getAllAuctions(), [getAllAuctions])

  useEffect(() => {
    if (!publicClient) return
    let cancelled = false
    const fetch = async () => {
      try {
        const b = await getActualContractBlockNumber(publicClient)
        if (!cancelled) setContractBlock(Number(b))
      } catch {}
    }
    fetch()
    const interval = setInterval(fetch, 15000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [publicClient])

  const liveRounds = useMemo(() => {
    if (contractBlock === 0) return []
    return onchainAuctions.filter(a => a.endBlock > contractBlock)
  }, [onchainAuctions, contractBlock])

  useEffect(() => {
    if (!publicClient) return
    let cancelled = false

    const fetchAll = async () => {
      const raisedUpdate: Record<string, bigint> = {}
      const backersUpdate: Record<string, string[]> = {}

      await Promise.all(liveRounds.map(async (a) => {
        const key = a.address.toLowerCase()
        try {
          const raised = await publicClient.readContract({
            address: a.address as `0x${string}`,
            abi: CCA_ABI,
            functionName: 'currencyRaised',
          }) as bigint
          raisedUpdate[key] = raised
        } catch {
          raisedUpdate[key] = 0n
        }

        try {
          const startBn = BigInt(a.startBlock || 0)
          const safeFrom = startBn > 100n ? startBn - 100n : 0n
          const logs = await publicClient.getLogs({
            address: a.address as `0x${string}`,
            event: {
              type: 'event' as const,
              name: 'BidSubmitted' as const,
              inputs: [
                { name: 'bidId', type: 'uint256' as const, indexed: true },
                { name: 'owner', type: 'address' as const, indexed: true },
                { name: 'maxPrice', type: 'uint256' as const, indexed: false },
                { name: 'amount', type: 'uint128' as const, indexed: false },
              ],
            },
            fromBlock: safeFrom,
            toBlock: 'latest',
          })
          const owners = new Set<string>()
          for (const log of logs) {
            const owner = (log.args as any)?.owner as string | undefined
            if (owner) owners.add(owner.toLowerCase())
          }
          backersUpdate[key] = Array.from(owners)
        } catch {
          backersUpdate[key] = []
        }
      }))

      if (!cancelled) {
        setRaisedByRound(prev => ({ ...prev, ...raisedUpdate }))
        setBackersByRound(prev => ({ ...prev, ...backersUpdate }))
      }
    }

    fetchAll()
    const interval = setInterval(fetchAll, 15000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [publicClient, liveRounds])

  const liveListings = useMemo(() => {
    return liveRounds.map(a => {
      const key = a.address.toLowerCase()
      const listing = roundToListing(a, {
        isEnded: false,
        currencyRaised: raisedByRound[key],
        backers: backersByRound[key] || [],
      })
      return listing
    })
  }, [liveRounds, raisedByRound, backersByRound])

  const combinedListings = useMemo(() => {
    return [...liveListings, ...DUMMY_LISTINGS]
  }, [liveListings])

  const filteredListings = filter === 'all'
    ? combinedListings.filter(l => l.status !== 'ended')
    : combinedListings.filter(l => l.status === filter)

  const statusColor = (s: string) => {
    if (s === 'live') return { bg: 'rgba(74,222,128,0.15)', text: '#4ADE80', border: 'rgba(74,222,128,0.3)' }
    if (s === 'upcoming') return { bg: 'rgba(96,165,250,0.15)', text: '#60A5FA', border: 'rgba(96,165,250,0.3)' }
    return { bg: 'rgba(148,163,184,0.1)', text: '#94A3B8', border: 'rgba(148,163,184,0.2)' }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a14', color: '#E2E8F0' }}>
      <header style={{ background: '#0f0f1a', borderBottom: '1px solid #1e1e2e', padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <NoVCLogo size={28} />
            <span style={{ fontWeight: 700, fontSize: '18px', color: '#F8FAFC' }}>NoVC</span>
          </Link>
          <span style={{ fontSize: '11px', color: '#64748B' }}>Open rounds</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/" style={{ fontSize: '11px', color: '#94A3B8', textDecoration: 'none', padding: '6px 12px', background: '#1e1e2e', borderRadius: '6px' }}>
            Back
          </Link>
          {isConnected && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', background: '#1e1e2e', borderRadius: '6px' }}>
              <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#22C55E' }} />
              <span style={{ fontSize: '10px', color: '#94A3B8' }}>{chainName}</span>
            </div>
          )}
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
        </div>
      </header>

      <main style={{ maxWidth: '1080px', margin: '0 auto', padding: '40px 20px' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 800, color: '#F8FAFC', margin: '0 0 8px 0', letterSpacing: '-1px' }}>
            Open rounds
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>
            Fair launch. Same price for every backer.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', padding: '3px', background: '#12121c', borderRadius: '8px', border: '1px solid #1e1e2e', width: 'fit-content' }}>
          {([['all', 'All'], ['live', 'Live'], ['upcoming', 'Soon'], ['ended', 'Closed']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)}
              style={{
                padding: '8px 18px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                background: filter === key ? '#2d2d44' : 'transparent',
                color: filter === key ? '#F8FAFC' : '#64748B',
                fontSize: '12px', fontWeight: filter === key ? 600 : 400
              }}>
              {label}
            </button>
          ))}
        </div>

        {liveListings.length > 0 && (
          <div style={{ marginBottom: '20px', padding: '12px 16px', background: 'rgba(74,222,128,0.06)', borderRadius: '10px', border: '1px solid rgba(74,222,128,0.15)' }}>
            <div style={{ fontSize: '10px', color: '#4ADE80', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {liveListings.length} live round{liveListings.length !== 1 ? 's' : ''} from the community
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredListings.map((listing: any) => {
            const sc = statusColor(listing.status)
            const isExpanded = expandedId === listing.id
            const raisedNum = parseFloat(String(listing.raised).replace(/,/g, '')) || 0
            const targetNum = parseFloat(String(listing.target).replace(/,/g, '')) || 0
            const progressPct = targetNum > 0 ? (raisedNum / targetNum * 100) : 0

            // Backer seeds for the avatar strip.
            // Real rounds use on-chain owners; example rounds use deterministic fakes.
            const backers = listing.isExample
              ? exampleBackers(listing.id, listing.investors || 0)
              : (listing.backers || [])

            return (
              <div key={listing.id} id={listing.address || listing.id}
                style={{
                  background: '#12121c', borderRadius: '14px', border: isExpanded ? `1px solid ${listing.color}30` : '1px solid #1e1e2e',
                  overflow: 'hidden', transition: 'border-color 0.3s',
                  scrollMarginTop: '20px',
                  position: 'relative',
                }}>
                {/* EXAMPLE ribbon for demo content */}
                {listing.isExample && (
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    right: '-28px',
                    transform: 'rotate(35deg)',
                    background: 'rgba(251,191,36,0.15)',
                    border: '1px solid rgba(251,191,36,0.35)',
                    color: '#FBBF24',
                    fontSize: '9px',
                    fontWeight: 700,
                    letterSpacing: '1.2px',
                    padding: '3px 32px',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }}>
                    EXAMPLE
                  </div>
                )}

                <div style={{ padding: '20px', cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : listing.id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{
                        width: '48px', height: '48px', borderRadius: '12px',
                        background: `linear-gradient(135deg, ${listing.color}20, ${listing.color}08)`,
                        border: `1px solid ${listing.color}30`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '20px', fontWeight: 700, color: listing.color
                      }}>
                        {listing.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '17px', fontWeight: 700, color: '#F8FAFC' }}>{listing.name}</span>
                          {listing.roundType && (
                            <span style={{ fontSize: '10px', color: '#A78BFA', padding: '2px 8px', background: 'rgba(139,92,246,0.1)', borderRadius: '8px' }}>
                              {listing.roundType}
                            </span>
                          )}
                          {listing.verified && (
                            <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(96,165,250,0.15)', color: '#60A5FA', fontWeight: 600 }}>VERIFIED</span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>{listing.tagline}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: '10px', padding: '4px 10px', borderRadius: '12px', background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`, fontWeight: 600, textTransform: 'uppercase' as const }}>
                      {listing.status}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '14px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11px', color: '#F8FAFC', fontWeight: 600 }}>${listing.raised}</span>
                        <span style={{ fontSize: '11px', color: '#64748B' }}>of ${listing.target}</span>
                      </div>
                      <div style={{ height: '6px', background: '#2d2d44', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(progressPct, 100)}%`, background: `linear-gradient(90deg, ${listing.color}, ${listing.color}AA)`, borderRadius: '3px', transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  </div>

                  {/* Social surface: who's backing this */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <BackerStack backers={backers} total={listing.investors || 0} />
                    <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#64748B' }}>
                      <span>{listing.endTime}</span>
                      <span style={{ color: '#475569' }}>·</span>
                      <span>From ${listing.floorPrice}</span>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ borderTop: '1px solid #1e1e2e', padding: '20px', background: '#0f0f1a' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                      <div>
                        <p style={{ fontSize: '12px', color: '#94A3B8', lineHeight: '1.7', margin: '0 0 20px 0' }}>{listing.description}</p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {listing.team.map((member: any, i: number) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: '#12121c', borderRadius: '8px' }}>
                              <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: `${listing.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: listing.color, fontWeight: 700, flexShrink: 0 }}>
                                {member.role.charAt(0)}
                              </div>
                              <div>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#F8FAFC' }}>{member.role}</div>
                                <div style={{ fontSize: '10px', color: '#64748B', marginTop: '1px' }}>{member.credential}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                          {[
                            { label: 'Starting', value: `$${listing.floorPrice}` },
                            { label: 'Target', value: `$${listing.target}` },
                            { label: 'Followers', value: listing.screening.xFollowers },
                            { label: 'KYB', value: listing.screening.kyb ? 'Verified' : 'Pending' },
                          ].map((item, i) => (
                            <div key={i} style={{ padding: '12px', background: '#12121c', borderRadius: '8px' }}>
                              <div style={{ fontSize: '9px', color: '#64748B', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>{item.label}</div>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: '#F8FAFC' }}>{item.value}</div>
                            </div>
                          ))}
                        </div>

                        {listing.screening.accelerator && (
                          <div style={{ fontSize: '11px', color: '#FBBF24', marginBottom: '12px' }}>
                            Backed by {listing.screening.accelerator}
                          </div>
                        )}

                        {listing.status === 'live' && (
                          <Link
                            href={listing.isOnchain
                              ? `/?tab=auctions&round=${listing.address}`
                              : `/`}
                            style={{ textDecoration: 'none' }}
                          >
                            <button style={{
                              width: '100%', padding: '14px',
                              background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
                              border: 'none', borderRadius: '10px', color: '#fff',
                              fontSize: '13px', fontWeight: 700, cursor: 'pointer'
                            }}>
                              Back this round
                            </button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {filteredListings.length === 0 && (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: '#64748B' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.5 }}>✦</div>
            <div style={{ fontSize: '14px', color: '#94A3B8' }}>No rounds here yet</div>
          </div>
        )}

        <div style={{ marginTop: '40px', padding: '24px', background: '#12121c', borderRadius: '14px', border: '1px solid #1e1e2e', textAlign: 'center' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#F8FAFC', marginBottom: '12px' }}>Want to raise here?</div>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <button style={{
              padding: '12px 28px', background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
              border: 'none', borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
            }}>
              Start a round
            </button>
          </Link>
        </div>
      </main>
    </div>
  )
}
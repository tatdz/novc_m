'use client'

import { useState, useMemo } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAuctionStore } from '@/lib/auctionStore'
import { SUPPORTED_CHAINS } from '@/lib/contracts'
import Link from 'next/link'

const DUMMY_LISTINGS = [
  {
    id: 'demo-1',
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
    endTime: 'Ended - Cleared at $0.12',
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

export default function ListingsClient() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { getAllAuctions } = useAuctionStore()
  const [filter, setFilter] = useState<FilterType>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const chainName = SUPPORTED_CHAINS.find(c => c.id === chainId)?.name || 'Unknown'
  const liveAuctions = useMemo(() => getAllAuctions(), [getAllAuctions])

  const filteredListings = filter === 'all'
    ? DUMMY_LISTINGS
    : DUMMY_LISTINGS.filter(l => l.status === filter)

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
            <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="20" fill="#2563EB"/>
              <path d="M20 7L22.5 15L20 12L17.5 15L20 7Z" fill="#93C5FD" stroke="#BFDBFE" strokeWidth="0.5"/>
              <ellipse cx="20" cy="22" rx="9" ry="10" fill="#60A5FA"/>
              <ellipse cx="20" cy="21" rx="7" ry="8" fill="#93C5FD"/>
              <circle cx="16" cy="19" r="1.5" fill="#1E3A8A"/>
              <ellipse cx="20" cy="27" rx="2" ry="1" fill="#1E3A8A"/>
              <path d="M11 17C9 15 8 17 9 19" stroke="#93C5FD" strokeWidth="2" strokeLinecap="round"/>
              <path d="M29 17C31 15 32 17 31 19" stroke="#93C5FD" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span style={{ fontWeight: 700, fontSize: '18px', color: '#F8FAFC' }}>NoVC</span>
          </Link>
          <span style={{ fontSize: '11px', color: '#64748B' }}>Auction Listings</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/" style={{ fontSize: '11px', color: '#94A3B8', textDecoration: 'none', padding: '6px 12px', background: '#1e1e2e', borderRadius: '6px' }}>
            Back to App
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

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '30px 20px' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#F8FAFC', margin: '0 0 8px 0' }}>Discover Auctions</h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>
            Browse verified startups raising through Continuous Clearing Auctions on Uniswap v4
          </p>
        </div>

        <div style={{ display: 'flex', gap: '24px', marginBottom: '20px', flexWrap: 'wrap' as const }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', flex: '1', minWidth: '300px' }}>
            {[
              { label: 'Total Listed', value: '4', icon: '&#128196;' },
              { label: 'Live Now', value: '2', icon: '&#128994;' },
              { label: 'Total Raised', value: '$1.53M', icon: '&#128176;' },
              { label: 'Investors', value: '285', icon: '&#128101;' },
            ].map((stat, i) => (
              <div key={i} style={{ background: '#12121c', borderRadius: '10px', padding: '14px', border: '1px solid #1e1e2e' }}>
                <div style={{ fontSize: '9px', color: '#64748B', marginBottom: '4px' }} dangerouslySetInnerHTML={{ __html: stat.icon + ' ' + stat.label }} />
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#F8FAFC' }}>{stat.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', padding: '3px', background: '#12121c', borderRadius: '8px', border: '1px solid #1e1e2e', width: 'fit-content' }}>
          {([['all', 'All'], ['live', 'Live'], ['upcoming', 'Upcoming'], ['ended', 'Ended']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)}
              style={{
                padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                background: filter === key ? '#2d2d44' : 'transparent',
                color: filter === key ? '#F8FAFC' : '#64748B',
                fontSize: '12px', fontWeight: filter === key ? 600 : 400
              }}>
              {label}
            </button>
          ))}
        </div>

        {liveAuctions.length > 0 && (
          <div style={{ marginBottom: '20px', padding: '12px 16px', background: 'rgba(74,222,128,0.06)', borderRadius: '10px', border: '1px solid rgba(74,222,128,0.15)' }}>
            <div style={{ fontSize: '11px', color: '#4ADE80', fontWeight: 600, marginBottom: '6px' }}>Your Live Auctions</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
              {liveAuctions.map((a: any) => (
                <div key={a.address} style={{ padding: '6px 10px', background: '#1e1e2e', borderRadius: '6px', fontSize: '10px', fontFamily: 'monospace', color: '#F8FAFC' }}>
                  {a.address.slice(0, 8)}...{a.address.slice(-4)}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredListings.map((listing) => {
            const sc = statusColor(listing.status)
            const isExpanded = expandedId === listing.id
            const progressPct = listing.target !== '0' ? (parseInt(listing.raised.replace(/,/g, '')) / parseInt(listing.target.replace(/,/g, '')) * 100) : 0

            return (
              <div key={listing.id}
                style={{
                  background: '#12121c', borderRadius: '14px', border: isExpanded ? `1px solid ${listing.color}30` : '1px solid #1e1e2e',
                  overflow: 'hidden', transition: 'border-color 0.3s'
                }}>
                <div style={{ padding: '20px', cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : listing.id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '44px', height: '44px', borderRadius: '12px',
                        background: `linear-gradient(135deg, ${listing.color}20, ${listing.color}08)`,
                        border: `1px solid ${listing.color}30`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '18px', fontWeight: 700, color: listing.color
                      }}>
                        {listing.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '16px', fontWeight: 700, color: '#F8FAFC' }}>{listing.name}</span>
                          <span style={{ fontSize: '10px', color: '#64748B', fontFamily: 'monospace' }}>${listing.ticker}</span>
                          {listing.verified && (
                            <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(96,165,250,0.15)', color: '#60A5FA', fontWeight: 600 }}>VERIFIED</span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>{listing.tagline}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span style={{ fontSize: '10px', padding: '3px 10px', borderRadius: '12px', background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`, fontWeight: 600, textTransform: 'uppercase' as const }}>
                        {listing.status}
                      </span>
                      <span style={{ fontSize: '10px', color: '#64748B' }}>{listing.endTime}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '10px', color: '#64748B' }}>Raised</span>
                        <span style={{ fontSize: '10px', color: '#94A3B8' }}>${listing.raised} / ${listing.target}</span>
                      </div>
                      <div style={{ height: '6px', background: '#2d2d44', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(progressPct, 100)}%`, background: `linear-gradient(90deg, ${listing.color}, ${listing.color}AA)`, borderRadius: '3px', transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: '80px' }}>
                      <div style={{ fontSize: '9px', color: '#64748B' }}>Floor Price</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#F8FAFC' }}>${listing.floorPrice}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
                    <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '12px', background: 'rgba(139,92,246,0.1)', color: '#A78BFA' }}>{listing.category}</span>
                    <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '12px', background: '#1e1e2e', color: '#94A3B8' }}>{listing.investors} investors</span>
                    <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '12px', background: '#1e1e2e', color: '#94A3B8' }}>{listing.screening.xFollowers} followers</span>
                    {listing.screening.accelerator && (
                      <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '12px', background: 'rgba(251,191,36,0.1)', color: '#FBBF24' }}>{listing.screening.accelerator}</span>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ borderTop: '1px solid #1e1e2e', padding: '20px', background: '#0f0f1a' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#F8FAFC', marginBottom: '8px' }}>About</div>
                        <p style={{ fontSize: '11px', color: '#94A3B8', lineHeight: '1.7', margin: '0 0 16px 0' }}>{listing.description}</p>

                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#F8FAFC', marginBottom: '8px' }}>Team</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {listing.team.map((member, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: '#12121c', borderRadius: '8px' }}>
                              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: `${listing.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: listing.color, fontWeight: 700 }}>
                                {member.role.charAt(0)}
                              </div>
                              <div>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: '#F8FAFC' }}>{member.role}</div>
                                <div style={{ fontSize: '9px', color: '#64748B' }}>{member.credential}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#F8FAFC', marginBottom: '8px' }}>Verification Status</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                          {[
                            { label: 'KYB Verified', done: listing.screening.kyb, detail: listing.screening.kyb ? 'Persona KYB complete' : 'Pending integration' },
                            { label: 'X Followers', done: parseInt(listing.screening.xFollowers) >= 10000, detail: listing.screening.xFollowers },
                            { label: 'GitHub', done: true, detail: listing.screening.github },
                            { label: 'Accelerator', done: !!listing.screening.accelerator, detail: listing.screening.accelerator || 'Not specified' },
                          ].map((item, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: '#12121c', borderRadius: '8px' }}>
                              <div style={{
                                width: '20px', height: '20px', borderRadius: '50%',
                                background: item.done ? 'rgba(74,222,128,0.15)' : 'rgba(148,163,184,0.1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '10px', color: item.done ? '#4ADE80' : '#64748B'
                              }}>
                                {item.done ? '\u2713' : '\u2012'}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '11px', color: item.done ? '#F8FAFC' : '#64748B' }}>{item.label}</div>
                                <div style={{ fontSize: '9px', color: '#64748B' }}>{item.detail}</div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div style={{ padding: '14px', background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(99,102,241,0.06))', borderRadius: '10px', border: '1px solid rgba(139,92,246,0.15)' }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#F8FAFC', marginBottom: '8px' }}>Auction Parameters</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div>
                              <div style={{ fontSize: '9px', color: '#64748B' }}>Floor Price</div>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: '#F8FAFC' }}>${listing.floorPrice} USDC</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '9px', color: '#64748B' }}>Target Raise</div>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: '#F8FAFC' }}>${listing.target}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '9px', color: '#64748B' }}>Mechanism</div>
                              <div style={{ fontSize: '11px', color: '#A78BFA' }}>CCA (Uniswap v4)</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '9px', color: '#64748B' }}>Network</div>
                              <div style={{ fontSize: '11px', color: '#60A5FA' }}>Arbitrum Sepolia</div>
                            </div>
                          </div>
                        </div>

                        {listing.status === 'live' && (
                          <Link href="/" style={{ textDecoration: 'none' }}>
                            <button style={{
                              width: '100%', marginTop: '12px', padding: '12px',
                              background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
                              border: 'none', borderRadius: '10px', color: '#fff',
                              fontSize: '13px', fontWeight: 600, cursor: 'pointer'
                            }}>
                              Place Bid
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

        <div style={{ marginTop: '32px', padding: '20px', background: '#12121c', borderRadius: '14px', border: '1px solid #1e1e2e', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#F8FAFC', marginBottom: '4px' }}>Want to list your project?</div>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '12px' }}>
            Create a Continuous Clearing Auction and reach Web3 investors
          </div>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <button style={{
              padding: '10px 24px', background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
              border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
            }}>
              Create Auction
            </button>
          </Link>
        </div>
      </main>
    </div>
  )
}

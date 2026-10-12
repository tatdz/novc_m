// app/client-page.tsx
'use client'

import { useState, useMemo, useEffect, Suspense } from 'react'
import { useAccount, useChainId, useBalance, useBlockNumber } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { formatUnits, type Address } from 'viem'
import { useAuctionStore } from '@/lib/auctionStore'
import { SUPPORTED_CHAINS, getUSDCAddress } from '@/lib/contracts'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

// Loading skeletons for each component
const PanelSkeleton = () => (
  <div style={{ background: '#12121c', borderRadius: '12px', border: '1px solid #1e1e2e', padding: '16px', minHeight: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ color: '#64748B' }}>Loading...</div>
  </div>
)

// Dynamic imports with loading states
const AuctionCreationPanel = dynamic(() => import('@/components/AuctionCreationPanel'), {
  ssr: false,
  loading: () => <PanelSkeleton />
})

const BidPanel = dynamic(() => import('@/components/BidPanel'), {
  ssr: false,
  loading: () => <PanelSkeleton />
})

const AngelPoolDashboard = dynamic(
  () => import('@/components/AngelPoolDashboard').then(mod => mod.AngelPoolDashboard),
  {
    ssr: false,
    loading: () => <PanelSkeleton />
  }
)

const SettleClient = dynamic(() => import('@/app/settle/settle-client'), {
  ssr: false,
  loading: () => <PanelSkeleton />
})

// ------------------------------------------------------------------
// NoVC logo — dollar-bill Pac-Man eating a VC ghost.
// Transparent background, static mouth (no animation), no tagline.
// ------------------------------------------------------------------
function NoVCLogo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
      aria-label="NoVC"
      role="img"
    >
      <defs>
        <linearGradient id="novcBillGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4ADE80" />
          <stop offset="45%" stopColor="#22C55E" />
          <stop offset="100%" stopColor="#15803D" />
        </linearGradient>

        <linearGradient id="novcBillEdge" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#86EFAC" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#14532D" stopOpacity="0.9" />
        </linearGradient>

        <pattern id="novcDollarTile" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
          <text
            x="11"
            y="15"
            fontFamily="-apple-system, BlinkMacSystemFont, 'Inter', sans-serif"
            fontSize="14"
            fontWeight="900"
            fill="#F0FDF4"
            textAnchor="middle"
            opacity="0.22"
          >
            $
          </text>
        </pattern>

        <pattern id="novcDollarTileDense" x="11" y="11" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
          <text
            x="11"
            y="15"
            fontFamily="-apple-system, BlinkMacSystemFont, 'Inter', sans-serif"
            fontSize="10"
            fontWeight="900"
            fill="#052E16"
            textAnchor="middle"
            opacity="0.18"
          >
            $
          </text>
        </pattern>

        <radialGradient id="novcShine" cx="30%" cy="25%" r="75%">
          <stop offset="0%" stopColor="#BBF7D0" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#22C55E" stopOpacity="0" />
          <stop offset="100%" stopColor="#14532D" stopOpacity="0.5" />
        </radialGradient>

        <linearGradient id="novcGhostGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#94A3B8" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>

        <radialGradient id="novcPelletGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#F59E0B" />
        </radialGradient>

        <path
          id="novcNoVCPath"
          d="M 42 76 A 65 65 0 0 1 98 32"
          fill="none"
        />

        {/* Pac-Man body: circle with the mouth wedge cut out of the silhouette */}
        <path
          id="novcPacBody"
          d="M 95 100
             L 165 55
             A 65 65 0 1 0 165 145
             Z"
        />

        {/* The mouth wedge (used as a fill, not as a cut) */}
        <path
          id="novcPacMouth"
          d="M 95 100
             L 165 55
             A 65 65 0 0 1 165 145
             Z"
        />
      </defs>

      {/* No background rect — SVG is fully transparent */}

      {/* === PAC-MAN === */}
      <g>
        <use href="#novcPacBody" fill="url(#novcBillGrad)" />
        <use href="#novcPacBody" fill="url(#novcDollarTile)" />
        <use href="#novcPacBody" fill="url(#novcDollarTileDense)" />
        <use href="#novcPacBody" fill="url(#novcShine)" />
        <use href="#novcPacBody" fill="none" stroke="url(#novcBillEdge)" strokeWidth="1.5" />
        <use href="#novcPacBody" fill="none" stroke="#BBF7D0" strokeWidth="0.5" strokeOpacity="0.4" strokeDasharray="3 3" />

        {/* Solid mouth cutout (static) */}
        <use href="#novcPacMouth" fill="#0a0a14" />

        {/* Eye */}
        <circle cx="122" cy="72" r="6.5" fill="#0a0a14" />
        <circle cx="124" cy="70" r="2.5" fill="#F8FAFC" opacity="0.9" />

        {/* NoVC arc on the shoulder */}
        <text
          fontFamily="-apple-system, BlinkMacSystemFont, 'Inter', sans-serif"
          fontSize="20"
          fontWeight="900"
          fill="#F8FAFC"
          letterSpacing="0.5"
          paintOrder="stroke"
          stroke="#14532D"
          strokeWidth="0.75"
          strokeLinejoin="round"
        >
          <textPath href="#novcNoVCPath" startOffset="0%">
            NoVC
          </textPath>
        </text>
      </g>

      {/* === VC GHOST inside the mouth === */}
      <g transform="translate(140, 92)">
        <path
          d="M 0 0 A 18 18 0 0 1 36 0 L 36 28 L 30 22 L 24 28 L 18 22 L 12 28 L 6 22 L 0 28 Z"
          fill="url(#novcGhostGrad)"
          opacity="0.95"
        />
        <ellipse cx="11" cy="8" rx="3.5" ry="4.5" fill="#0a0a14" />
        <ellipse cx="25" cy="8" rx="3.5" ry="4.5" fill="#0a0a14" />
        <circle cx="12" cy="7" r="1.5" fill="#F8FAFC" />
        <circle cx="26" cy="7" r="1.5" fill="#F8FAFC" />

        <text
          x="18"
          y="22"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Inter', sans-serif"
          fontSize="9"
          fontWeight="800"
          fill="#0a0a14"
          textAnchor="middle"
          opacity="0.85"
        >
          VC
        </text>
      </g>

      {/* === Pellets (static) === */}
      <circle cx="185" cy="100" r="3" fill="url(#novcPelletGrad)" />
      <circle cx="182" cy="82" r="2" fill="url(#novcPelletGrad)" opacity="0.7" />
      <circle cx="182" cy="118" r="2" fill="url(#novcPelletGrad)" opacity="0.7" />
      <circle cx="176" cy="66" r="1.5" fill="url(#novcPelletGrad)" opacity="0.5" />
      <circle cx="176" cy="134" r="1.5" fill="url(#novcPelletGrad)" opacity="0.5" />

      {/* === Motion lines (static) === */}
      <g opacity="0.55" stroke="#4ADE80" strokeWidth="1.5" strokeLinecap="round">
        <line x1="150" y1="55" x2="170" y2="45" />
        <line x1="150" y1="145" x2="170" y2="155" />
      </g>
    </svg>
  )
}

const panelStyle = { background: '#12121c', borderRadius: '12px', border: '1px solid #1e1e2e', padding: '16px' }

type TabType = 'auctions' | 'pool' | 'settle'

export default function ClientPage() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { data: blockNumber } = useBlockNumber({ watch: true })
  const { getAllAuctions } = useAuctionStore()
  const searchParams = useSearchParams()

  const [lastAuctionAddress, setLastAuctionAddress] = useState<string>('')
  const [refreshAuctionsTrigger, setRefreshAuctionsTrigger] = useState(0)
  const [activeTab, setActiveTab] = useState<TabType>('auctions')
  const sourceUSDC = getUSDCAddress(chainId)
  const { data: usdcBalance, refetch: refetchBalance } = useBalance({ address, token: sourceUSDC, chainId })

  const allAuctions = useMemo(() => getAllAuctions(), [getAllAuctions, refreshAuctionsTrigger])

  useEffect(() => {
    const tab = searchParams.get('tab') as TabType | null
    if (tab && ['auctions', 'pool', 'settle'].includes(tab)) {
      setActiveTab(tab)
    }
  }, [searchParams])

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    const url = new URL(window.location.href)
    if (tab === 'auctions') {
      url.searchParams.delete('tab')
    } else {
      url.searchParams.set('tab', tab)
    }
    window.history.pushState({}, '', url.toString())
  }

  useEffect(() => {
    const findLastAuction = () => {
      if (typeof window === 'undefined') return null
      const keys = Object.keys(localStorage).filter(k => k.startsWith('usdc-auction-'))
      if (keys.length === 0) return null
      const auctions = keys.map(k => { try { return JSON.parse(localStorage.getItem(k) || '{}') } catch { return null } }).filter(a => a && a.address && a.timestamp)
      if (auctions.length === 0) return null
      auctions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      return auctions[0]
    }
    const lastAuction = findLastAuction()
    if (lastAuction) setLastAuctionAddress(lastAuction.address)
  }, [allAuctions, refreshAuctionsTrigger])

  const chainName = SUPPORTED_CHAINS.find(c => c.id === chainId)?.name || 'Unknown'

  if (!isConnected) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a14', color: '#E2E8F0' }}>
        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', borderBottom: '1px solid #1e1e2e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <NoVCLogo size={40} />
            <span style={{ fontWeight: 700, fontSize: '20px', color: '#F8FAFC' }}>NoVC</span>
          </div>
          <ConnectButton />
        </nav>

        {/* HERO — bigger centered logo with radial glow behind it */}
        <section style={{ textAlign: 'center', padding: '56px 24px 32px', maxWidth: '680px', margin: '0 auto', position: 'relative' }}>
          <div style={{
            position: 'absolute',
            top: '30px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '420px',
            height: '420px',
            background: 'radial-gradient(circle, rgba(34,197,94,0.18) 0%, rgba(34,197,94,0.06) 40%, rgba(34,197,94,0) 70%)',
            pointerEvents: 'none',
            zIndex: 0,
          }} />

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', position: 'relative', zIndex: 1 }}>
            <NoVCLogo size={200} />
          </div>

          <h1 style={{ fontSize: '44px', fontWeight: 800, color: '#F8FAFC', lineHeight: 1.15, margin: '0 0 12px', position: 'relative', zIndex: 1 }}>
            Skip the VCs.<br />
            <span style={{ background: 'linear-gradient(135deg, #8B5CF6, #60A5FA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Raise onchain.</span>
          </h1>
          <p style={{ fontSize: '15px', color: '#94A3B8', lineHeight: 1.55, margin: '0 auto', position: 'relative', zIndex: 1 }}>
            Founders, angels, and public bidders meet in the same onchain pool.
          </p>
        </section>

        {/* THREE ROLES — tightened cards */}
        <section style={{ maxWidth: '880px', margin: '0 auto', padding: '24px 24px 40px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {[
            {
              icon: '\u26A1',
              gradient: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
              title: 'For Founders',
              desc: 'Launch a fundraising auction. Set your floor price. Accept cross-chain USDC bids via Circle CCTP.',
              cta: 'Start an auction'
            },
            {
              icon: '\uD83C\uDFCA',
              gradient: 'linear-gradient(135deg, #60A5FA, #3B82F6)',
              title: 'For Angels',
              desc: 'Pool capital with other angels, vote on deals, and earn Uniswap v4 swap fees while you hold.',
              cta: 'Join the pool'
            },
            {
              icon: '\uD83C\uDFAF',
              gradient: 'linear-gradient(135deg, #4ADE80, #22C55E)',
              title: 'For Public Bidders',
              desc: 'Bid directly against everyone else. The clearing price is discovered onchain — no insider allocations.',
              cta: 'Place a bid'
            },
          ].map((p, i) => (
            <div
              key={i}
              style={{
                background: '#12121c',
                borderRadius: '10px',
                padding: '16px 16px 12px',
                border: '1px solid #1e1e2e',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: p.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>{p.icon}</div>
                <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#F8FAFC', margin: 0 }}>{p.title}</h3>
              </div>
              <p style={{ fontSize: '11px', color: '#94A3B8', lineHeight: 1.5, margin: 0, flex: 1 }}>{p.desc}</p>
              <div style={{ fontSize: '10px', color: '#A78BFA', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', paddingTop: '6px', borderTop: '1px solid #1e1e2e' }}>
                {p.cta} <span style={{ fontSize: '11px' }}>&rarr;</span>
              </div>
            </div>
          ))}
        </section>

        {/* STACK */}
        <section style={{ textAlign: 'center', padding: '0 24px 48px' }}>
          <div style={{ fontSize: '9px', color: '#475569', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '10px' }}>
            Built on
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' as const }}>
            {['Uniswap v4', 'Pyth Oracle', 'Monad', 'Circle CCTP', 'Alchemy'].map((t, i) => (
              <span key={i} style={{ fontSize: '10px', color: '#94A3B8', padding: '4px 10px', background: '#12121c', borderRadius: '10px', border: '1px solid #1e1e2e' }}>{t}</span>
            ))}
          </div>
        </section>
      </div>
    )
  }

  const tabs: { key: TabType; label: string }[] = [
    { key: 'auctions', label: 'Auctions' },
    { key: 'pool', label: 'Angel Pool' },
    { key: 'settle', label: 'Settle' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a14', color: '#E2E8F0' }}>
      {/* Header */}
      <header style={{ background: '#0f0f1a', borderBottom: '1px solid #1e1e2e', padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <NoVCLogo size={36} />
          <span style={{ fontWeight: 700, fontSize: '18px', color: '#F8FAFC' }}>NoVC</span>
          <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 400 }}>Skip the VCs. Raise onchain.</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/listings" style={{ fontSize: '11px', color: '#A78BFA', textDecoration: 'none', padding: '5px 12px', background: 'rgba(139,92,246,0.1)', borderRadius: '6px', border: '1px solid rgba(139,92,246,0.2)', fontWeight: 500 }}>
            Explore Listings
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', background: '#1e1e2e', borderRadius: '6px' }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#22C55E' }} />
            <span style={{ fontSize: '10px', color: '#94A3B8' }}>{chainName}</span>
          </div>
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
        </div>
      </header>

      {/* Tabs */}
      <div style={{ background: '#0f0f1a', borderBottom: '1px solid #1e1e2e', padding: '0 24px' }}>
        <div style={{ display: 'flex', gap: '20px', maxWidth: '1600px', margin: '0 auto' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => handleTabChange(t.key)}
              style={{
                padding: '10px 2px', border: 'none', borderBottom: activeTab === t.key ? '2px solid #8B5CF6' : '2px solid transparent',
                color: activeTab === t.key ? '#F8FAFC' : '#64748B', fontWeight: activeTab === t.key ? 600 : 400,
                fontSize: '13px', background: 'transparent', cursor: 'pointer'
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active Auction Indicator */}
      {lastAuctionAddress && (
        <div style={{ background: '#0f0f1a', borderBottom: '1px solid #1e1e2e', padding: '6px 24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22C55E' }} />
          <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#F8FAFC' }}>
            {lastAuctionAddress?.slice(0,8)}...{lastAuctionAddress?.slice(-4)}
          </span>
          <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(34,197,94,0.2)', color: '#22C55E' }}>LIVE</span>
        </div>
      )}

      {/* Main */}
      <main style={{ maxWidth: '1600px', margin: '0 auto', padding: '20px' }}>
        {activeTab === 'auctions' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
            <div style={panelStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
                <span style={{ fontSize: '16px' }}>&#9889;</span>
                <span style={{ fontWeight: 600, color: '#F8FAFC', fontSize: '15px' }}>Create Auction</span>
              </div>
              <Suspense fallback={<PanelSkeleton />}>
                <AuctionCreationPanel />
              </Suspense>
            </div>
            <div style={panelStyle}>
              <Suspense fallback={<PanelSkeleton />}>
                <BidPanel refreshTrigger={refreshAuctionsTrigger} />
              </Suspense>
            </div>
          </div>
        )}

        {activeTab === 'pool' && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={panelStyle}>
              <Suspense fallback={<PanelSkeleton />}>
                <AngelPoolDashboard />
              </Suspense>
            </div>
          </div>
        )}

        {activeTab === 'settle' && (
          <Suspense fallback={<PanelSkeleton />}>
            <SettleClient />
          </Suspense>
        )}
      </main>
    </div>
  )
}
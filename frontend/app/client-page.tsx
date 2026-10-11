// app/client-page.tsx
'use client'

import { useState, useMemo, useEffect, Suspense } from 'react'
import { useAccount, useChainId, useBalance, useBlockNumber } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { formatUnits, type Address } from 'viem'
import { useGatewayBalance } from '@/hooks/useGatewayBalance'
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

const CCTPDepositPanel = dynamic(() => import('@/components/CCTPDepositPanel'), { 
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

function NoVCLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="20" fill="#2563EB"/>
      <path d="M20 7L22.5 15L20 12L17.5 15L20 7Z" fill="#93C5FD" stroke="#BFDBFE" strokeWidth="0.5"/>
      <ellipse cx="20" cy="22" rx="9" ry="10" fill="#60A5FA"/>
      <ellipse cx="20" cy="21" rx="7" ry="8" fill="#93C5FD"/>
      <circle cx="16" cy="19" r="1.5" fill="#1E3A8A"/>
      <ellipse cx="20" cy="27" rx="2" ry="1" fill="#1E3A8A"/>
      <path d="M11 17C9 15 8 17 9 19" stroke="#93C5FD" strokeWidth="2" strokeLinecap="round"/>
      <path d="M29 17C31 15 32 17 31 19" stroke="#93C5FD" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

const panelStyle = { background: '#12121c', borderRadius: '12px', border: '1px solid #1e1e2e', padding: '16px' }

type TabType = 'auctions' | 'pool' | 'bridge' | 'settle'

export default function ClientPage() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { data: blockNumber } = useBlockNumber({ watch: true })
  const { balance: gatewayBalance, refresh: refreshGateway } = useGatewayBalance()
  const { getAllAuctions } = useAuctionStore()
  const searchParams = useSearchParams()

  const [lastAuctionAddress, setLastAuctionAddress] = useState<string>('')
  const [refreshAuctionsTrigger, setRefreshAuctionsTrigger] = useState(0)
  const [activeTab, setActiveTab] = useState<TabType>('auctions')
  const sourceUSDC = getUSDCAddress(chainId)
  const { data: usdcBalance, refetch: refetchBalance } = useBalance({ address, token: sourceUSDC, chainId })

  const allAuctions = useMemo(() => getAllAuctions(), [getAllAuctions, refreshAuctionsTrigger])

  // Handle query params for tab navigation
  useEffect(() => {
    const tab = searchParams.get('tab') as TabType | null
    if (tab && ['auctions', 'pool', 'bridge', 'settle'].includes(tab)) {
      setActiveTab(tab)
    }
  }, [searchParams])

  // Update URL when tab changes
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
            <NoVCLogo />
            <span style={{ fontWeight: 700, fontSize: '20px', color: '#F8FAFC' }}>NoVC</span>
          </div>
          <ConnectButton />
        </nav>

        <section style={{ textAlign: 'center', padding: '80px 24px 48px', maxWidth: '640px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '44px', fontWeight: 800, color: '#F8FAFC', lineHeight: 1.15, margin: '0 0 12px' }}>
            Skip the VCs.<br />
            <span style={{ background: 'linear-gradient(135deg, #8B5CF6, #60A5FA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Raise onchain.</span>
          </h1>
          <p style={{ fontSize: '15px', color: '#94A3B8', lineHeight: 1.6, margin: '0 auto 0' }}>
            Fundraising auctions. No gatekeepers.
          </p>
        </section>

        <section style={{ maxWidth: '960px', margin: '0 auto', padding: '40px 24px 48px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {[
            { icon: '\u26A1', gradient: 'linear-gradient(135deg, #8B5CF6, #6366F1)', title: 'Founders', desc: 'Launch a fundraising auction. Set floor price, deploy on Monad, enable cross-chain bids in USDC with Circle CCTP.' },
            { icon: '\uD83C\uDFCA', gradient: 'linear-gradient(135deg, #60A5FA, #3B82F6)', title: 'Angel Pool', desc: 'Pool capital, vote on startups, earn swap fees.' },
            { icon: '\uD83C\uDFAF', gradient: 'linear-gradient(135deg, #4ADE80, #22C55E)', title: 'Public Bid', desc: 'Bid directly. Fair clearing price, no insider deals.' },
          ].map((p, i) => (
            <div key={i} style={{ background: '#12121c', borderRadius: '14px', padding: '24px 20px', border: '1px solid #1e1e2e' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: p.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', marginBottom: '12px' }}>{p.icon}</div>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#F8FAFC', margin: '0 0 6px' }}>{p.title}</h3>
              <p style={{ fontSize: '11px', color: '#94A3B8', lineHeight: 1.6, margin: 0 }}>{p.desc}</p>
            </div>
          ))}
        </section>

        <section style={{ maxWidth: '640px', margin: '0 auto', padding: '0 24px 48px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              { num: '1', text: 'Founder creates auction' },
              { num: '2', text: 'Investors bid or pool capital' },
              { num: '3', text: 'Clearing price discovered onchain' },
              { num: '4', text: 'Tokens distribute, funds settle' },
            ].map(s => (
              <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#12121c', borderRadius: '8px', border: '1px solid #1e1e2e' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'linear-gradient(135deg, #8B5CF6, #6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#fff', fontWeight: 700, flexShrink: 0 }}>{s.num}</div>
                <span style={{ fontSize: '12px', color: '#F8FAFC' }}>{s.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section style={{ textAlign: 'center', padding: '0 24px 60px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' as const }}>
            {['Uniswap v4 Hooks', 'Pyth Oracle', 'Monad', 'Circle CCTP', 'Alchemy'].map((t, i) => (
              <span key={i} style={{ fontSize: '10px', color: '#64748B', padding: '4px 10px', background: '#12121c', borderRadius: '12px', border: '1px solid #1e1e2e' }}>{t}</span>
            ))}
          </div>
        </section>
      </div>
    )
  }

  const tabs: { key: TabType; label: string }[] = [
    { key: 'auctions', label: 'Auctions' },
    { key: 'pool', label: 'Angel Pool' },
    { key: 'bridge', label: 'Bridge' },
    { key: 'settle', label: 'Settle' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a14', color: '#E2E8F0' }}>
      {/* Header */}
      <header style={{ background: '#0f0f1a', borderBottom: '1px solid #1e1e2e', padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <NoVCLogo />
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
                <BidPanel 
                  refreshTrigger={refreshAuctionsTrigger} 
                  onNavigateToBridge={() => handleTabChange('bridge')}
                />
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

        {activeTab === 'bridge' && (
          <div style={{ maxWidth: '500px', margin: '0 auto' }}>
            <div style={panelStyle}>
              <Suspense fallback={<PanelSkeleton />}>
                <CCTPDepositPanel 
                  gatewayBalance={gatewayBalance?.totalUSDC || 0}
                  onRefreshGateway={refreshGateway}
                  onDepositComplete={(amount, txHash) => {
                    refetchBalance()
                    refreshGateway()
                  }} 
                />
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

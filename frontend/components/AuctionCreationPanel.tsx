// components/AuctionCreationPanel.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { useAccount, useWalletClient, usePublicClient, useChainId } from 'wagmi'
import { type Address, parseUnits } from 'viem'
import { CONTRACTS } from '@/lib/contracts'
import { createNewAuction } from '@/lib/contract-interactions'
import { useAuctionStore } from '@/lib/auctionStore'
import { switchChain } from '@/lib/wallet-connector'
import MockTokenMintPanel from './MockTokenMintPanel'

interface AuctionCreationPanelProps {
  onAuctionCreated?: (address: string, auctionAddress?: Address) => void
}

type CreationStep = 'main' | 'verification' | 'complete'

const inputStyle = {
  padding: '10px',
  background: '#1e1e2e',
  border: '1px solid #2d2d44',
  borderRadius: '8px',
  color: '#F8FAFC',
  fontSize: '13px',
  width: '100%',
  boxSizing: 'border-box' as const
}

const btnStyle = {
  padding: '12px',
  background: 'linear-gradient(135deg, #10B981, #059669)',
  border: 'none',
  borderRadius: '10px',
  color: 'white',
  fontSize: '14px',
  fontWeight: 600 as const,
  cursor: 'pointer',
  width: '100%'
}

const MONAD_TESTNET_ID = 10143
const FAUCET_SELECTOR = '0xde5f72fd'

const ROUND_COLORS = ['#60A5FA', '#A78BFA', '#4ADE80', '#FBBF24', '#F472B6', '#22D3EE']

function pickColor(seed: string): string {
  if (!seed) return ROUND_COLORS[0]
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return ROUND_COLORS[h % ROUND_COLORS.length]
}

function getExplorerUrl(chainId: number, txHash: string): string {
  return `https://testnet.monadscan.com/tx/${txHash}`
}

const ROUND_TYPES = ['Pre-seed', 'Seed', 'Series A', 'Community']

// ─── Confetti ───────────────────────────────────────────────────────
// Lightweight canvas confetti. One burst per mount, cleans itself up.
// No dependencies, no external network calls.
function ConfettiBurst({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const colors = ['#8B5CF6', '#60A5FA', '#4ADE80', '#FBBF24', '#F472B6', '#22D3EE']
    const originX = window.innerWidth / 2
    const originY = window.innerHeight * 0.35

    interface P { x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; color: string; life: number }
    const parts: P[] = []
    const COUNT = 180
    for (let i = 0; i < COUNT; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 6 + Math.random() * 10
      parts.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        size: 6 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1,
      })
    }

    let frames = 0
    const MAX_FRAMES = 160

    const step = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      frames++
      for (const p of parts) {
        p.vy += 0.35
        p.vx *= 0.995
        p.vy *= 0.995
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        p.life = Math.max(0, 1 - frames / MAX_FRAMES)

        ctx.save()
        ctx.globalAlpha = p.life
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      }
      if (frames < MAX_FRAMES) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      }
    }
    rafRef.current = requestAnimationFrame(step)

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [active])

  if (!active) return null
  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  )
}

export default function AuctionCreationPanel({ onAuctionCreated }: AuctionCreationPanelProps) {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const chainId = useChainId()

  const [params, setParams] = useState({
    startDelayBlocks: '5',
    durationBlocks: '100',
    tickSpacing: '0.01',
    floorPrice: '0.01',
    auctionTokenAmount: '1000',
  })

  const [listing, setListing] = useState({
    name: '',
    roundType: 'Seed',
    tagline: '',
    category: '',
    description: '',
  })

  const [step, setStep] = useState<CreationStep>('main')
  const [verificationForm, setVerificationForm] = useState({
    email: '',
    xProfile: '',
    founderIdentity: '',
    pressCoverage: '',
    institutionalBacking: '',
    githubProfile: '',
    disclaimerAccepted: false,
  })
  const [status, setStatus] = useState<'idle' | 'creating' | 'complete'>('idle')
  const [error, setError] = useState<string>('')
  const [success, setSuccess] = useState<string>('')
  const [isSwitching, setIsSwitching] = useState(false)
  const [shareLink, setShareLink] = useState<string>('')
  const [confettiActive, setConfettiActive] = useState(false)
  const [copied, setCopied] = useState(false)

  const [createdAuction, setCreatedAuction] = useState<{
    address: string
    transactionHash: string
  } | null>(null)
  const [auctionAddress, setAuctionAddress] = useState<Address | undefined>()

  const [mintingTokens, setMintingTokens] = useState(false)
  const [mintSuccess, setMintSuccess] = useState('')

  const { addAuction } = useAuctionStore()

  const normalizeDecimal = (value: string): string => {
    let normalized = value.replace(',', '.');
    normalized = normalized.replace(/[^\d.-]/g, '');
    const parts = normalized.split('.');
    if (parts.length > 2) {
      normalized = parts[0] + '.' + parts.slice(1).join('');
    }
    normalized = normalized.replace(/^0+(?=\d)/, '');
    if (normalized.startsWith('.')) {
      normalized = '0' + normalized;
    }
    if (normalized === '' || normalized === '-' || normalized === '.') {
      return '0.01';
    }
    return normalized;
  }

  const handleParamChange = (field: string, value: string) => {
    if (field === 'tickSpacing' || field === 'floorPrice') {
      setParams(prev => ({ ...prev, [field]: value }));
    } else {
      const numericValue = value.replace(/[^\d]/g, '');
      setParams(prev => ({ ...prev, [field]: numericValue }));
    }
  }

  const handleBlur = (field: string) => {
    if (field === 'tickSpacing' || field === 'floorPrice') {
      const normalized = normalizeDecimal(params[field as keyof typeof params] as string);
      setParams(prev => ({ ...prev, [field]: normalized }));
    }
  }

  if (isConnected && chainId !== MONAD_TESTNET_ID) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div style={{ fontSize: '14px', color: '#F87171', fontWeight: 500, marginBottom: '12px' }}>
          Switch to Monad
        </div>
        <button
          onClick={async () => {
            setIsSwitching(true)
            try { await switchChain(MONAD_TESTNET_ID) } catch {} finally { setIsSwitching(false) }
          }}
          disabled={isSwitching}
          style={{
            padding: '10px 20px',
            background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            opacity: isSwitching ? 0.6 : 1
          }}
        >
          {isSwitching ? 'Switching...' : 'Switch network'}
        </button>
      </div>
    )
  }

  const validateParams = (): string | null => {
    if (!listing.name.trim()) return 'Company name is required'

    const startDelay = parseInt(params.startDelayBlocks)
    const duration = parseInt(params.durationBlocks)

    const tickSpacing = parseFloat(normalizeDecimal(params.tickSpacing))
    const floorPrice = parseFloat(normalizeDecimal(params.floorPrice))
    const tokenAmount = parseInt(params.auctionTokenAmount)

    if (isNaN(startDelay) || startDelay < 2 || startDelay > 10000) {
      return 'Round opens in 2-10,000 blocks'
    }
    if (isNaN(duration) || duration < 10 || duration > 100000) {
      return 'Round lasts 10-100,000 blocks'
    }
    if (isNaN(tickSpacing) || tickSpacing < 0.01 || tickSpacing > 1) {
      return 'Price step must be 0.01-1'
    }
    if (isNaN(floorPrice) || floorPrice < 0.01 || floorPrice > 1000) {
      return 'Starting price must be 0.01-1,000'
    }
    if (isNaN(tokenAmount) || tokenAmount < 100 || tokenAmount > 1000000000) {
      return 'Shares must be 100-1,000,000,000'
    }

    return null
  }

  const handleMintTokens = async () => {
    if (!address || !walletClient || !publicClient) return
    try {
      setMintingTokens(true)
      setError('')
      setMintSuccess('')
      const hash = await walletClient.sendTransaction({
        to: CONTRACTS.MOCK_TOKEN,
        data: FAUCET_SELECTOR as `0x${string}`,
        value: 0n,
        chain: walletClient.chain,
        account: address,
      })
      setMintSuccess('Confirming...')
      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 })
      if (receipt.status === 'success') {
        setMintSuccess('2,000,000 shares received')
        setTimeout(() => setMintSuccess(''), 5000)
      }
    } catch (err: any) {
      if (err.message?.includes('User rejected')) setError('Cancelled')
      else setError(err.shortMessage || 'Faucet failed')
      setTimeout(() => setError(''), 5000)
    } finally {
      setMintingTokens(false)
    }
  }

  const handleCreateAuction = async () => {
    if (!address || !walletClient || !chainId) return

    const normalizedParams = {
      startDelayBlocks: params.startDelayBlocks,
      durationBlocks: params.durationBlocks,
      tickSpacing: normalizeDecimal(params.tickSpacing),
      floorPrice: normalizeDecimal(params.floorPrice),
      auctionTokenAmount: params.auctionTokenAmount,
    }

    const validationError = validateParams()
    if (validationError) {
      setError(validationError);
      return
    }

    try {
      setStatus('creating')
      setError('')
      setSuccess('Starting...')

      const result = await createNewAuction(walletClient, normalizedParams)

      setCreatedAuction({ address: result.auctionAddress, transactionHash: result.transactionHash })
      setAuctionAddress(result.auctionAddress as Address)
      setSuccess('Round is live')

      const displayName = listing.name.trim()
      const displayTicker = displayName.split(/\s+/).map(w => w[0]).join('').slice(0, 4).toUpperCase() || 'RND'

      addAuction({
        address: result.auctionAddress as Address,
        creator: address,
        floorPrice: parseUnits(normalizedParams.floorPrice, 6),
        tickSpacing: parseUnits(normalizedParams.tickSpacing, 6),
        startBlock: result.startBlock,
        endBlock: result.endBlock,
        jobId: undefined,
        name: displayName,
        ticker: displayTicker,
        tagline: listing.tagline.trim() || undefined,
        roundType: listing.roundType,
        category: listing.category.trim() || undefined,
        description: listing.description.trim() || undefined,
        color: pickColor(displayName),
      })

      localStorage.setItem(`usdc-auction-${result.auctionAddress.toLowerCase()}`, JSON.stringify({
        address: result.auctionAddress,
        txHash: result.transactionHash,
        timestamp: Date.now(),
        chainId,
        currency: 'USDC',
        floorPrice: normalizedParams.floorPrice + ' USDC',
        tickSpacing: normalizedParams.tickSpacing + ' USDC',
        creator: address,
        name: displayName,
        ticker: displayTicker,
        tagline: listing.tagline.trim(),
        roundType: listing.roundType,
        category: listing.category.trim(),
        description: listing.description.trim(),
        color: pickColor(displayName),
      }))

      // Build the share link and the X intent URL.
      // The link points at the listings page anchored to this round.
      const shareUrl = `https://novc-m.vercel.app/listings#${result.auctionAddress}`
      const tweetText = [
        `${displayName} is raising — ${listing.roundType}`,
        listing.tagline ? listing.tagline : 'Community-backed round, live on NoVC.',
        'Back it with anyone, same price for every backer:',
      ].join('\n')
      const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(shareUrl)}`
      setShareLink(intentUrl)

      // Fire the confetti burst.
      setConfettiActive(true)
      setTimeout(() => setConfettiActive(false), 3500)

      onAuctionCreated?.(result.auctionAddress, result.auctionAddress as Address)
      setStep('complete')
      setStatus('complete')

    } catch (err: any) {
      setError(err.message || "Couldn't start the round")
      setStatus('idle')
    }
  }

  const handleCopyShareUrl = async () => {
    if (!createdAuction?.address) return
    const plainUrl = `https://novc-m.vercel.app/listings#${createdAuction.address}`
    try {
      await navigator.clipboard.writeText(plainUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const handleReset = () => {
    setStep('main')
    setStatus('idle')
    setCreatedAuction(null)
    setAuctionAddress(undefined)
    setError('')
    setSuccess('')
    setShareLink('')
    setCopied(false)
    setParams({
      startDelayBlocks: '5',
      durationBlocks: '100',
      tickSpacing: '0.01',
      floorPrice: '0.01',
      auctionTokenAmount: '1000'
    })
    setListing({
      name: '',
      roundType: 'Seed',
      tagline: '',
      category: '',
      description: '',
    })
  }

  if (step === 'verification') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, color: '#F8FAFC', fontSize: '14px' }}>Verified listing</span>
          <button onClick={() => setStep('main')} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: '12px' }}>Back</button>
        </div>

        <div style={{ padding: '10px', background: 'rgba(251,191,36,0.08)', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.2)' }}>
          <div style={{ fontSize: '11px', color: '#FBBF24', marginBottom: '4px', fontWeight: 600 }}>Any 3 of 5</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {['KYC/KYB', '10K+ X', 'Press', 'Accelerator', 'GitHub'].map((c, i) => (
              <span key={i} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(251,191,36,0.1)', color: '#FBBF24' }}>{c}</span>
            ))}
          </div>
        </div>

        <input type="email" value={verificationForm.email} onChange={(e) => setVerificationForm({ ...verificationForm, email: e.target.value })} placeholder="Contact email *" style={inputStyle} />
        <input value={verificationForm.xProfile} onChange={(e) => setVerificationForm({ ...verificationForm, xProfile: e.target.value })} placeholder="X profile *" style={inputStyle} />
        <input value={verificationForm.founderIdentity} onChange={(e) => setVerificationForm({ ...verificationForm, founderIdentity: e.target.value })} placeholder="Founder LinkedIn / KYC *" style={inputStyle} />
        <input value={verificationForm.githubProfile} onChange={(e) => setVerificationForm({ ...verificationForm, githubProfile: e.target.value })} placeholder="GitHub profile *" style={inputStyle} />
        <input value={verificationForm.pressCoverage} onChange={(e) => setVerificationForm({ ...verificationForm, pressCoverage: e.target.value })} placeholder="Press coverage" style={inputStyle} />
        <input value={verificationForm.institutionalBacking} onChange={(e) => setVerificationForm({ ...verificationForm, institutionalBacking: e.target.value })} placeholder="Accelerator backing" style={inputStyle} />

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
          <input type="checkbox" checked={verificationForm.disclaimerAccepted} onChange={(e) => setVerificationForm({ ...verificationForm, disclaimerAccepted: e.target.checked })} style={{ marginTop: '2px', accentColor: '#8B5CF6' }} />
          <span style={{ fontSize: '9px', color: '#64748B', lineHeight: '1.5' }}>
            A "Verified" label is not an endorsement, recommendation, or opinion by NoVC about any project.
          </span>
        </label>

        <button
          onClick={() => setStep('main')}
          disabled={!(verificationForm.email && verificationForm.xProfile && verificationForm.founderIdentity && verificationForm.githubProfile && verificationForm.disclaimerAccepted)}
          style={{
            ...btnStyle,
            background: (verificationForm.email && verificationForm.xProfile && verificationForm.founderIdentity && verificationForm.githubProfile && verificationForm.disclaimerAccepted)
              ? 'linear-gradient(135deg, #8B5CF6, #6366F1)'
              : '#2d2d44',
            opacity: (verificationForm.email && verificationForm.xProfile && verificationForm.founderIdentity && verificationForm.githubProfile && verificationForm.disclaimerAccepted) ? 1 : 0.5
          }}
        >
          Apply
        </button>
      </div>
    )
  }

  if (step === 'complete') {
    return (
      <>
        <ConfettiBurst active={confettiActive} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#4ADE80', fontSize: '16px' }}>&#10003;</span>
            <span style={{ fontWeight: 600, color: '#F8FAFC', fontSize: '14px' }}>Round is live</span>
          </div>

          {listing.name && (
            <div style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(96,165,250,0.06))', borderRadius: '8px', padding: '12px', border: '1px solid rgba(139,92,246,0.2)' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#F8FAFC', marginBottom: '2px' }}>{listing.name}</div>
              <div style={{ fontSize: '11px', color: '#A78BFA' }}>{listing.roundType}</div>
            </div>
          )}

          <div style={{ background: '#1e1e2e', borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '4px' }}>Address</div>
            <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#60A5FA', wordBreak: 'break-all' }}>
              {createdAuction?.address}
            </div>
          </div>

          {createdAuction?.transactionHash && (
            <a href={getExplorerUrl(chainId, createdAuction.transactionHash)} target="_blank" rel="noopener noreferrer"
              style={{
                display: 'block',
                padding: '8px',
                background: 'rgba(96,165,250,0.1)',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#60A5FA',
                textDecoration: 'none',
                textAlign: 'center'
              }}>
              View on explorer
            </a>
          )}

          {/* ─── Share on X ─── */}
          {shareLink && (
            <div style={{
              padding: '12px',
              background: 'linear-gradient(135deg, rgba(96,165,250,0.10), rgba(139,92,246,0.06))',
              borderRadius: '10px',
              border: '1px solid rgba(96,165,250,0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}>
              <div style={{ fontSize: '11px', color: '#F8FAFC', fontWeight: 600 }}>
                Announce it
              </div>
              <div style={{ fontSize: '10px', color: '#94A3B8', lineHeight: 1.5 }}>
                Share this round on X. Anyone with the link can back it.
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <a
                  href={shareLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'linear-gradient(135deg, #1D9BF0, #0A7BBF)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 700,
                    textAlign: 'center',
                    textDecoration: 'none',
                  }}
                >
                  Post on X →
                </a>
                <button
                  onClick={handleCopyShareUrl}
                  style={{
                    padding: '10px 14px',
                    background: copied ? 'rgba(74,222,128,0.15)' : '#1e1e2e',
                    border: copied ? '1px solid rgba(74,222,128,0.3)' : '1px solid #2d2d44',
                    borderRadius: '8px',
                    color: copied ? '#4ADE80' : '#F8FAFC',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {copied ? 'Copied ✓' : 'Copy link'}
                </button>
              </div>
            </div>
          )}

          {auctionAddress && (
            <MockTokenMintPanel auctionAddress={auctionAddress} onMinted={() => setSuccess('Round funded with 2M starter shares')} />
          )}

          <button onClick={handleReset} style={{ ...btnStyle, background: 'linear-gradient(135deg, #6366F1, #4F46E5)' }}>
            Start another
          </button>
        </div>
      </>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {!isConnected && (
        <div style={{ padding: '8px', background: 'rgba(251,191,36,0.1)', borderRadius: '6px', fontSize: '11px', color: '#FBBF24' }}>
          Connect to start a round
        </div>
      )}

      <div style={{
        padding: '8px 12px',
        background: 'rgba(139,92,246,0.06)',
        borderRadius: '8px',
        border: '1px solid rgba(139,92,246,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <span style={{ fontSize: '11px', color: '#94A3B8' }}>
          Want a Verified listing?{' '}
          <span onClick={() => setStep('verification')} style={{ color: '#A78BFA', cursor: 'pointer', textDecoration: 'underline' }}>
            Apply
          </span>
        </span>
      </div>

      {/* ── Listing section ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#A78BFA', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          Listing
        </div>

        <div>
          <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '3px' }}>Company name</div>
          <input
            type="text"
            value={listing.name}
            onChange={(e) => setListing(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g. Lumina Protocol"
            maxLength={60}
            style={inputStyle}
          />
        </div>

        <div>
          <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '3px' }}>Round type</div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {ROUND_TYPES.map((rt) => (
              <button
                key={rt}
                type="button"
                onClick={() => setListing(prev => ({ ...prev, roundType: rt }))}
                style={{
                  flex: 1,
                  padding: '8px 4px',
                  background: listing.roundType === rt ? 'rgba(139,92,246,0.2)' : '#1e1e2e',
                  border: listing.roundType === rt ? '1px solid rgba(139,92,246,0.5)' : '1px solid #2d2d44',
                  borderRadius: '6px',
                  color: listing.roundType === rt ? '#F8FAFC' : '#94A3B8',
                  fontSize: '11px',
                  fontWeight: listing.roundType === rt ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {rt}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '3px' }}>One-line tagline</div>
          <input
            type="text"
            value={listing.tagline}
            onChange={(e) => setListing(prev => ({ ...prev, tagline: e.target.value }))}
            placeholder="e.g. Decentralized AI inference"
            maxLength={90}
            style={inputStyle}
          />
        </div>

        <div>
          <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '3px' }}>Category</div>
          <input
            type="text"
            value={listing.category}
            onChange={(e) => setListing(prev => ({ ...prev, category: e.target.value }))}
            placeholder="e.g. AI / DePIN"
            maxLength={40}
            style={inputStyle}
          />
        </div>

        <div>
          <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '3px' }}>Description</div>
          <textarea
            value={listing.description}
            onChange={(e) => setListing(prev => ({ ...prev, description: e.target.value }))}
            placeholder="What does the company do? Keep it short."
            maxLength={400}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' as const, fontFamily: 'inherit' }}
          />
        </div>
      </div>

      <div style={{ borderTop: '1px solid #2d2d44', paddingTop: '8px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#60A5FA', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '8px' }}>
          Round terms
        </div>
      </div>

      {isConnected && chainId === MONAD_TESTNET_ID && !auctionAddress && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '14px' }}>&#128167;</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#F8FAFC' }}>Starter shares</span>
            </div>
            <span style={{ fontSize: '9px', color: '#64748B' }}>Required</span>
          </div>
          <button
            onClick={handleMintTokens}
            disabled={mintingTokens}
            style={{
              padding: '10px',
              background: mintingTokens ? '#1e1e2e' : 'linear-gradient(135deg, #10B981, #059669)',
              border: mintingTokens ? '1px solid #2d2d44' : 'none',
              borderRadius: '8px',
              color: '#fff',
              fontWeight: 600,
              fontSize: '12px',
              cursor: mintingTokens ? 'wait' : 'pointer',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              opacity: mintingTokens ? 0.7 : 1
            }}
          >
            {mintingTokens ? 'Requesting...' : 'Get 2,000,000 shares'}
          </button>
          {mintSuccess && <div style={{ fontSize: '11px', color: '#4ADE80', textAlign: 'center' }}>{mintSuccess}</div>}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '3px' }}>Opens in</div>
          <input
            type="number"
            value={params.startDelayBlocks}
            onChange={(e) => handleParamChange('startDelayBlocks', e.target.value)}
            min="2"
            max="10000"
            style={inputStyle}
          />
          <div style={{ fontSize: '9px', color: '#475569', marginTop: '1px' }}>
            ~{(parseInt(params.startDelayBlocks || '5') * 2 / 60).toFixed(1)}m
          </div>
        </div>
        <div>
          <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '3px' }}>Lasts for</div>
          <input
            type="number"
            value={params.durationBlocks}
            onChange={(e) => handleParamChange('durationBlocks', e.target.value)}
            min="10"
            max="100000"
            style={inputStyle}
          />
          <div style={{ fontSize: '9px', color: '#475569', marginTop: '1px' }}>
            ~{(parseInt(params.durationBlocks || '100') * 2 / 60).toFixed(1)}m
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '3px' }}>Price step</div>
          <input
            type="text"
            inputMode="decimal"
            value={params.tickSpacing}
            onChange={(e) => handleParamChange('tickSpacing', e.target.value)}
            onBlur={() => handleBlur('tickSpacing')}
            placeholder="0.01"
            style={inputStyle}
          />
        </div>
        <div>
          <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '3px' }}>Starting price</div>
          <input
            type="text"
            inputMode="decimal"
            value={params.floorPrice}
            onChange={(e) => handleParamChange('floorPrice', e.target.value)}
            onBlur={() => handleBlur('floorPrice')}
            placeholder="0.01"
            style={inputStyle}
          />
        </div>
        <div>
          <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '3px' }}>Shares</div>
          <input
            type="number"
            value={params.auctionTokenAmount}
            onChange={(e) => handleParamChange('auctionTokenAmount', e.target.value)}
            min="100"
            step="100"
            style={inputStyle}
          />
        </div>
      </div>

      {(() => {
        const fp = parseFloat(params.floorPrice) || 0
        const ta = parseFloat(params.auctionTokenAmount) || 0
        const potentialRaise = fp * ta
        const requiredRaise = potentialRaise * 0.8
        if (potentialRaise > 0) {
          return (
            <div style={{ padding: '8px', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.15)', borderRadius: '6px', fontSize: '11px', color: '#94A3B8', lineHeight: 1.6 }}>
              Succeeds if backers commit ≥ {requiredRaise.toFixed(2)}. Below that, everyone gets refunded.
            </div>
          )
        }
        return null
      })()}

      {error && !error.includes('ETH') && (
        <div style={{ padding: '8px', background: 'rgba(239,68,68,0.1)', borderRadius: '6px', fontSize: '11px', color: '#F87171' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: '8px', background: 'rgba(34,197,94,0.1)', borderRadius: '6px', fontSize: '11px', color: '#4ADE80' }}>
          {success}
        </div>
      )}

      <button
        onClick={handleCreateAuction}
        disabled={!isConnected || status === 'creating' || chainId !== MONAD_TESTNET_ID}
        style={{ ...btnStyle, opacity: (!isConnected || status === 'creating') ? 0.6 : 1 }}
      >
        {status === 'creating' ? (
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <span style={{
              display: 'inline-block',
              width: '16px',
              height: '16px',
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: '#fff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            Starting...
          </span>
        ) : 'Start the round'}
      </button>

      <div style={{ fontSize: '10px', color: '#475569', textAlign: 'center' }}>
        Factory: {CONTRACTS.FACTORY?.slice(0, 10)}...{CONTRACTS.FACTORY?.slice(-4)}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { to { transform: rotate(360deg); } }` }} />
    </div>
  )
}
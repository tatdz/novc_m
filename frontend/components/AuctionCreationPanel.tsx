//components/AuctionCreationPanel.tsx
'use client'

import { useState, useEffect } from 'react'
import { useAccount, useWalletClient, usePublicClient, useChainId } from 'wagmi'
import { type Address, parseUnits } from 'viem'
import { CONTRACTS } from '@/lib/contracts'
import { createNewAuction } from '@/lib/contract-interactions'
import { useAuctionStore } from '@/lib/auctionStore'
import { switchChain } from '@/lib/wallet-connector'
import { getChainName } from '@/lib/contracts'
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
  width: '100%' 
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

function getExplorerUrl(chainId: number, txHash: string): string {
  return `https://testnet.monadscan.com/tx/${txHash}`
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
  
  const [createdAuction, setCreatedAuction] = useState<{
    address: string
    transactionHash: string
  } | null>(null)
  const [auctionAddress, setAuctionAddress] = useState<Address | undefined>()
  
  const [mintingTokens, setMintingTokens] = useState(false)
  const [mintSuccess, setMintSuccess] = useState('')
  
  const { addAuction } = useAuctionStore()

  // Helper function to normalize decimal inputs
  const normalizeDecimal = (value: string): string => {
    // Replace comma with dot
    let normalized = value.replace(',', '.');
    
    // Remove any non-numeric characters except dot and minus
    normalized = normalized.replace(/[^\d.-]/g, '');
    
    // Ensure only one dot
    const parts = normalized.split('.');
    if (parts.length > 2) {
      normalized = parts[0] + '.' + parts.slice(1).join('');
    }
    
    // Remove leading zeros
    normalized = normalized.replace(/^0+(?=\d)/, '');
    
    // If it starts with just a dot, add a leading zero
    if (normalized.startsWith('.')) {
      normalized = '0' + normalized;
    }
    
    // If it's empty or just a minus, default to 0.01
    if (normalized === '' || normalized === '-' || normalized === '.') {
      return '0.01';
    }
    
    return normalized;
  }

  const handleParamChange = (field: string, value: string) => {
    if (field === 'tickSpacing' || field === 'floorPrice') {
      // For decimal fields, allow typing but normalize on blur
      setParams(prev => ({ ...prev, [field]: value }));
    } else {
      // For integer fields, only allow numbers
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
          Switch to Monad testnet
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
          {isSwitching ? 'Switching...' : 'Switch Network'}
        </button>
      </div>
    )
  }

  const validateParams = (): string | null => {
    const startDelay = parseInt(params.startDelayBlocks)
    const duration = parseInt(params.durationBlocks)
    
    // Normalize and parse decimal values
    const tickSpacing = parseFloat(normalizeDecimal(params.tickSpacing))
    const floorPrice = parseFloat(normalizeDecimal(params.floorPrice))
    const tokenAmount = parseInt(params.auctionTokenAmount)
    
    if (isNaN(startDelay) || startDelay < 2 || startDelay > 10000) {
      return 'Start delay must be between 2 and 10000 blocks'
    }
    if (isNaN(duration) || duration < 10 || duration > 100000) {
      return 'Duration must be between 10 and 100000 blocks'
    }
    if (isNaN(tickSpacing) || tickSpacing < 0.01 || tickSpacing > 1) {
      return 'Tick spacing must be between 0.01 and 1 USDC'
    }
    if (isNaN(floorPrice) || floorPrice < 0.01 || floorPrice > 1000) {
      return 'Floor price must be between 0.01 and 1000 USDC'
    }
    if (isNaN(tokenAmount) || tokenAmount < 100 || tokenAmount > 1000000000) {
      return 'Token amount must be between 100 and 1,000,000,000'
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
        setMintSuccess('2,000,000 RocketClaw tokens received!')
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
    
    // Normalize all inputs before validation
    const normalizedParams = {
      startDelayBlocks: params.startDelayBlocks,
      durationBlocks: params.durationBlocks,
      tickSpacing: normalizeDecimal(params.tickSpacing),
      floorPrice: normalizeDecimal(params.floorPrice),
      auctionTokenAmount: params.auctionTokenAmount,
    }
    
    console.log('[AuctionCreation] Normalized params:', normalizedParams)
    
    const validationError = validateParams()
    if (validationError) { 
      setError(validationError); 
      return 
    }
    
    try {
      setStatus('creating')
      setError('')
      setSuccess('Creating auction...')

      const result = await createNewAuction(walletClient, normalizedParams)
      
      setCreatedAuction({ address: result.auctionAddress, transactionHash: result.transactionHash })
      setAuctionAddress(result.auctionAddress as Address)
      setSuccess('Auction created!')
      
      addAuction({
        address: result.auctionAddress as Address,
        creator: address,
        floorPrice: parseUnits(normalizedParams.floorPrice, 6),
        tickSpacing: parseUnits(normalizedParams.tickSpacing, 6),
        startBlock: result.startBlock,
        endBlock: result.endBlock,
        jobId: undefined,
      })
      
      localStorage.setItem(`usdc-auction-${result.auctionAddress.toLowerCase()}`, JSON.stringify({
        address: result.auctionAddress,
        txHash: result.transactionHash,
        timestamp: Date.now(),
        chainId, 
        currency: 'USDC',
        floorPrice: normalizedParams.floorPrice + ' USDC',
        tickSpacing: normalizedParams.tickSpacing + ' USDC',
        creator: address
      }))
      
      onAuctionCreated?.(result.auctionAddress, result.auctionAddress as Address)
      setStep('complete')
      setStatus('complete')
      
    } catch (err: any) {
      console.error('[AuctionCreation] Error:', err)
      setError(err.message || 'Failed to create auction')
      setStatus('idle')
    }
  }

  const handleReset = () => {
    setStep('main')
    setStatus('idle')
    setCreatedAuction(null)
    setAuctionAddress(undefined)
    setError('')
    setSuccess('')
    setParams({ 
      startDelayBlocks: '5', 
      durationBlocks: '100', 
      tickSpacing: '0.01', 
      floorPrice: '0.01', 
      auctionTokenAmount: '1000' 
    })
  }

  if (step === 'verification') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, color: '#F8FAFC', fontSize: '14px' }}>Verified Listing Application</span>
          <button onClick={() => setStep('main')} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: '12px' }}>Back</button>
        </div>

        <div style={{ padding: '10px', background: 'rgba(251,191,36,0.08)', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.2)' }}>
          <div style={{ fontSize: '11px', color: '#FBBF24', marginBottom: '4px', fontWeight: 600 }}>Criteria (3 of 5 required)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {['KYC/KYB', '10K+ X', 'Press', 'Accelerator', 'GitHub'].map((c, i) => (
              <span key={i} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(251,191,36,0.1)', color: '#FBBF24' }}>{c}</span>
            ))}
          </div>
        </div>

        <input type="email" value={verificationForm.email} onChange={(e) => setVerificationForm({...verificationForm, email: e.target.value})} placeholder="Contact email *" style={inputStyle} />
        <input value={verificationForm.xProfile} onChange={(e) => setVerificationForm({...verificationForm, xProfile: e.target.value})} placeholder="X profile (10K+ followers) *" style={inputStyle} />
        <input value={verificationForm.founderIdentity} onChange={(e) => setVerificationForm({...verificationForm, founderIdentity: e.target.value})} placeholder="Founder LinkedIn / KYC *" style={inputStyle} />
        <input value={verificationForm.githubProfile} onChange={(e) => setVerificationForm({...verificationForm, githubProfile: e.target.value})} placeholder="GitHub profile *" style={inputStyle} />
        <input value={verificationForm.pressCoverage} onChange={(e) => setVerificationForm({...verificationForm, pressCoverage: e.target.value})} placeholder="Press coverage (optional)" style={inputStyle} />
        <input value={verificationForm.institutionalBacking} onChange={(e) => setVerificationForm({...verificationForm, institutionalBacking: e.target.value})} placeholder="Accelerator backing (optional)" style={inputStyle} />

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
          <input type="checkbox" checked={verificationForm.disclaimerAccepted} onChange={(e) => setVerificationForm({...verificationForm, disclaimerAccepted: e.target.checked})} style={{ marginTop: '2px', accentColor: '#8B5CF6' }} />
          <span style={{ fontSize: '9px', color: '#64748B', lineHeight: '1.5' }}>
            A "Verified" label does not constitute a recommendation, endorsement, or opinion by NoVC about any token, project, or auction.
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
          Submit Application
        </button>
      </div>
    )
  }

  if (step === 'complete') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#4ADE80', fontSize: '16px' }}>&#10003;</span>
          <span style={{ fontWeight: 600, color: '#F8FAFC', fontSize: '14px' }}>Auction Created</span>
        </div>
        
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
            View on Uniscan
          </a>
        )}

        {auctionAddress && (
          <MockTokenMintPanel auctionAddress={auctionAddress} onMinted={() => setSuccess('Auction funded with 2M RocketClaw!')} />
        )}
        
        <button onClick={handleReset} style={{ ...btnStyle, background: 'linear-gradient(135deg, #6366F1, #4F46E5)' }}>
          Create Another
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {!isConnected && (
        <div style={{ padding: '8px', background: 'rgba(251,191,36,0.1)', borderRadius: '6px', fontSize: '11px', color: '#FBBF24' }}>
          Connect wallet to create auction
        </div>
      )}

      {/* Verified Listing Link */}
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
          To be evaluated for a Verified listing, please{' '}
          <span onClick={() => setStep('verification')} style={{ color: '#A78BFA', cursor: 'pointer', textDecoration: 'underline' }}>
            complete this form
          </span>
        </span>
      </div>
      
      {/* Faucet - Minimal */}
      {isConnected && chainId === MONAD_TESTNET_ID && !auctionAddress && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '14px' }}>&#128167;</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#F8FAFC' }}>RocketClaw Token Faucet</span>
            </div>
            <span style={{ fontSize: '9px', color: '#64748B' }}>Required for auction</span>
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
            {mintingTokens ? 'Requesting...' : 'Get 2,000,000 RocketClaw Tokens'}
          </button>
          {mintSuccess && <div style={{ fontSize: '11px', color: '#4ADE80', textAlign: 'center' }}>{mintSuccess}</div>}
        </div>
      )}
      
      {/* Parameters */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '3px' }}>Start Delay (blocks)</div>
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
          <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '3px' }}>Duration (blocks)</div>
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
          <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '3px' }}>Tick Spacing</div>
          <input 
            type="text" 
            inputMode="decimal"
            value={params.tickSpacing} 
            onChange={(e) => handleParamChange('tickSpacing', e.target.value)}
            onBlur={() => handleBlur('tickSpacing')}
            placeholder="0.01" 
            style={inputStyle} 
          />
          <div style={{ fontSize: '9px', color: '#475569', marginTop: '1px' }}>USDC (min 0.01)</div>
        </div>
        <div>
          <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '3px' }}>Floor Price</div>
          <input 
            type="text" 
            inputMode="decimal"
            value={params.floorPrice} 
            onChange={(e) => handleParamChange('floorPrice', e.target.value)}
            onBlur={() => handleBlur('floorPrice')}
            placeholder="0.01" 
            style={inputStyle} 
          />
          <div style={{ fontSize: '9px', color: '#475569', marginTop: '1px' }}>USDC (min 0.01)</div>
        </div>
        <div>
          <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '3px' }}>Tokens</div>
          <input 
            type="number" 
            value={params.auctionTokenAmount} 
            onChange={(e) => handleParamChange('auctionTokenAmount', e.target.value)} 
            min="100" 
            step="100"
            style={inputStyle} 
          />
          <div style={{ fontSize: '9px', color: '#475569', marginTop: '1px' }}>RocketClaw</div>
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
              <span style={{ color: '#60A5FA', fontWeight: 600 }}>Graduation threshold:</span> {requiredRaise.toFixed(2)} USDC (80% of {potentialRaise.toFixed(2)} USDC max raise).
              Bids totaling {'>='} {requiredRaise.toFixed(2)} USDC will graduate the auction, enabling Sweep.
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
            Creating...
          </span>
        ) : 'Create Auction'}
      </button>

      <div style={{ fontSize: '10px', color: '#475569', textAlign: 'center' }}>
        Factory: {CONTRACTS.FACTORY?.slice(0, 10)}...{CONTRACTS.FACTORY?.slice(-4)}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { to { transform: rotate(360deg); } }` }} />
    </div>
  )
}
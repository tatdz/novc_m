// components/HookAuctionIntegration.tsx
'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { type Address, formatUnits, parseUnits } from 'viem'
import { useAngelPool } from '@/hooks/useAngelPool'

interface HookAuctionIntegrationProps {
  auctionAddress: Address
  auctionDetails: {
    floorPrice: string
    tickSpacing: string
    isActive: boolean
  }
  onBidSubmitted?: (bidId: string) => void
}

const btnStyle = { 
  padding: '8px 12px', 
  background: 'linear-gradient(135deg, #8B5CF6, #6366F1)', 
  border: 'none', 
  borderRadius: '6px', 
  color: '#fff', 
  fontWeight: 500, 
  cursor: 'pointer', 
  fontSize: '12px' 
}

const btnOutlineStyle = { 
  padding: '8px 12px', 
  background: 'transparent', 
  border: '1px solid #2d2d44', 
  borderRadius: '6px', 
  color: '#F8FAFC', 
  fontWeight: 400, 
  cursor: 'pointer', 
  fontSize: '12px' 
}

export function HookAuctionIntegration({ 
  auctionAddress, 
  auctionDetails,
  onBidSubmitted 
}: HookAuctionIntegrationProps) {
  const { address, isConnected } = useAccount()
  const { 
    hookContract,
    poolInfo,
    investorInfo,
    proposeAuction,
    voteOnAuction,
    executeAuction, // FIXED: Changed from executeAuctionInvestment
    getAuctionDetails,
    getPoolAuctionInvestments,
    getPoolBids,
    isPoolInitialized,
    error: poolError,
    clearError,
    loading: poolLoading,
    refreshPoolInfo
  } = useAngelPool()

  const [poolAuctionId, setPoolAuctionId] = useState<number | null>(null)
  const [poolAuctionDetails, setPoolAuctionDetails] = useState<any>(null)
  const [poolBids, setPoolBids] = useState<any[]>([])
  const [investmentAmount, setInvestmentAmount] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [voteStatus, setVoteStatus] = useState<'yes' | 'no' | null>(null)
  const [loading, setLoading] = useState(false)
  const [showProposalForm, setShowProposalForm] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [initialCheckDone, setInitialCheckDone] = useState(false)
  const [allProposals, setAllProposals] = useState<any[]>([])

  // Clear errors when component unmounts or auction changes
  useEffect(() => {
    setLocalError(null)
    clearError?.()
    setInitialCheckDone(false)
    setPoolAuctionId(null)
    setPoolAuctionDetails(null)
    setPoolBids([])
    setVoteStatus(null)
    setAllProposals([])
  }, [auctionAddress, clearError])

  // Check for existing proposals
  useEffect(() => {
    const checkExisting = async () => {
      if (!hookContract || !getPoolAuctionInvestments || !getAuctionDetails || !getPoolBids || !isPoolInitialized) {
        return
      }
      
      if (!address || !isConnected) return
      
      try {
        setLocalError(null)
        console.log('[HookAuction] Checking existing proposals for:', auctionAddress)
        
        const auctionIds = await getPoolAuctionInvestments()
        console.log('[HookAuction] Found auction IDs:', auctionIds)
        
        // Find ALL proposals for this auction address
        const proposalsForThisAuction = []
        
        for (const id of auctionIds) {
          try {
            const details = await getAuctionDetails(id)
            if (details?.auctionAddress?.toLowerCase() === auctionAddress.toLowerCase()) {
              console.log('[HookAuction] Found proposal:', { id, details })
              proposalsForThisAuction.push({ id, details })
            }
          } catch (detailErr) {
            console.log('[HookAuction] Failed to get details for auction ID:', id)
            continue
          }
        }
        
        setAllProposals(proposalsForThisAuction)
        
        if (proposalsForThisAuction.length > 0) {
          // Sort by auctionId to get the latest (assuming higher ID = newer)
          proposalsForThisAuction.sort((a, b) => b.id - a.id)
          
          const latestProposal = proposalsForThisAuction[0]
          console.log('[HookAuction] Using latest proposal:', latestProposal.id, 'with amount:', latestProposal.details.totalInvestedUSDC)
          
          setPoolAuctionId(latestProposal.id)
          setPoolAuctionDetails(latestProposal.details)
          
          // Try to get bids, but don't fail if none exist
          try {
            const bids = await getPoolBids(auctionAddress)
            setPoolBids(bids || [])
          } catch (bidErr) {
            console.log('[HookAuction] No bids found for this auction')
            setPoolBids([])
          }
        } else {
          console.log('[HookAuction] No existing proposal found for this auction')
          setPoolBids([])
        }
        
      } catch (err: any) {
        // Only log, don't show error to user - this is expected when no proposals exist
        console.log('[HookAuction] No existing proposals found:', err?.message || '')
        setPoolBids([])
      } finally {
        setInitialCheckDone(true)
      }
    }
    
    if (address && isConnected && isPoolInitialized && !initialCheckDone) {
      checkExisting()
    }
  }, [address, isConnected, auctionAddress, hookContract, getPoolAuctionInvestments, getAuctionDetails, getPoolBids, isPoolInitialized, initialCheckDone])

  // Calculate recommended values
  const recommendedAmount = Math.min(
    parseFloat(auctionDetails?.floorPrice || '0.01') * 10,
    parseFloat(poolInfo?.auctionSlice || '0') || 1.0
  ).toFixed(2)
  
  const recommendedPrice = (parseFloat(auctionDetails?.floorPrice || '0.01') * 1.2).toFixed(2)

  // Check if pool has enough auction funds
  const hasEnoughFunds = poolInfo && parseFloat(poolInfo.auctionSlice) > 0
  const auctionSliceAmount = poolInfo ? parseFloat(poolInfo.auctionSlice).toFixed(2) : '0.00'
  
  // Check if the current proposal has funds
  const proposalHasFunds = poolAuctionDetails && parseFloat(poolAuctionDetails.totalInvestedUSDC || '0') > 0

  const handlePropose = async () => {
    if (!investmentAmount || !maxPrice || !proposeAuction) return
    
    // Validate amount
    const amountNum = parseFloat(investmentAmount)
    if (isNaN(amountNum) || amountNum <= 0) {
      setLocalError('Please enter a valid amount')
      return
    }
    
    // Validate against pool's auction slice
    const auctionSlice = poolInfo ? parseFloat(poolInfo.auctionSlice) : 0
    
    if (amountNum > auctionSlice) {
      setLocalError(`Insufficient auction funds. Available: $${auctionSlice.toFixed(2)}. Requested: $${amountNum.toFixed(2)}`)
      return
    }

    // Validate price
    const priceNum = parseFloat(maxPrice)
    const floorNum = parseFloat(auctionDetails?.floorPrice || '0.01')
    if (priceNum < floorNum) {
      setLocalError(`Max price must be at least floor price (${floorNum} USDC)`)
      return
    }

    try {
      setLoading(true)
      setLocalError(null)
      clearError?.()
      
      const amountInUSDC = parseUnits(investmentAmount, 6)
      const priceInUSDC = parseUnits(maxPrice, 6)
      
      console.log('[HookAuction] Proposing auction:', {
        auctionAddress,
        amount: investmentAmount,
        amountWei: amountInUSDC.toString(),
        maxPrice
      })
      
      const auctionId = await proposeAuction(
        auctionAddress,
        amountInUSDC.toString(),
        priceInUSDC.toString()
      )
      
      console.log('[HookAuction] Proposal created with ID:', auctionId)
      
      setPoolAuctionId(Number(auctionId))
      setShowProposalForm(false)
      setInvestmentAmount('')
      setMaxPrice('')
      
      // Refresh pool info to update available funds
      await refreshPoolInfo?.()
      
      // Get fresh details
      if (getAuctionDetails && auctionId) {
        const details = await getAuctionDetails(Number(auctionId))
        setPoolAuctionDetails(details)
      }
      
    } catch (err: any) {
      console.error('[HookAuction] Proposal failed:', err)
      let errorMsg = err?.message || 'Proposal failed'
      
      if (errorMsg.includes('Not enough auction funds')) {
        errorMsg = err.message // Already formatted with available amount
      } else if (errorMsg.includes('already exists')) {
        errorMsg = 'A proposal for this auction already exists'
      } else if (errorMsg.includes('invalid amount')) {
        errorMsg = 'Invalid bid amount'
      } else if (errorMsg.includes('user rejected')) {
        errorMsg = 'Transaction cancelled'
      }
      
      setLocalError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleVote = async (voteFor: boolean) => {
    if (!poolAuctionId || !voteOnAuction) return
    
    // Check if proposal has funds
    if (!proposalHasFunds) {
      setLocalError('This proposal has no funds allocated. Please create a new proposal with a valid amount.')
      return
    }
    
    try {
      setLoading(true)
      setLocalError(null)
      clearError?.()
      
      console.log(`[HookAuction] Voting ${voteFor ? 'YES' : 'NO'} on auction ${poolAuctionId} (proposal amount: $${poolAuctionDetails?.totalInvestedUSDC})`)
      
      await voteOnAuction(poolAuctionId, voteFor)
      setVoteStatus(voteFor ? 'yes' : 'no')
      
      // Refresh details after successful vote
      if (getAuctionDetails) {
        const details = await getAuctionDetails(poolAuctionId)
        setPoolAuctionDetails(details)
      }
      
      // Refresh investor info to update voting power
      await refreshPoolInfo?.()
      
    } catch (err: any) {
      console.error('[HookAuction] Vote failed:', err)
      
      // Set user-friendly error message
      let errorMsg = err?.message || 'Vote failed'
      
      if (errorMsg.includes('TransferFromFailed') || errorMsg.includes('0x7939f424')) {
        errorMsg = '⚠️ This proposal has no funds allocated. Please create a new proposal with a valid amount.'
      } else if (errorMsg.includes('voting ended') || errorMsg.includes('0x5aabfefb')) {
        errorMsg = 'Voting period has ended for this proposal'
      } else if (errorMsg.includes('already voted') || errorMsg.includes('0xd9f31a6d')) {
        errorMsg = 'You have already voted on this proposal'
      } else if (errorMsg.includes('voting power') || errorMsg.includes('0x9b9cfe45')) {
        errorMsg = 'You do not have enough voting power in the pool'
      } else if (errorMsg.includes('Not enough auction funds')) {
        errorMsg = 'The pool does not have enough funds allocated. Please deposit and allocate USDC first.'
      } else if (errorMsg.includes('user rejected')) {
        errorMsg = 'Transaction cancelled'
      }
      
      setLocalError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleExecute = async () => {
    if (!poolAuctionId || !executeAuction) return // FIXED: Changed from executeAuctionInvestment
    
    try {
      setLoading(true)
      setLocalError(null)
      clearError?.()
      
      console.log('[HookAuction] Executing auction investment:', poolAuctionId)
      
      const bidId = await executeAuction(poolAuctionId) // FIXED: Changed from executeAuctionInvestment
      console.log('[HookAuction] Execute successful, bid ID:', bidId)
      
      onBidSubmitted?.(bidId)
      
      // Refresh details
      if (getAuctionDetails) {
        const details = await getAuctionDetails(poolAuctionId)
        setPoolAuctionDetails(details)
      }
      
      // Refresh bids
      if (getPoolBids) {
        const bids = await getPoolBids(auctionAddress)
        setPoolBids(bids || [])
      }
      
      // Refresh pool info
      await refreshPoolInfo?.()
      
    } catch (err: any) {
      console.error('[HookAuction] Execute failed:', err)
      let errorMsg = err?.message || 'Execute failed'
      
      if (errorMsg.includes('not passed')) {
        errorMsg = 'Vote threshold not reached. Need at least 60% YES votes.'
      } else if (errorMsg.includes('already executed')) {
        errorMsg = 'This auction has already been executed'
      } else if (errorMsg.includes('voting ended')) {
        errorMsg = 'Voting period has ended'
      }
      
      setLocalError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  // ... rest of the component remains the same (JSX)

  if (!isConnected) {
    return (
      <div style={{ fontSize: '12px', color: '#64748B', textAlign: 'center', padding: '16px' }}>
        Connect wallet to participate
      </div>
    )
  }

  if (!isPoolInitialized) {
    return (
      <div style={{ fontSize: '12px', color: '#64748B', textAlign: 'center', padding: '16px' }}>
        Angel Pool not initialized. Go to Dashboard first.
      </div>
    )
  }

  if (!initialCheckDone && poolLoading) {
    return (
      <div style={{ fontSize: '12px', color: '#64748B', textAlign: 'center', padding: '16px' }}>
        Loading pool data...
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Pool Budget Indicator */}
      {poolInfo && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '12px', 
          background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(99,102,241,0.05))', 
          borderRadius: '8px',
          border: '1px solid rgba(139,92,246,0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#94A3B8' }}>Pool Auction Budget:</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#A78BFA' }}>
              ${auctionSliceAmount}
            </span>
          </div>
          {investorInfo && (
            <div style={{ 
              padding: '4px 8px', 
              background: 'rgba(139,92,246,0.15)', 
              borderRadius: '4px',
              fontSize: '11px',
              color: '#A78BFA',
              fontWeight: 600
            }}>
              Your Vote: {investorInfo.sharePercentage}
            </div>
          )}
        </div>
      )}

      {/* Allocation Status Indicator */}
      {poolInfo && (
        <div style={{ 
          background: '#1e1e2e', 
          borderRadius: '10px', 
          padding: '16px',
          border: '1px solid #2d2d44',
          marginBottom: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ 
                width: '28px', 
                height: '28px', 
                borderRadius: '8px', 
                background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px'
              }}>
                ⚡
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#F8FAFC' }}>
                Pool Allocation Status
              </span>
            </div>
            <a 
              href="/?tab=pool" 
              style={{ 
                padding: '6px 12px',
                background: 'rgba(139,92,246,0.15)',
                borderRadius: '6px',
                color: '#A78BFA',
                fontSize: '11px',
                fontWeight: 600,
                textDecoration: 'none',
                border: '1px solid rgba(139,92,246,0.3)',
                cursor: 'pointer'
              }}
              onClick={(e) => {
                e.preventDefault()
                window.location.href = '/?tab=pool'
              }}
            >
              Manage Pool →
            </a>
          </div>

          {/* Allocation Breakdown */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '2px' }}>Total Pool</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#F8FAFC' }}>
                ${parseFloat(poolInfo.totalValue).toFixed(2)}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '2px' }}>APY Slice (30%)</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#60A5FA' }}>
                ${parseFloat(poolInfo.apySlice).toFixed(2)}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '2px' }}>Auction Slice (70%)</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: parseFloat(poolInfo.auctionSlice) > 0 ? '#4ADE80' : '#F87171' }}>
                ${parseFloat(poolInfo.auctionSlice).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Allocation Progress Bar */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '10px', color: '#64748B' }}>Allocation Progress</span>
              <span style={{ fontSize: '10px', color: '#64748B' }}>
                {parseFloat(poolInfo.auctionSlice) > 0 ? 'Allocated' : 'Not Allocated'}
              </span>
            </div>
            <div style={{ height: '6px', background: '#2d2d44', borderRadius: '3px', overflow: 'hidden' }}>
              <div 
                style={{ 
                  height: '100%', 
                  width: `${(parseFloat(poolInfo.auctionSlice) / parseFloat(poolInfo.totalValue) * 100) || 0}%`, 
                  background: parseFloat(poolInfo.auctionSlice) > 0 
                    ? 'linear-gradient(90deg, #4ADE80, #22C55E)' 
                    : '#F87171',
                  borderRadius: '3px',
                  transition: 'width 0.3s ease'
                }} 
              />
            </div>
          </div>

          {/* Allocation Required Warning */}
          {parseFloat(poolInfo.auctionSlice) <= 0 && (
            <div style={{ 
              padding: '12px', 
              background: 'rgba(251,191,36,0.1)', 
              borderRadius: '8px', 
              border: '1px solid rgba(251,191,36,0.3)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '16px' }}>⚠️</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#FBBF24' }}>
                  Allocation Required
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#94A3B8', lineHeight: '1.6', marginBottom: '12px' }}>
                Your funds are deposited but not allocated. Click the button below to split your deposit into:
                <div style={{ marginTop: '8px', padding: '8px', background: '#1e1e2e', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: '#60A5FA' }}>30% APY Slice</span>
                    <span style={{ color: '#60A5FA', fontWeight: 600 }}>${(parseFloat(poolInfo.totalValue) * 0.3).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#A78BFA' }}>70% Auction Slice</span>
                    <span style={{ color: '#A78BFA', fontWeight: 600 }}>${(parseFloat(poolInfo.totalValue) * 0.7).toFixed(2)}</span>
                  </div>
                </div>
              </div>
              <a 
                href="/?tab=pool" 
                style={{ 
                  display: 'block',
                  textAlign: 'center',
                  padding: '10px',
                  background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 600,
                  textDecoration: 'none'
                }}
                onClick={(e) => {
                  e.preventDefault()
                  window.location.href = '/?tab=pool'
                }}
              >
                Go to Pool Dashboard to Allocate
              </a>
            </div>
          )}

          {/* Success State - Allocated */}
          {parseFloat(poolInfo.auctionSlice) > 0 && (
            <div style={{ 
              padding: '10px', 
              background: 'rgba(74,222,128,0.1)', 
              borderRadius: '6px', 
              border: '1px solid rgba(74,222,128,0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '14px', color: '#4ADE80' }}>✓</span>
              <span style={{ fontSize: '11px', color: '#4ADE80' }}>
                Funds allocated! You can now vote.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Existing Pool Bids */}
      {poolBids.length > 0 && (
        <div style={{ background: '#1e1e2e', borderRadius: '8px', padding: '12px' }}>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '8px', fontWeight: 600 }}>
            Pool Bids
          </div>
          {poolBids.slice(0, 3).map((bid, idx) => (
            <div key={idx} style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              fontSize: '11px', 
              padding: '6px 0',
              borderBottom: idx < poolBids.length - 1 ? '1px solid #2d2d44' : 'none'
            }}>
              <span style={{ color: '#94A3B8' }}>Bid #{bid.id || idx + 1}</span>
              <span style={{ 
                color: bid.claimed ? '#4ADE80' : '#FBBF24',
                fontWeight: 600
              }}>
                {bid.claimed ? '✓ Claimed' : '● Active'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Multiple proposals warning */}
      {allProposals.length > 1 && (
        <div style={{ 
          padding: '10px', 
          background: 'rgba(251,191,36,0.1)', 
          borderRadius: '8px', 
          fontSize: '11px', 
          color: '#FBBF24',
          border: '1px solid rgba(251,191,36,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>⚠️</span>
          <span>
            {allProposals.length} proposals found for this auction. Using latest proposal #{poolAuctionId} with ${poolAuctionDetails?.totalInvestedUSDC || '0'} USDC.
          </span>
        </div>
      )}

      {/* Error Display */}
      {(localError || poolError) && (
        <div style={{ 
          padding: '12px', 
          background: localError?.includes('⚠️') || poolError?.includes('⚠️') 
            ? 'rgba(251,191,36,0.1)' 
            : 'rgba(239,68,68,0.1)', 
          borderRadius: '8px', 
          fontSize: '11px', 
          color: localError?.includes('⚠️') || poolError?.includes('⚠️') ? '#FBBF24' : '#F87171',
          border: localError?.includes('⚠️') || poolError?.includes('⚠️') 
            ? '1px solid rgba(251,191,36,0.2)' 
            : '1px solid rgba(239,68,68,0.2)',
          wordBreak: 'break-word',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          {localError?.includes('⚠️') || poolError?.includes('⚠️') ? '⚠️' : '❌'}
          {localError || poolError}
        </div>
      )}

      {/* No Funds Warning */}
      {!hasEnoughFunds && !poolAuctionId && (
        <div style={{ 
          padding: '12px', 
          background: 'rgba(251,191,36,0.1)', 
          borderRadius: '8px', 
          fontSize: '11px', 
          color: '#FBBF24',
          border: '1px solid rgba(251,191,36,0.2)'
        }}>
          ⚠️ Pool has no funds allocated for auctions. Please deposit and allocate USDC first.
        </div>
      )}

      {/* Proposal Section */}
      {!poolAuctionId ? (
        showProposalForm ? (
          <div style={{ 
            background: '#1e1e2e', 
            borderRadius: '8px', 
            padding: '16px',
            border: '1px solid #2d2d44'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#F8FAFC', marginBottom: '12px' }}>
              Propose Pool Bid
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '4px' }}>
                  Amount (USDC) • Max: ${auctionSliceAmount}
                </div>
                <input
                  type="number"
                  value={investmentAmount}
                  onChange={(e) => setInvestmentAmount(e.target.value)}
                  placeholder={`Recommended: ${recommendedAmount}`}
                  min="0.01"
                  step="0.01"
                  style={{ 
                    padding: '10px', 
                    background: '#12121c', 
                    border: '1px solid #2d2d44', 
                    borderRadius: '6px', 
                    color: '#F8FAFC', 
                    fontSize: '13px',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '4px' }}>
                  Max Price (USDC) • Floor: {auctionDetails?.floorPrice || '0.01'}
                </div>
                <input
                  type="number"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder={`Recommended: ${recommendedPrice}`}
                  min={auctionDetails?.floorPrice || '0.01'}
                  step="0.01"
                  style={{ 
                    padding: '10px', 
                    background: '#12121c', 
                    border: '1px solid #2d2d44', 
                    borderRadius: '6px', 
                    color: '#F8FAFC', 
                    fontSize: '13px',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  onClick={handlePropose}
                  disabled={loading || !investmentAmount || !maxPrice || !hasEnoughFunds}
                  style={{ 
                    ...btnStyle, 
                    flex: 2,
                    opacity: (loading || !investmentAmount || !maxPrice || !hasEnoughFunds) ? 0.5 : 1,
                    padding: '10px'
                  }}
                >
                  {loading ? 'Proposing...' : 'Submit Proposal'}
                </button>
                <button
                  onClick={() => {
                    setShowProposalForm(false)
                    setInvestmentAmount('')
                    setMaxPrice('')
                    setLocalError(null)
                  }}
                  style={{ 
                    ...btnOutlineStyle, 
                    flex: 1,
                    padding: '10px'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowProposalForm(true)}
            style={{ 
              ...btnOutlineStyle,
              padding: '12px',
              width: '100%',
              border: '1px dashed #2d2d44',
              background: 'rgba(139,92,246,0.02)'
            }}
            disabled={!hasEnoughFunds}
          >
            + Propose Pool Bid
          </button>
        )
      ) : (
        <div style={{ 
          background: '#1e1e2e', 
          borderRadius: '8px', 
          padding: '16px',
          border: poolAuctionDetails?.isActive ? '1px solid rgba(74,222,128,0.2)' : '1px solid #2d2d44'
        }}>
          {/* Proposal Header with Amount */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#F8FAFC' }}>
                Proposal #{poolAuctionId}
              </span>
              {poolAuctionDetails?.isActive ? (
                <span style={{ 
                  fontSize: '10px', 
                  padding: '3px 8px', 
                  background: 'rgba(34,197,94,0.15)', 
                  borderRadius: '12px', 
                  color: '#4ADE80',
                  fontWeight: 600
                }}>
                  ● Voting
                </span>
              ) : poolAuctionDetails?.bidId > 0 ? (
                <span style={{ 
                  fontSize: '10px', 
                  padding: '3px 8px', 
                  background: 'rgba(139,92,246,0.15)', 
                  borderRadius: '12px', 
                  color: '#A78BFA',
                  fontWeight: 600
                }}>
                  ✓ Executed
                </span>
              ) : (
                <span style={{ 
                  fontSize: '10px', 
                  padding: '3px 8px', 
                  background: 'rgba(100,116,139,0.15)', 
                  borderRadius: '12px', 
                  color: '#64748B',
                  fontWeight: 600
                }}>
                  ● Ended
                </span>
              )}
            </div>
            {poolAuctionDetails?.totalInvestedUSDC && (
              <div style={{
                padding: '4px 10px',
                background: parseFloat(poolAuctionDetails.totalInvestedUSDC) > 0 
                  ? 'rgba(74,222,128,0.15)' 
                  : 'rgba(251,191,36,0.15)',
                borderRadius: '20px',
                border: parseFloat(poolAuctionDetails.totalInvestedUSDC) > 0 
                  ? '1px solid rgba(74,222,128,0.3)' 
                  : '1px solid rgba(251,191,36,0.3)',
              }}>
                <span style={{ 
                  fontSize: '11px', 
                  color: parseFloat(poolAuctionDetails.totalInvestedUSDC) > 0 ? '#4ADE80' : '#FBBF24', 
                  fontWeight: 600 
                }}>
                  ${poolAuctionDetails.totalInvestedUSDC} USDC
                </span>
              </div>
            )}
          </div>

          {/* Vote Progress */}
          {poolAuctionDetails?.isActive && !poolAuctionDetails?.bidId && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  YES Votes ({poolAuctionDetails.yesVotes || 0}%)
                </span>
                <span style={{ fontSize: '11px', color: '#64748B' }}>
                  NO Votes ({poolAuctionDetails.noVotes || 0}%)
                </span>
              </div>
              <div style={{ 
                height: '8px', 
                background: '#2d2d44', 
                borderRadius: '4px', 
                marginBottom: '12px',
                overflow: 'hidden',
                position: 'relative'
              }}>
                <div 
                  style={{ 
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    height: '100%', 
                    width: `${Math.min(Number(poolAuctionDetails.yesVotes) || 0, 100)}%`, 
                    background: '#4ADE80',
                    borderRadius: '4px 0 0 4px',
                    transition: 'width 0.3s ease'
                  }} 
                />
                <div 
                  style={{ 
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    height: '100%', 
                    width: `${Math.min(Number(poolAuctionDetails.noVotes) || 0, 100)}%`, 
                    background: '#F87171',
                    borderRadius: '0 4px 4px 0',
                    transition: 'width 0.3s ease'
                  }} 
                />
              </div>
              
              {/* 60% threshold indicator */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '16px'
              }}>
                <div style={{ 
                  height: '2px', 
                  width: '60%', 
                  background: 'rgba(251,191,36,0.3)',
                  position: 'relative'
                }}>
                  <div style={{
                    position: 'absolute',
                    right: 0,
                    top: '-4px',
                    width: '2px',
                    height: '10px',
                    background: '#FBBF24'
                  }} />
                </div>
                <span style={{ fontSize: '10px', color: '#FBBF24' }}>60% needed</span>
              </div>
              
              {/* Vote buttons */}
              {!proposalHasFunds ? (
                <div style={{ 
                  padding: '12px', 
                  background: 'rgba(251,191,36,0.1)', 
                  borderRadius: '6px', 
                  fontSize: '11px', 
                  color: '#FBBF24',
                  textAlign: 'center',
                  border: '1px dashed rgba(251,191,36,0.3)'
                }}>
                  ⚠️ This proposal has no funds allocated. Create a new proposal with a valid amount.
                </div>
              ) : voteStatus ? (
                <div style={{ 
                  fontSize: '12px', 
                  color: voteStatus === 'yes' ? '#4ADE80' : '#F87171', 
                  textAlign: 'center', 
                  padding: '10px',
                  background: voteStatus === 'yes' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
                  borderRadius: '8px',
                  fontWeight: 600,
                  border: `1px solid ${voteStatus === 'yes' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`
                }}>
                  You voted {voteStatus === 'yes' ? 'YES' : 'NO'}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleVote(true)}
                    disabled={loading}
                    style={{ 
                      flex: 1,
                      padding: '12px',
                      background: 'rgba(74,222,128,0.15)',
                      border: '1px solid rgba(74,222,128,0.3)',
                      borderRadius: '8px',
                      color: '#4ADE80',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.5 : 1,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    Vote YES
                  </button>
                  <button
                    onClick={() => handleVote(false)}
                    disabled={loading}
                    style={{ 
                      flex: 1,
                      padding: '12px',
                      background: 'rgba(248,113,113,0.08)',
                      border: '1px solid rgba(248,113,113,0.2)',
                      borderRadius: '8px',
                      color: '#F87171',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.5 : 1,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    Vote NO
                  </button>
                </div>
              )}

              {/* Execute button - show if threshold reached */}
              {Number(poolAuctionDetails.yesVotes || 0) >= 60 && !poolAuctionDetails?.bidId && proposalHasFunds && (
                <button
                  onClick={handleExecute}
                  disabled={loading}
                  style={{ 
                    ...btnStyle,
                    marginTop: '12px',
                    width: '100%',
                    padding: '12px',
                    background: 'linear-gradient(135deg, #4ADE80, #22C55E)',
                    color: '#000',
                    fontWeight: 700,
                    opacity: loading ? 0.5 : 1
                  }}
                >
                  {loading ? 'Executing...' : 'Execute Bid ✓'}
                </button>
              )}
            </>
          )}

          {/* Executed Bid Info */}
          {poolAuctionDetails?.bidId > 0 && (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              padding: '12px',
              background: 'rgba(139,92,246,0.1)',
              borderRadius: '6px',
              marginTop: '8px'
            }}>
              <span style={{ fontSize: '11px', color: '#94A3B8' }}>Bid ID:</span>
              <span style={{ 
                fontSize: '12px', 
                fontFamily: 'monospace', 
                color: '#A78BFA',
                fontWeight: 600
              }}>
                #{poolAuctionDetails.bidId}
              </span>
            </div>
          )}

          {/* Deadline info */}
          {poolAuctionDetails?.deadline && Number(poolAuctionDetails.deadline) > 0 && (
            <div style={{ 
              fontSize: '10px', 
              color: '#64748B', 
              marginTop: '8px',
              textAlign: 'right'
            }}>
              Deadline: Block {poolAuctionDetails.deadline}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
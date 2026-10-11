//components/AngelPoolDashboard.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount, useBalance, usePublicClient, useWalletClient } from 'wagmi'
import { parseUnits, formatUnits, type Address } from 'viem'
import { useAngelPool } from '@/hooks/useAngelPool'
import { CONTRACT_ADDRESSES } from '@/lib/abis'
import { CONTRACTS, PYTH_FEEDS } from '@/lib/contracts'
import { useAuctionStore } from '@/lib/auctionStore'
import { createPublicClient, http } from 'viem'
import { monadTestnet } from 'viem/chains'

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

const btnPrimary = { 
  padding: '10px 16px', 
  background: 'linear-gradient(135deg, #8B5CF6, #6366F1)', 
  border: 'none', 
  borderRadius: '8px', 
  color: '#fff', 
  fontWeight: 600 as const, 
  cursor: 'pointer', 
  fontSize: '13px', 
  width: '100%' 
}

const btnSuccess = { 
  padding: '10px 16px', 
  background: 'linear-gradient(135deg, #4ADE80, #22C55E)', 
  border: 'none', 
  borderRadius: '8px', 
  color: '#000', 
  fontWeight: 700 as const, 
  cursor: 'pointer', 
  fontSize: '13px', 
  width: '100%' 
}

interface PythPrice {
  price: string
  conf: string
  expo: number
  publishTime: number
  feedName: string
}

// Contract addresses for swap functionality
const POOL_SWAP_TEST = '0xc4006B415D3625047E039e16C13766483CEE42cD' as Address
const POOL_MANAGER = '0x451D64ab3b650040d2aE1886602b97ed6eDc643d' as Address
const HOOK_ADDRESS = '0x8f93D9b74E8034FfA21bF423A43aD0A67a48BfF0' as Address
const USDC_ADDRESS = '0x534b2f3A21130d7a60830c2Df862319e593943A3' as Address
const DIRECT_SWAP_ADDRESS = '0x5Dd8cFCa08f604da9E5b77031f83519549A5590D' as Address

export function AngelPoolDashboard() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const {
    poolInfo: hookPoolInfo, investorInfo, loading, error, isPoolInitialized, hookContract,
    createAngelPool, depositUSDC, depositETH, withdrawUSDC, withdrawETH,
    allocateSlices, proposeAuction, voteOnAuction, getPoolAuctionInvestments,
    getAuctionDetails, refreshPoolInfo, refreshInvestorInfo, recoverAccounting
  } = useAngelPool()

  const { getAllAuctions } = useAuctionStore()
  const { data: walletClient } = useWalletClient()

  // Original state
  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [depositType, setDepositType] = useState<'usdc' | 'eth'>('usdc')
  const [isAllocating, setIsAllocating] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<'deposit' | 'vote' | 'oracle'>('deposit')
  const [proposalAuction, setProposalAuction] = useState('')
  const [proposalAmount, setProposalAmount] = useState('')
  const [poolAuctions, setPoolAuctions] = useState<any[]>([])
  const [loadingVote, setLoadingVote] = useState(false)
  const [executingBid, setExecutingBid] = useState<number | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [claimingAPY, setClaimingAPY] = useState(false)
  const [currentBlockNumber, setCurrentBlockNumber] = useState<number>(0)
  const [pythPrices, setPythPrices] = useState<PythPrice[]>([])
  const [pythLoading, setPythLoading] = useState(false)
  const [pythError, setPythError] = useState<string | null>(null)
  const [totalSwapFees, setTotalSwapFees] = useState<string | null>(null)
  const [lastAction, setLastAction] = useState<number>(Date.now())

  // New swap state
  const [swapAmount, setSwapAmount] = useState('')
  const [swapStatus, setSwapStatus] = useState<string | null>(null)
  const [swapError, setSwapError] = useState<string | null>(null)
  const [swapTxHash, setSwapTxHash] = useState<string | null>(null)
  const [feesLoading, setFeesLoading] = useState(false)

const HOOK_USDC = '0x534b2f3A21130d7a60830c2Df862319e593943A3' as Address

const { data: usdcBalance } = useBalance({
  address,
  token: HOOK_USDC,
  chainId: CONTRACT_ADDRESSES.CHAIN_ID
})


  // ==================== AUTO-REFRESH EFFECT ====================
  useEffect(() => {
    if (!isConnected) return
    
    const refreshData = async () => {
      try {
        await Promise.all([
          refreshPoolInfo(),
          refreshInvestorInfo(),
          refreshAuctionsFromContract()
        ])
        console.log('[UI] Data refreshed automatically')
      } catch (err) {
        console.error('[UI] Auto-refresh failed:', err)
      }
    }
    
    refreshData()
    const interval = setInterval(refreshData, 10000)
    
    return () => clearInterval(interval)
  }, [isConnected, lastAction, refreshPoolInfo, refreshInvestorInfo])

  // Helper function to trigger refresh after any action
  const triggerRefresh = useCallback(() => {
    setLastAction(Date.now())
  }, [])

  // ==================== AUCTION REFRESH ====================
  const refreshAuctionsFromContract = useCallback(async () => {
    if (!getPoolAuctionInvestments || !getAuctionDetails || !publicClient) {
      console.log('[UI] Cannot refresh auctions: functions not available')
      return
    }
    
    setIsRefreshing(true)
    
    try {
      console.log('[UI] Refreshing auctions from contract...')
      const ids = await getPoolAuctionInvestments()
      console.log('[UI] Contract auction IDs:', ids)
      
      const currentBlock = await publicClient.getBlockNumber()
      setCurrentBlockNumber(Number(currentBlock))
      
      if (!ids || ids.length === 0) {
        console.log('[UI] No auctions found in contract')
        setPoolAuctions([])
        return
      }
      console.log('[UI] Current block:', currentBlock.toString())
      
      const details = await Promise.all(ids.map(async (id: number) => {
        try { 
          const detail = await getAuctionDetails(id)
          
          if (detail && detail.auctionAddress) {
            console.log(`[UI] Auction ${id} state:`, {
              isActive: detail.isActive,
              isExecuted: detail.isExecuted,
              status: detail.status,
              bidId: detail.bidId
            })
            
            try {
              const endBlock = await publicClient.readContract({
                address: detail.auctionAddress,
                abi: [{
                  name: 'endBlock',
                  type: 'function',
                  inputs: [],
                  outputs: [{ type: 'uint64' }],
                  stateMutability: 'view'
                }],
                functionName: 'endBlock'
              }) as bigint
              
              const isEnded = currentBlock >= endBlock
              const wasExecuted = !!detail.isExecuted || detail.status === 'executed' || (detail.bidId && detail.bidId !== '0')
              
              if (isEnded && !wasExecuted) {
                console.log(`[UI] Auction ${id} has ended (endBlock: ${endBlock}) and not executed, filtering out`)
                return null
              }
              
              const isGraduated = await publicClient.readContract({
                address: detail.auctionAddress,
                abi: [{
                  name: 'isGraduated',
                  type: 'function',
                  inputs: [],
                  outputs: [{ type: 'bool' }],
                  stateMutability: 'view'
                }],
                functionName: 'isGraduated'
              }).catch(() => false)
              
              if (isGraduated && !wasExecuted) {
                console.log(`[UI] Auction ${id} has graduated and not executed, filtering out`)
                return null
              }
              
              return {
                ...detail,
                endBlock: endBlock.toString()
              }
            } catch (err) {
              console.log(`[UI] Could not fetch end block for auction ${id}:`, err)
              return detail
            }
          }
          
          return detail 
        } catch (err) {
          console.log(`[UI] Failed to fetch auction ${id}:`, err)
          return null
        }
      }))
      
      const validAuctions = details.filter(Boolean)
      setPoolAuctions(validAuctions)
      console.log('[UI] Set poolAuctions to:', validAuctions.length, 'active auctions')
    } catch (err) {
      console.error('[UI] Failed to refresh auctions:', err)
    } finally {
      setIsRefreshing(false)
    }
  }, [getPoolAuctionInvestments, getAuctionDetails, publicClient])

  // ==================== SWAP FEES FETCH ====================
  const fetchSwapFees = useCallback(async () => {
    if (!publicClient) return
    try {
      const result = await publicClient.readContract({
        address: HOOK_ADDRESS,
        abi: [{
          name: 'totalSwapFeesCollected',
          type: 'function',
          inputs: [],
          outputs: [{ type: 'uint256' }],
          stateMutability: 'view'
        }],
        functionName: 'totalSwapFeesCollected'
      }) as bigint
      
      const formatted = formatUnits(result, 6)
      setTotalSwapFees(formatted)
      console.log('[UI] Total swap fees collected:', formatted, 'USDC')
    } catch (err) {
      console.log('[UI] Could not fetch swap fees')
    }
  }, [publicClient])

  useEffect(() => {
    fetchSwapFees()
    const interval = setInterval(fetchSwapFees, 5000)
    return () => clearInterval(interval)
  }, [fetchSwapFees])

  // ==================== EXECUTE SWAP USING DIRECT SWAP CONTRACT ====================
  const executeSwap = async () => {
    if (!address || !walletClient || !publicClient) {
      setSwapError('Wallet not connected')
      console.error('[Swap] Wallet not connected')
      return
    }

    if (!swapAmount || parseFloat(swapAmount) <= 0) {
      setSwapError('Enter valid amount')
      return
    }

    const amountInWei = parseUnits(swapAmount, 18)
    if (amountInWei > 1000000000000000n) {
      setSwapError('Max swap amount is 0.001 ETH')
      return
    }

    setSwapStatus('Preparing swap...')
    setSwapError(null)
    setSwapTxHash(null)
    setFeesLoading(true)

    try {
      console.log('[Swap] Using DirectSwap contract at:', DIRECT_SWAP_ADDRESS)
      console.log('[Swap] Swap amount:', swapAmount, 'ETH')
      
      setSwapStatus('Executing swap...')
      
      // Call swapETHForUSDC on the DirectSwap contract
      const txHash = await walletClient.writeContract({
        address: DIRECT_SWAP_ADDRESS,
        abi: [{
          name: 'swapETHForUSDC',
          type: 'function',
          inputs: [],
          outputs: [],
          stateMutability: 'payable'
        }],
        functionName: 'swapETHForUSDC',
        value: amountInWei,
        chain: walletClient.chain,
        account: address,
        gas: 500000n
      })

      console.log('[Swap] Transaction sent:', txHash)
      setSwapTxHash(txHash)
      setSwapStatus('Swap submitted, waiting for confirmation...')

      const receipt = await publicClient.waitForTransactionReceipt({ 
        hash: txHash,
        timeout: 60000
      })
      
      console.log('[Swap] Transaction receipt:', receipt)
      
      if (receipt.status === 'success') {
        setSwapStatus('Swap completed successfully!')
        console.log('[Swap] Swap successful!')
        
        // Wait for state update
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // Refresh data
        await fetchSwapFees()
        await refreshPoolInfo()
        await refreshInvestorInfo()
        triggerRefresh()
        
        setSwapAmount('')
      } else {
        console.error('[Swap] Transaction failed:', receipt)
        setSwapError('Swap transaction failed - check explorer for details')
      }

    } catch (err: any) {
      console.error('[Swap] Swap failed with error:', err)
      
      // Parse error message
      let errorMessage = err?.shortMessage || err?.message || 'Swap failed'
      
      // Check for common errors
      if (err?.message?.includes('execution reverted')) {
        errorMessage = 'Transaction reverted - check if you have enough ETH'
      }
      
      setSwapError(errorMessage)
    } finally {
      setFeesLoading(false)
      setTimeout(() => setSwapStatus(null), 5000)
    }
  }

  // ==================== PYTH PRICES ====================
  const fetchPythPrices = async () => {
    setPythLoading(true)
    setPythError(null)
    try {
      const response = await fetch(
        `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_FEEDS.ETH_USD}&ids[]=${PYTH_FEEDS.USDC_USD}`
      )
      if (!response.ok) throw new Error('Pyth API unavailable')
      const data = await response.json()
      const prices: PythPrice[] = data.parsed?.map((p: any, idx: number) => ({
        price: p.price?.price || '0',
        conf: p.price?.conf || '0',
        expo: p.price?.expo || 0,
        publishTime: p.price?.publish_time || 0,
        feedName: idx === 0 ? 'ETH/USD' : 'USDC/USD'
      })) || []
      setPythPrices(prices)
    } catch (err: any) {
      setPythError(err.message)
    } finally {
      setPythLoading(false)
    }
  }

  useEffect(() => {
    if (activeSection === 'oracle') fetchPythPrices()
  }, [activeSection])

  // ==================== DEPOSIT HANDLER ====================
  const handleDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) return
    try {
      setSuccess(null)
      setLocalError(null)
      if (depositType === 'usdc') {
        await depositUSDC(parseUnits(depositAmount, 6).toString())
        setSuccess(`Deposited ${depositAmount} USDC`)
      } else {
        await depositETH(parseUnits(depositAmount, 18).toString())
        setSuccess(`Deposited ${depositAmount} ETH`)
      }
      setDepositAmount('')

      setSuccess(prev => (prev || '') + ' — Waiting for confirmation...')
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      try {
        setSuccess(prev => (prev || '') + ' — Allocating 30/70...')
        await allocateSlices()
        setSuccess(`✅ Deposited & allocated ${depositAmount} ${depositType.toUpperCase()}`)
        
        await refreshPoolInfo()
        await refreshInvestorInfo()
        await refreshAuctionsFromContract()
        triggerRefresh()
      } catch (err) {
        console.log('[Deposit] Allocation failed - funds are in idle state')
        setSuccess(`Deposited ${depositAmount} ${depositType.toUpperCase()} — Click "Allocate" to split 30/70`)
        triggerRefresh()
      }
      
      setTimeout(() => setSuccess(null), 5000)
    } catch (err: any) {
      setLocalError(err?.reason || err?.message || 'Deposit failed')
      triggerRefresh()
    }
  }

  // ==================== WITHDRAW HANDLER ====================
  const handleWithdraw = async () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) return
    try {
      setSuccess(null)
      setLocalError(null)
      if (depositType === 'usdc') {
        await withdrawUSDC(parseUnits(withdrawAmount, 6).toString())
        setSuccess(`Withdrew ${withdrawAmount} USDC`)
      } else {
        await withdrawETH(parseUnits(withdrawAmount, 18).toString())
        setSuccess(`Withdrew ${withdrawAmount} ETH`)
      }
      setWithdrawAmount('')
      await refreshPoolInfo()
      await refreshInvestorInfo()
      await refreshAuctionsFromContract()
      triggerRefresh()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      setLocalError(err?.reason || err?.message || 'Withdraw failed')
      triggerRefresh()
    }
  }

  // ==================== ALLOCATE HANDLER ====================
  const handleAllocate = async () => {
    try {
      setIsAllocating(true)
      setLocalError(null)
      
      console.log('[Allocate] Recovering accounting...')
      await recoverAccounting()
      
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      console.log('[Allocate] Allocating slices...')
      await allocateSlices()
      
      setSuccess('Allocated: 30% APY / 70% Auction')
      await refreshAuctionsFromContract()
      triggerRefresh()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      console.error('[Allocate] Error:', err)
      setLocalError(err?.reason || err?.message || 'Allocation failed')
    } finally { 
      setIsAllocating(false) 
    }
  }

  // ==================== PROPOSE HANDLER ====================
  const handlePropose = async () => {
    if (!proposalAuction || !proposalAmount || !proposeAuction) return
    const amountNum = parseFloat(proposalAmount)
    const auctionSlice = hookPoolInfo ? parseFloat(hookPoolInfo.auctionSlice) : 0
    if (amountNum > auctionSlice) {
      setLocalError(`Insufficient auction funds. Available: $${auctionSlice.toFixed(2)}. Deposit more USDC first, then allocate.`)
      return
    }
    try {
      setLoadingVote(true)
      setLocalError(null)
      const amountWei = parseUnits(proposalAmount, 6)
      
      console.log('[Propose] Sending proposal...')
      await proposeAuction(proposalAuction as any, amountWei.toString(), '0')
      setSuccess('Investment proposed! Voting open.')
      setProposalAuction('')
      setProposalAmount('')
      
      await new Promise(resolve => setTimeout(resolve, 3000))
      await refreshAuctionsFromContract()
      triggerRefresh()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      const msg = err?.reason || err?.message || 'Proposal failed'
      console.error('[Propose] Error:', err)
      if (msg.includes('Not enough auction funds')) {
        setLocalError('Auction slice empty. Deposit USDC and allocate before proposing.')
      } else {
        setLocalError(msg)
      }
    } finally { setLoadingVote(false) }
  }

  // ==================== VOTE HANDLER ====================
  const handleVote = async (auctionId: number, voteFor: boolean) => {
    if (!voteOnAuction) return
    try {
      setLoadingVote(true)
      setLocalError(null)
      console.log(`[Vote] Voting ${voteFor ? 'YES' : 'NO'} on auction ${auctionId}`)
      await voteOnAuction(auctionId, voteFor)
      setSuccess(`Voted ${voteFor ? 'YES' : 'NO'}`)
      
      await new Promise(resolve => setTimeout(resolve, 3000))
      await refreshAuctionsFromContract()
      triggerRefresh()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      const msg = err?.reason || err?.message || 'Vote failed'
      console.error('[Vote] Vote error:', msg)
      setLocalError(msg)
    } finally { setLoadingVote(false) }
  }

  // ==================== EXECUTE BID HANDLER ====================
  const handleExecuteBid = async (auctionId: number) => {
    if (!publicClient || !walletClient || !address || !hookContract) {
      setLocalError('Wallet not connected or contract not initialized')
      return
    }
    
    setExecutingBid(auctionId)
    setLocalError(null)
    
    try {
      console.log('[ExecuteBid] Using hook contract for auction ID:', auctionId)
      
      const hookAddr = CONTRACT_ADDRESSES.NOVC_ANGEL_HOOK as Address
      
      const auctionCheck = await publicClient.readContract({
        address: hookAddr,
        abi: [{
          name: 'auctionInvestments',
          type: 'function',
          inputs: [{ name: '', type: 'uint256' }],
          outputs: [
            { name: 'auctionId', type: 'uint256' },
            { name: 'auctionAddress', type: 'address' },
            { name: 'auctionToken', type: 'address' },
            { name: 'proposedAmount', type: 'uint256' },
            { name: 'totalInvestedUSDC', type: 'uint256' },
            { name: 'tokensPurchased', type: 'uint256' },
            { name: 'bidId', type: 'uint256' },
            { name: 'isActive', type: 'bool' },
            { name: 'isExecuted', type: 'bool' },
            { name: 'tokensClaimed', type: 'bool' },
            { name: 'voteDeadline', type: 'uint256' },
            { name: 'yesVotes', type: 'uint256' },
            { name: 'noVotes', type: 'uint256' },
            { name: 'clearingPriceAtInvestment', type: 'uint256' },
            { name: 'poolIdRef', type: 'bytes32' }
          ],
          stateMutability: 'view'
        }],
        functionName: 'auctionInvestments',
        args: [BigInt(auctionId)]
      }) as any
      
      const proposedAmount = auctionCheck[3]
      const auctionAddress = auctionCheck[1] as Address
      
      console.log('[ExecuteBid] Contract auction state:', {
        proposedAmount: formatUnits(proposedAmount, 6),
        isActive: auctionCheck[7],
        isExecuted: auctionCheck[8],
        yesVotes: (Number(auctionCheck[11]) / 100).toFixed(2)
      })

      const isPermit2Approved = await publicClient.readContract({
        address: hookAddr,
        abi: [{
          name: 'isPermit2Approved',
          type: 'function',
          inputs: [{ name: 'user', type: 'address' }],
          outputs: [{ name: '', type: 'bool' }],
          stateMutability: 'view'
        }],
        functionName: 'isPermit2Approved',
        args: [address]
      }) as boolean

      if (!isPermit2Approved) {
        console.log('[ExecuteBid] Permit2 not approved, approving USDC for Permit2 first...')
        
        const permit2ApproveHash = await walletClient.writeContract({
          address: hookAddr,
          abi: [{
            name: 'approveUSDCForPermit2',
            type: 'function',
            inputs: [],
            outputs: [],
            stateMutability: 'nonpayable'
          }],
          functionName: 'approveUSDCForPermit2'
        })
        
        console.log('[ExecuteBid] Permit2 approval tx:', permit2ApproveHash)
        setSuccess('Approving Permit2 (one-time)...')
        
        await publicClient.waitForTransactionReceipt({ hash: permit2ApproveHash })
        console.log('[ExecuteBid] Permit2 approved successfully')
      }

      await new Promise(resolve => setTimeout(resolve, 5000))

      const latestNonce = await publicClient.getTransactionCount({
        address: address
      })
      console.log('[ExecuteBid] Latest nonce after approvals and wait:', latestNonce)

      console.log('[ExecuteBid] Executing auction...')
      const hash = await walletClient.writeContract({
        address: hookAddr,
        abi: [{
          name: 'executeAuction',
          type: 'function',
          inputs: [{ name: 'auctionId', type: 'uint256' }],
          outputs: [],
          stateMutability: 'nonpayable'
        }],
        functionName: 'executeAuction',
        args: [BigInt(auctionId)],
        gas: 800000n
      })

      console.log('[ExecuteBid] Transaction sent:', hash)
      setSuccess('Bid execution initiated...')
      
      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      if (receipt.status === 'success') {
        const explorerUrl = `https://testnet.monadscan.com/tx/${hash}`
        setSuccess(`✅ Bid executed successfully! View on explorer: ${explorerUrl}`)
        console.log('[ExecuteBid] Success! Explorer:', explorerUrl)
        await new Promise(resolve => setTimeout(resolve, 2000))
        await refreshAuctionsFromContract()
        triggerRefresh()
        setTimeout(() => setSuccess(null), 15000)
      } else {
        throw new Error('Transaction failed')
      }
    } catch (err: any) {
      console.error('[ExecuteBid] Error:', err)
      
      let errorMessage = err?.message || 'Failed to execute bid'
      
      if (err?.data) {
        console.log('[ExecuteBid] Revert data:', err.data)
        errorMessage = `Revert data: ${err.data}`
      }
      
      if (err?.message?.includes('0x7939f424')) {
        errorMessage = 'TransferFromFailed - USDC transfer issue'
      } else if (err?.message?.includes('0xc8731608')) {
        errorMessage = 'InsufficientAllowance - approval issue'
      } else if (err?.message?.includes('0xfb8f41b2')) {
        errorMessage = 'Auction not started yet'
      } else if (err?.message?.includes('0xec5a2e1b')) {
        errorMessage = 'Auction has already ended'
      } else if (err?.message?.includes('0x5b448f5b')) {
        errorMessage = 'Tokens not received by auction'
      } else if (err?.message?.includes('0xTotalValueMismatch')) {
        errorMessage = 'Accounting mismatch - call recoverAccounting()'
      } else if (err?.message?.includes('0xPrecisionLoss')) {
        errorMessage = 'Math precision loss - cannot execute'
      } else if (err?.message?.includes('0xd81b2f2e')) {
        errorMessage = 'AllowanceExpired - Permit2 allowance issue'
      }
      
      setLocalError(errorMessage)
    } finally {
      setExecutingBid(null)
      triggerRefresh()
    }
  }

  // ==================== REFRESH ALL HANDLER ====================
  const handleRefreshAll = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([
        refreshPoolInfo(),
        refreshInvestorInfo(),
        refreshAuctionsFromContract(),
        fetchPythPrices()
      ])
      setSuccess('Data refreshed')
      triggerRefresh()
      setTimeout(() => setSuccess(null), 2000)
    } catch (err) {
      console.error('Refresh failed:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  const formatPythPrice = (price: string, expo: number): string => {
    const num = Number(price) * Math.pow(10, expo)
    return num.toFixed(2)
  }

  const formatExplorerUrl = (txHash: string) => {
    return `https://testnet.monadscan.com/tx/${txHash}`
  }

  const availableAuctions = getAllAuctions().filter((a: any) => currentBlockNumber === 0 || a.endBlock > currentBlockNumber)
  const auctionSliceVal = hookPoolInfo ? parseFloat(hookPoolInfo.auctionSlice) : 0
  const idleSliceVal = hookPoolInfo ? parseFloat(hookPoolInfo.idleSlice) : 0
  
  // Calculate APY earnings
  const investorAPYValue = (() => {
    if (!hookPoolInfo || !investorInfo) return 0
    const shareRaw = parseFloat(investorInfo.sharePercentage.replace('%', ''))
    const apySliceVal = parseFloat(hookPoolInfo.apySlice)
    return (shareRaw / 100) * apySliceVal
  })()

  // Format fee display with proper decimal places
  const formatFeeDisplay = (fee: string | null): string => {
    if (!fee) return '0.000000'
    const numFee = parseFloat(fee)
    if (numFee === 0) return '0.000000'
    if (numFee < 0.000001) return '<0.000001'
    return numFee.toFixed(6)
  }

  // Get current ETH price from Pyth
  const getEthPrice = useCallback((): number => {
    const ethPriceFeed = pythPrices.find(p => p.feedName === 'ETH/USD')
    if (ethPriceFeed) {
      return parseFloat(ethPriceFeed.price) * Math.pow(10, ethPriceFeed.expo)
    }
    return 2000 // fallback
  }, [pythPrices])

  const ethPrice = getEthPrice()

  // ==================== CLAIM APY HANDLER ====================
  const handleClaimAPY = async () => {
    if (investorAPYValue <= 0) return
    try {
      setClaimingAPY(true)
      setLocalError(null)
      const amountMicro = Math.floor(investorAPYValue * 1e6)
      if (amountMicro <= 0) {
        setLocalError('APY earnings too small to claim')
        return
      }
      await withdrawUSDC(amountMicro.toString())
      setSuccess(`Claimed $${investorAPYValue.toFixed(4)} APY earnings`)
      await refreshPoolInfo()
      await refreshInvestorInfo()
      triggerRefresh()
      setTimeout(() => setSuccess(null), 5000)
    } catch (err: any) {
      const msg = err?.reason || err?.message || 'APY claim failed'
      if (msg.includes('revert')) {
        setLocalError('Withdrawal reverted. APY funds may be locked in active liquidity. Try a smaller amount via the Withdraw button.')
      } else {
        setLocalError(msg)
      }
    } finally {
      setClaimingAPY(false)
    }
  }

  if (!isConnected) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
        Connect wallet to view pool
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* User Guidance Section */}
      <div style={{ 
        padding: '12px', 
        background: 'rgba(139,92,246,0.1)', 
        borderRadius: '8px', 
        border: '1px solid rgba(139,92,246,0.2)',
        fontSize: '12px',
        color: '#F8FAFC',
        lineHeight: '1.6'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontSize: '16px' }}>ℹ️</span>
          <span style={{ fontWeight: 600, color: '#A78BFA' }}>How to use the Angel Pool:</span>
        </div>
        <ol style={{ margin: '4px 0 0 24px', color: '#94A3B8', fontSize: '11px' }}>
          <li>Deposit USDC or ETH (funds go to Idle state)</li>
          <li>Click "Allocate" to split 30% APY / 70% Auction</li>
          <li>30% APY slice earns <strong style={{ color: '#4ADE80' }}>0.05% fees</strong> when people trade on Uniswap v4</li>
          <li>70% Auction slice lets you propose and vote on startup investments</li>
          <li><span style={{ color: '#FBBF24' }}>⏱️ Updates appear every 10 seconds - page auto-refreshes</span></li>
        </ol>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>🏊</span>
          <span style={{ fontWeight: 600, color: '#F8FAFC', fontSize: '16px' }}>Angel Pool</span>
          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(139,92,246,0.1)', color: '#A78BFA' }}>
            {hookPoolInfo?.totalInvestors || 0} investor{parseInt(hookPoolInfo?.totalInvestors || '0') !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleRefreshAll}
            disabled={isRefreshing}
            style={{
              padding: '8px 12px',
              background: 'transparent',
              border: '1px solid #2d2d44',
              borderRadius: '6px',
              color: '#94A3B8',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span>{isRefreshing ? '⟳' : '⟳'}</span>
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          {!isPoolInitialized && (
            <button 
              onClick={async () => {
                try {
                  await createAngelPool();
                  setTimeout(() => {
                    refreshPoolInfo();
                  }, 2000);
                } catch (err) {
                  console.error('Failed to initialize pool:', err);
                }
              }} 
              disabled={loading}
              style={{ 
                ...btnPrimary, 
                width: 'auto', 
                padding: '8px 16px', 
                fontSize: '12px', 
                opacity: loading ? 0.6 : 1,
                background: 'linear-gradient(135deg, #10B981, #059669)'
              }}>
              {loading ? 'Initializing...' : '🚀 Create Angel Pool'}
            </button>
          )}
        </div>
      </div>

      {/* Simplified Pool Stats - No Ownership Percentages */}
      {hookPoolInfo && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          <div style={{ background: '#1e1e2e', borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '4px' }}>Liquid Pool (USDC)</div>
            <div style={{ fontSize: '20px', fontWeight: 600, color: '#F8FAFC' }}>${parseFloat(hookPoolInfo.totalValue).toFixed(2)}</div>
            <div style={{ fontSize: '9px', color: '#64748B', marginTop: '4px' }}>
              ETH Price: ${ethPrice.toFixed(2)}
            </div>
          </div>
          
          <div style={{ background: '#1e1e2e', borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '4px' }}>Your Total Holdings</div>
            {investorInfo ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#60A5FA' }}>USDC: </span>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: '#F8FAFC' }}>${parseFloat(investorInfo.usdcBalance).toFixed(2)}</span>
                  {parseFloat(investorInfo.usdcBalance) > parseFloat(hookPoolInfo.totalValue) && (
                    <span style={{ fontSize: '10px', color: '#FBBF24', marginLeft: '4px' }}>
                      (${(parseFloat(investorInfo.usdcBalance) - parseFloat(hookPoolInfo.totalValue)).toFixed(2)} in auctions)
                    </span>
                  )}
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#FBBF24' }}>ETH: </span>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: '#F8FAFC' }}>{parseFloat(investorInfo.ethBalance).toFixed(4)} ETH</span>
                </div>
                <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px' }}>
                  ≈ ${((parseFloat(investorInfo.ethBalance) || 0) * ethPrice).toFixed(2)} USDC
                </div>
              </div>
            ) : (
              <div style={{ color: '#64748B', fontSize: '14px' }}>Loading...</div>
            )}
          </div>
          
          <div style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(99,102,241,0.08))', borderRadius: '8px', padding: '12px', border: '1px solid rgba(139,92,246,0.15)' }}>
            <div style={{ fontSize: '10px', color: '#94A3B8', marginBottom: '4px' }}>Pool Allocation</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', color: '#60A5FA' }}>APY Slice (30%)</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#60A5FA' }}>${parseFloat(hookPoolInfo.apySlice).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', color: '#A78BFA' }}>Auction Slice (70%)</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#A78BFA' }}>${parseFloat(hookPoolInfo.auctionSlice).toFixed(2)}</span>
              </div>
              {parseFloat(hookPoolInfo.idleSlice) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px', paddingTop: '2px', borderTop: '1px solid #2d2d44' }}>
                  <span style={{ fontSize: '10px', color: '#FBBF24' }}>Idle (unallocated)</span>
                  <span style={{ fontSize: '12px', color: '#FBBF24' }}>${parseFloat(hookPoolInfo.idleSlice).toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Allocate Button */}
      {idleSliceVal > 0 && (
        <button onClick={handleAllocate} disabled={isAllocating}
          style={{ padding: '8px', background: 'linear-gradient(135deg, rgba(251,191,36,0.15), rgba(245,158,11,0.15))', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '6px', color: '#FBBF24', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
          {isAllocating ? 'Allocating...' : `Allocate $${idleSliceVal.toFixed(2)} Idle Funds (30% APY / 70% Auction)`}
        </button>
      )}

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '4px', padding: '3px', background: '#1e1e2e', borderRadius: '8px' }}>
        {(['deposit', 'vote', 'oracle'] as const).map(s => (
          <button key={s} onClick={() => { setActiveSection(s); setLocalError(null) }}
            style={{
              flex: 1, padding: '8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
              background: activeSection === s ? '#2d2d44' : 'transparent',
              color: activeSection === s ? '#F8FAFC' : '#64748B',
              fontSize: '12px', fontWeight: activeSection === s ? 500 : 400
            }}>
            {s === 'deposit' ? 'Deposit / Withdraw' : s === 'vote' ? 'Vote on Startups' : 'Oracle & Yield'}
          </button>
        ))}
      </div>

      {/* Deposit/Withdraw Section */}
      {activeSection === 'deposit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['usdc', 'eth'] as const).map(t => (
              <button key={t} onClick={() => setDepositType(t)}
                style={{
                  flex: 1, padding: '6px', border: '1px solid #2d2d44', borderRadius: '6px', cursor: 'pointer',
                  background: depositType === t ? '#2d2d44' : 'transparent',
                  color: depositType === t ? '#F8FAFC' : '#64748B', fontSize: '11px'
                }}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)}
                placeholder={`Amount in ${depositType.toUpperCase()}`} style={inputStyle} />
              {depositType === 'usdc' && usdcBalance && (
                <div style={{ fontSize: '9px', color: '#64748B', marginTop: '2px' }}>
                  Balance: {formatUnits(usdcBalance.value, usdcBalance.decimals)} USDC
                </div>
              )}
            </div>
            <button onClick={handleDeposit} disabled={!depositAmount || loading}
              style={{ ...btnPrimary, width: '80px', flexShrink: 0, opacity: loading ? 0.6 : 1 }}>
              {loading ? '...' : 'Deposit'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input type="number" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder={`Withdraw ${depositType.toUpperCase()}`} style={inputStyle} />
              {investorInfo && (
                <div style={{ fontSize: '9px', color: '#64748B', marginTop: '2px' }}>
                  Available: {depositType === 'usdc' ? investorInfo.usdcBalance : investorInfo.ethBalance}
                </div>
              )}
            </div>
            <button onClick={handleWithdraw} disabled={!withdrawAmount || loading}
              style={{ padding: '10px 16px', background: 'transparent', border: '1px solid #2d2d44', borderRadius: '8px', color: '#F8FAFC', fontWeight: 500, cursor: 'pointer', fontSize: '13px', width: '80px', flexShrink: 0 }}>
              {loading ? '...' : 'Withdraw'}
            </button>
          </div>

          <div style={{ padding: '10px', background: 'rgba(96,165,250,0.06)', borderRadius: '8px', border: '1px solid rgba(96,165,250,0.1)' }}>
            <div style={{ fontSize: '10px', color: '#94A3B8', lineHeight: '1.6' }}>
              Deposits auto-allocate: <span style={{ color: '#60A5FA' }}>30% APY</span> (Uniswap v4 swap fees) + <span style={{ color: '#A78BFA' }}>70% Auction</span> (startup investments via voting).
            </div>
          </div>
        </div>
      )}

      {/* Vote Section */}
      {activeSection === 'vote' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {auctionSliceVal === 0 && idleSliceVal === 0 && (
            <div style={{ padding: '20px', background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(99,102,241,0.06))', borderRadius: '12px', border: '1px solid rgba(139,92,246,0.2)', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>💰</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#F8FAFC', marginBottom: '4px' }}>Fund the Pool First</div>
              <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '12px', lineHeight: '1.6' }}>
                Deposit USDC to the pool. 70% goes to the auction slice for startup investments.
              </div>
              <button onClick={() => setActiveSection('deposit')}
                style={{ ...btnPrimary, width: 'auto', padding: '8px 20px', fontSize: '12px' }}>
                Go to Deposit
              </button>
            </div>
          )}

          {auctionSliceVal === 0 && idleSliceVal > 0 && (
            <div style={{ padding: '20px', background: 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(245,158,11,0.06))', borderRadius: '12px', border: '1px solid rgba(251,191,36,0.2)', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>⚠️</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#F8FAFC', marginBottom: '4px' }}>Allocate Your Funds</div>
              <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '12px', lineHeight: '1.6' }}>
                You have ${idleSliceVal.toFixed(2)} idle. Allocate to split 30% APY / 70% Auction before voting.
              </div>
              <button onClick={handleAllocate} disabled={isAllocating}
                style={{ ...btnPrimary, width: 'auto', padding: '8px 20px', fontSize: '12px', background: 'linear-gradient(135deg, #F59E0B, #D97706)' }}>
                {isAllocating ? 'Allocating...' : 'Allocate Now'}
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ADE80' }} />
              <span style={{ fontSize: '10px', color: '#4ADE80' }}>60% threshold</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#A78BFA' }} />
              <span style={{ fontSize: '10px', color: '#A78BFA' }}>3-day deadline</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#60A5FA' }} />
              <span style={{ fontSize: '10px', color: '#60A5FA' }}>weighted votes</span>
            </div>
          </div>

          {auctionSliceVal > 0 && (
            <div style={{ background: '#1e1e2e', borderRadius: '10px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', color: '#F8FAFC', fontWeight: 600 }}>Propose Investment</span>
                <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '12px', background: 'rgba(139,92,246,0.1)', color: '#A78BFA', fontWeight: 600 }}>
                  ${auctionSliceVal.toFixed(2)} available
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <select value={proposalAuction} onChange={(e) => setProposalAuction(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Select auction...</option>
                  {availableAuctions.map((a: any) => (
                    <option key={a.address} value={a.address}>
                      {a.address.slice(0, 8)}...{a.address.slice(-4)}
                    </option>
                  ))}
                </select>
                <input type="number" value={proposalAmount} onChange={(e) => setProposalAmount(e.target.value)}
                  placeholder="USDC amount" style={inputStyle} />
                <button onClick={handlePropose} disabled={!proposalAuction || !proposalAmount || loadingVote}
                  style={{ ...btnPrimary, opacity: (!proposalAuction || !proposalAmount || loadingVote) ? 0.5 : 1 }}>
                  {loadingVote ? 'Proposing...' : 'Propose Investment'}
                </button>
              </div>
            </div>
          )}

          {poolAuctions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#F8FAFC', fontWeight: 600 }}>Active Proposals</span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '9px', padding: '3px 8px', borderRadius: '12px', background: 'rgba(96,165,250,0.1)', color: '#60A5FA', fontWeight: 600 }}>
                    {poolAuctions.length} active proposal{poolAuctions.length !== 1 ? 's' : ''}
                  </span>
                  <span style={{ fontSize: '9px', padding: '3px 8px', borderRadius: '12px', background: 'rgba(139,92,246,0.1)', color: '#A78BFA', fontWeight: 600 }}>
                    ${poolAuctions.reduce((sum: number, a: any) => sum + (Number(a?.proposedAmount || 0) / 1e6), 0).toFixed(2)} total
                  </span>
                </div>
              </div>
              {poolAuctions.map((auction: any, idx: number) => {
                const yesVotesNum = parseFloat(auction?.yesVotes || '0')
                const noVotesNum = parseFloat(auction?.noVotes || '0')
                const totalVotes = yesVotesNum + noVotesNum
                
                const yesPercent = totalVotes > 0 ? (yesVotesNum / totalVotes) * 100 : 0
                const noPercent = totalVotes > 0 ? (noVotesNum / totalVotes) * 100 : 0
                
                const threshold = 60
                const passed = yesPercent >= threshold
                
                const hasBid = auction?.bidId && auction.bidId !== '0' && auction.bidId !== '0x0'
                const isExecuted = hasBid || !!auction?.isExecuted || auction?.status === 'executed'
                const isActive = !!auction?.isActive
                
                const showVoteButtons = isActive && !isExecuted && !passed
                const showExecuteButton = !isExecuted && passed
                
                let statusBadge = { text: '', color: '', background: '' }
                if (isExecuted) {
                  statusBadge = { 
                    text: `✓ Executed${hasBid ? ` (Bid #${auction.bidId})` : ''}`, 
                    color: '#A78BFA', 
                    background: 'rgba(139,92,246,0.15)' 
                  }
                } else if (passed) {
                  statusBadge = { 
                    text: '✓ READY TO EXECUTE', 
                    color: '#4ADE80', 
                    background: 'rgba(74,222,128,0.15)' 
                  }
                } else {
                  statusBadge = { 
                    text: 'VOTING', 
                    color: '#FBBF24', 
                    background: 'rgba(251,191,36,0.1)' 
                  }
                }
                
                const proposedAmountFormatted = auction?.proposedAmount 
                  ? formatUnits(BigInt(auction.proposedAmount), 6) 
                  : '0'
                
                return (
                  <div key={idx} style={{ 
                    background: '#1e1e2e', 
                    borderRadius: '10px', 
                    padding: '14px', 
                    border: passed && !isExecuted ? '1px solid rgba(74,222,128,0.3)' : '1px solid transparent'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#F8FAFC' }}>
                        {auction?.auctionAddress?.slice(0, 8)}...{auction?.auctionAddress?.slice(-4)}
                      </span>
                      <span style={{ 
                        fontSize: '9px', 
                        padding: '3px 8px', 
                        borderRadius: '12px',
                        background: statusBadge.background,
                        color: statusBadge.color, 
                        fontWeight: 600 
                      }}>
                        {statusBadge.text}
                      </span>
                    </div>

                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '10px', color: '#4ADE80', fontWeight: 600 }}>YES {yesPercent.toFixed(0)}%</span>
                        <span style={{ fontSize: '10px', color: '#F87171', fontWeight: 600 }}>NO {noPercent.toFixed(0)}%</span>
                      </div>
                      <div style={{ height: '8px', background: '#2d2d44', borderRadius: '4px', overflow: 'hidden', position: 'relative' as const }}>
                        <div style={{ position: 'absolute' as const, left: 0, top: 0, height: '100%', width: `${Math.min(yesPercent, 100)}%`, background: 'linear-gradient(90deg, #4ADE80, #22C55E)', borderRadius: '4px', transition: 'width 0.5s ease' }} />
                      </div>
                      <div style={{ position: 'relative' as const, height: '0px' }}>
                        <div style={{ position: 'absolute' as const, left: '60%', top: '-12px', width: '2px', height: '16px', background: '#FBBF24', opacity: 0.6 }} />
                        <span style={{ position: 'absolute' as const, left: '60%', top: '6px', transform: 'translateX(-50%)', fontSize: '8px', color: '#FBBF24', fontWeight: 600 }}>60%</span>
                      </div>
                    </div>

                    {showVoteButtons && (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '16px' }}>
                        <button 
                          onClick={() => handleVote(auction.auctionId, true)} 
                          disabled={loadingVote}
                          style={{ 
                            flex: 1, 
                            padding: '10px', 
                            background: 'linear-gradient(135deg, rgba(74,222,128,0.2), rgba(34,197,94,0.15))', 
                            border: '1px solid rgba(74,222,128,0.3)', 
                            borderRadius: '8px', 
                            color: '#4ADE80', 
                            fontSize: '13px', 
                            fontWeight: 600, 
                            cursor: 'pointer' 
                          }}
                        >
                          Vote YES
                        </button>
                        <button 
                          onClick={() => handleVote(auction.auctionId, false)} 
                          disabled={loadingVote}
                          style={{ 
                            flex: 1, 
                            padding: '10px', 
                            background: 'rgba(248,113,113,0.08)', 
                            border: '1px solid rgba(248,113,113,0.2)', 
                            borderRadius: '8px', 
                            color: '#F87171', 
                            fontSize: '13px', 
                            fontWeight: 600, 
                            cursor: 'pointer' 
                          }}
                        >
                          Vote NO
                        </button>
                      </div>
                    )}

                    {showExecuteButton && (
                      <div style={{ marginTop: '16px' }}>
                        <button
                          onClick={() => handleExecuteBid(auction.auctionId)}
                          disabled={executingBid === auction.auctionId}
                          style={{
                            ...btnSuccess,
                            opacity: executingBid === auction.auctionId ? 0.6 : 1,
                            width: '100%'
                          }}
                        >
                          {executingBid === auction.auctionId ? (
                            '⏳ Executing...'
                          ) : (
                            `⚡ Execute Bid (${proposedAmountFormatted} USDC)`
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {poolAuctions.length === 0 && auctionSliceVal > 0 && (
            <div style={{ textAlign: 'center', padding: '24px', color: '#64748B' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px', opacity: 0.4 }}>✓</div>
              <div style={{ fontSize: '13px', color: '#94A3B8' }}>No proposals yet</div>
              <div style={{ fontSize: '10px', marginTop: '4px' }}>Select an auction above to propose an investment</div>
            </div>
          )}
        </div>
      )}

      {/* Oracle & Yield Section */}
      {activeSection === 'oracle' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* APY Disclaimer */}
          <div style={{ 
            padding: '12px', 
            background: 'rgba(96,165,250,0.1)', 
            borderRadius: '8px', 
            border: '1px solid rgba(96,165,250,0.2)',
            fontSize: '11px',
            color: '#94A3B8',
            lineHeight: '1.6'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <span style={{ color: '#60A5FA', fontWeight: 600, fontSize: '12px' }}>ℹ️ How APY Works</span>
            </div>
            <div style={{ marginBottom: '6px' }}>
              The 30% APY slice provides liquidity to the <strong>Uniswap v4 USDC/ETH pool</strong>. 
              Every time someone trades on that pool, your hook captures <strong style={{ color: '#4ADE80' }}>0.05% fees</strong>.
            </div>
          </div>

          {/* Swap Interface */}
          <div style={{ background: '#1e1e2e', borderRadius: '12px', padding: '16px', border: '1px solid #2d2d44' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #4ADE80, #22C55E)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🔄</div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#F8FAFC' }}>Generate APY - Swap ETH for USDC</div>
                <div style={{ fontSize: '11px', color: '#94A3B8' }}>Execute a swap to generate 0.05% fees for the APY slice</div>
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '4px', display: 'block' }}>Amount (ETH)</label>
              <input
                type="number"
                value={swapAmount}
                onChange={(e) => setSwapAmount(e.target.value)}
                placeholder="0.0001"
                min="0.00001"
                max="0.001"
                step="0.00001"
                style={inputStyle}
              />
              <div style={{ fontSize: '9px', color: '#64748B', marginTop: '4px' }}>
                Max: 0.001 ETH • Fee: 0.05% (captured by hook)
                {swapAmount && Number(swapAmount) >= 0.0001 && (
                  <span style={{ display: 'block', marginTop: '2px', color: '#FBBF24' }}>
                    Estimated fee: ~${(Number(swapAmount) * ethPrice * 0.0005).toFixed(6)} USDC
                  </span>
                )}
              </div>
            </div>

            {swapStatus && (
              <div style={{ padding: '8px', background: 'rgba(96,165,250,0.1)', borderRadius: '6px', fontSize: '11px', color: '#60A5FA', marginBottom: '12px' }}>
                {swapStatus}
              </div>
            )}

            {swapError && (
              <div style={{ padding: '8px', background: 'rgba(239,68,68,0.1)', borderRadius: '6px', fontSize: '11px', color: '#F87171', marginBottom: '12px' }}>
                {swapError}
                {swapTxHash && (
                  <div style={{ marginTop: '4px' }}>
                    <a href={`https://sepolia.uniscan.xyz/tx/${swapTxHash}`} target="_blank" rel="noopener noreferrer" style={{ color: '#60A5FA', textDecoration: 'underline' }}>
                      View Transaction ↗
                    </a>
                  </div>
                )}
              </div>
            )}

            {swapTxHash && !swapError && (
              <div style={{ padding: '8px', background: 'rgba(34,197,94,0.1)', borderRadius: '6px', fontSize: '11px', color: '#4ADE80', marginBottom: '12px' }}>
                <a href={`https://sepolia.uniscan.xyz/tx/${swapTxHash}`} target="_blank" rel="noopener noreferrer" style={{ color: '#4ADE80', textDecoration: 'underline' }}>
                  View Transaction ↗
                </a>
              </div>
            )}

            <button
              onClick={executeSwap}
              disabled={feesLoading || !swapAmount}
              style={{
                ...btnPrimary,
                opacity: feesLoading || !swapAmount ? 0.6 : 1,
                background: 'linear-gradient(135deg, #4ADE80, #22C55E)',
                color: '#000'
              }}
            >
              {feesLoading ? 'Swapping...' : 'Swap ETH for USDC'}
            </button>

            {/* Fee Display */}
            <div style={{ marginTop: '16px', padding: '12px', background: '#12121c', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                  Total Fees Collected by Hook:
                  <span 
                    style={{ 
                      marginLeft: '4px', 
                      cursor: 'help',
                      borderBottom: '1px dotted #64748B'
                    }}
                    title="Fees are 0.05% of each swap. Small swaps may show 0 due to rounding (minimum fee is ~0.000001 USDC). Try a 0.01 ETH swap to see visible fees."
                  >
                    ⓘ
                  </span>
                </span>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#4ADE80' }}>
                  ${formatFeeDisplay(totalSwapFees)} USDC
                </span>
              </div>
              <div style={{ fontSize: '9px', color: '#64748B', marginTop: '4px' }}>
                Fees accumulate in APY slice with each swap
                {totalSwapFees && parseFloat(totalSwapFees) === 0 && (
                  <span style={{ display: 'block', marginTop: '4px', color: '#FBBF24' }}>
                    ⚡ Try a larger swap (0.01 ETH) to see fees - minimum fee is ~0.000001 USDC
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Pyth Oracle Section */}
          <div style={{ background: '#1e1e2e', borderRadius: '10px', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>⚡</div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#F8FAFC' }}>Pyth Oracle</div>
                  <div style={{ fontSize: '9px', color: '#64748B' }}>Real-time price feeds</div>
                </div>
              </div>
              <button onClick={fetchPythPrices} disabled={pythLoading}
                style={{ padding: '6px 12px', background: 'linear-gradient(135deg, #8B5CF6, #6366F1)', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '10px', fontWeight: 600, cursor: 'pointer', opacity: pythLoading ? 0.6 : 1 }}>
                {pythLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {pythError && (
              <div style={{ padding: '8px', background: 'rgba(251,191,36,0.1)', borderRadius: '6px', fontSize: '10px', color: '#FBBF24', marginBottom: '8px' }}>
                {pythError}
              </div>
            )}

            {pythPrices.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {pythPrices.map((p, idx) => (
                  <div key={idx} style={{ padding: '14px', background: '#12121c', borderRadius: '10px', border: '1px solid #2d2d44' }}>
                    <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '6px' }}>{p.feedName}</div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: '#4ADE80', letterSpacing: '-0.5px' }}>
                      ${formatPythPrice(p.price, p.expo)}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                      <span style={{ fontSize: '9px', color: '#64748B' }}>
                        ±${formatPythPrice(p.conf, p.expo)}
                      </span>
                      <span style={{ fontSize: '9px', color: '#64748B' }}>
                        {new Date(p.publishTime * 1000).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '16px', color: '#64748B', fontSize: '11px' }}>
                {pythLoading ? 'Fetching prices...' : 'Click Refresh to load oracle prices'}
              </div>
            )}

            <div style={{ marginTop: '10px', padding: '8px 10px', background: '#12121c', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#22C55E' }} />
              <span style={{ fontSize: '9px', color: '#64748B', fontFamily: 'monospace' }}>
                {CONTRACTS.PYTH?.slice(0, 10)}...{CONTRACTS.PYTH?.slice(-4)}
              </span>
            </div>
          </div>

          {/* Yield Strategy Section */}
          <div style={{ background: '#1e1e2e', borderRadius: '10px', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #60A5FA, #3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>📈</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#F8FAFC' }}>Yield Strategy</div>
                <div style={{ fontSize: '9px', color: '#64748B' }}>Uniswap v4 swap fees</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              <div style={{ padding: '12px', background: 'linear-gradient(135deg, rgba(96,165,250,0.08), rgba(59,130,246,0.06))', borderRadius: '10px', border: '1px solid rgba(96,165,250,0.15)' }}>
                <div style={{ fontSize: '9px', color: '#64748B' }}>APY Slice (30%)</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#60A5FA' }}>
                  ${hookPoolInfo ? parseFloat(hookPoolInfo.apySlice).toFixed(2) : '0.00'}
                </div>
              </div>
              <div style={{ padding: '12px', background: 'linear-gradient(135deg, rgba(74,222,128,0.08), rgba(34,197,94,0.06))', borderRadius: '10px', border: '1px solid rgba(74,222,128,0.15)' }}>
                <div style={{ fontSize: '9px', color: '#64748B' }}>
                  Swap Fees Collected
                  <span 
                    style={{ 
                      marginLeft: '4px', 
                      cursor: 'help',
                      borderBottom: '1px dotted #64748B'
                    }}
                    title="0.05% of each swap. With 0.001 ETH swap at $2000/ETH, fee is ~$0.001 (shows as 0.000001 USDC)"
                  >
                    ⓘ
                  </span>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#4ADE80' }}>
                  ${formatFeeDisplay(totalSwapFees)} USDC
                </div>
              </div>
            </div>

            {/* Live APY Updates */}
            <div style={{ 
              padding: '12px', 
              background: 'rgba(74,222,128,0.06)', 
              borderRadius: '8px', 
              border: '1px solid rgba(74,222,128,0.2)',
              marginBottom: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', color: '#4ADE80', fontWeight: 600 }}>Live APY Updates</span>
                <span style={{ fontSize: '9px', color: '#64748B' }}>Auto-refreshes every 5s</span>
              </div>
              <div style={{ fontSize: '10px', color: '#94A3B8' }}>
                Every swap through the Uniswap v4 pool adds 0.05% fees here. 
                {totalSwapFees && parseFloat(totalSwapFees) > 0 ? (
                  <span style={{ color: '#4ADE80', display: 'block', marginTop: '4px' }}>
                    ✅ {parseFloat(totalSwapFees).toFixed(6)} USDC earned so far!
                  </span>
                ) : (
                  <span style={{ display: 'block', marginTop: '4px' }}>
                    ⏳ Use the swap panel above to generate fees! A 0.01 ETH swap would generate ~${(0.01 * ethPrice * 0.0005).toFixed(4)} in fees.
                  </span>
                )}
              </div>
            </div>

            {investorInfo && investorAPYValue > 0 && (
              <div style={{ padding: '12px', background: 'linear-gradient(135deg, rgba(74,222,128,0.06), rgba(34,197,94,0.04))', borderRadius: '10px', border: '1px solid rgba(74,222,128,0.2)', marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontSize: '9px', color: '#64748B' }}>Your APY Earnings</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#4ADE80' }}>
                      ${investorAPYValue.toFixed(6)}
                    </div>
                    <div style={{ fontSize: '9px', color: '#64748B' }}>
                      {investorInfo.sharePercentage} of ${hookPoolInfo ? parseFloat(hookPoolInfo.apySlice).toFixed(2) : '0'} APY pool
                    </div>
                  </div>
                  <button onClick={handleClaimAPY} disabled={claimingAPY || loading || investorAPYValue <= 0}
                    style={{
                      padding: '8px 16px', background: 'linear-gradient(135deg, #4ADE80, #22C55E)',
                      border: 'none', borderRadius: '8px', color: '#000', fontSize: '11px', fontWeight: 700,
                      cursor: 'pointer', opacity: claimingAPY || loading ? 0.5 : 1
                    }}>
                    {claimingAPY ? 'Claiming...' : 'Withdraw APY'}
                  </button>
                </div>
                <div style={{ fontSize: '9px', color: '#94A3B8', lineHeight: 1.5 }}>
                  Withdraws your proportional share of the APY slice as USDC. Earnings grow as swap fees accrue from Uniswap v4 trading activity.
                </div>
              </div>
            )}

            {/* How It Works */}
            <div style={{ padding: '12px', background: '#12121c', borderRadius: '8px', border: '1px solid #2d2d44' }}>
              <div style={{ fontSize: '11px', color: '#F8FAFC', fontWeight: 600, marginBottom: '8px' }}>How It Works</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(96,165,250,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#60A5FA', fontWeight: 700, flexShrink: 0 }}>1</div>
                  <span style={{ fontSize: '10px', color: '#94A3B8' }}>Pool deposits provide liquidity in Uniswap v4</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#A78BFA', fontWeight: 700, flexShrink: 0 }}>2</div>
                  <span style={{ fontSize: '10px', color: '#94A3B8' }}>afterSwap hook captures 0.05% fees automatically</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(74,222,128,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#4ADE80', fontWeight: 700, flexShrink: 0 }}>3</div>
                  <span style={{ fontSize: '10px', color: '#94A3B8' }}>Fees accrue to APY slice, growing investor shares</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(251,191,36,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#FBBF24', fontWeight: 700, flexShrink: 0 }}>4</div>
                  <span style={{ fontSize: '10px', color: '#94A3B8' }}>Withdraw APY to claim your proportional earnings</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pool Not Initialized */}
      {!isPoolInitialized && (
        <div style={{ padding: '20px', background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(99,102,241,0.06))', borderRadius: '12px', border: '1px solid rgba(139,92,246,0.15)', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>🏊</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#F8FAFC', marginBottom: '4px' }}>Pool Not Initialized</div>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '12px' }}>Create the Angel Pool to start investing</div>
          <button onClick={createAngelPool} disabled={loading}
            style={{ ...btnPrimary, width: 'auto', padding: '10px 24px', fontSize: '13px' }}>
            {loading ? 'Creating...' : 'Create Angel Pool'}
          </button>
        </div>
      )}

      {/* Error/Success Messages */}
      {(error || localError) && (
        <div style={{ padding: '10px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', fontSize: '11px', color: '#F87171', border: '1px solid rgba(239,68,68,0.2)' }}>
          {localError || error}
        </div>
      )}
      {success && (
        <div style={{ padding: '10px', background: 'rgba(34,197,94,0.1)', borderRadius: '8px', fontSize: '11px', color: '#4ADE80', border: '1px solid rgba(34,197,94,0.2)' }}>
          {success.includes('https://') ? (
            <>
              {success.split('https://')[0]}
              <a href={`https://${success.split('https://')[1]}`} target="_blank" rel="noopener noreferrer" style={{ color: '#60A5FA', textDecoration: 'underline', marginLeft: '4px' }}>
                View on Explorer ↗
              </a>
            </>
          ) : success}
        </div>
      )}
    </div>
  )
}
// components/BidPanel.tsx
'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { parseUnits, formatUnits, type Address } from 'viem'
import { monadTestnet } from 'viem/chains'
import { useGatewayBalance } from '@/hooks/useGatewayBalance'
import { useAuctionStore } from '@/lib/auctionStore'
import { CCA_ABI, ERC20_ABI } from '@/lib/abis'
import { 
  getRevertReasonFromTx, 
  checkAuctionPreConditions, 
  getMonadL2BlockNumber,
  getActualContractBlockNumber,
  verifyAuctionActiveOnChain
} from '@/lib/contract-interactions'
import { useRouter } from 'next/navigation'

// Constants for gas
const GAS_BUFFER = 120n // 20% buffer
const PRIORITY_FEE = 100000000n // 0.1 gwei (safe for Monad)
const MAX_FEE_BUFFER = 120n // 20% over base fee

const panelStyle = { background: '#12121c', borderRadius: '12px', border: '1px solid #1e1e2e', padding: '16px' }
const inputStyle = { padding: '10px', background: '#1e1e2e', border: '1px solid #2d2d44', borderRadius: '8px', color: '#F8FAFC', fontSize: '13px', width: '100%' }
const btnStyle = { padding: '10px 16px', background: 'linear-gradient(135deg, #8B5CF6, #6366F1)', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '13px', width: '100%' }
const btnOutlineStyle = { padding: '10px 16px', background: 'transparent', border: '1px solid #2d2d44', borderRadius: '8px', color: '#F8FAFC', fontWeight: 500, cursor: 'pointer', fontSize: '13px', width: '100%' }
const smallBtnStyle = { padding: '6px 12px', background: '#1e1e2e', border: '1px solid #2d2d44', borderRadius: '6px', color: '#94A3B8', fontSize: '11px', cursor: 'pointer' }

// Helper to get next nonce
async function getNextNonce(publicClient: any, address: Address, description?: string): Promise<number> {
  await new Promise(resolve => setTimeout(resolve, 1000))
  const nonce = await publicClient.getTransactionCount({ address })
  return nonce
}

function PostAuctionActions({ auctionAddress, auctionDetails, storedBids, publicClient, walletClient, address, onSuccess, onError }: {
  auctionAddress: string
  auctionDetails: any
  storedBids: any[]
  publicClient: any
  walletClient: any
  address: Address | undefined
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [acting, setActing] = useState(false)
  const [bidIdInput, setBidIdInput] = useState('')

  if (!publicClient || !walletClient || !address) {
    return (
      <div style={{ marginTop: '8px', padding: '14px', background: '#1e1e2e', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.2)' }}>
        <div style={{ fontSize: '12px', color: '#94A3B8' }}>Connect wallet to access post-auction actions</div>
      </div>
    )
  }

  const getGas = async () => {
    let baseFee = 100000000n
    try {
      const feeData = await publicClient.getFeeHistory({ blockCount: 1, rewardPercentiles: [50] })
      if (feeData.baseFeePerGas[0] && feeData.baseFeePerGas[0] > 0n) baseFee = feeData.baseFeePerGas[0]
    } catch {}
    return { maxFeePerGas: (baseFee * 200n / 100n) + PRIORITY_FEE, maxPriorityFeePerGas: PRIORITY_FEE }
  }

  const decodeError = (err: any): string => {
    const msg = err?.message || err?.shortMessage || ''
    const knownErrors: Record<string, string> = {
      '0x00175ba8': 'AuctionIsNotOver - The auction end block has not been reached yet on-chain.',
      '0x76ae8ed7': 'CannotSweepCurrency - Already swept.',
      '0x8fd6c3f9': 'CannotSweepTokens - Already swept.',
      '0xd66173a5': 'NotGraduated - Auction did not reach minimum raise. Use Exit & Refund.',
      '0x6247a84e': 'NotClaimable - Claim block not reached.',
      '0x34588221': 'BidAlreadyExited - This bid was already exited.',
      '0x0ba98457': 'CannotExitBid - This bid cannot be exited.',
    }
    for (const [sig, desc] of Object.entries(knownErrors)) {
      if (msg.includes(sig)) return desc
    }
    return err?.shortMessage || msg.slice(0, 200) || 'Transaction failed'
  }

  const validateBidId = (): bigint | null => {
    if (!bidIdInput || bidIdInput.trim() === '') { onError('Enter a bid ID'); return null }
    try {
      const id = BigInt(bidIdInput)
      if (id < 0n) { onError('Bid ID must be non-negative'); return null }
      return id
    } catch { onError('Invalid bid ID - must be a number'); return null }
  }

  const handleClaimTokens = async () => {
    const bidId = validateBidId()
    if (bidId === null) return
    try {
      setActing(true)
      const gas = await getGas()
      const claimNonce = await getNextNonce(publicClient, address, 'claim-tokens')
      const tx = await walletClient.writeContract({
        address: auctionAddress as Address,
        abi: CCA_ABI,
        functionName: 'claimTokens',
        args: [bidId],
        gas: 500000n,
        nonce: claimNonce,
        ...gas,
        chain: monadTestnet,
      })
      const claimReceipt = await publicClient.waitForTransactionReceipt({ hash: tx })
      if (claimReceipt.status !== 'success') { onError('Claim tokens transaction reverted on-chain'); return }
      onSuccess(`Tokens claimed for bid #${bidIdInput}`)
    } catch (err: any) {
      onError(decodeError(err))
    } finally { setActing(false) }
  }

  const handleExitBid = async () => {
    const bidId = validateBidId()
    if (bidId === null) return
    try {
      setActing(true)
      const gas = await getGas()
      const exitNonce = await getNextNonce(publicClient, address, 'exit-bid')
      const tx = await walletClient.writeContract({
        address: auctionAddress as Address,
        abi: CCA_ABI,
        functionName: 'exitBid',
        args: [bidId],
        gas: 500000n,
        nonce: exitNonce,
        ...gas,
        chain: monadTestnet,
      })
      const exitReceipt = await publicClient.waitForTransactionReceipt({ hash: tx })
      if (exitReceipt.status !== 'success') { onError('Exit bid transaction reverted on-chain'); return }
      onSuccess(`Bid #${bidIdInput} exited - refund sent`)
    } catch (err: any) {
      onError(decodeError(err))
    } finally { setActing(false) }
  }

  const handleSweepCurrency = async () => {
    try {
      setActing(true)
      const gas = await getGas()
      const sweepNonce = await getNextNonce(publicClient, address, 'sweep-currency')
      const tx = await walletClient.writeContract({
        address: auctionAddress as Address,
        abi: CCA_ABI,
        functionName: 'sweepCurrency',
        args: [],
        gas: 500000n,
        nonce: sweepNonce,
        ...gas,
        chain: monadTestnet,
      })
      const sweepReceipt = await publicClient.waitForTransactionReceipt({ hash: tx })
      if (sweepReceipt.status !== 'success') { onError('Sweep currency transaction reverted on-chain'); return }
      onSuccess('Raised funds swept to founder')
    } catch (err: any) {
      onError(decodeError(err))
    } finally { setActing(false) }
  }

  const handleSweepUnsold = async () => {
    try {
      setActing(true)
      const gas = await getGas()
      const sweepNonce = await getNextNonce(publicClient, address, 'sweep-unsold')
      const tx = await walletClient.writeContract({
        address: auctionAddress as Address,
        abi: CCA_ABI,
        functionName: 'sweepUnsoldTokens',
        args: [],
        gas: 500000n,
        nonce: sweepNonce,
        ...gas,
        chain: monadTestnet,
      })
      const sweepUnsoldReceipt = await publicClient.waitForTransactionReceipt({ hash: tx })
      if (sweepUnsoldReceipt.status !== 'success') { onError('Sweep unsold tokens transaction reverted on-chain'); return }
      onSuccess('Unsold tokens swept back')
    } catch (err: any) {
      onError(decodeError(err))
    } finally { setActing(false) }
  }

  return (
    <div style={{ marginTop: '12px', padding: '16px', background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(96,165,250,0.06))', borderRadius: '10px', border: '1px solid rgba(139,92,246,0.25)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg, #8B5CF6, #6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px' }}>&#127942;</div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#F8FAFC' }}>Post-Auction Settlement</div>
          <div style={{ fontSize: '9px', color: '#94A3B8' }}>Auction ended - claim tokens, exit bids, or sweep funds</div>
        </div>
      </div>

      <div style={{ background: '#12121c', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px' }}>&#127919;</span>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#4ADE80' }}>Bidders / Angels</span>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input
            type="number"
            value={bidIdInput}
            onChange={(e) => setBidIdInput(e.target.value)}
            placeholder="Bid ID"
            style={{ padding: '8px', background: '#1e1e2e', border: '1px solid #2d2d44', borderRadius: '6px', color: '#F8FAFC', fontSize: '12px', width: '90px' }}
          />
          <button onClick={handleClaimTokens} disabled={acting || !bidIdInput}
            style={{ padding: '8px 14px', background: 'linear-gradient(135deg, #4ADE80, #22C55E)', border: 'none', borderRadius: '6px', color: '#000', fontSize: '11px', fontWeight: 700, cursor: 'pointer', opacity: acting || !bidIdInput ? 0.5 : 1 }}>
            {acting ? '...' : 'Claim Tokens'}
          </button>
          <button onClick={handleExitBid} disabled={acting || !bidIdInput}
            style={{ padding: '8px 14px', background: 'transparent', border: '1px solid #F87171', borderRadius: '6px', color: '#F87171', fontSize: '11px', fontWeight: 600, cursor: 'pointer', opacity: acting || !bidIdInput ? 0.5 : 1 }}>
            {acting ? '...' : 'Exit & Refund'}
          </button>
        </div>
        <div style={{ fontSize: '9px', color: '#64748B', marginTop: '6px' }}>
          Won the auction? Claim your tokens. Didn't win or want out? Exit to get your USDC back.
        </div>
      </div>

      <div style={{ background: '#12121c', borderRadius: '8px', padding: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px' }}>&#9889;</span>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#A78BFA' }}>Founders / Startup</span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={handleSweepCurrency} disabled={acting}
            style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(139,92,246,0.08))', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '6px', color: '#A78BFA', fontSize: '11px', fontWeight: 700, cursor: 'pointer', opacity: acting ? 0.5 : 1 }}>
            Sweep Raised USDC
          </button>
          <button onClick={handleSweepUnsold} disabled={acting}
            style={{ flex: 1, padding: '10px', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: '6px', color: '#60A5FA', fontSize: '11px', fontWeight: 700, cursor: 'pointer', opacity: acting ? 0.5 : 1 }}>
            Sweep Unsold Tokens
          </button>
        </div>
        <div style={{ fontSize: '9px', color: '#64748B', marginTop: '6px' }}>
          Collect the USDC raised from winning bids, or reclaim any tokens that weren't sold.
        </div>
      </div>
    </div>
  )
}

interface BidPanelProps {
  auctionAddress?: string
  onBidSubmitted?: (txHash: string) => void
  refreshTrigger?: number
  onNavigateToBridge?: () => void 
}

export default function BidPanel({ auctionAddress: propAuctionAddress, onBidSubmitted, refreshTrigger = 0, onNavigateToBridge }: BidPanelProps) {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { getAllAuctions, addBid } = useAuctionStore()

  // State
  const [bidAmount, setBidAmount] = useState('')
  const [bidPrice, setBidPrice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [selectedAuctionAddress, setSelectedAuctionAddress] = useState<string>(propAuctionAddress || '')
  const [auctionDetails, setAuctionDetails] = useState<{
    address: Address
    floorPrice: string
    tickSpacing: string
    isActive: boolean
    isEnded: boolean
    currency: Address
    startBlock: number
    endBlock: number
    currentL2Block: number
    contractBlockNumber: number
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [showStored, setShowStored] = useState(false)
  const [manualRefresh, setManualRefresh] = useState(0)
  
  // Block state
  const [l2BlockNumber, setL2BlockNumber] = useState<number | null>(null)
  const [contractBlockNumber, setContractBlockNumber] = useState<number | null>(null)
  
  const { balance: gatewayBalance, refresh: refreshGateway, loading: gatewayLoading } = useGatewayBalance()
  
  // Get auctions with memo
  const allAuctions = useMemo(() => {
    return getAllAuctions()
  }, [getAllAuctions, refreshTrigger, manualRefresh])

  // ============================================
  // FETCH BLOCKS
  // ============================================
  useEffect(() => {
    const fetchBlocks = async () => {
      if (publicClient) {
        try {
          const l2 = await getMonadL2BlockNumber(publicClient)
          const contractBlock = await getActualContractBlockNumber(publicClient)
          
          setL2BlockNumber(Number(l2))
          setContractBlockNumber(Number(contractBlock))
        } catch (err) {
          console.error('Failed to fetch blocks:', err)
        }
      }
    }
    
    fetchBlocks()
    const interval = setInterval(fetchBlocks, 15000)
    return () => clearInterval(interval)
  }, [publicClient, manualRefresh])

  // ============================================
  // AUCTION LOADING
  // ============================================
  const loadAuctionsFromStore = useCallback(async () => {
    try {
      const auctions = getAllAuctions()
      return auctions
    } catch (err) {
      console.error('Failed to load auctions:', err)
      return []
    }
  }, [getAllAuctions])

  // Initial load
  useEffect(() => {
    loadAuctionsFromStore()
  }, [loadAuctionsFromStore, refreshTrigger, manualRefresh])
  
  // Filter active auctions
  const activeAuctions = useMemo(() => {
    if (!contractBlockNumber) return allAuctions
    return allAuctions.filter(a => a.endBlock > contractBlockNumber)
  }, [allAuctions, contractBlockNumber])

  // Filter ended auctions
  const endedAuctions = useMemo(() => {
    if (!contractBlockNumber) return []
    return allAuctions.filter(a => a.endBlock <= contractBlockNumber)
  }, [allAuctions, contractBlockNumber])

  // Set auction from props
  useEffect(() => {
    if (propAuctionAddress) {
      setSelectedAuctionAddress(propAuctionAddress)
    }
  }, [propAuctionAddress])

  // Load auction details when selected
  useEffect(() => {
    if (selectedAuctionAddress && publicClient && contractBlockNumber !== null && l2BlockNumber !== null) {
      loadAuctionDetails(selectedAuctionAddress)
    }
  }, [selectedAuctionAddress, publicClient, contractBlockNumber, l2BlockNumber, manualRefresh])

  // ============================================
  // LOAD AUCTION DETAILS FROM CONTRACT
  // ============================================
  const loadAuctionDetails = async (auctionAddress: string) => {
    if (!auctionAddress || !publicClient || contractBlockNumber === null || l2BlockNumber === null) {
      return
    }
    
    try {
      setLoading(true)
      setError(null)
      
      // Check if this is a valid contract
      const code = await publicClient.getCode({ address: auctionAddress as Address })
      if (!code || code === '0x') {
        throw new Error('Address is not a contract')
      }
      
      const [floorPriceQ96, tickSpacingQ96, currency, startBlock, endBlock, isGraduated] = await Promise.all([
        publicClient.readContract({
          address: auctionAddress as Address,
          abi: CCA_ABI,
          functionName: 'floorPrice'
        }),
        publicClient.readContract({
          address: auctionAddress as Address,
          abi: CCA_ABI,
          functionName: 'tickSpacing'
        }),
        publicClient.readContract({
          address: auctionAddress as Address,
          abi: CCA_ABI,
          functionName: 'currency'
        }),
        publicClient.readContract({
          address: auctionAddress as Address,
          abi: CCA_ABI,
          functionName: 'startBlock'
        }),
        publicClient.readContract({
          address: auctionAddress as Address,
          abi: CCA_ABI,
          functionName: 'endBlock'
        }),
        publicClient.readContract({
          address: auctionAddress as Address,
          abi: CCA_ABI,
          functionName: 'isGraduated'
        })
      ])

      const Q96 = 2n ** 96n
      const formatFromQ96 = (q96: bigint): string => {
        const priceInMicroUSDC = q96 / Q96
        return (Number(priceInMicroUSDC) / 1e6).toFixed(2)
      }

      const floorPrice = formatFromQ96(floorPriceQ96 as bigint)
      const tickSpacing = formatFromQ96(tickSpacingQ96 as bigint)
      
      const currentBlock = contractBlockNumber
      const isActiveByBlock = !isGraduated && currentBlock >= Number(startBlock) && currentBlock < Number(endBlock)
      const isEndedByBlock = currentBlock >= Number(endBlock)
      
      const isActive = isActiveByBlock
      const isEnded = isEndedByBlock

      setAuctionDetails({
        address: auctionAddress as Address,
        floorPrice,
        tickSpacing,
        isActive,
        isEnded,
        currency: currency as Address,
        startBlock: Number(startBlock),
        endBlock: Number(endBlock),
        currentL2Block: l2BlockNumber,
        contractBlockNumber: currentBlock,
      })

    } catch (err: any) {
      console.error('Failed to load auction details:', err)
      setError(`Failed to load auction: ${err.message}`)
      setAuctionDetails(null)
    } finally {
      setLoading(false)
    }
  }

  // ============================================
  // MANUAL REFRESH
  // ============================================
  const handleManualRefresh = async () => {
    setError(null)
    setManualRefresh(prev => prev + 1)
    await loadAuctionsFromStore()
    if (selectedAuctionAddress) {
      await loadAuctionDetails(selectedAuctionAddress)
    }
    refreshGateway()
  }

  // ============================================
  // NAVIGATE TO CCTP DEPOSIT
  // ============================================
  const handleGoToBridge = () => {
    if (onNavigateToBridge) {
      onNavigateToBridge()
    } else {
      // Fallback if prop not provided
      window.location.href = '/?tab=bridge'
    }
  }

  // ============================================
  // LOAD STORED BIDS
  // ============================================
  const handleLoadStored = () => {
    setShowStored(!showStored)
  }

  const rawBids = useAuctionStore((state) => state.bids)
  const storedBids = useMemo(() => {
    if (!selectedAuctionAddress || !showStored) return []
    const addrStr = selectedAuctionAddress.toLowerCase()
    const filtered = rawBids.filter(b => b.auctionAddress.toLowerCase() === addrStr)
    return filtered.map(b => ({
      amount: formatUnits(BigInt(b.amount), 6),
      price: formatUnits(BigInt(b.price), 6),
      totalUSDC: (Number(formatUnits(BigInt(b.amount), 6)) * Number(formatUnits(BigInt(b.price), 6))).toFixed(2),
      txHash: b.txHash,
      timestamp: b.timestamp,
      onchainBidId: b.onchainBidId,
    }))
  }, [selectedAuctionAddress, showStored, rawBids])

  // ============================================
  // SUBMIT BID
  // ============================================
  const handlePublicBid = async () => {
    if (!address || !selectedAuctionAddress || !publicClient || !walletClient) {
      setError('Please connect wallet')
      return
    }

    if (!bidAmount || !bidPrice) {
      setError('Enter amount and price')
      return
    }

    if (!auctionDetails) {
      setError('Auction details not loaded')
      return
    }

    if (!auctionDetails.isActive) {
      setError('Auction is not active')
      return
    }

    const bidAmountNum = parseFloat(bidAmount)
    const bidPriceNum = parseFloat(bidPrice)
    const totalUSDC = bidAmountNum * bidPriceNum
    
    if (totalUSDC < 0.000001) {
      setError(`Total bid too small. Current: ${totalUSDC.toFixed(6)} USDC`)
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)
      setSuccess(null)

      const amountWei = parseUnits(bidAmount, 6)
      const UNISWAP_Q96 = BigInt('79228162514264337593543950336')
      const priceFloat = parseFloat(bidPrice)
      const priceMicro = BigInt(Math.floor(priceFloat * 1_000_000))
      const priceWei = priceMicro * UNISWAP_Q96
      const totalUSDCWei = parseUnits(totalUSDC.toFixed(6), 6)

      const submitBid4ArgAbi = [{
        name: 'submitBid',
        type: 'function' as const,
        stateMutability: 'payable' as const,
        inputs: [
          { name: '_maxPrice', type: 'uint256' as const },
          { name: '_amount', type: 'uint128' as const },
          { name: '_owner', type: 'address' as const },
          { name: '_hookData', type: 'bytes' as const }
        ],
        outputs: [{ name: 'bidId', type: 'uint256' as const }]
      }]
      
      const bidArgs = [priceWei, amountWei, address, '0x'] as const

      const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address

      // USDC approval for Permit2
      const allowance = await publicClient.readContract({
        address: auctionDetails.currency,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, PERMIT2]
      }) as bigint
      
      if (allowance < totalUSDCWei) {
        const approveNonce = await getNextNonce(publicClient, address, 'usdc-approval')
        
        const approveTx = await walletClient.writeContract({
          address: auctionDetails.currency,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [PERMIT2, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')],
          gas: 100000n,
          nonce: approveNonce,
          chain: monadTestnet,
        })
        const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveTx })
        if (approveReceipt.status !== 'success') {
          throw new Error('USDC approval for Permit2 reverted')
        }
        await new Promise(resolve => setTimeout(resolve, 2000))
      }

      // Permit2 allowance setup
      const permit2Abi = [{
        name: 'allowance',
        type: 'function' as const,
        stateMutability: 'view' as const,
        inputs: [
          { name: 'owner', type: 'address' as const },
          { name: 'token', type: 'address' as const },
          { name: 'spender', type: 'address' as const }
        ],
        outputs: [
          { name: 'amount', type: 'uint160' as const },
          { name: 'expiration', type: 'uint48' as const },
          { name: 'nonce', type: 'uint48' as const }
        ]
      }]
      const [p2Amount, p2Expiry] = await publicClient.readContract({
        address: PERMIT2,
        abi: permit2Abi,
        functionName: 'allowance',
        args: [address, auctionDetails.currency, selectedAuctionAddress as Address]
      }) as [bigint, number, number]
      
      const now = Math.floor(Date.now() / 1000)
      
      if (p2Amount < totalUSDCWei || p2Expiry < now) {
        const approveP2Abi = [{
          name: 'approve',
          type: 'function' as const,
          stateMutability: 'nonpayable' as const,
          inputs: [
            { name: 'token', type: 'address' as const },
            { name: 'spender', type: 'address' as const },
            { name: 'amount', type: 'uint160' as const },
            { name: 'expiration', type: 'uint48' as const }
          ],
          outputs: []
        }]
        const maxUint160 = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')
        const farExpiry = BigInt(now + 86400 * 365)
        
        const p2Nonce = await getNextNonce(publicClient, address, 'permit2-approval')
        
        const p2Tx = await walletClient.writeContract({
          address: PERMIT2,
          abi: approveP2Abi,
          functionName: 'approve',
          args: [auctionDetails.currency, selectedAuctionAddress as Address, maxUint160, farExpiry],
          gas: 100000n,
          nonce: p2Nonce,
          chain: monadTestnet,
        })
        const p2Receipt = await publicClient.waitForTransactionReceipt({ hash: p2Tx })
        if (p2Receipt.status !== 'success') {
          throw new Error('Permit2 allowance approval reverted')
        }
        await new Promise(resolve => setTimeout(resolve, 2000))
      }

      // Submit the bid
      const bidNonce = await getNextNonce(publicClient, address, 'bid')
      
      const bidTx = await walletClient.writeContract({
        address: selectedAuctionAddress as Address,
        abi: submitBid4ArgAbi,
        functionName: 'submitBid',
        args: bidArgs,
        gas: 500000n,
        nonce: bidNonce,
        chain: monadTestnet,
      })
      
      const receipt = await publicClient.waitForTransactionReceipt({ hash: bidTx })

      if (receipt.status !== 'success') {
        let revertReason = 'Unknown revert'
        try {
          revertReason = await getRevertReasonFromTx(publicClient, bidTx)
        } catch {}
        throw new Error(`Bid reverted: ${revertReason}`)
      }

      let onchainBidId: string | undefined
      try {
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() === selectedAuctionAddress.toLowerCase() && log.topics[0]) {
            const { decodeEventLog } = await import('viem')
            try {
              const decoded = decodeEventLog({ abi: CCA_ABI, data: log.data, topics: log.topics as any })
              if (decoded.eventName === 'BidSubmitted') {
                onchainBidId = ((decoded.args as any).bidId || log.topics[1]).toString()
                if (onchainBidId && onchainBidId.startsWith('0x')) {
                  onchainBidId = BigInt(onchainBidId).toString()
                }
                break
              }
            } catch {}
          }
        }
      } catch {}

      addBid({
        bidder: address,
        amount: amountWei,
        price: priceWei,
        auctionAddress: selectedAuctionAddress as Address,
        txHash: bidTx,
        onchainBidId
      })

      setSuccess(`Bid confirmed!${onchainBidId ? ` ID: ${onchainBidId}` : ''} Tx: ${bidTx.slice(0, 10)}...`)
      setBidAmount('')
      setBidPrice('')
      handleLoadStored()
      
      if (onBidSubmitted) {
        onBidSubmitted(bidTx)
      }

    } catch (err: any) {
      let errorMsg = err.shortMessage || err.message || 'Bid failed'
      console.error('Bid error:', errorMsg)
      setError(errorMsg.slice(0, 200))
    } finally {
      setIsSubmitting(false)
    }
  }

  // ============================================
  // RENDER
  // ============================================
  if (!isConnected) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
        Connect wallet to bid
      </div>
    )
  }

  if (l2BlockNumber === null || contractBlockNumber === null || gatewayLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
        Loading...
      </div>
    )
  }

  if (allAuctions.length === 0 && !propAuctionAddress) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: '24px', marginBottom: '12px' }}>🏭</div>
        <div style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '16px' }}>
          No auctions found
        </div>
        <button onClick={handleManualRefresh} style={btnOutlineStyle}>
          🔄 Refresh
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Auction Selector */}
      <div>
        <select
          value={selectedAuctionAddress}
          onChange={(e) => setSelectedAuctionAddress(e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="">Select auction...</option>
          {activeAuctions.map((auction) => (
            <option key={auction.address} value={auction.address}>
              {auction.address.slice(0, 8)}...{auction.address.slice(-4)} • 
              Floor: {formatUnits(auction.floorPrice, 6)} USDC
            </option>
          ))}
          {endedAuctions.length > 0 && (
            <optgroup label="Ended">
              {endedAuctions.map((auction) => (
                <option key={auction.address} value={auction.address}>
                  {auction.address.slice(0, 8)}...{auction.address.slice(-4)} • Ended
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {/* Auction Status */}
      {auctionDetails && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#1e1e2e', borderRadius: '6px' }}>
          <span style={{ fontSize: '11px', color: '#64748B' }}>Floor {auctionDetails.floorPrice} USDC</span>
          <span style={{ fontSize: '11px', color: auctionDetails.isActive ? '#4ADE80' : '#F87171' }}>
            {auctionDetails.isActive ? 'Active' : 'Ended'}
          </span>
        </div>
      )}

      {/* Gateway Balance Display */}
      {gatewayBalance && (
        <div style={{ background: '#1e1e2e', borderRadius: '8px', padding: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: '#94A3B8' }}>Gateway Balance</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#22C55E' }}>
              ${gatewayBalance.totalUSDC.toFixed(2)} USDC
            </span>
          </div>
          
          {/* Chain Breakdown */}
          <div style={{ marginTop: '8px', fontSize: '11px' }}>
            {gatewayBalance.chains.filter(c => c.balanceFormatted > 0).map((chain, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: '#94A3B8' }}>
                <span>{chain.chainName}:</span>
                <span>${chain.balanceFormatted.toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Bridge Button */}
          <button
     onClick={handleGoToBridge}
    style={{
      ...smallBtnStyle,
      width: '100%',
      marginTop: '10px',
      background: '#2d2d44',
      color: '#60A5FA',
      borderColor: '#3b3b5a'
    }}
  >
    🔗 Bridge USDC
  </button>
        </div>
      )}

      {/* Bid Inputs */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '11px', color: '#64748B' }}>Token Amount</span>
        </div>
        <input
          type="number"
          value={bidAmount}
          onChange={(e) => setBidAmount(e.target.value)}
          placeholder="0.0"
          step="0.01"
          style={inputStyle}
        />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '11px', color: '#64748B' }}>Max Price (USDC)</span>
        </div>
        <input
          type="number"
          value={bidPrice}
          onChange={(e) => setBidPrice(e.target.value)}
          placeholder="0.0"
          step="0.01"
          style={inputStyle}
        />
      </div>

      {/* Total */}
      {bidAmount && bidPrice && (
        <div style={{ padding: '10px', background: 'rgba(139,92,246,0.1)', borderRadius: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', color: '#94A3B8' }}>Total</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#F8FAFC' }}>
              {(parseFloat(bidAmount) * parseFloat(bidPrice)).toFixed(2)} USDC
            </span>
          </div>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div style={{ padding: '8px', background: 'rgba(239,68,68,0.1)', borderRadius: '6px', fontSize: '11px', color: '#F87171' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: '8px', background: 'rgba(34,197,94,0.1)', borderRadius: '6px', fontSize: '11px', color: '#4ADE80' }}>
          {success}
        </div>
      )}

      {/* Submit Button */}
      <button
        onClick={handlePublicBid}
        disabled={isSubmitting || !bidAmount || !bidPrice || !selectedAuctionAddress || !auctionDetails?.isActive}
        style={{ ...btnStyle, opacity: isSubmitting || !auctionDetails?.isActive ? 0.6 : 1 }}
      >
        {isSubmitting ? 'Submitting...' : 'Submit Bid'}
      </button>

      {/* Stored Bids */}
      <div style={{ borderTop: '1px solid #2d2d44', paddingTop: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', color: '#94A3B8' }}>Your Bids</span>
          <button onClick={handleLoadStored} style={smallBtnStyle}>
            {showStored ? 'Hide' : 'Show'}
          </button>
        </div>
        
        {showStored && storedBids.length > 0 && (
          <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
            {storedBids.slice(0, 3).map((bid, idx) => (
              <div key={idx} style={{ padding: '8px', background: '#1e1e2e', borderRadius: '6px', marginBottom: '4px', fontSize: '10px' }}>
                <div>{bid.amount} tokens @ {bid.price} USDC</div>
                <div style={{ color: '#64748B' }}>{bid.totalUSDC} USDC</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Post-Auction */}
      {auctionDetails?.isEnded && (
        <PostAuctionActions
          auctionAddress={selectedAuctionAddress}
          auctionDetails={auctionDetails}
          storedBids={storedBids}
          publicClient={publicClient}
          walletClient={walletClient}
          address={address}
          onSuccess={(msg) => { setSuccess(msg); setTimeout(() => setSuccess(null), 4000) }}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  )
}

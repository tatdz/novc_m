// components/BidPanel.tsx
'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { parseUnits, formatUnits, type Address } from 'viem'
import { monadTestnet } from 'viem/chains'
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
import Link from 'next/link'

const PRIORITY_FEE = 100000000n

const inputStyle = { padding: '10px', background: '#1e1e2e', border: '1px solid #2d2d44', borderRadius: '8px', color: '#F8FAFC', fontSize: '13px', width: '100%', boxSizing: 'border-box' as const }
const btnStyle = { padding: '10px 16px', background: 'linear-gradient(135deg, #8B5CF6, #6366F1)', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '13px', width: '100%' }
const btnOutlineStyle = { padding: '10px 16px', background: 'transparent', border: '1px solid #2d2d44', borderRadius: '8px', color: '#F8FAFC', fontWeight: 500, cursor: 'pointer', fontSize: '13px', width: '100%' }
const smallBtnStyle = { padding: '6px 12px', background: '#1e1e2e', border: '1px solid #2d2d44', borderRadius: '6px', color: '#94A3B8', fontSize: '11px', cursor: 'pointer' }

async function getNextNonce(publicClient: any, address: Address, description?: string): Promise<number> {
  await new Promise(resolve => setTimeout(resolve, 1000))
  const nonce = await publicClient.getTransactionCount({ address })
  return nonce
}

function roundLabel(a: { name?: string; roundType?: string; address: string }): string {
  if (a.name && a.name.trim()) {
    return a.roundType ? `${a.name} · ${a.roundType}` : a.name
  }
  return `${a.address.slice(0, 8)}...${a.address.slice(-4)}`
}

function AddressInfo({ address }: { address: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ position: 'relative' as const, display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v) }}
        style={{
          width: '16px', height: '16px', borderRadius: '50%',
          background: 'rgba(96,165,250,0.15)',
          border: '1px solid rgba(96,165,250,0.35)',
          color: '#60A5FA', fontSize: '10px', fontWeight: 700,
          cursor: 'pointer', padding: 0, lineHeight: 1,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          marginLeft: '6px'
        }}
        aria-label="Show round address"
      >
        i
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute' as const,
            top: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 50,
            background: '#0f0f1a',
            border: '1px solid #2d2d44',
            borderRadius: '8px',
            padding: '10px 12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            minWidth: '240px',
          }}
        >
          <div style={{ fontSize: '9px', color: '#64748B', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
            Round address
          </div>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#F8FAFC', wordBreak: 'break-all' }}>
            {address}
          </div>
          <div style={{ fontSize: '9px', color: '#64748B', marginTop: '6px', lineHeight: 1.5 }}>
            This is the on-chain contract for this round. You normally don't need it — share the round name instead.
          </div>
        </div>
      )}
    </span>
  )
}

// Display a stored bid in human-readable form.
// amountWei is the bid amount in 6-decimal USDC-units (shares),
// priceWei is the raw Q96 price. Both go through formatUnits so the
// user sees USDC per share, never raw wei.
function formatStoredBid(amount: string, price: string) {
  const shares = formatUnits(BigInt(amount), 6)
  const sharesNum = Number(shares)
  const sharesDisplay = Number.isFinite(sharesNum)
    ? sharesNum.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : shares

  // Price is Q96-encoded. Divide by 2^96 to get USDC per share with 6 decimals.
  const Q96 = 2n ** 96n
  const priceRaw = BigInt(price)
  const priceInMicroUSDC = priceRaw / Q96              // integer micro USDC per share
  const priceInUSDC = Number(priceInMicroUSDC) / 1e6
  const priceDisplay = Number.isFinite(priceInUSDC)
    ? priceInUSDC.toFixed(4)
    : '—'

  const total = Number.isFinite(sharesNum) && Number.isFinite(priceInUSDC)
    ? (sharesNum * priceInUSDC).toFixed(2)
    : '—'

  return { sharesDisplay, priceDisplay, total }
}

interface BidPanelProps {
  auctionAddress?: string
  onBidSubmitted?: (txHash: string) => void
  refreshTrigger?: number
}

export default function BidPanel({ auctionAddress: propAuctionAddress, onBidSubmitted, refreshTrigger = 0 }: BidPanelProps) {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { getAllAuctions, addBid } = useAuctionStore()

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

  const [l2BlockNumber, setL2BlockNumber] = useState<number | null>(null)
  const [contractBlockNumber, setContractBlockNumber] = useState<number | null>(null)

  const allAuctions = useMemo(() => {
    return getAllAuctions()
  }, [getAllAuctions, refreshTrigger, manualRefresh])

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

  const loadAuctionsFromStore = useCallback(async () => {
    try {
      const auctions = getAllAuctions()
      return auctions
    } catch (err) {
      console.error('Failed to load auctions:', err)
      return []
    }
  }, [getAllAuctions])

  useEffect(() => {
    loadAuctionsFromStore()
  }, [loadAuctionsFromStore, refreshTrigger, manualRefresh])

  // Only named rounds appear in the picker.
  const namedAuctions = useMemo(() => {
    return allAuctions.filter(a => a.name && a.name.trim().length > 0)
  }, [allAuctions])

  const activeAuctions = useMemo(() => {
    if (!contractBlockNumber) return namedAuctions
    return namedAuctions.filter(a => a.endBlock > contractBlockNumber)
  }, [namedAuctions, contractBlockNumber])

  const endedAuctions = useMemo(() => {
    if (!contractBlockNumber) return []
    return namedAuctions.filter(a => a.endBlock <= contractBlockNumber)
  }, [namedAuctions, contractBlockNumber])

  useEffect(() => {
    if (propAuctionAddress) {
      setSelectedAuctionAddress(propAuctionAddress)
    }
  }, [propAuctionAddress])

  useEffect(() => {
    if (selectedAuctionAddress && publicClient && contractBlockNumber !== null && l2BlockNumber !== null) {
      loadAuctionDetails(selectedAuctionAddress)
    }
  }, [selectedAuctionAddress, publicClient, contractBlockNumber, l2BlockNumber, manualRefresh])

  const loadAuctionDetails = async (auctionAddress: string) => {
    if (!auctionAddress || !publicClient || contractBlockNumber === null || l2BlockNumber === null) {
      return
    }

    try {
      setLoading(true)
      setError(null)

      const code = await publicClient.getCode({ address: auctionAddress as Address })
      if (!code || code === '0x') {
        throw new Error('Not a contract')
      }

      const [floorPriceQ96, tickSpacingQ96, currency, startBlock, endBlock, isGraduated] = await Promise.all([
        publicClient.readContract({ address: auctionAddress as Address, abi: CCA_ABI, functionName: 'floorPrice' }),
        publicClient.readContract({ address: auctionAddress as Address, abi: CCA_ABI, functionName: 'tickSpacing' }),
        publicClient.readContract({ address: auctionAddress as Address, abi: CCA_ABI, functionName: 'currency' }),
        publicClient.readContract({ address: auctionAddress as Address, abi: CCA_ABI, functionName: 'startBlock' }),
        publicClient.readContract({ address: auctionAddress as Address, abi: CCA_ABI, functionName: 'endBlock' }),
        publicClient.readContract({ address: auctionAddress as Address, abi: CCA_ABI, functionName: 'isGraduated' })
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

      setAuctionDetails({
        address: auctionAddress as Address,
        floorPrice,
        tickSpacing,
        isActive: isActiveByBlock,
        isEnded: isEndedByBlock,
        currency: currency as Address,
        startBlock: Number(startBlock),
        endBlock: Number(endBlock),
        currentL2Block: l2BlockNumber,
        contractBlockNumber: currentBlock,
      })

    } catch (err: any) {
      console.error('Failed to load auction details:', err)
      setError(`Couldn't load this round`)
      setAuctionDetails(null)
    } finally {
      setLoading(false)
    }
  }

  const handleManualRefresh = async () => {
    setError(null)
    setManualRefresh(prev => prev + 1)
    await loadAuctionsFromStore()
    if (selectedAuctionAddress) {
      await loadAuctionDetails(selectedAuctionAddress)
    }
  }

  const handleLoadStored = () => {
    setShowStored(!showStored)
  }

  const rawBids = useAuctionStore((state) => state.bids)
  const storedBids = useMemo(() => {
    if (!selectedAuctionAddress) return []
    const addrStr = selectedAuctionAddress.toLowerCase()
    const filtered = rawBids.filter(b => b.auctionAddress.toLowerCase() === addrStr)
    return filtered.map(b => {
      const { sharesDisplay, priceDisplay, total } = formatStoredBid(b.amount, b.price)
      return {
        sharesDisplay,
        priceDisplay,
        total,
        txHash: b.txHash,
        timestamp: b.timestamp,
        onchainBidId: b.onchainBidId,
      }
    })
  }, [selectedAuctionAddress, rawBids])

  const selectedMeta = useMemo(() => {
    if (!selectedAuctionAddress) return null
    const found = allAuctions.find(
      a => a.address.toLowerCase() === selectedAuctionAddress.toLowerCase()
    )
    return found ?? null
  }, [allAuctions, selectedAuctionAddress])

  const handlePublicBid = async () => {
    if (!address || !selectedAuctionAddress || !publicClient || !walletClient) {
      setError('Connect your wallet first')
      return
    }

    if (!bidAmount || !bidPrice) {
      setError('Enter shares and a price')
      return
    }

    if (!auctionDetails) {
      setError('Round not loaded')
      return
    }

    if (!auctionDetails.isActive) {
      setError('Round is not open')
      return
    }

    const bidAmountNum = parseFloat(bidAmount)
    const bidPriceNum = parseFloat(bidPrice)
    const totalUSDC = bidAmountNum * bidPriceNum

    if (totalUSDC < 0.000001) {
      setError(`Too small: $${totalUSDC.toFixed(6)}`)
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
          throw new Error('Approval reverted')
        }
        await new Promise(resolve => setTimeout(resolve, 2000))
      }

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
          throw new Error('Approval reverted')
        }
        await new Promise(resolve => setTimeout(resolve, 2000))
      }

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
        let revertReason = 'Unknown'
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

      setSuccess(`Backed${onchainBidId ? ` · bid ${onchainBidId}` : ''}`)
      setBidAmount('')
      setBidPrice('')
      handleLoadStored()

      if (onBidSubmitted) {
        onBidSubmitted(bidTx)
      }

    } catch (err: any) {
      const errorMsg = err.shortMessage || err.message || "Bid failed"
      console.error('Bid error:', errorMsg)
      setError(errorMsg.slice(0, 200))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isConnected) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
        Connect to back a round
      </div>
    )
  }

  if (l2BlockNumber === null || contractBlockNumber === null) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
        Loading...
      </div>
    )
  }

  if (namedAuctions.length === 0 && !propAuctionAddress) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: '24px', marginBottom: '12px' }}>🏭</div>
        <div style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '16px' }}>
          No rounds yet
        </div>
        <button onClick={handleManualRefresh} style={btnOutlineStyle}>
          Refresh
        </button>
      </div>
    )
  }

  const isEnded = !!auctionDetails?.isEnded
  const isActive = !!auctionDetails?.isActive

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <select
          value={selectedAuctionAddress}
          onChange={(e) => setSelectedAuctionAddress(e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="">Select a round…</option>
          {activeAuctions.map((auction) => (
            <option key={auction.address} value={auction.address}>
              {roundLabel(auction)} · ${formatUnits(auction.floorPrice, 6)}
            </option>
          ))}
          {endedAuctions.length > 0 && (
            <optgroup label="Closed">
              {endedAuctions.map((auction) => (
                <option key={auction.address} value={auction.address}>
                  {roundLabel(auction)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {selectedMeta && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' as const }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: '#1e1e2e', borderRadius: '16px', border: '1px solid #2d2d44' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#F8FAFC' }}>
              {selectedMeta.name || `${selectedMeta.address.slice(0, 8)}...${selectedMeta.address.slice(-4)}`}
            </span>
            {selectedMeta.roundType && (
              <span style={{ fontSize: '10px', color: '#A78BFA' }}>· {selectedMeta.roundType}</span>
            )}
            <AddressInfo address={selectedMeta.address} />
          </div>
          <Link
            href={`/listings#${selectedMeta.address}`}
            style={{
              fontSize: '11px',
              color: '#60A5FA',
              textDecoration: 'none',
              padding: '4px 10px',
              background: 'rgba(96,165,250,0.08)',
              borderRadius: '16px',
              border: '1px solid rgba(96,165,250,0.2)',
              fontWeight: 600,
            }}
          >
            View listing →
          </Link>
        </div>
      )}

      {auctionDetails && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#1e1e2e', borderRadius: '6px' }}>
          <span style={{ fontSize: '11px', color: '#94A3B8' }}>From ${auctionDetails.floorPrice}</span>
          <span style={{ fontSize: '11px', color: isActive ? '#4ADE80' : '#F87171', fontWeight: 600 }}>
            {isActive ? 'Open' : 'Closed'}
          </span>
        </div>
      )}

      {isEnded ? (
        // Round closed: no action form. Just a link to the Collect page.
        <div style={{
          padding: '16px',
          background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(96,165,250,0.06))',
          borderRadius: '10px',
          border: '1px solid rgba(139,92,246,0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#F8FAFC' }}>
            This round has closed
          </div>
          <div style={{ fontSize: '11px', color: '#94A3B8', lineHeight: 1.6 }}>
            Collect your shares or exit for a refund on the Collect page.
          </div>
          <Link
            href="/?tab=settle"
            style={{
              textDecoration: 'none',
            }}
          >
            <button style={{
              width: '100%',
              padding: '12px',
              background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
              border: 'none',
              borderRadius: '10px',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}>
              Go to Collect →
            </button>
          </Link>
        </div>
      ) : (
        <>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', color: '#64748B' }}>Shares</span>
            </div>
            <input
              type="number"
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
              placeholder="0"
              step="1"
              style={inputStyle}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', color: '#64748B' }}>Your max price</span>
              <span style={{ fontSize: '10px', color: '#475569' }}>per share, in USDC</span>
            </div>
            <input
              type="number"
              value={bidPrice}
              onChange={(e) => setBidPrice(e.target.value)}
              placeholder="0.00"
              step="0.01"
              style={inputStyle}
            />
          </div>

          {bidAmount && bidPrice && (
            <div style={{ padding: '10px', background: 'rgba(139,92,246,0.1)', borderRadius: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                  {parseFloat(bidAmount) || 0} share{parseFloat(bidAmount) === 1 ? '' : 's'} @ ${parseFloat(bidPrice).toFixed(4)}
                </span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#F8FAFC' }}>
                  ${(parseFloat(bidAmount) * parseFloat(bidPrice)).toFixed(2)}
                </span>
              </div>
              <div style={{ fontSize: '10px', color: '#64748B', marginTop: '4px' }}>
                You commit at most ${(parseFloat(bidAmount) * parseFloat(bidPrice)).toFixed(2)}. You only pay the final clearing price.
              </div>
            </div>
          )}

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

          <button
            onClick={handlePublicBid}
            disabled={isSubmitting || !bidAmount || !bidPrice || !selectedAuctionAddress || !auctionDetails?.isActive}
            style={{ ...btnStyle, opacity: isSubmitting || !auctionDetails?.isActive ? 0.6 : 1 }}
          >
            {isSubmitting ? 'Backing...' : 'Back this round'}
          </button>
        </>
      )}

      <div style={{ borderTop: '1px solid #2d2d44', paddingTop: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', color: '#94A3B8' }}>Your commitments</span>
          <button onClick={handleLoadStored} style={smallBtnStyle}>
            {showStored ? 'Hide' : 'Show'}
          </button>
        </div>

        {showStored && storedBids.length > 0 && (
          <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {storedBids.map((bid, idx) => (
              <div key={idx} style={{
                padding: '10px',
                background: '#1e1e2e',
                borderRadius: '8px',
                fontSize: '11px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ color: '#F8FAFC', fontWeight: 600 }}>
                    {bid.sharesDisplay} shares @ ${bid.priceDisplay}
                  </span>
                  <span style={{ color: '#94A3B8', fontFamily: 'monospace', fontSize: '10px' }}>
                    {bid.onchainBidId ? `#${bid.onchainBidId}` : '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748B' }}>Total committed: ${bid.total}</span>
                  {bid.txHash && (
                    <a
                      href={`https://testnet.monadscan.com/tx/${bid.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#60A5FA', textDecoration: 'underline', fontSize: '10px' }}
                    >
                      View tx ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {showStored && storedBids.length === 0 && (
          <div style={{ fontSize: '11px', color: '#64748B', textAlign: 'center', padding: '12px' }}>
            No commitments for this round yet
          </div>
        )}
      </div>
    </div>
  )
}
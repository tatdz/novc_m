// app/settle/settle-client.tsx
'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAccount, usePublicClient, useWalletClient, useBlockNumber, useSwitchChain, useChainId } from 'wagmi'
import { type Address, formatUnits, encodeFunctionData, pad, createPublicClient, createWalletClient, custom, http, decodeAbiParameters } from 'viem'
import { monadTestnet } from 'viem/chains'
import { CCA_ABI, ERC20_ABI, CCTP_TOKEN_MESSENGER_ABI, CCTP_MESSAGE_TRANSMITTER_ABI } from '@/lib/abis'
import { useAuctionStore } from '@/lib/auctionStore'
import { getActualContractBlockNumber } from '@/lib/contract-interactions'
import { CONTRACTS, CCTP_DOMAINS, DEPLOYED_ADDRESSES } from '@/lib/contracts'

const PRIORITY_FEE = 100000000n

const Q96 = 2n ** 96n

const KNOWN_ERRORS: Record<string, string> = {
  '0x00175ba8': "The round hasn't closed yet. Wait for more blocks.",
  '0x76ae8ed7': 'Funds already collected.',
  '0x8fd6c3f9': 'Shares already recovered.',
  '0xd66173a5': "This round didn't reach its minimum. Exit to get your money back.",
  '0x6247a84e': "Shares aren't available to claim yet. Check back soon.",
  '0x5f0ae8b5': 'The round has already ended.',
  '0x34588221': "You've already exited this bid.",
  '0x0ba98457': "This bid can't be exited.",
  '0x9076e8b9': 'Bid not found. Check your bid IDs in the list above.',
  '0xeffaea80': "The round hasn't started yet.",
  '0x5cd54361': 'The round is fully sold out.',
  '0x7e138882': 'Exit this bid first, then claim your shares.',
}

function decodeRevertReason(err: any): string {
  const searchTexts = [
    err?.message || '',
    err?.shortMessage || '',
    err?.cause?.message || '',
    err?.cause?.data || '',
    err?.cause?.signature || '',
    typeof err?.data === 'string' ? err.data : '',
  ].join(' ')
  for (const [sig, description] of Object.entries(KNOWN_ERRORS)) {
    if (searchTexts.includes(sig)) return description
  }
  if (err?.shortMessage) return err.shortMessage
  const msg = err?.message || ''
  return msg.slice(0, 200) || 'Transaction failed'
}

// Format a USDC amount with 2 decimals and locale grouping.
// Handles very small values by showing 4 decimals instead of rounding to 0.00.
function formatUsdc(value: string | number): string {
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (!Number.isFinite(n)) return '0.00'
  if (n === 0) return '0.00'
  if (Math.abs(n) < 0.01) return n.toFixed(4)
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// CCA prices are Q96-encoded. Divide by 2^96 to get USDC-per-share with 6
// decimals, then format for display. Returns '—' if the value is 0 (not yet set).
function formatClearingPrice(q96Raw: bigint): string {
  if (q96Raw === 0n) return ''
  const priceInMicroUsdc = q96Raw / Q96
  const priceInUsdc = Number(priceInMicroUsdc) / 1e6
  if (!Number.isFinite(priceInUsdc) || priceInUsdc === 0) return ''
  if (priceInUsdc < 0.01) return priceInUsdc.toFixed(4)
  return priceInUsdc.toFixed(2)
}

interface AuctionInfo {
  address: string
  clearingPrice: string
  startBlock: string
  endBlock: string
  claimBlock: string
  isEnded: boolean
  isActive: boolean
  isClaimable: boolean
  creator: string
  currencyRaised: string
}

interface UserBid {
  bidId: string
  source: 'onchain' | 'local'
  txHash?: string
}

export default function SettleClient() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { data: blockNumber } = useBlockNumber({ watch: true })
  const { switchChainAsync } = useSwitchChain()
  const chainId = useChainId()
  const { getAllAuctions, getBidsForAuction } = useAuctionStore()

  const [auctionAddress, setAuctionAddress] = useState('')
  const [bidIdInput, setBidIdInput] = useState('')
  const [acting, setActing] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [auctionInfo, setAuctionInfo] = useState<AuctionInfo | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [userBids, setUserBids] = useState<UserBid[]>([])
  const [bidsLoaded, setBidsLoaded] = useState(false)
  const [currentBlock, setCurrentBlock] = useState<bigint>(0n)
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null)
  const [isGraduated, setIsGraduated] = useState<boolean>(false)
  const [claimedBids, setClaimedBids] = useState<Set<string>>(new Set())

  const lastFetchedAddr = useRef('')
  const lastFetchedBlock = useRef(0n)

  const roundsMeta = useMemo(() => {
    const map: Record<string, { name: string; roundType?: string }> = {}
    for (const a of getAllAuctions()) {
      if (!a.name) continue
      map[a.address.toLowerCase()] = { name: a.name, roundType: a.roundType }
    }
    return map
  }, [getAllAuctions])

  const namedRounds = useMemo(() => {
    return getAllAuctions().filter(a => a.name && a.name.trim().length > 0)
  }, [getAllAuctions])

  useEffect(() => {
    if (!auctionAddress) {
      setClaimedBids(new Set())
      return
    }
    try {
      const raw = localStorage.getItem(`claimed_bids_${auctionAddress.toLowerCase()}`)
      if (raw) {
        const arr = JSON.parse(raw) as string[]
        setClaimedBids(new Set(arr))
      } else {
        setClaimedBids(new Set())
      }
    } catch {
      setClaimedBids(new Set())
    }
  }, [auctionAddress])

  const markClaimed = useCallback((bidId: string) => {
    setClaimedBids(prev => {
      const next = new Set(prev)
      next.add(bidId)
      try {
        localStorage.setItem(
          `claimed_bids_${auctionAddress.toLowerCase()}`,
          JSON.stringify(Array.from(next))
        )
      } catch {}
      return next
    })
  }, [auctionAddress])

  useEffect(() => {
    if (!publicClient) return
    let cancelled = false
    const fetchCurrentBlock = async () => {
      try {
        const block = await getActualContractBlockNumber(publicClient)
        if (!cancelled) setCurrentBlock(block)
      } catch {}
    }
    fetchCurrentBlock()
    const interval = setInterval(fetchCurrentBlock, 15000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [publicClient, blockNumber])

  useEffect(() => {
    const stored = getAllAuctions()
    if (stored.length > 0 && !auctionAddress) {
      const sorted = [...stored].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      setAuctionAddress(sorted[0].address)
    }
  }, [getAllAuctions, auctionAddress])

  const fetchAuctionInfo = useCallback(async () => {
    if (!publicClient || !auctionAddress || !/^0x[a-fA-F0-9]{40}$/.test(auctionAddress)) {
      setAuctionInfo(null)
      return
    }
    if (lastFetchedAddr.current === auctionAddress && currentBlock > 0n && currentBlock - lastFetchedBlock.current < 100n && lastFetchedBlock.current > 0n) {
      if (auctionInfo) {
        const endBn = BigInt(auctionInfo.endBlock)
        const claimBn = BigInt(auctionInfo.claimBlock)
        const isEnded = endBn > 0n && currentBlock > endBn
        const isClaimable = claimBn > 0n ? currentBlock >= claimBn : isEnded
        if (isEnded !== auctionInfo.isEnded || isClaimable !== auctionInfo.isClaimable) {
          setAuctionInfo(prev => prev ? { ...prev, isEnded, isClaimable, isActive: !isEnded && currentBlock >= BigInt(prev.startBlock) } : null)
        }
        return
      }
    }
    setLoadingInfo(true)
    lastFetchedAddr.current = auctionAddress
    lastFetchedBlock.current = currentBlock
    try {
      // currencyRaised has its own try/catch so a real RPC failure is logged
      // and we can tell the difference between "genuinely 0" and "call failed".
      let currencyRaisedRaw: bigint = 0n
      try {
        currencyRaisedRaw = await publicClient.readContract({
          address: auctionAddress as Address,
          abi: CCA_ABI,
          functionName: 'currencyRaised',
        }) as bigint
      } catch (crErr: any) {
        console.warn('[Settle] currencyRaised read failed:', crErr?.shortMessage || crErr?.message)
        currencyRaisedRaw = 0n
      }

      const [clearingPriceRaw, startBlock, endBlock, claimBlock, creator, graduated, tokenAddr] = await Promise.all([
        publicClient.readContract({ address: auctionAddress as Address, abi: CCA_ABI, functionName: 'clearingPrice' }).catch(() => 0n),
        publicClient.readContract({ address: auctionAddress as Address, abi: CCA_ABI, functionName: 'startBlock' }).catch(() => 0n),
        publicClient.readContract({ address: auctionAddress as Address, abi: CCA_ABI, functionName: 'endBlock' }).catch(() => 0n),
        publicClient.readContract({ address: auctionAddress as Address, abi: CCA_ABI, functionName: 'claimBlock' }).catch(() => 0n),
        publicClient.readContract({ address: auctionAddress as Address, abi: CCA_ABI, functionName: 'fundsRecipient' }).catch(() => '0x0'),
        publicClient.readContract({ address: auctionAddress as Address, abi: CCA_ABI, functionName: 'isGraduated' }).catch(() => false),
        publicClient.readContract({ address: auctionAddress as Address, abi: CCA_ABI, functionName: 'token' }).catch(() => '0x0'),
      ])

      const currencyRaised = currencyRaisedRaw
      let graduatedResult = graduated as boolean

      const endBnCheck = BigInt(endBlock?.toString() || '0')
      if (!graduatedResult && endBnCheck > 0n && currentBlock > endBnCheck && address) {
        try {
          await publicClient.simulateContract({
            address: auctionAddress as Address,
            abi: CCA_ABI,
            functionName: 'sweepCurrency',
            args: [],
            account: address,
          })
          graduatedResult = true
        } catch (simErr: any) {
          const msg = simErr?.shortMessage || simErr?.message || ''
          if (msg.includes('CannotSweepCurrency') || msg.includes('0x')) {
            const alreadySwept = msg.includes('CannotSweepCurrency')
            if (alreadySwept) graduatedResult = true
          }
        }
      }
      setIsGraduated(graduatedResult)

      if (tokenAddr && tokenAddr !== '0x0') {
        try {
          const [tokenBal, totalSup] = await Promise.all([
            publicClient.readContract({ address: tokenAddr as Address, abi: ERC20_ABI, functionName: 'balanceOf', args: [auctionAddress as Address] }),
            publicClient.readContract({ address: auctionAddress as Address, abi: CCA_ABI, functionName: 'totalSupply' }),
          ])
          const hasTokens = BigInt((tokenBal as bigint).toString()) >= BigInt((totalSup as bigint).toString())
          try {
            const checkpointAbi = [{ name: 'checkpoint', type: 'function', stateMutability: 'nonpayable', inputs: [] as any[], outputs: [{ name: '', type: 'tuple', components: [{ name: 'clearingPrice', type: 'uint256' }, { name: 'totalMps', type: 'uint256' }] }] }]
            await publicClient.simulateContract({ address: auctionAddress as Address, abi: checkpointAbi, functionName: 'checkpoint' })
            setIsInitialized(true)
          } catch (simErr: any) {
            const simMsg = simErr?.shortMessage || simErr?.message || ''
            if (simMsg.includes('0x8d6b8a82') || simMsg.includes('TokensNotReceived')) {
              setIsInitialized(false)
            } else {
              setIsInitialized(hasTokens)
            }
          }
        } catch { setIsInitialized(null) }
      }
      const endBn = BigInt(endBlock?.toString() || '0')
      const startBn = BigInt(startBlock?.toString() || '0')
      const claimBn = BigInt(claimBlock?.toString() || '0')
      const isEnded = endBn > 0n && currentBlock > endBn
      const isActive = startBn > 0n && currentBlock >= startBn && currentBlock <= endBn
      const isClaimable = claimBn > 0n ? currentBlock >= claimBn : isEnded

      // Fallback: if the contract reports 0 raised but the user has bids stored
      // for this round, show the sum of the user's own bids so the panel is not
      // misleadingly empty during the round. This is a display-only value.
      let currencyRaisedFinal = BigInt(currencyRaised?.toString() || '0')
      if (currencyRaisedFinal === 0n) {
        try {
          const localBids = getBidsForAuction(auctionAddress as Address)
          let sum = 0n
          for (const b of localBids) {
            // b.amount is shares (6 decimals), b.price is Q96-encoded max price.
            // Total committed = amount * (price / 2^96) / 1e6, both in USDC units.
            const priceInMicroUSDC = b.price / Q96
            const totalMicroUSDC = (BigInt(b.amount) * priceInMicroUSDC) / 1_000_000n
            sum += totalMicroUSDC
          }
          if (sum > 0n) {
            currencyRaisedFinal = sum
            console.log('[Settle] contract currencyRaised=0, using local bid sum as fallback:', formatUnits(sum, 6))
          }
        } catch (fbErr) {
          console.warn('[Settle] fallback sum failed:', fbErr)
        }
      }

      // Clearing price is Q96-encoded. Divide by 2^96 to get USDC per share.
      // Store the formatted string so the UI never sees the raw value.
      const clearingPriceNum = formatClearingPrice(BigInt(clearingPriceRaw?.toString() || '0'))

      setAuctionInfo({
        address: auctionAddress,
        clearingPrice: clearingPriceNum,
        startBlock: startBn.toString(),
        endBlock: endBn.toString(),
        claimBlock: claimBn.toString(),
        isEnded,
        isActive,
        isClaimable,
        creator: (creator as string) || '0x0',
        currencyRaised: formatUnits(currencyRaisedFinal, 6),
      })
    } catch (err) {
      console.error('Failed to fetch auction info:', err)
      setAuctionInfo(null)
    } finally {
      setLoadingInfo(false)
    }
  }, [publicClient, auctionAddress, currentBlock, getBidsForAuction])

  const fetchUserBids = useCallback(async () => {
    if (!publicClient || !auctionAddress || !address || !/^0x[a-fA-F0-9]{40}$/.test(auctionAddress)) {
      setUserBids([])
      return
    }
    const found: UserBid[] = []
    const seenIds = new Set<string>()

    const localBids = getBidsForAuction(auctionAddress as Address)
    for (const b of localBids) {
      if (b.onchainBidId && b.bidder.toLowerCase() === address.toLowerCase()) {
        if (!seenIds.has(b.onchainBidId)) {
          found.push({ bidId: b.onchainBidId, source: 'local', txHash: b.txHash })
          seenIds.add(b.onchainBidId)
        }
      }
    }

    const bidSubmittedEvent = {
      type: 'event' as const,
      name: 'BidSubmitted' as const,
      inputs: [
        { name: 'bidId', type: 'uint256' as const, indexed: true },
        { name: 'owner', type: 'address' as const, indexed: true },
        { name: 'maxPrice', type: 'uint256' as const, indexed: false },
        { name: 'amount', type: 'uint128' as const, indexed: false }
      ]
    }

    try {
      const startBn = auctionInfo?.startBlock ? BigInt(auctionInfo.startBlock) : undefined
      const safeFromBlock = startBn && startBn > 0n ? startBn - 100n : undefined
      const fromBlock = safeFromBlock && safeFromBlock > 0n ? safeFromBlock : undefined

      const ownerAddresses: Address[] = [
        address as Address,
        DEPLOYED_ADDRESSES.NOVC_ANGEL_HOOK as Address,
      ]

      for (const ownerAddr of ownerAddresses) {
        try {
          const logs = await publicClient.getLogs({
            address: auctionAddress as Address,
            event: bidSubmittedEvent,
            args: { owner: ownerAddr },
            fromBlock,
            toBlock: 'latest',
          })

          for (const log of logs) {
            const args = log.args as Record<string, any>
            const bidId = args.bidId?.toString()
            if (bidId && !seenIds.has(bidId)) {
              const isHookBid = ownerAddr.toLowerCase() === DEPLOYED_ADDRESSES.NOVC_ANGEL_HOOK.toLowerCase()
              const bidTxReceipt = log.transactionHash ? await publicClient.getTransactionReceipt({ hash: log.transactionHash }) : null
              const isUserTx = bidTxReceipt?.from?.toLowerCase() === address.toLowerCase()
              if (!isHookBid || isUserTx) {
                found.push({ bidId, source: 'onchain', txHash: log.transactionHash })
                seenIds.add(bidId)
              }
            }
          }
        } catch (e) {
          console.warn(`Could not fetch BidSubmitted events for owner ${ownerAddr}:`, e)
        }
      }
    } catch (e) {
      console.warn('Could not fetch BidSubmitted events:', e)
    }

    setUserBids(found)
    setBidsLoaded(true)
  }, [publicClient, auctionAddress, address, getBidsForAuction, auctionInfo])

  useEffect(() => {
    fetchAuctionInfo()
  }, [fetchAuctionInfo])

  useEffect(() => {
    if (auctionInfo && !bidsLoaded) fetchUserBids()
  }, [auctionInfo, bidsLoaded, fetchUserBids])

  useEffect(() => {
    setBidsLoaded(false)
  }, [auctionAddress])

  const getGas = async () => {
    let baseFee = 100000000n
    try {
      if (publicClient) {
        const block = await publicClient.getBlock()
        if (block.baseFeePerGas && block.baseFeePerGas > 0n) baseFee = block.baseFeePerGas
      }
    } catch {}
    return { maxFeePerGas: (baseFee * 200n / 100n) + PRIORITY_FEE, maxPriorityFeePerGas: PRIORITY_FEE }
  }

  const [bridging, setBridging] = useState(false)

  const getExplorerUrl = (txHash: string) => `https://testnet.monadscan.com/tx/${txHash}`

  const showStatus = (type: 'success' | 'error', msg: string) => {
    setStatus({ type, msg })
    if (type === 'success') setTimeout(() => setStatus(null), 15000)
  }

  const handleInitialize = async () => {
    if (!walletClient || !publicClient) return
    try {
      setActing(true)
      setStatus(null)
      const gas = await getGas()
      const tx = await walletClient.writeContract({
        address: auctionAddress as Address,
        abi: CCA_ABI,
        functionName: 'onTokensReceived',
        args: [],
        gas: 200000n,
        ...gas,
        chain: monadTestnet,
      })
      const initReceipt = await publicClient.waitForTransactionReceipt({ hash: tx })
      if (initReceipt.status !== 'success') { showStatus('error', 'Initialization reverted on-chain'); return }
      setIsInitialized(true)
      showStatus('success', `Initialized! Bids and settlement are now live. View: ${getExplorerUrl(tx)}`)
      lastFetchedAddr.current = ''
      fetchAuctionInfo()
    } catch (err: any) {
      showStatus('error', decodeRevertReason(err))
    } finally { setActing(false) }
  }

  const handleClaimTokens = async () => {
    if (!walletClient || !publicClient || !bidIdInput) return
    if (claimedBids.has(bidIdInput)) {
      showStatus('error', `Bid #${bidIdInput} has already been claimed.`)
      return
    }
    try {
      setActing(true)
      setStatus(null)

      const bidId = BigInt(bidIdInput)

      try {
        await publicClient.simulateContract({
          address: auctionAddress as Address,
          abi: CCA_ABI,
          functionName: 'exitBid',
          args: [bidId],
          account: walletClient.account.address,
        })

        const gas = await getGas()
        const exitTx = await walletClient.writeContract({
          address: auctionAddress as Address,
          abi: CCA_ABI,
          functionName: 'exitBid',
          args: [bidId],
          gas: 500000n,
          ...gas,
          chain: monadTestnet,
        })
        const exitReceipt = await publicClient.waitForTransactionReceipt({ hash: exitTx })
        if (exitReceipt.status !== 'success') {
          showStatus('error', 'Exit reverted on-chain')
          return
        }
        showStatus('success', 'Bid exited (refund sent). Now collecting shares...')
        await new Promise(r => setTimeout(r, 3000))
      } catch (exitSimErr: any) {
        const exitReason = decodeRevertReason(exitSimErr)
        const isAlreadyExited =
          exitReason.includes('BidAlreadyExited') ||
          exitReason.includes('0x34588221') ||
          (exitSimErr?.message || '').includes('BidAlreadyExited') ||
          (exitSimErr?.message || '').includes('0x34588221')
        if (!isAlreadyExited) {
          console.error('[Settle] exitBid simulation failed:', exitSimErr)
          showStatus('error', `Exit failed: ${exitReason}`)
          return
        }
        console.log('[Settle] Bid already exited, proceeding to claimTokens')
      }

      let tokenAddr: Address | null = null
      let balanceBefore = 0n
      try {
        tokenAddr = await publicClient.readContract({
          address: auctionAddress as Address,
          abi: CCA_ABI,
          functionName: 'token',
        }) as Address
        if (tokenAddr && tokenAddr !== '0x0') {
          balanceBefore = await publicClient.readContract({
            address: tokenAddr,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [walletClient.account.address],
          }) as bigint
        }
      } catch (balErr) {
        console.warn('[Settle] Could not read balance before claim:', balErr)
      }

      try {
        await publicClient.simulateContract({
          address: auctionAddress as Address,
          abi: CCA_ABI,
          functionName: 'claimTokens',
          args: [bidId],
          account: walletClient.account.address,
        })
      } catch (simErr: any) {
        const reason = decodeRevertReason(simErr)
        console.error('[Settle] claimTokens simulation failed:', simErr)
        showStatus('error', reason)
        return
      }

      const gas = await getGas()
      const tx = await walletClient.writeContract({
        address: auctionAddress as Address,
        abi: CCA_ABI,
        functionName: 'claimTokens',
        args: [bidId],
        gas: 500000n,
        ...gas,
        chain: monadTestnet,
      })
      const claimReceipt = await publicClient.waitForTransactionReceipt({ hash: tx })
      if (claimReceipt.status !== 'success') {
        showStatus('error', 'Collection reverted on-chain')
        return
      }

      let received = 0n
      if (tokenAddr && tokenAddr !== '0x0') {
        try {
          const balanceAfter = await publicClient.readContract({
            address: tokenAddr,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [walletClient.account.address],
          }) as bigint
          received = balanceAfter - balanceBefore
        } catch (balErr) {
          console.warn('[Settle] Could not read balance after claim:', balErr)
        }
      }

      markClaimed(bidIdInput)

      if (received > 0n) {
        showStatus('success', `Received ${formatUnits(received, 18)} shares for bid #${bidIdInput}! View: ${getExplorerUrl(tx)}`)
      } else {
        showStatus('success', `Collect tx succeeded for bid #${bidIdInput}, but no new shares moved (already collected). View: ${getExplorerUrl(tx)}`)
      }
      fetchAuctionInfo()
    } catch (err: any) {
      showStatus('error', decodeRevertReason(err))
    } finally {
      setActing(false)
    }
  }

  const handleExitBid = async () => {
    if (!walletClient || !publicClient || !bidIdInput || !address) return
    try {
      setActing(true)
      setStatus(null)

      try {
        await publicClient.simulateContract({
          address: auctionAddress as Address,
          abi: CCA_ABI,
          functionName: 'exitBid',
          args: [BigInt(bidIdInput)],
          account: address,
        })
      } catch (simErr: any) {
        const reason = decodeRevertReason(simErr)
        console.error('[Settle] exitBid simulation failed:', simErr)
        showStatus('error', reason)
        return
      }

      const gas = await getGas()
      const tx = await walletClient.writeContract({
        address: auctionAddress as Address,
        abi: CCA_ABI,
        functionName: 'exitBid',
        args: [BigInt(bidIdInput)],
        gas: 500000n,
        ...gas,
        chain: monadTestnet,
      })
      const exitReceipt = await publicClient.waitForTransactionReceipt({ hash: tx })
      if (exitReceipt.status !== 'success') { showStatus('error', 'Exit reverted on-chain'); return }
      showStatus('success', `Bid #${bidIdInput} exited — refund sent. View: ${getExplorerUrl(tx)}`)
      fetchAuctionInfo()
    } catch (err: any) {
      showStatus('error', decodeRevertReason(err))
    } finally { setActing(false) }
  }

  const handleSweepCurrency = async (bridgeToArc = false) => {
    if (!walletClient || !publicClient || !address) return
    try {
      setActing(true)
      if (bridgeToArc) setBridging(true)
      setStatus(null)

      try {
        await publicClient.simulateContract({
          address: auctionAddress as Address,
          abi: CCA_ABI,
          functionName: 'sweepCurrency',
          args: [],
          account: address,
        })
      } catch (simErr: any) {
        const reason = decodeRevertReason(simErr)
        console.error('[Settle] sweepCurrency simulation failed:', simErr)
        showStatus('error', reason)
        return
      }

      const usdcAddress = DEPLOYED_ADDRESSES.USDC_MONAD_TESTNET as Address
      let balanceBefore = 0n
      if (bridgeToArc) {
        balanceBefore = await publicClient.readContract({
          address: usdcAddress, abi: ERC20_ABI, functionName: 'balanceOf', args: [address]
        }) as bigint
      }

      const gas = await getGas()
      const tx = await walletClient.writeContract({
        address: auctionAddress as Address,
        abi: CCA_ABI,
        functionName: 'sweepCurrency',
        args: [],
        gas: 500000n,
        ...gas,
        chain: monadTestnet,
      })
      const sweepReceipt = await publicClient.waitForTransactionReceipt({ hash: tx })
      if (sweepReceipt.status !== 'success') { showStatus('error', 'Collection reverted on-chain'); return }

      if (!bridgeToArc) {
        showStatus('success', `Funds collected! View: ${getExplorerUrl(tx)}`)
        fetchAuctionInfo()
        return
      }

      showStatus('success', 'Funds collected! Now bridging via CCTP...')

      await new Promise(r => setTimeout(r, 5000))

      const balanceAfter = await publicClient.readContract({
        address: usdcAddress, abi: ERC20_ABI, functionName: 'balanceOf', args: [address]
      }) as bigint
      const sweptAmount = balanceAfter - balanceBefore
      if (sweptAmount <= 0n) {
        showStatus('error', 'No funds moved (balance unchanged). Bridge cancelled.')
        return
      }

      const messengerAddress = CONTRACTS.CCTP_TOKEN_MESSENGER as Address
      const messageTransmitter = CONTRACTS.CCTP_MESSAGE_TRANSMITTER as Address
      try {
        const allowance = await publicClient.readContract({
          address: usdcAddress, abi: ERC20_ABI, functionName: 'allowance', args: [address, messengerAddress]
        }) as bigint

        if (allowance < sweptAmount) {
          showStatus('success', 'Approving USDC for bridge...')
          const approveHash = await walletClient.writeContract({
            address: usdcAddress, abi: ERC20_ABI, functionName: 'approve',
            args: [messengerAddress, sweptAmount],
            chain: monadTestnet, account: address,
          })
          await publicClient.waitForTransactionReceipt({ hash: approveHash, confirmations: 1 })
          await new Promise(r => setTimeout(r, 4000))
        }

        const mintRecipient = pad(address as Address, { size: 32 })
        const destinationCaller = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`

        showStatus('success', 'Burning USDC via CCTP...')
        const bridgeHash = await walletClient.writeContract({
          address: messengerAddress,
          abi: [{
            name: 'depositForBurn',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'amount', type: 'uint256' },
              { name: 'destinationDomain', type: 'uint32' },
              { name: 'mintRecipient', type: 'bytes32' },
              { name: 'burnToken', type: 'address' },
              { name: 'destinationCaller', type: 'bytes32' },
              { name: 'maxFee', type: 'uint256' },
              { name: 'minFinalityThreshold', type: 'uint32' }
            ],
            outputs: [{ type: 'uint64' }]
          }],
          functionName: 'depositForBurn',
          args: [sweptAmount, CCTP_DOMAINS.ARC_TESTNET, mintRecipient, usdcAddress, destinationCaller, sweptAmount / 100n, 1000],
          chain: monadTestnet, account: address,
          gas: 500000n,
        })
        const bridgeReceipt = await publicClient.waitForTransactionReceipt({ hash: bridgeHash, confirmations: 1 })
        if (bridgeReceipt.status !== 'success') {
          showStatus('error', 'Funds collected but CCTP bridge reverted. Funds are safe in your wallet.')
          return
        }

        showStatus('success', `Burn complete! Waiting for attestation...`)

        const sourceDomain = 10

        let messageBytes: `0x${string}` | null = null
        let attestation: string | null = null
        for (let i = 0; i < 120; i++) {
          try {
            const resp = await fetch(`https://iris-api-sandbox.circle.com/v2/messages/${sourceDomain}?transactionHash=${bridgeHash}`)
            if (resp.ok) {
              const data = await resp.json()
              const msg = data?.messages?.[0]
              if (msg && msg.attestation && msg.attestation !== 'PENDING') {
                attestation = msg.attestation
                const rawMsg = msg.message as `0x${string}`
                if (rawMsg.startsWith('0x000000000000000000000000000000000000000000000000000000000000002')) {
                  const [decoded] = decodeAbiParameters([{ type: 'bytes' }], rawMsg)
                  messageBytes = decoded as `0x${string}`
                } else {
                  messageBytes = rawMsg
                }
                break
              }
            }
          } catch {}
          showStatus('success', `Waiting for attestation... (${i + 1}/120)`)
          await new Promise(r => setTimeout(r, 5000))
        }

        if (!attestation || !messageBytes) {
          showStatus('success', `${formatUnits(sweptAmount, 6)} USDC burned. Attestation timed out — funds will arrive once claimed. View: ${getExplorerUrl(bridgeHash)}`)
          return
        }

        showStatus('success', 'Attestation received! Switching to Arc Testnet...')

        const { arcTestnet } = await import('viem/chains')

        const provider = (window as any).ethereum
        const destHexChainId = `0x${arcTestnet.id.toString(16)}`

        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: destHexChainId }],
          })
        } catch (switchErr: any) {
          if (switchErr.code === 4902) {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: destHexChainId,
                chainName: arcTestnet.name,
                nativeCurrency: arcTestnet.nativeCurrency,
                rpcUrls: [arcTestnet.rpcUrls.default.http[0]],
                blockExplorerUrls: arcTestnet.blockExplorers ? [arcTestnet.blockExplorers.default.url] : [],
              }],
            })
          } else {
            throw switchErr
          }
        }

        await new Promise(r => setTimeout(r, 2000))

        let currentChain = await provider.request({ method: 'eth_chainId' })
        let retries = 0
        while (parseInt(currentChain, 16) !== arcTestnet.id && retries < 30) {
          await new Promise(r => setTimeout(r, 1000))
          currentChain = await provider.request({ method: 'eth_chainId' })
          retries++
        }
        if (parseInt(currentChain, 16) !== arcTestnet.id) {
          showStatus('error', 'Chain switch failed. Please manually switch to Arc Testnet and try again.')
          return
        }

        const calldata = encodeFunctionData({
          abi: CCTP_MESSAGE_TRANSMITTER_ABI,
          functionName: 'receiveMessage',
          args: [messageBytes, attestation as `0x${string}`],
        })

        showStatus('success', 'Minting USDC on Arc Testnet...')
        const receiveHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: address,
            to: messageTransmitter,
            data: calldata,
            gas: `0x${(500000).toString(16)}`,
          }],
        }) as `0x${string}`

        const destClient = createPublicClient({ chain: arcTestnet, transport: http() })
        showStatus('success', 'Confirming...')
        const receiveReceipt = await destClient.waitForTransactionReceipt({ hash: receiveHash })
        if (receiveReceipt.status !== 'success') {
          showStatus('error', 'receiveMessage reverted on Arc Testnet. Funds can be claimed manually.')
          return
        }

        showStatus('success', `${formatUnits(sweptAmount, 6)} USDC collected & bridged to Arc Testnet! View: ${getExplorerUrl(bridgeHash)}`)
      } catch (bridgeErr: any) {
        showStatus('error', `Funds collected successfully but bridge failed: ${bridgeErr?.shortMessage || bridgeErr?.message || 'unknown error'}. Funds are safe in your wallet.`)
        return
      }
      fetchAuctionInfo()
    } catch (err: any) {
      showStatus('error', decodeRevertReason(err))
    } finally {
      setActing(false)
      setBridging(false)
    }
  }

  const handleSweepUnsold = async () => {
    if (!walletClient || !publicClient || !address) return
    try {
      setActing(true)
      setStatus(null)

      try {
        await publicClient.simulateContract({
          address: auctionAddress as Address,
          abi: CCA_ABI,
          functionName: 'sweepUnsoldTokens',
          args: [],
          account: address,
        })
      } catch (simErr: any) {
        const reason = decodeRevertReason(simErr)
        console.error('[Settle] sweepUnsoldTokens simulation failed:', simErr)
        showStatus('error', reason)
        return
      }

      const gas = await getGas()
      const tx = await walletClient.writeContract({
        address: auctionAddress as Address,
        abi: CCA_ABI,
        functionName: 'sweepUnsoldTokens',
        args: [],
        gas: 500000n,
        ...gas,
        chain: monadTestnet,
      })
      const sweepUnsoldReceipt = await publicClient.waitForTransactionReceipt({ hash: tx })
      if (sweepUnsoldReceipt.status !== 'success') { showStatus('error', 'Recovery reverted on-chain'); return }
      showStatus('success', `Unsold shares recovered! View: ${getExplorerUrl(tx)}`)
      fetchAuctionInfo()
    } catch (err: any) {
      showStatus('error', decodeRevertReason(err))
    } finally { setActing(false) }
  }

  const isFounder = auctionInfo && address && auctionInfo.creator.toLowerCase() === address.toLowerCase()
  const storedAuctions = namedRounds
  const panelStyle = { background: '#12121c', borderRadius: '12px', border: '1px solid #1e1e2e', padding: '20px' }

  const blocksUntilEnd = auctionInfo && !auctionInfo.isEnded && currentBlock > 0n
    ? BigInt(auctionInfo.endBlock) - currentBlock
    : null
  const blocksUntilClaim = auctionInfo && auctionInfo.isEnded && !auctionInfo.isClaimable && auctionInfo.claimBlock !== '0' && currentBlock > 0n
    ? BigInt(auctionInfo.claimBlock) - currentBlock
    : null

  const selectedBidAlreadyClaimed = bidIdInput ? claimedBids.has(bidIdInput) : false

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '20px' }}>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#F8FAFC', margin: '0 0 6px' }}>
          Collect & Settle
        </h2>
        <p style={{ fontSize: '12px', color: '#94A3B8', margin: 0 }}>
          Collect your shares, get refunds, or withdraw raised funds once a round closes
        </p>
      </div>

      {!isConnected ? (
        <div style={{ ...panelStyle, textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>&#128274;</div>
          <p style={{ fontSize: '14px', color: '#94A3B8', margin: 0 }}>Connect to collect</p>
        </div>
      ) : (
        <>
          <div style={{ ...panelStyle, marginBottom: '16px' }}>
            <label style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500, display: 'block', marginBottom: '6px' }}>Round address</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={auctionAddress}
                onChange={(e) => setAuctionAddress(e.target.value)}
                placeholder="0x..."
                style={{ flex: 1, padding: '10px 12px', background: '#1e1e2e', border: '1px solid #2d2d44', borderRadius: '8px', color: '#F8FAFC', fontSize: '13px', fontFamily: 'monospace' }}
              />
              <button onClick={() => { lastFetchedAddr.current = ''; fetchAuctionInfo(); setBidsLoaded(false); }} disabled={loadingInfo}
                style={{ padding: '10px 16px', background: '#1e1e2e', border: '1px solid #2d2d44', borderRadius: '8px', color: '#F8FAFC', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                {loadingInfo ? '...' : 'Load'}
              </button>
            </div>

            {storedAuctions.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '10px', color: '#64748B', marginBottom: '4px' }}>Your rounds:</div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {storedAuctions.map((a, i) => {
                    const meta = roundsMeta[a.address.toLowerCase()]
                    const label = meta?.name
                      ? `${meta.name}${meta.roundType ? ` · ${meta.roundType}` : ''}`
                      : `${a.address.slice(0, 6)}...${a.address.slice(-4)}`
                    const isSelected = auctionAddress === a.address
                    return (
                      <button key={i} onClick={() => setAuctionAddress(a.address)}
                        style={{
                          padding: '4px 10px',
                          background: isSelected ? 'rgba(139,92,246,0.2)' : '#1e1e2e',
                          border: isSelected ? '1px solid rgba(139,92,246,0.4)' : '1px solid #2d2d44',
                          borderRadius: '6px',
                          color: '#F8FAFC',
                          fontSize: '10px',
                          fontWeight: meta?.name ? 600 : 400,
                          fontFamily: meta?.name ? 'inherit' : 'monospace',
                          cursor: 'pointer',
                        }}>
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {auctionInfo && (
            <div style={{ ...panelStyle, marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: auctionInfo.isClaimable ? '#4ADE80' : auctionInfo.isEnded ? '#FBBF24' : auctionInfo.isActive ? '#22C55E' : '#94A3B8'
                }} />
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#F8FAFC' }}>
                  {auctionInfo.isClaimable ? 'Ready to collect' : auctionInfo.isEnded ? 'Ended — waiting for claim block' : auctionInfo.isActive ? 'Round live' : 'Round pending'}
                </span>
                {isFounder && (
                  <span style={{ fontSize: '9px', padding: '2px 6px', background: 'rgba(139,92,246,0.2)', color: '#A78BFA', borderRadius: '4px', fontWeight: 600 }}>
                    FOUNDER
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                <div style={{ background: '#1e1e2e', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '9px', color: '#64748B', marginBottom: '2px' }}>Final price</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#F8FAFC' }}>
                    {auctionInfo.clearingPrice ? `$${auctionInfo.clearingPrice}` : 'TBD'}
                  </div>
                </div>
                <div style={{ background: '#1e1e2e', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '9px', color: '#64748B', marginBottom: '2px' }}>Raised</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#F8FAFC' }}>
                    {Number(auctionInfo.currencyRaised) > 0
                      ? `$${formatUsdc(auctionInfo.currencyRaised)}`
                      : auctionInfo.isEnded
                        ? '$0.00'
                        : 'In progress'}
                  </div>
                </div>
                <div style={{ background: '#1e1e2e', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '9px', color: '#64748B', marginBottom: '2px' }}>End block</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#F8FAFC' }}>
                    {auctionInfo.endBlock}
                    {blocksUntilEnd !== null && blocksUntilEnd > 0n && (
                      <span style={{ fontSize: '10px', color: '#FBBF24', marginLeft: '6px' }}>({blocksUntilEnd.toString()} left)</span>
                    )}
                  </div>
                </div>
                <div style={{ background: '#1e1e2e', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '9px', color: '#64748B', marginBottom: '2px' }}>Claim block</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: auctionInfo.isClaimable ? '#4ADE80' : '#FBBF24' }}>
                    {auctionInfo.claimBlock !== '0' ? auctionInfo.claimBlock : 'Same as end'}
                    {blocksUntilClaim !== null && blocksUntilClaim > 0n && (
                      <span style={{ fontSize: '10px', marginLeft: '6px' }}>({blocksUntilClaim.toString()} left)</span>
                    )}
                  </div>
                </div>
              </div>
              {currentBlock > 0n && (
                <div style={{ fontSize: '10px', color: '#64748B', marginTop: '6px', textAlign: 'right' }}>
                  Current block: {currentBlock.toString()}
                </div>
              )}
            </div>
          )}

          {status && (
            <div style={{
              padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '12px', fontWeight: 500,
              background: status.type === 'success' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
              border: `1px solid ${status.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: status.type === 'success' ? '#4ADE80' : '#F87171',
              wordBreak: 'break-word'
            }}>
              {status.msg.includes('https://') ? (
                <>
                  {status.msg.split('View: ')[0]}
                  {status.msg.includes('View: ') && (
                    <a href={status.msg.split('View: ')[1]} target="_blank" rel="noopener noreferrer"
                      style={{ color: '#60A5FA', textDecoration: 'underline', marginLeft: '4px' }}>
                      View on Explorer
                    </a>
                  )}
                </>
              ) : status.msg}
            </div>
          )}

          {auctionInfo && isInitialized === false && (
            <div style={{ ...panelStyle, border: '1px solid rgba(239,68,68,0.3)', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #EF4444, #DC2626)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>&#9888;</div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#F87171' }}>Not initialized</div>
                  <div style={{ fontSize: '11px', color: '#94A3B8' }}>Shares are in the contract but onTokensReceived() has not been called. Bids and settlement will fail until it is.</div>
                </div>
              </div>
              <button onClick={handleInitialize} disabled={acting}
                style={{
                  width: '100%', padding: '14px', background: 'linear-gradient(135deg, #EF4444, #DC2626)', border: 'none', borderRadius: '10px',
                  color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: acting ? 0.5 : 1
                }}>
                {acting ? 'Initializing...' : 'Initialize round'}
              </button>
            </div>
          )}

          {auctionInfo && !auctionInfo.isEnded && (
            <div style={{ ...panelStyle, border: '1px solid rgba(251,191,36,0.2)', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>&#9203;</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#FBBF24', marginBottom: '4px' }}>Round still live</div>
              <div style={{ fontSize: '12px', color: '#94A3B8' }}>
                Settlement opens after block {auctionInfo.endBlock}
                {blocksUntilEnd !== null && blocksUntilEnd > 0n && (
                  <span> (~{blocksUntilEnd.toString()} blocks / {Math.ceil(Number(blocksUntilEnd) * 2)}s left)</span>
                )}
              </div>
            </div>
          )}

          {auctionInfo?.isEnded && !auctionInfo.isClaimable && (
            <div style={{ ...panelStyle, border: '1px solid rgba(251,191,36,0.2)', textAlign: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>&#9203;</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#FBBF24', marginBottom: '4px' }}>Waiting for claim block</div>
              <div style={{ fontSize: '12px', color: '#94A3B8' }}>
                Round ended but claims open at block {auctionInfo.claimBlock}
                {blocksUntilClaim !== null && blocksUntilClaim > 0n && (
                  <span> (~{blocksUntilClaim.toString()} blocks / {Math.ceil(Number(blocksUntilClaim) * 2)}s left)</span>
                )}
              </div>
            </div>
          )}

          {auctionInfo?.isEnded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* ─────── Two-column split: Founders (left) • Backers (right) ─────── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'start' }}>

                {/* LEFT COLUMN — FOUNDERS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 12px',
                    background: 'rgba(139,92,246,0.08)',
                    border: '1px solid rgba(139,92,246,0.2)',
                    borderRadius: '20px',
                    width: 'fit-content'
                  }}>
                    <span style={{ fontSize: '11px' }}>&#9889;</span>
                    <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#A78BFA' }}>Founders</span>
                  </div>

                  <div style={{ ...panelStyle, border: '1px solid rgba(139,92,246,0.2)' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#F8FAFC', marginBottom: '4px' }}>Collect the round</div>
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '16px' }}>Withdraw raised funds or recover unsold shares</div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <button onClick={() => handleSweepCurrency(false)} disabled={acting || bridging || (!isGraduated && !!auctionInfo?.isEnded)}
                        style={{
                          padding: '14px', background: 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(139,92,246,0.1))',
                          border: '1px solid rgba(139,92,246,0.35)',
                          borderRadius: '10px', color: '#A78BFA', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                          opacity: (acting || bridging || (!isGraduated && !!auctionInfo?.isEnded)) ? 0.5 : 1
                        }}>
                        {acting && !bridging ? 'Working...' : 'Collect funds'}
                      </button>
                      <button onClick={handleSweepUnsold} disabled={acting || bridging}
                        style={{
                          padding: '14px', background: 'rgba(96,165,250,0.08)',
                          border: '1px solid rgba(96,165,250,0.25)',
                          borderRadius: '10px', color: '#60A5FA', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                          opacity: acting || bridging ? 0.5 : 1
                        }}>
                        {acting ? 'Working...' : 'Recover unsold shares'}
                      </button>
                    </div>

                    {!isGraduated && auctionInfo?.isEnded && (
                      <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '6px', fontSize: '11px', color: '#FBBF24', lineHeight: 1.6 }}>
                        Round didn't reach its minimum. Use "Recover unsold shares" to reclaim tokens.
                      </div>
                    )}
                    {isGraduated && (
                      <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: '6px', fontSize: '11px', color: '#4ADE80', lineHeight: 1.6 }}>
                        Round funded successfully.
                      </div>
                    )}
                    {isInitialized === false && (
                      <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', fontSize: '11px', color: '#F87171', lineHeight: 1.6 }}>
                        Round not initialized. Initialize above first.
                      </div>
                    )}
                  </div>
                </div>

                {/* RIGHT COLUMN — BACKERS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 12px',
                    background: 'rgba(74,222,128,0.08)',
                    border: '1px solid rgba(74,222,128,0.2)',
                    borderRadius: '20px',
                    width: 'fit-content'
                  }}>
                    <span style={{ fontSize: '11px' }}>&#127919;</span>
                    <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#4ADE80' }}>Backers</span>
                  </div>

                  {userBids.length > 0 && (
                    <div style={{ ...panelStyle, border: '1px solid rgba(96,165,250,0.2)', padding: '16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#F8FAFC', marginBottom: '8px' }}>
                        Your bid IDs ({userBids.length})
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {userBids.map((b, i) => {
                          const isClaimed = claimedBids.has(b.bidId)
                          return (
                            <button key={i} onClick={() => setBidIdInput(b.bidId)}
                              style={{
                                padding: '6px 12px',
                                background: bidIdInput === b.bidId ? 'rgba(96,165,250,0.2)' : isClaimed ? 'rgba(74,222,128,0.08)' : '#1e1e2e',
                                border: bidIdInput === b.bidId ? '1px solid rgba(96,165,250,0.4)' : isClaimed ? '1px solid rgba(74,222,128,0.3)' : '1px solid #2d2d44',
                                borderRadius: '6px', color: '#F8FAFC', fontSize: '12px', fontFamily: 'monospace', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px'
                              }}>
                              <span style={{ fontWeight: 700 }}>#{b.bidId}</span>
                              <span style={{ fontSize: '9px', color: isClaimed ? '#4ADE80' : '#64748B' }}>
                                {isClaimed ? 'collected ✓' : b.source}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div style={{ ...panelStyle, border: '1px solid rgba(74,222,128,0.2)' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#F8FAFC', marginBottom: '4px' }}>Collect your shares</div>
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '16px' }}>Or exit for a full refund</div>

                    <div style={{ marginBottom: '12px', padding: '10px', background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)', borderRadius: '6px', fontSize: '11px', color: '#94A3B8', lineHeight: 1.6 }}>
                      <strong style={{ color: '#60A5FA' }}>We handle the order for you:</strong> collecting runs exit first if needed, then delivers your shares.
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '11px', color: '#94A3B8', display: 'block', marginBottom: '4px' }}>Bid ID {userBids.length > 0 ? '(tap above to select)' : ''}</label>
                      <input
                        type="number"
                        value={bidIdInput}
                        onChange={(e) => setBidIdInput(e.target.value)}
                        placeholder="Bid ID"
                        style={{ width: '100%', padding: '10px 12px', background: '#1e1e2e', border: '1px solid #2d2d44', borderRadius: '8px', color: '#F8FAFC', fontSize: '13px', boxSizing: 'border-box' }}
                      />
                      {selectedBidAlreadyClaimed && (
                        <div style={{ fontSize: '10px', color: '#4ADE80', marginTop: '4px' }}>
                          ✓ Bid #{bidIdInput} already collected
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <button
                        onClick={handleClaimTokens}
                        disabled={acting || !bidIdInput || selectedBidAlreadyClaimed}
                        style={{
                          padding: '14px',
                          background: selectedBidAlreadyClaimed ? 'rgba(74,222,128,0.15)' : 'linear-gradient(135deg, #4ADE80, #22C55E)',
                          border: selectedBidAlreadyClaimed ? '1px solid rgba(74,222,128,0.3)' : 'none',
                          borderRadius: '10px',
                          color: selectedBidAlreadyClaimed ? '#4ADE80' : '#000',
                          fontSize: '13px', fontWeight: 700,
                          cursor: acting || !bidIdInput || selectedBidAlreadyClaimed ? 'not-allowed' : 'pointer',
                          opacity: acting || !bidIdInput ? 0.5 : 1
                        }}>
                        {selectedBidAlreadyClaimed ? 'Collected ✓' : acting ? 'Working...' : 'Collect shares'}
                      </button>
                      <button
                        onClick={handleExitBid}
                        disabled={acting || !bidIdInput}
                        style={{
                          padding: '14px', background: 'transparent', border: '2px solid #F87171', borderRadius: '10px',
                          color: '#F87171', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                          opacity: acting || !bidIdInput ? 0.5 : 1
                        }}>
                        {acting ? 'Working...' : 'Exit for refund'}
                      </button>
                    </div>
                  </div>
                </div>

              </div>

              {/* ─────── How settlement works — full width below the split ─────── */}
              <div style={{ ...panelStyle }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#F8FAFC', marginBottom: '8px' }}>How settlement works</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {[
                    { num: '1', text: 'The round closes when its timer runs out' },
                    { num: '2', text: 'Wait a beat for the last bids to settle' },
                    { num: '3', text: 'Backers collect their shares at the final price' },
                    { num: '4', text: 'Backers who missed out exit for a full refund' },
                    { num: '5', text: 'Founder collects the raised funds' },
                    { num: '6', text: 'Founder recovers any unsold shares' },
                  ].map(s => (
                    <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', background: '#1e1e2e', borderRadius: '6px' }}>
                      <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'linear-gradient(135deg, #8B5CF6, #6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#fff', fontWeight: 700, flexShrink: 0 }}>{s.num}</div>
                      <span style={{ fontSize: '11px', color: '#94A3B8' }}>{s.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!auctionInfo && auctionAddress && !loadingInfo && (
            <div style={{ ...panelStyle, textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: '#94A3B8' }}>
                Nothing to settle yet. Once your round closes, your share of the shares will appear here.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
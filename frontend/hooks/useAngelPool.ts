//hooks/useAngelPool.ts
import { useState, useCallback, useEffect } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { type Address, formatUnits } from 'viem'
import { BrowserProvider, Contract, formatEther as ethersFormatEther } from 'ethers'
import { retryWriteContract } from '@/lib/contract-interactions'
import {
  NOVC_ANGEL_HOOK_ABI,
  CONTRACT_ADDRESSES,
  POOL_KEY,
  POOL_ID
} from '@/lib/abis'

export interface PoolInfo {
  totalValue: string
  apySlice: string
  auctionSlice: string
  idleSlice: string
  activeLiquiditySlice: string
  totalInvestors: string
}

export interface InvestorInfo {
  usdcBalance: string
  ethBalance: string
  sharePercentage: string
  activeLiquidity: string
  positionIds: string[]
  tokenBalances?: Record<string, string>
}

export interface AuctionProposal {
  auctionId: number
  auctionAddress: Address
  auctionToken: Address
  proposedAmount: string
  totalInvestedUSDC: string
  tokensPurchased: string
  isActive: boolean
  yesVotes: string
  noVotes: string
  deadline: string
  hasFunds: boolean
  status: 'voting' | 'executed' | 'expired'
}

export interface PreviewData {
  proposedAmount: string
  floorPrice: string
  tickSpacing: string
  maxPrice: string
  tokenAmountMicro: string
  tokenAmountUSDC: string
  verifyAmountMicro: string
  mathValid: boolean
  currentBlock: string
  auctionStartBlock: string
  auctionEndBlock: string
  isActive: boolean
}

// Constants
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address
const USDC_ADDRESS = '0x534b2f3A21130d7a60830c2Df862319e593943A3' as Address

const MAX_UINT256 = (1n << 256n) - 1n
const FAR_FUTURE = 4102444800 // Jan 1, 2100

// Helper to decode revert reasons
const decodeRevertReason = (error: any): string => {
  if (error?.reason) return error.reason

  const revertData = error?.data || error?.info?.error?.data || error?.error?.data
  if (revertData) {
    const data = revertData.toString()
    if (data.includes('No idle funds')) return 'No idle funds — deposit first, or the pool is already allocated.'

    if (data.includes('0x9ddc6f9e')) return 'Not enough auction funds'
    if (data.includes('0x5aabfefb')) return 'Voting period ended'
    if (data.includes('0xd9f31a6d')) return 'Already voted'
    if (data.includes('0x9b9cfe45')) return 'Insufficient voting power'
    if (data.includes('0x7939f424')) return 'Transfer failed'
    if (data.includes('0xc8731608')) return 'Insufficient allowance'
    if (data.includes('0xfb8f41b2')) return 'USDC allowance too low — the hook needs approval to spend your USDC'
    if (data.includes('0xec5a2e1b')) return 'Auction ended'
    if (data.includes('0x584a7938')) return 'Bid too small'
    if (data.includes('0x1aab16b9')) return 'Price below floor'
    if (data.includes('0x8ab1bcb7')) return 'Max price below clearing'
    if (data.includes('0x5b448f5b')) return 'Tokens not received'
    if (data.includes('0xdf4cc36d')) return 'Pool not initialized - call createAngelPool() first'
    if (data.includes('0x5ee44171')) return 'Pool not initialized - call createAngelPool() first'
    if (data.includes('0x8d6b8a82')) return 'TokensNotReceived - auction not initialized'
    if (data.includes('0xb86a3def')) return 'Accounting mismatch - call recoverAccounting() first'
    if (data.includes('0x860b82a9')) return 'Deposit amount is below the minimum required'
    if (data.includes('0x90b8ec18')) return 'Token transfer failed - check USDC approval and balance'
    if (data.includes('0xTotalValueMismatch')) return 'Accounting mismatch - call recoverAccounting()'
    if (data.includes('0xPrecisionLoss')) return 'Math precision loss - cannot execute'
    if (data.includes('0xTransferAmountMismatch')) return 'Transfer amount mismatch'
    if (data.includes('0xInsufficientPermit2Allowance')) return 'Permit2 allowance insufficient'
    if (data.includes('0xPermit2NotApproved')) return 'Permit2 not approved - one-time approval needed'
    if (data.includes('0xd81b2f2e')) return 'AllowanceExpired - Permit2 allowance has expired'
    // OpenZeppelin ERC20InsufficientBalance
    if (data.includes('0xe450d38c')) return 'USDC balance too low'
    if (data.includes('0x96c6fd1e')) return 'USDC address is zero'
    if (data.includes('0x08c379a0')) {
      try {
        const abiCoder = new (require('ethers')).AbiCoder()
        const reason = abiCoder.decode(['string'], '0x' + data.slice(10))[0]
        return reason
      } catch {
        return 'Contract call reverted'
      }
    }
  }

  const msg = error?.message || ''
  if (msg.includes('No idle funds')) return 'No idle funds — deposit first, or the pool is already allocated.'
  if (msg.includes('Not enough auction funds')) return 'Not enough auction funds'
  if (msg.includes('already voted')) return 'Already voted'
  if (msg.includes('voting ended')) return 'Voting period ended'
  if (msg.includes('voting power')) return 'Insufficient voting power'
  if (msg.includes('user rejected')) return 'Transaction rejected by user'
  if (msg.includes('insufficient funds')) return 'Transaction simulation failed - the contract call would revert. Try recoverAccounting() first, or check that the pool is initialized.'
  if (msg.includes('Pool already created')) return 'Pool already created'
  if (msg.includes('Pool not created')) return 'Pool not created - call createAngelPool() first'
  if (msg.includes('TransferFromFailed')) return 'Transfer failed'
  if (msg.includes('TotalValueMismatch')) return 'Accounting mismatch - call recoverAccounting()'
  if (msg.includes('PrecisionLoss')) return 'Math precision loss - cannot execute'
  if (msg.includes('TransferAmountMismatch')) return 'Transfer amount mismatch'

  return msg || 'Transaction failed'
}

// Helper to convert wagmi wallet client to ethers signer
const getEthersSigner = (walletClient: any) => {
  if (!walletClient) return null
  try {
    const { account, chain, transport } = walletClient
    const provider = new BrowserProvider(transport, {
      chainId: chain.id,
      name: chain.name,
    })
    const signer = provider.getSigner(account.address)
    return signer
  } catch (error) {
    console.error('Failed to create ethers signer:', error)
    return null
  }
}

// Create hook contract with ethers v6
const createHookContract = (signer: any) => {
  return new Contract(
    CONTRACT_ADDRESSES.NOVC_ANGEL_HOOK,
    NOVC_ANGEL_HOOK_ABI,
    signer
  )
}

// Helper for retrying RPC calls
const executeWithRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (err: any) {
      const isRetryable = err.message?.includes('RPC') ||
                          err.code === 'CALL_EXCEPTION' ||
                          err.message?.includes('missing revert data') ||
                          err.message?.includes('network') ||
                          err.message?.includes('timeout')
      if (isRetryable && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1500
        console.log(`[Retry] Call failed (attempt ${i + 1}/${maxRetries}), retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw err
    }
  }
  throw new Error('Max retries exceeded')
}

export function useAngelPool() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [hookContract, setHookContract] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [poolInfoState, setPoolInfoState] = useState<PoolInfo | null>(null)
  const [investorInfo, setInvestorInfo] = useState<InvestorInfo | null>(null)
  const [poolId, setPoolId] = useState<string>(POOL_ID)
  const [isPoolInitialized, setIsPoolInitialized] = useState<boolean>(false)
  const [permit2Approved, setPermit2Approved] = useState<boolean>(false)

  // Initialize contract and check pool status
  useEffect(() => {
    const initContract = async () => {
      if (walletClient && address) {
        try {
          const signer = await getEthersSigner(walletClient)
          if (signer) {
            const contract = createHookContract(signer)
            setHookContract(contract)

            try {
              const pid = await contract.poolId()
              console.log('[AngelPool] Contract poolId() returned:', pid?.toString())

              const isInit = pid && pid !== '0x0000000000000000000000000000000000000000000000000000000000000000'
              setIsPoolInitialized(!!isInit)

              if (isInit) {
                console.log('[AngelPool] Pool is initialized with ID:', pid.toString())
                setPoolId(pid.toString())
                await refreshPoolInfo(contract)
                await refreshInvestorInfo(contract)
              } else {
                console.log('[AngelPool] Pool not initialized yet')
              }
            } catch (e) {
              console.log('[AngelPool] Error checking poolId, assuming not initialized:', e)
              setIsPoolInitialized(false)
            }
          }
        } catch (err) {
          console.error('[AngelPool] Failed to initialize contract:', err)
        }
      }
    }

    initContract()
  }, [walletClient, address])

  // Refresh pool info - can be called with or without contract param
  const refreshPoolInfo = useCallback(async (contract?: any) => {
    const targetContract = contract || hookContract
    if (!targetContract) return

    try {
      let pid
      try {
        pid = await targetContract.poolId()
      } catch (err) {
        console.log('[AngelPool] Cannot get poolId, pool may not be initialized')
        setIsPoolInitialized(false)
        return
      }

      if (!pid || pid === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        console.log('[AngelPool] Pool not initialized in refresh')
        setIsPoolInitialized(false)
        return
      }

      setIsPoolInitialized(true)

      const info = await targetContract.getPoolInfo()
      const infoArray = info as any[]

      const smartFormat = (val: bigint): string => {
        const abs = val < 0n ? -val : val
        if (abs > 10n ** 15n) {
          return formatUnits(val, 18)
        }
        return formatUnits(val, 6)
      }

      const totalVal = smartFormat(BigInt(infoArray[0]?.toString() || '0'))
      const apyVal = smartFormat(BigInt(infoArray[1]?.toString() || '0'))
      const auctionVal = smartFormat(BigInt(infoArray[2]?.toString() || '0'))
      const idleVal = smartFormat(BigInt(infoArray[3]?.toString() || '0'))
      const liqVal = smartFormat(BigInt(infoArray[4]?.toString() || '0'))

      console.log('[AngelPool] Pool info refreshed:', {
        totalValue: totalVal,
        auctionSlice: auctionVal,
        idleSlice: idleVal
      })

      setPoolInfoState({
        totalValue: totalVal,
        apySlice: apyVal,
        auctionSlice: auctionVal,
        idleSlice: idleVal,
        activeLiquiditySlice: liqVal,
        totalInvestors: infoArray[5]?.toString() || '0'
      })
    } catch (err) {
      console.error('[AngelPool] Failed to get pool info:', err)
    }
  }, [hookContract])

  // Refresh investor info - can be called with or without contract param
  const refreshInvestorInfo = useCallback(async (contract?: any) => {
    const targetContract = contract || hookContract
    if (!targetContract || !address) return

    try {
      const pid = await targetContract.poolId()
      if (!pid || pid === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        return
      }

      const info = await executeWithRetry(() => targetContract.getInvestorInfo(address))
      const infoArray = info as any[]

      const usdcRaw = BigInt(infoArray[0]?.toString() || '0')
      const ethRaw = BigInt(infoArray[1]?.toString() || '0')
      const shareRaw = BigInt(infoArray[2]?.toString() || '0')

      // ===== DEBUG LOGGING (kept from original) =====
      const poolInfo = await targetContract.getPoolInfo()
      const poolInfoArray = poolInfo as any[]
      const totalValue = poolInfoArray[0] ? BigInt(poolInfoArray[0].toString()) : 0n
      const apySlice = poolInfoArray[1] ? BigInt(poolInfoArray[1].toString()) : 0n
      const auctionSlice = poolInfoArray[2] ? BigInt(poolInfoArray[2].toString()) : 0n
      const idleSlice = poolInfoArray[3] ? BigInt(poolInfoArray[3].toString()) : 0n
      const activeLiquiditySlice = poolInfoArray[4] ? BigInt(poolInfoArray[4].toString()) : 0n

      console.log('[AngelPool] Share calculation debug:', {
        investorUSDC: formatUnits(usdcRaw, 6),
        investorETH: ethersFormatEther(ethRaw),
        investorTotal: (Number(formatUnits(usdcRaw, 6)) + (Number(ethersFormatEther(ethRaw)) * 2000)).toFixed(2),
        shareRaw: shareRaw.toString(),
        sharePercentage: (Number(shareRaw) / 100).toFixed(2) + '%',
        totalPoolValue: formatUnits(totalValue, 6),
        apySlice: formatUnits(apySlice, 6),
        auctionSlice: formatUnits(auctionSlice, 6),
        idleSlice: formatUnits(idleSlice, 6),
        activeLiquiditySlice: formatUnits(activeLiquiditySlice, 6),
        sumOfSlices: (Number(formatUnits(apySlice, 6)) +
                      Number(formatUnits(auctionSlice, 6)) +
                      Number(formatUnits(idleSlice, 6)) +
                      Number(formatUnits(activeLiquiditySlice, 6))).toFixed(2)
      })
      // ===== END DEBUG LOGGING =====

      const usdcFormatted = formatUnits(usdcRaw, 6)
      const ethFormatted = ethersFormatEther(ethRaw)
      const sharePercentage = (Number(shareRaw) / 100).toFixed(2) + '%'

      console.log('[AngelPool] Investor info refreshed:', {
        usdcContributed: usdcFormatted,
        ethContributed: ethFormatted,
        sharePercentage,
        rawShare: shareRaw.toString()
      })

      setInvestorInfo({
        usdcBalance: usdcFormatted,
        ethBalance: ethFormatted,
        sharePercentage,
        activeLiquidity: infoArray[3]?.toString() || '0',
        positionIds: (infoArray[4] as any[])?.map((id: any) => id?.toString() || '0') || []
      })
    } catch (err) {
      console.error('[AngelPool] Failed to get investor info:', err)
    }
  }, [hookContract, address])

  // Auto-refresh when contract changes
  useEffect(() => {
    if (hookContract && address && isPoolInitialized) {
      refreshPoolInfo()
      refreshInvestorInfo()
    }
  }, [hookContract, address, isPoolInitialized, refreshPoolInfo, refreshInvestorInfo])

  // Check Permit2 approval status
  const checkPermit2Approval = useCallback(async () => {
    if (!hookContract || !address) return

    try {
      const approved = await executeWithRetry(() => hookContract.isPermit2Approved(address))
      setPermit2Approved(approved === true)
      console.log('[AngelPool] Permit2 approved:', approved)
    } catch (err) {
      console.log('[AngelPool] Permit2 approval check unavailable (will retry on next refresh)')
    }
  }, [hookContract, address])

  useEffect(() => {
    if (hookContract && address) {
      checkPermit2Approval()
    }
  }, [hookContract, address, checkPermit2Approval])

  // Get gas params - simplified, let MetaMask handle it
  const getGasForHook = useCallback(async () => {
    return {} // Return empty object - let MetaMask handle gas estimation
  }, [])

  // Check auction slice balance
  const checkAuctionSliceBalance = useCallback(async () => {
    if (!hookContract || !isPoolInitialized) return null

    try {
      const poolInfo = await hookContract.getPoolInfo()
      const poolInfoArray = poolInfo as any[]
      const auctionSlice = poolInfoArray[2] ? BigInt(poolInfoArray[2].toString()) : 0n
      const auctionSliceUSDC = formatUnits(auctionSlice, 6)

      console.log('[AngelPool] Auction slice balance:', auctionSliceUSDC, 'USDC')
      return auctionSliceUSDC
    } catch (err) {
      console.error('[AngelPool] Failed to check auction slice balance:', err)
      return null
    }
  }, [hookContract, isPoolInitialized])

  // Create Angel Pool
  const createAngelPool = useCallback(async () => {
    if (!hookContract) throw new Error('Contract not initialized')

    try {
      const pid = await hookContract.poolId()
      if (pid && pid !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        console.log('[AngelPool] Pool already initialized with ID:', pid.toString())
        setIsPoolInitialized(true)
        await refreshPoolInfo()
        await refreshInvestorInfo()
        return pid.toString()
      }
    } catch (err) {
      // Pool not initialized, continue
    }

    setLoading(true)
    setError(null)

    try {
      console.log('[AngelPool] Creating pool...')

      const tx = await hookContract.createAngelPool({
        gasLimit: 500000n
      })

      console.log('[AngelPool] Pool creation tx:', tx.hash)

      const receipt = await tx.wait()

      if (receipt.status === 0) {
        throw new Error('Pool creation reverted on-chain')
      }

      const pid = await hookContract.poolId()
      setIsPoolInitialized(true)
      setPoolId(pid.toString())

      await refreshPoolInfo()
      await refreshInvestorInfo()

      console.log('[AngelPool] Pool created successfully with ID:', pid.toString())
      return pid.toString()
    } catch (err: any) {
      console.error('[AngelPool] Failed to create pool:', err)

      if (err?.message?.includes('Pool already created') || err?.data?.includes('Pool already created')) {
        console.log('[AngelPool] Pool already exists, updating state')
        setIsPoolInitialized(true)
        await refreshPoolInfo()
        await refreshInvestorInfo()
        return
      }

      setError(decodeRevertReason(err))
      throw err
    } finally {
      setLoading(false)
    }
  }, [hookContract, refreshPoolInfo, refreshInvestorInfo])

  const depositUSDC = useCallback(async (amount: string) => {
    if (!hookContract) throw new Error('Contract not initialized')
    if (!walletClient) throw new Error('Wallet not connected')
    if (!publicClient) throw new Error('Public client not available')
    if (!isPoolInitialized) throw new Error('Pool not initialized. Call createAngelPool() first')
    setLoading(true)
    setError(null)

    try {
      const amountWei = BigInt(amount)
      const hookAddress = CONTRACT_ADDRESSES.NOVC_ANGEL_HOOK as Address
      const usdcAddress = USDC_ADDRESS
      const userAddress = walletClient.account.address

      // Read balance on the correct USDC
      const balance = await publicClient.readContract({
        address: usdcAddress,
        abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }],
        functionName: 'balanceOf',
        args: [userAddress]
      }) as bigint
      console.log('[AngelPool] User USDC balance:', formatUnits(balance, 6))

      if (balance < amountWei) {
        throw new Error(`Insufficient USDC balance`)
      }

      const currentAllowance = await publicClient.readContract({
        address: usdcAddress,
        abi: [{ name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }],
        functionName: 'allowance',
        args: [userAddress, hookAddress]
      }) as bigint
      console.log('[AngelPool] Current USDC allowance:', formatUnits(currentAllowance, 6))

      if (currentAllowance < amountWei) {
        console.log('[AngelPool] Approving USDC via writeContract...')
        const approveHash = await walletClient.writeContract({
          address: usdcAddress,
          abi: [{ name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }],
          functionName: 'approve',
          args: [hookAddress, MAX_UINT256],
          chain: walletClient.chain,
          account: userAddress,
        })
        console.log('[AngelPool] Approval tx:', approveHash)
        const approveRc = await publicClient.waitForTransactionReceipt({ hash: approveHash, confirmations: 1 })
        if (approveRc.status !== 'success') throw new Error('USDC approve tx reverted')

        const postApproveAllowance = await publicClient.readContract({
          address: usdcAddress,
          abi: [{ name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }],
          functionName: 'allowance',
          args: [userAddress, hookAddress]
        }) as bigint
        console.log('[AngelPool] Post-approve allowance:', formatUnits(postApproveAllowance, 6))
        if (postApproveAllowance < amountWei) {
          throw new Error('Allowance did not update after approve')
        }

        console.log('[AngelPool] USDC approved')
        await new Promise(resolve => setTimeout(resolve, 2000))
      }

      console.log('[AngelPool] Depositing USDC...')
      try {
        await publicClient.simulateContract({
          address: hookAddress,
          abi: NOVC_ANGEL_HOOK_ABI,
          functionName: 'depositUSDC',
          args: [amountWei],
          account: userAddress,
        })
      } catch (simErr: any) {
        console.error('[AngelPool] Deposit simulation failed:', simErr)
        throw new Error(decodeRevertReason(simErr) || 'Deposit would fail on-chain. Check pool status and USDC balance.')
      }
      const depositHash = await retryWriteContract(walletClient, {
        address: hookAddress,
        abi: NOVC_ANGEL_HOOK_ABI,
        functionName: 'depositUSDC',
        args: [amountWei],
        chain: walletClient.chain,
        account: userAddress,
        gas: 500000n,
      }, 'depositUSDC')

      console.log('[AngelPool] Deposit tx:', depositHash)
      const receipt = await publicClient.waitForTransactionReceipt({ hash: depositHash, confirmations: 1 })

      if (receipt.status !== 'success') {
        throw new Error('Deposit reverted on-chain')
      }

      console.log('[AngelPool] Deposit confirmed')
      await refreshPoolInfo()
      await refreshInvestorInfo()
    } catch (err: any) {
      console.error('[AngelPool] Deposit failed:', err)
      setError(decodeRevertReason(err))
      throw err
    } finally {
      setLoading(false)
    }
  }, [hookContract, walletClient, publicClient, isPoolInitialized, refreshPoolInfo, refreshInvestorInfo])

  // Deposit ETH
  const depositETH = useCallback(async (amount: string) => {
    if (!hookContract) throw new Error('Contract not initialized')

    try {
      const pid = await hookContract.poolId()
      if (!pid || pid === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        throw new Error('Pool not initialized. Call createAngelPool() first')
      }
    } catch (err) {
      throw new Error('Pool not initialized. Call createAngelPool() first')
    }

    setLoading(true)
    setError(null)
    try {
      console.log('[AngelPool] Depositing ETH...')
      try {
        await hookContract.depositETH.staticCall({ value: amount })
      } catch (simErr: any) {
        console.error('[AngelPool] ETH deposit simulation failed:', simErr)
        throw new Error(decodeRevertReason(simErr) || 'ETH deposit would fail on-chain. Check pool status.')
      }
      const hookAddress = CONTRACT_ADDRESSES.NOVC_ANGEL_HOOK as Address
      const depositHash = await walletClient!.writeContract({
        address: hookAddress,
        abi: NOVC_ANGEL_HOOK_ABI,
        functionName: 'depositETH',
        args: [],
        value: BigInt(amount),
        chain: walletClient!.chain,
        account: walletClient!.account.address,
        gas: 500000n,
      })
      console.log('[AngelPool] Deposit tx:', depositHash)
      const receipt = await publicClient!.waitForTransactionReceipt({ hash: depositHash, confirmations: 1 })
      if (receipt.status !== 'success') {
        throw new Error('Deposit reverted on-chain')
      }
      console.log('[AngelPool] Deposit confirmed')
      await refreshPoolInfo()
      await refreshInvestorInfo()
    } catch (err: any) {
      console.error('[AngelPool] Deposit failed:', err)
      setError(decodeRevertReason(err))
      throw err
    } finally {
      setLoading(false)
    }
  }, [hookContract, refreshPoolInfo, refreshInvestorInfo])

  // Withdraw USDC
  const withdrawUSDC = useCallback(async (amount: string) => {
    if (!hookContract) throw new Error('Contract not initialized')

    try {
      const pid = await hookContract.poolId()
      if (!pid || pid === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        throw new Error('Pool not initialized')
      }
    } catch (err) {
      throw new Error('Pool not initialized')
    }

    setLoading(true)
    setError(null)
    try {
      const investorData = await hookContract.getInvestorInfo(address)
      const investorDataArray = investorData as any[]
      const availableUSDC = BigInt(investorDataArray[0]?.toString() || '0')
      const requestedAmount = BigInt(amount)
      if (requestedAmount > availableUSDC) {
        throw new Error(`Insufficient USDC in pool. Available: ${formatUnits(availableUSDC, 6)} USDC`)
      }
      if (requestedAmount === 0n) throw new Error('Amount must be greater than 0')

      console.log('[AngelPool] Withdrawing USDC...')
      const tx = await hookContract.withdrawUSDC(requestedAmount, { gasLimit: 800000n })
      console.log('[AngelPool] Withdraw tx:', tx.hash)
      const receipt = await tx.wait()
      if (receipt.status === 0) {
        throw new Error('Withdrawal reverted on-chain')
      }
      console.log('[AngelPool] Withdraw confirmed')
      await refreshPoolInfo()
      await refreshInvestorInfo()
    } catch (err: any) {
      console.error('[AngelPool] Withdraw failed:', err)
      let msg = decodeRevertReason(err)
      if (msg.includes('execution reverted') && !err?.reason) {
        msg = 'Withdrawal reverted. Funds may be locked in liquidity positions or active auction investments. Try withdrawing a smaller amount.'
      }
      setError(msg)
      throw new Error(msg)
    } finally {
      setLoading(false)
    }
  }, [hookContract, refreshPoolInfo, refreshInvestorInfo, address])

  // Withdraw ETH
  const withdrawETH = useCallback(async (amount: string) => {
    if (!hookContract) throw new Error('Contract not initialized')

    try {
      const pid = await hookContract.poolId()
      if (!pid || pid === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        throw new Error('Pool not initialized')
      }
    } catch (err) {
      throw new Error('Pool not initialized')
    }

    setLoading(true)
    setError(null)
    try {
      const investorData = await hookContract.getInvestorInfo(address)
      const investorDataArray = investorData as any[]
      const availableETH = BigInt(investorDataArray[1]?.toString() || '0')
      const requestedAmount = BigInt(amount)
      if (requestedAmount > availableETH) {
        throw new Error(`Insufficient ETH in pool. Available: ${formatUnits(availableETH, 18)} ETH`)
      }
      if (requestedAmount === 0n) throw new Error('Amount must be greater than 0')

      console.log('[AngelPool] Withdrawing ETH...')
      const tx = await hookContract.withdrawETH(requestedAmount, { gasLimit: 800000n })
      console.log('[AngelPool] Withdraw tx:', tx.hash)
      const receipt = await tx.wait()
      if (receipt.status === 0) {
        throw new Error('Withdrawal reverted on-chain')
      }
      console.log('[AngelPool] Withdraw confirmed')
      await refreshPoolInfo()
      await refreshInvestorInfo()
    } catch (err: any) {
      console.error('[AngelPool] Withdraw failed:', err)
      let msg = decodeRevertReason(err)
      if (msg.includes('execution reverted') && !err?.reason) {
        msg = 'Withdrawal reverted. Funds may be locked in liquidity positions. Try withdrawing a smaller amount.'
      }
      setError(msg)
      throw new Error(msg)
    } finally {
      setLoading(false)
    }
  }, [hookContract, refreshPoolInfo, refreshInvestorInfo, address])

  // ✅ FIX: Allocate Slices — short-circuit when idle is zero.
  // The deposit auto-allocation in the dashboard drains idle to 0; calling
  // allocateSlices again reverts with "No idle funds". We now check first.
  const allocateSlices = useCallback(async () => {
    if (!hookContract) throw new Error('Contract not initialized')
    if (!isPoolInitialized) throw new Error('Pool not initialized. Call createAngelPool() first')
    setLoading(true)
    setError(null)
    try {
      // ✅ FIX: pre-flight read of idle — if it is 0, do nothing.
      try {
        const poolInfo = await hookContract.getPoolInfo()
        const poolInfoArray = poolInfo as any[]
        const idleRaw = BigInt(poolInfoArray[3]?.toString() || '0')
        if (idleRaw === 0n) {
          console.log('[AngelPool] allocateSlices skipped — idle is already 0')
          return
        }
      } catch (e) {
        // if the read fails, fall through and let simulateContract decide
        console.log('[AngelPool] Could not pre-read idle; continuing', e)
      }

      console.log('[AngelPool] Allocating slices...')
      const hookAddress = CONTRACT_ADDRESSES.NOVC_ANGEL_HOOK as Address
      const userAddress = walletClient!.account.address
      try {
        await publicClient!.simulateContract({
          address: hookAddress,
          abi: NOVC_ANGEL_HOOK_ABI,
          functionName: 'allocateSlices',
          args: [],
          account: userAddress,
        })
      } catch (simErr: any) {
        console.error('[AngelPool] Allocation simulation failed:', simErr)
        throw new Error(decodeRevertReason(simErr) || 'Allocation would fail on-chain. Check pool status and idle funds.')
      }
      const allocHash = await retryWriteContract(walletClient!, {
        address: hookAddress,
        abi: NOVC_ANGEL_HOOK_ABI,
        functionName: 'allocateSlices',
        args: [],
        chain: walletClient!.chain,
        account: userAddress,
        gas: 300000n,
      }, 'allocateSlices')
      console.log('[AngelPool] Allocate tx:', allocHash)
      const receipt = await publicClient!.waitForTransactionReceipt({ hash: allocHash, confirmations: 1 })
      if (receipt.status !== 'success') {
        throw new Error('Allocation reverted on-chain')
      }
      console.log('[AngelPool] Allocation confirmed')
      await refreshPoolInfo()
    } catch (err: any) {
      console.error('[AngelPool] Allocation failed:', err)
      setError(decodeRevertReason(err))
      throw err
    } finally {
      setLoading(false)
    }
  }, [hookContract, isPoolInitialized, walletClient, publicClient, refreshPoolInfo])

  // Recover Accounting
  const recoverAccounting = useCallback(async () => {
    if (!walletClient || !publicClient) throw new Error('Wallet not connected')
    if (!isPoolInitialized) throw new Error('Pool not initialized')

    setLoading(true)
    setError(null)
    const hookAddress = CONTRACT_ADDRESSES.NOVC_ANGEL_HOOK as Address
    const userAddress = walletClient.account.address

    try {
      console.log('[AngelPool] Recovering accounting...')
      const recoverHash = await retryWriteContract(walletClient, {
        address: hookAddress,
        abi: NOVC_ANGEL_HOOK_ABI,
        functionName: 'recoverAccounting',
        args: [],
        chain: walletClient.chain,
        account: userAddress,
        gas: 300000n,
      }, 'recoverAccounting')
      console.log('[AngelPool] Recovery tx:', recoverHash)
      const receipt = await publicClient.waitForTransactionReceipt({ hash: recoverHash, confirmations: 1 })
      if (receipt.status !== 'success') {
        throw new Error('Recovery reverted on-chain')
      }
      console.log('[AngelPool] Accounting recovered successfully')
      await refreshPoolInfo()
      await refreshInvestorInfo()
    } catch (err: any) {
      console.error('[AngelPool] Recovery failed:', err)
      setError(decodeRevertReason(err))
      throw err
    } finally {
      setLoading(false)
    }
  }, [walletClient, publicClient, isPoolInitialized, refreshPoolInfo, refreshInvestorInfo])

  // Approve USDC for Permit2 (one-time, hook-side helper)
  const approveUSDCForPermit2 = useCallback(async () => {
    if (!hookContract) throw new Error('Contract not initialized')

    try {
      const pid = await hookContract.poolId()
      if (!pid || pid === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        throw new Error('Pool not initialized')
      }
    } catch (err) {
      throw new Error('Pool not initialized')
    }

    setLoading(true)
    setError(null)

    try {
      console.log('[AngelPool] Approving USDC for Permit2...')
      const tx = await hookContract.approveUSDCForPermit2({
        gasLimit: 100000n
      })
      console.log('[AngelPool] Approval tx:', tx.hash)
      const receipt = await tx.wait()
      if (receipt.status === 0) {
        throw new Error('Approval reverted on-chain')
      }
      console.log('[AngelPool] USDC approved for Permit2')
      setPermit2Approved(true)
    } catch (err: any) {
      console.error('[AngelPool] Approval failed:', err)
      setError(decodeRevertReason(err))
      throw err
    } finally {
      setLoading(false)
    }
  }, [hookContract])

  // ✅ FIX: use the hook's USDC for the Permit2 token argument.
  const approvePersonalAuctionViaPermit2 = useCallback(async (
    auctionAddress: Address,
    amount: bigint
  ) => {
    if (!walletClient) throw new Error('Wallet not connected')

    setLoading(true)
    setError(null)

    try {
      console.log('[AngelPool] Approving personal auction via Permit2:', { auctionAddress, amount: amount.toString() })

      const signer = await getEthersSigner(walletClient)
      if (!signer) throw new Error('No signer available')

      const permit2Contract = new Contract(
        PERMIT2_ADDRESS,
        ['function approve(address token, address spender, uint160 amount, uint48 expiration) external'],
        signer
      )

      const tx = await permit2Contract.approve(
        USDC_ADDRESS,   
        auctionAddress,
        amount,
        FAR_FUTURE,
        { gasLimit: 200000n }
      )

      console.log('[AngelPool] Personal approval tx:', tx.hash)
      const receipt = await tx.wait()
      if (receipt.status === 0) {
        throw new Error('Personal approval reverted on-chain')
      }
      console.log('[AngelPool] Personal auction approved via Permit2')
    } catch (err: any) {
      console.error('[AngelPool] Personal approval failed:', err)
      setError(decodeRevertReason(err))
      throw err
    } finally {
      setLoading(false)
    }
  }, [walletClient])

  // Approve auction via Permit2 (hook approval)
  const approveHookAuctionViaPermit2 = useCallback(async (
    auctionAddress: Address,
    amount: bigint
  ) => {
    if (!hookContract) throw new Error('Contract not initialized')
    if (!isPoolInitialized) throw new Error('Pool not initialized')

    setLoading(true)
    setError(null)

    try {
      console.log('[AngelPool] Approving hook auction via Permit2:', { auctionAddress, amount: amount.toString() })

      const tx = await hookContract.approveAuctionViaPermit2(
        auctionAddress,
        amount,
        FAR_FUTURE
      )

      console.log('[AngelPool] Hook approval tx:', tx.hash)
      const receipt = await tx.wait()
      if (receipt.status === 0) {
        throw new Error('Hook approval reverted on-chain')
      }
      console.log('[AngelPool] Hook auction approved via Permit2')
    } catch (err: any) {
      console.error('[AngelPool] Hook approval failed:', err)
      setError(decodeRevertReason(err))
      throw err
    } finally {
      setLoading(false)
    }
  }, [hookContract, isPoolInitialized])

  // Preview Execute Auction
  const previewExecuteAuction = useCallback(async (auctionId: number): Promise<PreviewData | null> => {
    if (!hookContract) {
      console.log('[AngelPool] Contract not initialized for preview')
      return null
    }

    try {
      console.log(`[AngelPool] Previewing execute auction ${auctionId}...`)
      const preview = await hookContract.previewExecuteAuction(auctionId)
      const previewArray = preview as any[]

      const data = {
        proposedAmount: formatUnits(previewArray[0]?.toString() || '0', 6),
        floorPrice: previewArray[1]?.toString() || '0',
        tickSpacing: previewArray[2]?.toString() || '0',
        maxPrice: previewArray[3]?.toString() || '0',
        tokenAmountMicro: previewArray[4]?.toString() || '0',
        tokenAmountUSDC: (Number(previewArray[5]?.toString() || '0') / 1e6).toFixed(6),
        verifyAmountMicro: previewArray[6]?.toString() || '0',
        mathValid: previewArray[7] === true,
        currentBlock: previewArray[8]?.toString() || '0',
        auctionStartBlock: previewArray[9]?.toString() || '0',
        auctionEndBlock: previewArray[10]?.toString() || '0',
        isActive: previewArray[11] === true
      }

      console.log('[AngelPool] Preview data:', {
        ...data,
        tokenAmountMicro: data.tokenAmountMicro,
        verifyAmountMicro: data.verifyAmountMicro,
        match: data.tokenAmountMicro === data.verifyAmountMicro ? '✅' : '❌'
      })

      return data
    } catch (err) {
      console.error('[AngelPool] Preview failed:', err)
      return null
    }
  }, [hookContract])

  // Propose Auction
  const proposeAuction = useCallback(async (auctionAddress: Address, amount: string, maxPrice: string) => {
    if (!hookContract) throw new Error('Contract not initialized')

    try {
      const pid = await hookContract.poolId()
      if (!pid || pid === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        throw new Error('Pool not initialized. Call createAngelPool() first')
      }
    } catch (err) {
      throw new Error('Pool not initialized. Call createAngelPool() first')
    }

    setLoading(true)
    setError(null)

    try {
      await refreshPoolInfo()

      const amountWei = BigInt(amount)
      const amountInUSDC = Number(formatUnits(amountWei, 6))

      console.log('[AngelPool] Proposing auction:', {
        auctionAddress,
        amountWei: amountWei.toString(),
        amountInUSDC,
        maxPrice
      })

      if (!poolInfoState) {
        throw new Error('Pool info not available')
      }

      const auctionSliceNum = parseFloat(poolInfoState.auctionSlice)

      if (amountInUSDC > auctionSliceNum) {
        throw new Error(`Not enough auction funds. Available: $${auctionSliceNum.toFixed(2)} USDC, Requested: $${amountInUSDC.toFixed(2)} USDC`)
      }

      if (amountInUSDC <= 0) {
        throw new Error('Amount must be greater than 0')
      }

      console.log('[AngelPool] Sending propose transaction with amount:', amountWei.toString())

      const hookAddress = CONTRACT_ADDRESSES.NOVC_ANGEL_HOOK as Address
      const userAddress = walletClient!.account.address
      const proposeHash = await retryWriteContract(walletClient!, {
        address: hookAddress,
        abi: NOVC_ANGEL_HOOK_ABI,
        functionName: 'proposeAuctionInvestment',
        args: [auctionAddress, amountWei],
        chain: walletClient!.chain,
        account: userAddress,
        gas: 500000n,
      }, 'proposeAuctionInvestment')

      console.log('[AngelPool] Proposal tx sent:', proposeHash)

      const receipt = await publicClient!.waitForTransactionReceipt({ hash: proposeHash, confirmations: 1 })

      if (receipt.status !== 'success') {
        throw new Error('Proposal transaction reverted on-chain')
      }

      let auctionId = null
      if (receipt.logs && receipt.logs.length > 0) {
        for (const log of receipt.logs) {
          if (log.topics && log.topics.length > 1) {
            const topic = log.topics[1]
            if (topic) {
              auctionId = BigInt(topic).toString()
              break
            }
          }
        }
      }

      if (!auctionId && hookContract) {
        try {
          const investments = await hookContract.getPoolAuctionInvestments()
          const investmentsArray = investments as any[] || []
          if (investmentsArray.length > 0) {
            auctionId = investmentsArray[investmentsArray.length - 1]?.toString() || null
          }
        } catch (err) {
          console.log('[AngelPool] Could not fetch latest investments')
        }
      }

      console.log('[AngelPool] Proposal confirmed, auction ID:', auctionId || 'unknown')
      console.log('[AngelPool] IMPORTANT: Funds will only be transferred when vote threshold (60%) is reached')

      await refreshPoolInfo()

      return auctionId || '0'
    } catch (err: any) {
      console.error('[AngelPool] Proposal failed:', err)

      let errorMsg = err?.reason || err?.message || 'Proposal failed'

      if (errorMsg.includes('Not enough auction funds')) {
        errorMsg = err.message
      } else if (errorMsg.includes('user rejected')) {
        errorMsg = 'Transaction cancelled'
      } else if (errorMsg.includes('0x9ddc6f9e')) {
        errorMsg = 'Not enough auction funds available'
      } else if (errorMsg.includes('0x7939f424')) {
        errorMsg = 'Transfer failed'
      } else if (errorMsg.includes('TotalValueMismatch')) {
        errorMsg = 'Accounting mismatch - please recover accounting first'
      }

      setError(errorMsg)
      throw new Error(errorMsg)
    } finally {
      setLoading(false)
    }
  }, [hookContract, refreshPoolInfo, poolInfoState, walletClient, publicClient])

  // Vote on Auction
  const voteOnAuction = useCallback(async (auctionId: number, voteFor: boolean) => {
    if (!hookContract) throw new Error('Contract not initialized')

    try {
      const pid = await hookContract.poolId()
      if (!pid || pid === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        throw new Error('Pool not initialized. Call createAngelPool() first')
      }
    } catch (err) {
      throw new Error('Pool not initialized. Call createAngelPool() first')
    }

    setLoading(true)
    setError(null)

    try {
      console.log(`[AngelPool] Voting ${voteFor ? 'YES' : 'NO'} on auction ${auctionId}`)

      await refreshInvestorInfo()

      if (!investorInfo) {
        throw new Error('Investor info not available')
      }

      const usdcContributed = parseFloat(investorInfo.usdcBalance)
      const ethContributed = parseFloat(investorInfo.ethBalance)

      console.log('[AngelPool] Investor contribution:', {
        usdcContributed,
        ethContributed,
        sharePercentage: investorInfo.sharePercentage
      })

      if (usdcContributed <= 0 && ethContributed <= 0) {
        throw new Error('You must deposit funds to the pool before voting')
      }

      let auctionDetails
      try {
        auctionDetails = await hookContract.getAuctionDetails(auctionId)
        const auctionArray = auctionDetails as any[]
        console.log('[AngelPool] Auction details for vote:', {
          auctionId,
          isActive: auctionArray[4],
          yesVotes: auctionArray[5]?.toString(),
          noVotes: auctionArray[6]?.toString(),
          deadline: auctionArray[7]?.toString()
        })

        if (!auctionArray[4]) {
          throw new Error('Voting period has ended for this proposal')
        }

        const deadline = Number(auctionArray[7]?.toString() || '0')
        if (deadline > 0 && Date.now() / 1000 > deadline) {
          throw new Error('Voting deadline has passed')
        }
      } catch (err) {
        console.log('[AngelPool] Could not fetch auction details')
      }

      console.log('[AngelPool] Sending vote transaction...')

      const tx = await hookContract.voteOnAuction(auctionId, voteFor, {
        gasLimit: 500000n
      })

      console.log('[AngelPool] Vote tx sent:', tx.hash)

      const receipt = await tx.wait()

      if (receipt.status === 0) {
        throw new Error('Transaction reverted on-chain')
      }

      console.log('[AngelPool] Vote confirmed:', receipt.hash)

      await new Promise(resolve => setTimeout(resolve, 2000))

      await refreshInvestorInfo()

      return true
    } catch (err: any) {
      console.error('[AngelPool] Vote failed:', err)

      let errorMsg = err?.message || 'Vote failed'

      if (errorMsg.includes('0x7939f424') || errorMsg.includes('TransferFromFailed')) {
        errorMsg = '⚠️ You need to have USDC deposited in the pool to vote. Please deposit USDC first.'
      } else if (errorMsg.includes('0x5aabfefb') || errorMsg.includes('voting ended')) {
        errorMsg = 'Voting period has ended for this proposal'
      } else if (errorMsg.includes('0xd9f31a6d') || errorMsg.includes('already voted')) {
        errorMsg = 'You have already voted on this proposal'
      } else if (errorMsg.includes('0x9b9cfe45') || errorMsg.includes('voting power')) {
        errorMsg = 'You do not have enough voting power in the pool'
      } else if (errorMsg.includes('Not an investor')) {
        errorMsg = 'You must deposit USDC to the pool before voting'
      } else if (errorMsg.includes('user rejected')) {
        errorMsg = 'Transaction cancelled'
      } else if (errorMsg.includes('insufficient funds')) {
        errorMsg = 'Insufficient ETH for gas'
      } else if (errorMsg.includes('TotalValueMismatch')) {
        errorMsg = 'Accounting mismatch - please recover accounting first'
      } else if (errorMsg.includes('PrecisionLoss')) {
        errorMsg = 'Math precision loss - cannot execute this auction'
      }

      setError(errorMsg)
      throw new Error(errorMsg)
    } finally {
      setLoading(false)
    }
  }, [hookContract, refreshInvestorInfo, investorInfo])

  // Execute Auction
  const executeAuction = useCallback(async (auctionId: number) => {
    if (!hookContract) throw new Error('Contract not initialized')

    try {
      const pid = await hookContract.poolId()
      if (!pid || pid === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        throw new Error('Pool not initialized')
      }
    } catch (err) {
      throw new Error('Pool not initialized')
    }

    setLoading(true)
    setError(null)

    try {
      console.log('[AngelPool] Executing auction:', auctionId)

      const preview = await previewExecuteAuction(auctionId)
      if (preview && !preview.mathValid) {
        console.warn('[AngelPool] ⚠️ Preview shows math invalid!', preview)
      }

      const tx = await hookContract.executeAuction(auctionId, {
        gasLimit: 800000n
      })

      console.log('[AngelPool] Execute tx:', tx.hash)
      const receipt = await tx.wait()
      if (receipt.status === 0) {
        throw new Error('Execution reverted on-chain')
      }
      console.log('[AngelPool] Execute confirmed')

      await refreshPoolInfo()
      return `bid-${auctionId}-${Date.now()}`
    } catch (err: any) {
      console.error('[AngelPool] Execute failed:', err)
      setError(decodeRevertReason(err))
      throw err
    } finally {
      setLoading(false)
    }
  }, [hookContract, refreshPoolInfo, previewExecuteAuction])

  // Get Auction Details
  const getAuctionDetails = useCallback(async (auctionId: number) => {
    if (!hookContract) throw new Error('Contract not initialized')
    try {
      const investment = await hookContract.auctionInvestments(auctionId)
      const investmentArray = investment as any[]

      if (!investmentArray || investmentArray[0] === 0n) {
        console.log(`[AngelPool] Auction ${auctionId} not found in contract`)
        return null
      }

      console.log('[AngelPool] Raw investment:', {
        auctionId: investmentArray[0]?.toString(),
        auctionAddress: investmentArray[1],
        proposedAmount: investmentArray[3]?.toString(),
        isActive: investmentArray[7],
        yesVotes: investmentArray[11]?.toString(),
        noVotes: investmentArray[12]?.toString()
      })

      const yesVotesRaw = Number(investmentArray[11]?.toString() || '0')
      const noVotesRaw = Number(investmentArray[12]?.toString() || '0')

      const yesVotes = (yesVotesRaw / 100).toFixed(2)
      const noVotes = (noVotesRaw / 100).toFixed(2)

      const proposedAmount = investmentArray[3]?.toString() || '0'
      const isActive = investmentArray[7] === true
      const isExecuted = investmentArray[8] === true
      const hasBid = investmentArray[6] && investmentArray[6].toString() !== '0'

      console.log('[AngelPool] Processed auction:', {
        auctionId,
        proposedAmount,
        isActive,
        isExecuted,
        hasBid,
        yesVotes,
        noVotes
      })

      return {
        auctionId,
        auctionAddress: investmentArray[1] as Address,
        auctionToken: investmentArray[2] as Address,
        proposedAmount,
        totalInvested: investmentArray[4]?.toString() || '0',
        totalInvestedUSDC: formatUnits(BigInt(investmentArray[4]?.toString() || '0'), 6),
        tokensPurchased: investmentArray[5]?.toString() || '0',
        bidId: investmentArray[6]?.toString() || '0',
        isActive,
        isExecuted,
        tokensClaimed: investmentArray[9] === true,
        deadline: investmentArray[10]?.toString() || '0',
        yesVotes,
        noVotes,
        status: isExecuted ? 'executed' : (isActive ? 'voting' : 'expired')
      }
    } catch (err) {
      console.error(`[AngelPool] Get auction details failed for ID ${auctionId}:`, err)
      return null
    }
  }, [hookContract])

  // Get Pool Auction Investments
  const getPoolAuctionInvestments = useCallback(async () => {
    if (!hookContract) {
      console.log('[AngelPool] Contract not initialized, cannot fetch investments')
      return []
    }

    try {
      const investments = await executeWithRetry(() => hookContract.getPoolAuctionInvestments())
      const investmentsArray = (investments as any[]) || []
      console.log('[AngelPool] Raw pool investments:', investmentsArray.map((id: any) => id?.toString() || '0'))

      return investmentsArray
        .map((id: any) => Number(id?.toString() || '0'))
        .filter((id: number) => id > 0)
    } catch (err: any) {
      console.log('[AngelPool] Pool auction investments unavailable (will retry on next refresh)')
      return []
    }
  }, [hookContract])

  // ✅ FIX: Get Pool Bids — restored from the original file.
  const getPoolBids = useCallback(async (auctionAddress: Address) => {
    if (!hookContract) {
      console.log('[AngelPool] Contract not initialized for getPoolBids')
      return []
    }

    try {
      const pid = await hookContract.poolId()
      if (!pid || pid === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        console.log('[AngelPool] Pool not initialized, no bids')
        return []
      }

      console.log('[AngelPool] Fetching pool bids for auction:', auctionAddress)
      const bids = await hookContract.getPoolBids(auctionAddress)

      if (!bids) return []

      const bidsArray = bids as any[]
      return bidsArray.map((bid: any, index: number) => ({
        id: bid?.toString?.() || index.toString(),
        claimed: false
      }))
    } catch (err: any) {
      console.log('[AngelPool] No pool bids found for auction:', auctionAddress, err?.message || '')
      return []
    }
  }, [hookContract])

  // Clear error
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    // State
    account: address || '',
    loading,
    error,
    poolKey: POOL_KEY,
    poolId,
    poolInfo: poolInfoState,
    investorInfo,
    hookContract,
    isPoolInitialized,
    permit2Approved,

    // Actions
    createAngelPool,
    depositUSDC,
    depositETH,
    withdrawUSDC,
    withdrawETH,
    allocateSlices,
    recoverAccounting,
    approveUSDCForPermit2,
    previewExecuteAuction,
    proposeAuction,
    voteOnAuction,
    executeAuction,

    // View functions
    refreshPoolInfo,
    refreshInvestorInfo,
    getAuctionDetails,
    getPoolAuctionInvestments,
    getPoolBids,
    checkAuctionSliceBalance,

    // Clear error
    clearError
  }
}
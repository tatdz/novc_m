// lib/contract-interactions.ts
import { 
  type Address, 
  type Hex, 
  parseUnits, 
  keccak256, 
  encodePacked, 
  encodeAbiParameters, 
  createPublicClient,
  http,
  getAddress,
  formatUnits,
  fallback
} from 'viem'
import { monadTestnet} from 'viem/chains'
import { CONTRACTS, DEPLOYED_ADDRESSES } from './contracts'
import { 
  FACTORY_ABI, 
  CCA_ABI, 
  ERC20_ABI, 
} from './abis'

export async function retryWriteContract(
  walletClient: any,
  params: any,
  label: string,
  maxAttempts = 3
): Promise<`0x${string}`> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await walletClient.writeContract(params)
    } catch (err: any) {
      const msg = (err?.message || '') + ' ' + (err?.shortMessage || '')
      const isNonceTooLow = msg.includes('nonce too low')
      const isTransient = isNonceTooLow || msg.includes('RPC') || msg.includes('HTTP') || msg.includes('timed out') || msg.includes('timeout') || msg.includes('Unknown RPC') || (err?.code === -32603) || (err?.code === -32080)
      if (!isTransient || attempt === maxAttempts - 1) throw err
      const delay = isNonceTooLow ? 5000 : 3000
      console.warn(`${label} attempt ${attempt + 1} failed (${isNonceTooLow ? 'nonce stale' : 'transient RPC error'}), retrying in ${delay / 1000}s...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error(`${label} failed after ${maxAttempts} attempts`)
}

// ============================================
// MONAD TESTNET CONFIG (ONLY)
// ============================================
export const USDC_MONAD_TESTNET = {
  address: DEPLOYED_ADDRESSES.USDC_MONAD_TESTNET,
  decimals: 6
}

// Mock Token for auction - 6 decimals (USDC standard)
export const MOCK_TOKEN = {
  address: DEPLOYED_ADDRESSES.MOCK_USDC,
  decimals: 6
}

// Constants
export const UNISWAP_Q96 = BigInt('79228162514264337593543950336') // 2^96
const MSG_SENDER = '0x0000000000000000000000000000000000000001' as Address
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

// ============================================
// REFERENCE BLOCKS FOR IN MONAD TESTNET
// ============================================
export const REFERENCE_L2_BLOCK = 45000000n // Approximate current block

// Helper function to ensure address is properly checksummed
function ensureChecksumAddress(address: string): Address {
  try {
    return getAddress(address)
  } catch (error) {
    console.error('Invalid address format:', address)
    throw new Error(`Invalid address format: ${address}`)
  }
}

// Helper to get RPC URL via proxy
const getRpcUrl = (network: string = 'monad-testnet'): string => {
  // Use the proxy endpoint
  return `/api/rpc?network=${network}`
}

// Create public client for Monad testnet using proxy
const createMonadPublicClient = () => {
  return createPublicClient({
    chain: monadTestnet,
    transport: http(getRpcUrl('monad-testnet'), {
      fetchOptions: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
    })
  })
}

// ============================================
// ACCURATE CONTRACT BLOCK NUMBER UTILITIES
// ============================================

/**
 * Get the actual block.number value that would be seen by a contract
 */
export async function getActualContractBlockNumber(publicClient?: any): Promise<bigint> {
  const client = publicClient || createMonadPublicClient()
  
  try {
    const bytecode = '0x4360005260206000F3'
    
    const result = await client.call({
      data: bytecode,
      to: null,
    })
    
    if (result.data && result.data !== '0x') {
      const blockNumber = BigInt(result.data)
      console.log('[Monad] Actual contract block number:', blockNumber.toString())
      return blockNumber
    }
  } catch (error) {
    console.error('[Monad] Failed to get contract block number via minimal contract:', error)
  }
  
  try {
    const l2Block = await client.getBlockNumber()
    console.warn('[Monad] Using fallback L2 block number:', l2Block.toString())
    return l2Block
  } catch (fallbackError) {
    console.error('[Monad] All block number methods failed')
    return 0n
  }
}

// ============================================
// Monad L2 BLOCK NUMBER UTILITIES
// ============================================

export async function getMonadL2BlockNumber(publicClient?: any): Promise<bigint> {
  const client = publicClient || createMonadPublicClient()
  const blockNumber = await client.getBlockNumber()
  return blockNumber
}

export async function getMonadBlockNumbers(publicClient?: any): Promise<{ l1: bigint; l2: bigint }> {
  const client = publicClient || createMonadPublicClient()
  const [l2, contract] = await Promise.all([
    client.getBlockNumber(),
    getActualContractBlockNumber(client)
  ])
  return { l1: contract, l2 }
}

// ============================================
// AUCTION VERIFICATION UTILITIES
// ============================================

export async function verifyAuctionActiveOnChain(
  publicClient: any,
  auctionAddress: Address
): Promise<boolean> {
  try {
    const contractBlock = await getActualContractBlockNumber(publicClient)
    
    const endBlock = await publicClient.readContract({
      address: auctionAddress,
      abi: CCA_ABI,
      functionName: 'endBlock'
    }) as bigint
    
    const startBlock = await publicClient.readContract({
      address: auctionAddress,
      abi: CCA_ABI,
      functionName: 'startBlock'
    }) as bigint
    
    const isGraduated = await publicClient.readContract({
      address: auctionAddress,
      abi: CCA_ABI,
      functionName: 'isGraduated'
    }).catch(() => false)
    
    const isActive = !isGraduated && contractBlock >= startBlock && contractBlock < endBlock
    
    console.log('[verifyAuctionActiveOnChain]', {
      auction: auctionAddress,
      contractBlock: contractBlock.toString(),
      startBlock: startBlock.toString(),
      endBlock: endBlock.toString(),
      isActive,
      isGraduated,
      blocksUntilStart: Number(startBlock) - Number(contractBlock),
      blocksUntilEnd: Number(endBlock) - Number(contractBlock)
    })
    
    return isActive
  } catch (error) {
    console.error('[verifyAuctionActiveOnChain] Failed:', error)
    return false
  }
}

export async function hasAuctionEnded(publicClient: any, auctionAddress: Address): Promise<boolean> {
  try {
    const contractBlock = await getActualContractBlockNumber(publicClient)
    
    const endBlock = await publicClient.readContract({
      address: auctionAddress,
      abi: CCA_ABI,
      functionName: 'endBlock',
      args: []
    }) as bigint

    return contractBlock >= endBlock
  } catch (error) {
    console.error('Failed to check auction end:', error)
    return false
  }
}

export function isAuctionActive(
  currentBlock: number,
  startBlock: number,
  endBlock: number,
  isGraduated: boolean
): boolean {
  return !isGraduated && currentBlock >= startBlock && currentBlock < endBlock
}

export function isAuctionEnded(
  currentBlock: number,
  endBlock: number
): boolean {
  return currentBlock >= endBlock
}

export function getTimeRemaining(
  currentBlock: number,
  targetBlock: number
): { blocks: number; seconds: number; minutes: number; hours: number } | null {
  if (targetBlock <= currentBlock) return null

  const blocksLeft = targetBlock - currentBlock
  const secondsLeft = blocksLeft * 2
  const minutesLeft = Math.floor(secondsLeft / 60)
  const hoursLeft = Math.floor(minutesLeft / 60)

  return {
    blocks: blocksLeft,
    seconds: secondsLeft,
    minutes: minutesLeft,
    hours: hoursLeft
  }
}

// ============================================
// Q96 CONVERSION FUNCTIONS 
// ============================================

export function convertUSDCToQ96(usdcValue: string): bigint {
  try {
    const normalizedValue = usdcValue.replace(',', '.')
    const usdcNum = parseFloat(normalizedValue)
    
    if (isNaN(usdcNum) || usdcNum <= 0) {
      throw new Error('Invalid USDC value')
    }
    
    const microUSDC = usdcNum * 1_000_000
    const q96Price = BigInt(Math.floor(microUSDC)) * UNISWAP_Q96
    return q96Price
  } catch (error) {
    console.error('USDC to Q96 conversion error:', error)
    const defaultMicroUSDC = 0.01 * 1_000_000
    return BigInt(Math.floor(defaultMicroUSDC)) * UNISWAP_Q96
  }
}

export function convertQ96ToUSDC(q96Value: bigint): string {
  try {
    const ratio = q96Value / UNISWAP_Q96
    const usdcValue = Number(ratio) / 1_000_000
    return usdcValue.toFixed(6)
  } catch (error) {
    console.error('Q96 to USDC conversion error:', error)
    return '0.000001'
  }
}

// ============================================
// CCA ERROR DECODING
// ============================================
const CCA_ERROR_SELECTORS: Record<string, string> = {
  '0xeffaea80': 'AuctionNotStarted: Auction has not started yet (startBlock not reached)',
  '0x8d6b8a82': 'TokensNotReceived: Auction not initialized - the creator needs to call onTokensReceived first',
  '0x5f0ae8b5': 'AuctionIsOver: Auction has ended (past endBlock)',
  '0xc8731608': 'BidAmountTooSmall: Bid amount is zero',
  '0x5f259e52': 'BidMustBeAboveClearingPrice: Your bid price must be above the current clearing price',
  '0x4076a98c': 'BidOwnerCannotBeZeroAddress: Bid owner cannot be zero address',
  '0x00175ba8': 'AuctionIsNotOver: The auction is still running',
  '0xd66173a5': 'NotGraduated: Auction did not reach graduation threshold',
  '0x2c5211c6': 'InvalidAmount: msg.value does not match bid amount',
  '0xe3e0a9bd': 'CurrencyIsNotNative: Do not send ETH with this bid (currency is USDC)',
  '0x5cd54361': 'AuctionSoldOut: All tokens have been sold',
  '0xf675989d': 'InvalidBidPriceTooHigh: Bid price exceeds the max allowed for this supply',
  '0x7939f424': 'TransferFromFailed: USDC transfer via Permit2 failed - check that USDC is approved to Permit2 AND Permit2 allowance is set for this auction',
  '0x8757f0fd': 'Permit2AmountOverflow: Bid amount exceeds uint160 max for Permit2',
  '0xd81b2f2e': 'AllowanceExpired: Permit2 allowance has expired - re-approve',
  '0xf96fb071': 'InsufficientAllowance: Permit2 allowance too low for this bid amount',
}

export function decodeCCARevert(data: string | undefined): string | null {
  if (!data || typeof data !== 'string' || data.length < 10) return null
  const selector = data.slice(0, 10).toLowerCase()
  return CCA_ERROR_SELECTORS[selector] || null
}

function extractRevertData(error: any): string | null {
  const paths = [
    error?.data,
    error?.cause?.data,
    error?.cause?.cause?.data,
  ]
  for (const d of paths) {
    if (d && typeof d === 'string' && d.startsWith('0x') && d.length >= 10 && d.length <= 138) return d
  }
  try {
    if (error?.walk) {
      let found: string | null = null
      error.walk((e: any) => {
        if (e?.data && typeof e.data === 'string' && e.data.startsWith('0x') && e.data.length >= 10 && e.data.length <= 138) {
          found = e.data
        }
        return false
      })
      if (found) return found
    }
  } catch {}
  return null
}

export async function getRevertReasonFromTx(
  publicClient: any,
  txHash: string
): Promise<string> {
  try {
    const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` })
    if (!tx) return 'Transaction not found'

    const decodedFromInput = decodeCCARevert(tx.input)
    if (decodedFromInput) return decodedFromInput

    try {
      await publicClient.call({
        to: tx.to,
        data: tx.input,
        from: tx.from,
        value: tx.value,
        blockNumber: tx.blockNumber! - 1n,
      })
    } catch (callError: any) {
      const revertData = extractRevertData(callError)
      if (revertData) {
        const decoded = decodeCCARevert(revertData)
        if (decoded) return decoded
        return `Revert data: ${revertData.slice(0, 66)}`
      }

      const msg = callError?.shortMessage || callError?.message || ''
      const errorChecks: [string, string][] = [
        ['TokensNotReceived', 'Auction not initialized - tokens not deposited or onTokensReceived not called'],
        ['AuctionNotStarted', 'Auction has not started yet'],
        ['AuctionIsOver', 'Auction has ended'],
        ['BidMustBeAboveClearingPrice', 'Bid price must be above clearing price'],
        ['BidAmountTooSmall', 'Bid amount is too small'],
        ['CurrencyIsNotNative', 'Do not send ETH - this auction uses USDC'],
        ['insufficient allowance', 'USDC allowance insufficient - Permit2 approval may have failed'],
        ['TRANSFER_FROM_FAILED', 'USDC transfer failed - check allowance and balance'],
      ]
      for (const [key, readable] of errorChecks) {
        if (msg.includes(key)) return readable
      }
      if (msg && msg !== 'Execution reverted for an unknown reason.') {
        return msg.slice(0, 300)
      }
    }

    try {
      await publicClient.call({
        to: tx.to,
        data: tx.input,
        from: tx.from,
        value: tx.value,
      })
      return 'Replay at current block passed - the auction state may have changed since the tx failed'
    } catch (latestErr: any) {
      const revertData = extractRevertData(latestErr)
      if (revertData) {
        const decoded = decodeCCARevert(revertData)
        if (decoded) return decoded
        return `Revert data: ${revertData.slice(0, 66)}`
      }
      const msg = latestErr?.shortMessage || latestErr?.message || ''
      if (msg && msg !== 'Execution reverted for an unknown reason.') {
        return msg.slice(0, 300)
      }
    }

    return `On-chain revert (could not decode). Tx input: ${tx.input?.slice(0, 10)}`
  } catch (err: any) {
    return err?.message?.slice(0, 200) || 'Could not decode revert reason'
  }
}

const AUCTION_VIEW_ABI = [
  { name: 'startBlock', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] },
  { name: 'endBlock', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] },
  { name: 'floorPrice', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'nextActiveTickPrice', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'clearingPrice', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'currency', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint128' }] },
] as const

export async function checkAuctionPreConditions(
  publicClient: any,
  auctionAddress: `0x${string}`
): Promise<{ ready: boolean; reason?: string; startBlock?: bigint; endBlock?: bigint }> {
  try {
    const currentBlock = await getActualContractBlockNumber(publicClient)

    const [auctionStart, auctionEnd] = await Promise.all([
      publicClient.readContract({
        address: auctionAddress,
        abi: AUCTION_VIEW_ABI,
        functionName: 'startBlock',
      }) as Promise<bigint>,
      publicClient.readContract({
        address: auctionAddress,
        abi: AUCTION_VIEW_ABI,
        functionName: 'endBlock',
      }) as Promise<bigint>,
    ])

    console.log('[preCheck] Auction state:', {
      currentBlock: currentBlock.toString(),
      startBlock: auctionStart.toString(),
      endBlock: auctionEnd.toString(),
      blocksUntilStart: Number(auctionStart) - Number(currentBlock),
      blocksUntilEnd: Number(auctionEnd) - Number(currentBlock),
      started: currentBlock >= auctionStart,
      ended: currentBlock >= auctionEnd,
    })

    if (currentBlock < auctionStart) {
      const blocksLeft = Number(auctionStart - currentBlock)
      const secsLeft = Math.ceil(blocksLeft * 2)
      const minsLeft = Math.floor(secsLeft / 60)
      return {
        ready: false,
        reason: `Auction hasn't started yet. ${blocksLeft} blocks (~${minsLeft}m ${secsLeft % 60}s) until start.`,
        startBlock: auctionStart,
        endBlock: auctionEnd
      }
    }

    if (currentBlock >= auctionEnd) {
      return {
        ready: false,
        reason: 'Auction has ended. Go to Settlement page to claim or exit.',
        startBlock: auctionStart,
        endBlock: auctionEnd
      }
    }

    return { ready: true, startBlock: auctionStart, endBlock: auctionEnd }
  } catch (err: any) {
    console.warn('[preCheck] Could not read auction state:', err?.message?.slice(0, 100))
    return { ready: true }
  }
}

export async function simulateBidBeforeSending(
  publicClient: any,
  auctionAddress: `0x${string}`,
  bidder: `0x${string}`,
  maxPrice: bigint,
  amount: bigint,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const submitBidAbi = [{
      name: 'submitBid',
      type: 'function',
      stateMutability: 'payable',
      inputs: [
        { name: '_maxPrice', type: 'uint256' },
        { name: '_amount', type: 'uint128' },
        { name: '_owner', type: 'address' },
        { name: '_hookData', type: 'bytes' }
      ],
      outputs: [{ name: 'bidId', type: 'uint256' }]
    }] as const

    await publicClient.simulateContract({
      address: auctionAddress,
      abi: submitBidAbi,
      functionName: 'submitBid',
      args: [maxPrice, amount, bidder, '0x'],
      account: bidder,
    })
    return { ok: true }
  } catch (simErr: any) {
    const revertData = extractRevertData(simErr)
    if (revertData) {
      const decoded = decodeCCARevert(revertData)
      if (decoded) return { ok: false, error: decoded }
      return { ok: false, error: `Revert data: ${revertData}` }
    }
    const msg = simErr?.shortMessage || simErr?.message || 'Unknown simulation error'
    return { ok: false, error: msg.slice(0, 300) }
  }
}

// ============================================
// CREATE AUCTION (Monad testnet ONLY)
// ============================================
export async function createNewAuction(
  walletClient: any,
  params: {
    startDelayBlocks: string
    durationBlocks: string
    tickSpacing: string
    floorPrice: string
    auctionTokenAmount: string
  }
): Promise<{
  auctionAddress: string
  transactionHash: string
  floorPrice: string
  tickSpacing: string
  startBlock: number
  endBlock: number
}> {
  try {
    const { startDelayBlocks, durationBlocks, tickSpacing, floorPrice, auctionTokenAmount } = params
    const creator = walletClient.account.address
    const publicClient = createMonadPublicClient()

    const currentBlock = await getActualContractBlockNumber(publicClient)

    console.log('[createAuction] Current block:', {
      block: currentBlock.toString(),
      blockNumber: Number(currentBlock)
    })

    // Parse values
    const tickSpacingNum = parseFloat(tickSpacing.replace(',', '.'));
    const floorPriceNum = parseFloat(floorPrice.replace(',', '.'));

    const microTickSpacing = tickSpacingNum * 1_000_000;
    const microFloorPrice = floorPriceNum * 1_000_000;

    const tickSpacingQ96 = BigInt(Math.floor(microTickSpacing)) * UNISWAP_Q96;
    const floorPriceQ96 = BigInt(Math.floor(microFloorPrice)) * UNISWAP_Q96;

    const tokenAmount = parseUnits(auctionTokenAmount, 6)

    // Check token balance
    const tokenBalance = await publicClient.readContract({
      address: MOCK_TOKEN.address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [creator]
    }) as bigint

    console.log('Token balance:', formatUnits(tokenBalance, 6), 'RocketClaw')
    console.log('Required amount:', formatUnits(tokenAmount, 6), 'RocketClaw')
    
    if (tokenBalance < tokenAmount) {
      throw new Error(`Insufficient tokens. Have: ${formatUnits(tokenBalance, 6)}, Need: ${auctionTokenAmount}`)
    }

    // Calculate blocks
    const effectiveStartDelay = Math.max(parseInt(startDelayBlocks), 5)
    const startBlock = Number(currentBlock) + effectiveStartDelay
    const endBlock = startBlock + parseInt(durationBlocks)
    const claimBlock = endBlock + 10

    console.log('[createAuction] Auction timing:', {
      currentBlock: currentBlock.toString(),
      startDelay: effectiveStartDelay,
      startBlock,
      endBlock,
      claimBlock,
    })

    // Create auction steps data
    function createAuctionStepsData(): Hex {
      const totalDuration = parseInt(durationBlocks)
      const TOTAL_MPS = 10_000_000

      let steps: [number, number][]

      if (TOTAL_MPS % totalDuration === 0) {
        steps = [[TOTAL_MPS / totalDuration, totalDuration]]
      } else {
        const mainMps = Math.floor(TOTAL_MPS / totalDuration)
        const mainBlocks = totalDuration - 1
        const remainderMps = TOTAL_MPS - (mainMps * mainBlocks)
        steps = [
          [mainMps, mainBlocks],
          [remainderMps, 1]
        ]
      }

      let encoded = '0x'
      for (const [mps, duration] of steps) {
        const mpsHex = BigInt(mps).toString(16).padStart(6, '0')
        const durationHex = BigInt(duration).toString(16).padStart(10, '0')
        encoded += mpsHex + durationHex
      }
      return encoded as Hex
    }

    const auctionStepsData = createAuctionStepsData()

    const Q96 = 2n ** 96n
    const floorPriceRaw = parseUnits(floorPrice.replace(',', '.'), 6)
    const tokenAmountRaw = BigInt(auctionTokenAmount)
    const potentialAtFloor = floorPriceRaw * tokenAmountRaw
    const rawRequired = (potentialAtFloor * 80n) / 100n
    const requiredCurrencyRaised = rawRequired > 100n ? rawRequired - 100n : 0n

    // Prepare auction parameters
    const auctionParameters = {
      currency: USDC_MONAD_TESTNET.address,
      tokensRecipient: creator,
      fundsRecipient: creator,
      startBlock: BigInt(startBlock),
      endBlock: BigInt(endBlock),
      claimBlock: BigInt(claimBlock),
      tickSpacing: tickSpacingQ96,
      validationHook: ZERO_ADDRESS,
      floorPrice: floorPriceQ96,
      requiredCurrencyRaised: requiredCurrencyRaised,
      auctionStepsData: auctionStepsData
    }

    const configData = encodeAbiParameters(
      [
        {
          name: 'parameters',
          type: 'tuple',
          components: [
            { name: 'currency', type: 'address' },
            { name: 'tokensRecipient', type: 'address' },
            { name: 'fundsRecipient', type: 'address' },
            { name: 'startBlock', type: 'uint64' },
            { name: 'endBlock', type: 'uint64' },
            { name: 'claimBlock', type: 'uint64' },
            { name: 'tickSpacing', type: 'uint256' },
            { name: 'validationHook', type: 'address' },
            { name: 'floorPrice', type: 'uint256' },
            { name: 'requiredCurrencyRaised', type: 'uint128' },
            { name: 'auctionStepsData', type: 'bytes' }
          ]
        }
      ],
      [auctionParameters]
    )

    const salt = keccak256(
      encodePacked(
        ['string', 'uint256'],
        ['novc-auction-monad', BigInt(Date.now())]
      )
    )

    const factoryAddress = ensureChecksumAddress(CONTRACTS.FACTORY)
    console.log('Using factory address:', factoryAddress)

    // Step 1: Simulate factory call to preview auction address
    let auctionAddress: Address;
    let transactionHash: `0x${string}`;

    try {
      // Get predicted auction address
      auctionAddress = await publicClient.readContract({
        address: factoryAddress,
        abi: FACTORY_ABI,
        functionName: 'getAuctionAddress',
        args: [
          MOCK_TOKEN.address,
          tokenAmount,
          configData,
          salt,
          creator
        ]
      }) as Address

      console.log('Predicted auction address:', auctionAddress)

      if (!auctionAddress || auctionAddress === ZERO_ADDRESS) {
        throw new Error('Failed to get auction address from factory')
      }

      // Step 2: Approve the AUCTION contract to spend tokens
      const allowance = await publicClient.readContract({
        address: MOCK_TOKEN.address,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [creator, auctionAddress]
      }) as bigint

      if (allowance < tokenAmount) {
        console.log('Approving auction contract to spend tokens...')
        
        const approveHash = await retryWriteContract(walletClient, {
          address: MOCK_TOKEN.address,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [auctionAddress, tokenAmount],
          chain: monadTestnet,
          account: creator,
          gas: 60000n,
        }, 'Token approval')

        console.log('Approval tx hash:', approveHash)
        
        const approveReceipt = await publicClient.waitForTransactionReceipt({ 
          hash: approveHash,
          confirmations: 1 
        })
        
        if (approveReceipt.status !== 'success') {
          throw new Error('Token approval transaction reverted on-chain')
        }
        
        console.log('Approval confirmed')
        await new Promise(resolve => setTimeout(resolve, 4000))
      }

      // Step 3: Create auction via factory
      console.log('Creating auction with factory...')
      
      transactionHash = await retryWriteContract(walletClient, {
        address: factoryAddress,
        abi: FACTORY_ABI,
        functionName: 'initializeDistribution',
        args: [MOCK_TOKEN.address, tokenAmount, configData, salt],
        chain: monadTestnet,
        account: creator,
        gas: 5000000n,
      }, 'Factory initializeDistribution')

      console.log('Factory tx hash:', transactionHash)

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: transactionHash,
        confirmations: 1,
        timeout: 180000,
      })

      if (receipt.status !== 'success') {
        throw new Error('Auction creation reverted on-chain')
      }

      // Step 4: Verify auction has tokens
      const auctionBalance = await publicClient.readContract({
        address: MOCK_TOKEN.address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [auctionAddress]
      }) as bigint

      console.log('Auction balance:', formatUnits(auctionBalance, 6), 'RocketClaw')
      
      if (auctionBalance < tokenAmount) {
        console.log('⚠️ Transferring tokens to auction...')
        
        const transferHash = await retryWriteContract(walletClient, {
          address: MOCK_TOKEN.address,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [auctionAddress, tokenAmount],
          chain: monadTestnet,
          account: creator,
          gas: 100000n,
        }, 'Token transfer')

        console.log('Transfer tx hash:', transferHash)
        const transferReceipt = await publicClient.waitForTransactionReceipt({ 
          hash: transferHash, 
          confirmations: 1 
        })
        if (transferReceipt.status !== 'success') {
          throw new Error('Token transfer to auction reverted on-chain')
        }
        
        await new Promise(resolve => setTimeout(resolve, 4000))
      }

      // Step 5: Initialize auction with onTokensReceived
      console.log('Initializing auction with onTokensReceived...')
      
      const initHash = await retryWriteContract(walletClient, {
        address: auctionAddress,
        abi: CCA_ABI,
        functionName: 'onTokensReceived',
        chain: monadTestnet,
        account: creator,
        gas: 200000n,
      }, 'Auction initialization')

      console.log('Init tx hash:', initHash)

      const initReceipt = await publicClient.waitForTransactionReceipt({ 
        hash: initHash, 
        confirmations: 1 
      })
      
      if (initReceipt.status !== 'success') {
        throw new Error('onTokensReceived reverted')
      }

      console.log('✅ Auction fully initialized and activated!')

      // Return success inside the try block where transactionHash is defined
      return {
        auctionAddress,
        transactionHash: transactionHash,
        floorPrice: `${floorPrice} USDC`,
        tickSpacing: `${tickSpacing} USDC`,
        startBlock,
        endBlock
      }

    } catch (simError: any) {
      console.error('Auction creation step error:', simError)
      
      const errorName = simError?.cause?.data?.errorName || simError?.data?.errorName || ''
      const friendlyMessages: Record<string, string> = {
        'InvalidEndBlockGivenStepData': 'Auction step data duration does not match endBlock - startBlock',
        'InvalidStepDataMps': 'Auction step percentages do not sum to 100%',
        'InvalidEndBlock': 'End block must be after start block',
        'InvalidAuctionDataLength': 'Invalid auction configuration data length',
        'TickSpacingTooSmall': 'Tick spacing is too small',
        'FloorPriceIsZero': 'Floor price cannot be zero',
        'FloorPriceTooLow': 'Floor price is below the minimum allowed',
        'TotalSupplyIsZero': 'Token amount cannot be zero',
        'TotalSupplyIsTooLarge': 'Token amount exceeds the maximum supported supply',
        'TokenIsAddressZero': 'Token address is invalid',
        'ClaimBlockIsBeforeEndBlock': 'Claim block must be after the auction end block',
        'FloorPriceAndTickSpacingGreaterThanMaxBidPrice': 'Floor price + tick spacing exceeds the max bid price for this supply',
        'DeploymentFailed': 'Contract deployment failed - try using a different salt',
        'TokensNotReceived': 'Factory did not receive the auction tokens - check approval',
      }
      const friendly = friendlyMessages[errorName]
      const errMsg = simError?.message || ''
      const isRpcError = errMsg.includes('RPC') || errMsg.includes('HTTP') || errMsg.includes('timed out') || errMsg.includes('timeout')
      if (isRpcError) {
        throw new Error(`Network error during auction creation. The auction may have been partially created. Please try again or check the settle page for the auction address.`)
      }
      const reason = friendly || simError?.cause?.reason || simError?.shortMessage || simError?.message || 'Unknown revert'
      throw new Error(`Auction creation failed: ${reason}`)
    }

  } catch (error: any) {
    console.error('Auction creation failed:', error)
    throw new Error(`Failed to create auction: ${error?.message || error}`)
  }
}

// ============================================
// PLACE BID (Monad Testnet ONLY)
// ============================================
export async function placeBid(
  walletClient: any,
  auctionAddress: Address,
  maxPrice: string,
  amount: string,
  owner?: Address
): Promise<{ success: boolean; transactionHash?: string; error?: string; bidId?: string }> {
  try {
    const publicClient = createMonadPublicClient()
    const bidder = walletClient.account.address

    const preCheck = await checkAuctionPreConditions(publicClient, auctionAddress as `0x${string}`)
    if (!preCheck.ready) {
      return { success: false, error: preCheck.reason }
    }

    const maxPriceQ96 = convertUSDCToQ96(maxPrice)
    const amountUsdc = parseUnits(amount, 6)

    const usdcAddress = USDC_MONAD_TESTNET.address

    const currentAllowance = await publicClient.readContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [bidder, auctionAddress]
    }) as bigint

    if (currentAllowance < amountUsdc) {
      const MAX_UINT256 = 2n ** 256n - 1n
      
      const approveHash = await walletClient.writeContract({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [auctionAddress, MAX_UINT256],
        chain: monadTestnet,
        account: bidder,
      })
      
      const approveReceipt2 = await publicClient.waitForTransactionReceipt({ 
        hash: approveHash, 
        confirmations: 1 
      })
      
      if (approveReceipt2.status !== 'success') {
        return { success: false, error: 'USDC approval transaction reverted on-chain' }
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000))
    }

    const submitBidAbi = [{
      name: 'submitBid',
      type: 'function',
      stateMutability: 'payable',
      inputs: [
        { name: '_maxPrice', type: 'uint256' },
        { name: '_amount', type: 'uint128' },
        { name: '_owner', type: 'address' },
        { name: '_hookData', type: 'bytes' }
      ],
      outputs: [{ name: 'bidId', type: 'uint256' }]
    }] as const

    const transactionHash = await walletClient.writeContract({
      address: auctionAddress,
      abi: submitBidAbi,
      functionName: 'submitBid',
      args: [
        maxPriceQ96,
        amountUsdc,
        owner || bidder,
        '0x'
      ],
      chain: monadTestnet,
      account: bidder,
      gas: 500000n,
    })

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: transactionHash,
      confirmations: 1,
      timeout: 120000
    })

    if (receipt.status !== 'success') {
      let revertReason = 'Unknown revert'
      try {
        revertReason = await getRevertReasonFromTx(publicClient, transactionHash)
      } catch {}
      return {
        success: false,
        transactionHash,
        error: revertReason
      }
    }

    let bidId: string | undefined
    for (const log of receipt.logs) {
      if (log.topics.length >= 2) {
        try {
          bidId = BigInt(log.topics[1] || '0x0').toString()
          if (bidId !== '0') break
        } catch {}
      }
    }

    return {
      success: true,
      transactionHash,
      bidId,
    }

  } catch (error: any) {
    let errorMessage = error?.shortMessage || error?.message || 'Unknown error'
    const revertData = error?.data || error?.cause?.data

    const decoded = decodeCCARevert(revertData)
    if (decoded) errorMessage = decoded

    return {
      success: false,
      error: errorMessage
    }
  }
}

// ============================================
// GET AUCTION STATE
// ============================================
export async function getAuctionState(auctionAddress: Address) {
  try {
    const publicClient = createMonadPublicClient()

    const [clearingPrice, currencyRaised, totalSupply, floorPrice, tickSpacing] = await Promise.all([
      publicClient.readContract({
        address: auctionAddress,
        abi: CCA_ABI,
        functionName: 'clearingPrice',
        args: []
      }) as Promise<bigint>,
      publicClient.readContract({
        address: auctionAddress,
        abi: CCA_ABI,
        functionName: 'currencyRaised',
        args: []
      }) as Promise<bigint>,
      publicClient.readContract({
        address: auctionAddress,
        abi: CCA_ABI,
        functionName: 'totalSupply',
        args: []
      }) as Promise<bigint>,
      publicClient.readContract({
        address: auctionAddress,
        abi: CCA_ABI,
        functionName: 'floorPrice',
        args: []
      }) as Promise<bigint>,
      publicClient.readContract({
        address: auctionAddress,
        abi: CCA_ABI,
        functionName: 'tickSpacing',
        args: []
      }) as Promise<bigint>
    ])

    return {
      clearingPrice,
      currencyRaised,
      totalSupply,
      floorPrice,
      tickSpacing
    }
  } catch (error) {
    console.error('Failed to get auction state:', error)
    return null
  }
}

// ============================================
// EXIT BID
// ============================================
export async function exitBid(
  walletClient: any,
  auctionAddress: Address,
  bidId: bigint
): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
  try {
    const publicClient = createMonadPublicClient()
    const bidder = walletClient.account.address

    const transactionHash = await walletClient.writeContract({
      address: auctionAddress,
      abi: CCA_ABI,
      functionName: 'exitBid',
      args: [bidId],
      chain: monadTestnet,
      account: bidder,
      gas: 300000n,
    })

    const exitReceipt = await publicClient.waitForTransactionReceipt({
      hash: transactionHash,
      confirmations: 1,
      timeout: 120000
    })

    if (exitReceipt.status !== 'success') {
      return { success: false, error: 'Exit bid transaction reverted on-chain' }
    }

    return { success: true, transactionHash }

  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Failed to exit bid'
    }
  }
}

// ============================================
// CLAIM TOKENS
// ============================================
export async function claimTokens(
  walletClient: any,
  auctionAddress: Address,
  bidId: bigint
): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
  try {
    const publicClient = createMonadPublicClient()
    const bidder = walletClient.account.address

    const transactionHash = await walletClient.writeContract({
      address: auctionAddress,
      abi: CCA_ABI,
      functionName: 'claimTokens',
      args: [bidId],
      chain: monadTestnet,
      account: bidder,
      gas: 300000n,
    })

    const claimReceipt = await publicClient.waitForTransactionReceipt({
      hash: transactionHash,
      confirmations: 1,
      timeout: 120000
    })

    if (claimReceipt.status !== 'success') {
      return { success: false, error: 'Claim tokens transaction reverted on-chain' }
    }

    return { success: true, transactionHash }

  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Failed to claim tokens'
    }
  }
}

// ============================================
// INITIALIZE AUCTION
// ============================================
export async function initializeAuction(
  walletClient: any,
  auctionAddress: Address
): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
  try {
    const publicClient = createMonadPublicClient()
    const account = walletClient.account.address

    const transactionHash = await walletClient.writeContract({
      address: auctionAddress,
      abi: CCA_ABI,
      functionName: 'onTokensReceived',
      chain: monadTestnet,
      account,
      gas: 200000n,
    })

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: transactionHash,
      confirmations: 1,
      timeout: 60000
    })

    if (receipt.status !== 'success') {
      return { success: false, error: 'onTokensReceived reverted on-chain' }
    }

    return { success: true, transactionHash }
  } catch (error: any) {
    return {
      success: false,
      error: error?.shortMessage || error?.message || 'Failed to initialize auction'
    }
  }
}

// ============================================
// CHECK AUCTION STATUS
// ============================================
export async function checkAuctionStatus(auctionAddress: Address): Promise<{
  isInitialized: boolean
  isGraduated: boolean
  tokenBalance: bigint
  totalSupply: bigint
}> {
  const publicClient = createMonadPublicClient()

  const tokenAddr = await publicClient.readContract({
    address: auctionAddress,
    abi: CCA_ABI,
    functionName: 'token',
  }) as Address

  const [tokenBalance, totalSupply, isGraduated] = await Promise.all([
    publicClient.readContract({
      address: tokenAddr,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [auctionAddress]
    }) as Promise<bigint>,
    publicClient.readContract({
      address: auctionAddress,
      abi: CCA_ABI,
      functionName: 'totalSupply',
    }) as Promise<bigint>,
    publicClient.readContract({
      address: auctionAddress,
      abi: CCA_ABI,
      functionName: 'isGraduated',
    }).then(() => true).catch(() => false),
  ])

  let isInitialized = false
  try {
    await publicClient.simulateContract({
      address: auctionAddress,
      abi: [{
        name: 'checkpoint',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [],
        outputs: [{ name: '', type: 'tuple', components: [{ name: 'clearingPrice', type: 'uint256' }, { name: 'totalMps', type: 'uint256' }] }]
      }],
      functionName: 'checkpoint',
    })
    isInitialized = true
  } catch (e: any) {
    const msg = e?.shortMessage || e?.message || ''
    if (msg.includes('0x8d6b8a82') || msg.includes('TokensNotReceived')) {
      isInitialized = false
    } else {
      isInitialized = tokenBalance >= totalSupply
    }
  }

  return { isInitialized, isGraduated, tokenBalance, totalSupply }
}

// ============================================
// GET BID INFO
// ============================================
export async function getBidInfo(
  auctionAddress: Address,
  bidId: bigint
): Promise<any> {
  try {
    const publicClient = createMonadPublicClient()

    const bidInfo = await publicClient.readContract({
      address: auctionAddress,
      abi: CCA_ABI,
      functionName: 'getBid',
      args: [bidId]
    })

    return bidInfo
  } catch (error) {
    console.error('Failed to get bid info:', error)
    return null
  }
}
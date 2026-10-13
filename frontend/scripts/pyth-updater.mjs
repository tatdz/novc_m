// scripts/pyth-updater.mjs
import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { monadTestnet } from 'viem/chains'
import { HermesClient } from '@pythnetwork/hermes-client'

const HERMES_URL = 'https://hermes.pyth.network'
const PYTH_CONTRACT = '0xFC6bd9F9f0c6481c6Af3A7Eb46b296A5B85ed379'
const FEEDS = [
  '0x31491744e2dbf6df7fcf4ac0820d18a609b49076d45066d3568424e62f686cd1', // MON/USD
  '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a', // USDC/USD
]

const PYTH_ABI = [
  { name: 'getUpdateFee', type: 'function', stateMutability: 'view', inputs: [{ name: 'updateData', type: 'bytes[]' }], outputs: [{ name: 'feeAmount', type: 'uint256' }] },
  { name: 'updatePriceFeeds', type: 'function', stateMutability: 'payable', inputs: [{ name: 'updateData', type: 'bytes[]' }], outputs: [] },
]

const account = privateKeyToAccount(
  process.env.PRIVATE_KEY.startsWith('0x') ? process.env.PRIVATE_KEY : `0x${process.env.PRIVATE_KEY}`
)
const publicClient = createPublicClient({ chain: monadTestnet, transport: http(process.env.MONAD_RPC_URL) })
const walletClient = createWalletClient({ chain: monadTestnet, transport: http(process.env.MONAD_RPC_URL), account })

const hermes = new HermesClient(HERMES_URL)

// Fetch latest signed price updates
const priceUpdates = await hermes.getLatestPriceUpdates(FEEDS)
const updateData = priceUpdates.binary.data.map((d) => '0x' + d)

// Get the update fee from the on-chain Pyth contract
const fee = await publicClient.readContract({
  address: PYTH_CONTRACT,
  abi: PYTH_ABI,
  functionName: 'getUpdateFee',
  args: [updateData],
})

// Submit the update. Overpay 2x; Pyth refunds excess.
const hash = await walletClient.writeContract({
  address: PYTH_CONTRACT,
  abi: PYTH_ABI,
  functionName: 'updatePriceFeeds',
  args: [updateData],
  value: fee * 2n,
})

await publicClient.waitForTransactionReceipt({ hash })
console.log('Updated:', hash)
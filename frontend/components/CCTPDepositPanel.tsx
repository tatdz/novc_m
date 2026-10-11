//components/CCTPDepositPanel.tsx
'use client'

import { useState, useEffect } from 'react'
import { useAccount, useWalletClient, useSwitchChain, useChainId } from 'wagmi'
import { parseUnits, formatUnits, type Address, createPublicClient, createWalletClient, custom, http, decodeAbiParameters, encodeFunctionData } from 'viem'
import { 
  sepolia, 
  baseSepolia, 
  arbitrumSepolia, 
  optimismSepolia, 
  polygonAmoy, 
  avalancheFuji,
  arcTestnet,
  monadTestnet
} from 'viem/chains'
import { USDC_ADDRESSES, TOKEN_MESSENGER_ADDRESSES, MESSAGE_TRANSMITTER_ADDRESSES } from '@/lib/circle-addresses'

// Complete chain configurations for all supported networks
const CHAIN_CONFIGS: Record<number, any> = {
  11155111: sepolia,           // Ethereum Sepolia (domain 0)
  43113: avalancheFuji,        // Avalanche Fuji (domain 1)
  11155420: optimismSepolia,    // OP Sepolia (domain 2)
  421614: arbitrumSepolia,      // Arbitrum Sepolia (domain 3)
  84532: baseSepolia,           // Base Sepolia (domain 6)
  80002: polygonAmoy,           // Polygon Amoy (domain 7)
  10143: monadTestnet,        // Monad Testnet (domain 15)
  5042002: arcTestnet,          // Arc Testnet (domain 26)
}

// CCTP-supported testnets from https://developers.circle.com/cctp/references/contract-addresses
const CCTP_SUPPORTED_CHAINS = [
  { id: 11155111, name: 'Ethereum Sepolia', shortName: 'ETH', domain: 0, attestation: '~15m' },
  { id: 43113, name: 'Avalanche Fuji', shortName: 'Avax', domain: 1, attestation: '~8s' },
  { id: 11155420, name: 'OP Sepolia', shortName: 'OP', domain: 2, attestation: '~15m' },
  { id: 421614, name: 'Arbitrum Sepolia', shortName: 'Arb', domain: 3, attestation: '~15m' },
  { id: 84532, name: 'Base Sepolia', shortName: 'Base', domain: 6, attestation: '~15m' },
  { id: 80002, name: 'Polygon Amoy', shortName: 'Polygon', domain: 7, attestation: '~8s' },
  { id: 10143, name: 'Monad Testnet', shortName: 'Monad', domain: 15, attestation: '~5s' },
  { id: 5042002, name: 'Arc Testnet', shortName: 'Arc', domain: 26, attestation: '~0.5s' },
]

const selectStyle = { 
  width: '100%', 
  padding: '10px', 
  borderRadius: '8px', 
  border: '1px solid #2a2a3a', 
  background: '#1e1e2e', 
  color: '#F8FAFC', 
  fontSize: '13px',
  cursor: 'pointer',
  appearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394A3B8' d='M3 4l3 4 3-4z'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  paddingRight: '30px',
}

const btnStyle = { 
  width: '100%', 
  padding: '10px', 
  borderRadius: '8px', 
  fontWeight: 600, 
  fontSize: '13px', 
  cursor: 'pointer', 
  border: 'none', 
  color: 'white', 
  transition: 'all 0.2s' 
}

interface CCTPDepositPanelProps {
  onDepositComplete?: (amount: string, txHash: string) => void
  gatewayBalance?: number
  onRefreshGateway?: () => void
}

export default function CCTPDepositPanel({ onDepositComplete, gatewayBalance, onRefreshGateway }: CCTPDepositPanelProps) {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { data: walletClient } = useWalletClient()
  const { switchChainAsync } = useSwitchChain()
  
  const [selectedChain, setSelectedChain] = useState(11155111)
  const [destinationChain, setDestinationChain] = useState(10143) // Default to Monad
  const [amount, setAmount] = useState('')
  const [balance, setBalance] = useState('0')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [depositTx, setDepositTx] = useState('')

  // Set initial selected chain to current chain if supported
  useEffect(() => {
    if (chainId && CCTP_SUPPORTED_CHAINS.find(c => c.id === chainId)) {
      setSelectedChain(chainId)
    }
  }, [chainId])

  // Fetch balance when selected chain or address changes
  useEffect(() => {
    if (address) fetchBalance()
  }, [address, selectedChain])

  const fetchBalance = async () => {
    if (!address) return
    const usdcAddress = USDC_ADDRESSES[selectedChain]
    if (!usdcAddress) return
    
    try {
      const chainConfig = CHAIN_CONFIGS[selectedChain]
      if (!chainConfig) return
      
      const client = createPublicClient({ 
        chain: chainConfig, 
        transport: http() 
      })
      
      const bal = await client.readContract({
        address: usdcAddress,
        abi: [{ 
          name: 'balanceOf', 
          type: 'function', 
          stateMutability: 'view', 
          inputs: [{ type: 'address' }], 
          outputs: [{ type: 'uint256' }] 
        }],
        functionName: 'balanceOf',
        args: [address]
      }) as bigint
      
      setBalance(formatUnits(bal, 6))
    } catch (e) {
      console.warn('Failed to fetch balance:', e)
    }
  }

  const handleDeposit = async () => {
  if (!address || !walletClient) {
    setError('Wallet not connected')
    return
  }
  
  if (!amount || parseFloat(amount) <= 0) { 
    setError('Enter valid amount')
    return 
  }
  
  if (selectedChain === destinationChain) { 
    setError('Source and destination chains must be different')
    return 
  }
  
  setLoading(true)
  setError('')
  setStatus('Preparing...')
  setDepositTx('')
  
  try {
    // Switch chain if needed
    if (chainId !== selectedChain) {
      setStatus('Switching chain...')
      await switchChainAsync({ chainId: selectedChain })
      await new Promise(r => setTimeout(r, 2000))
    }
    
    const usdcAddress = USDC_ADDRESSES[selectedChain] as Address
    const tokenMessenger = TOKEN_MESSENGER_ADDRESSES[selectedChain] as Address
    const destChain = CCTP_SUPPORTED_CHAINS.find(c => c.id === destinationChain)
    
    if (!usdcAddress || !tokenMessenger || !destChain) {
      throw new Error('Chain not supported by CCTP')
    }

    const amountInUnits = parseUnits(amount, 6)
    // Format mint recipient as bytes32 (address with 0x prefix + 24 zeros)
    const mintRecipient = (`0x000000000000000000000000${address.slice(2)}`) as `0x${string}`
    // Empty bytes32 allows any address to call receiveMessage
    const destinationCaller = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`
    const maxFee = amountInUnits / 100n > 500n ? amountInUnits / 100n : 500n
    // minFinalityThreshold: 1000 or less for Fast Transfer, 2000+ for Standard
    const minFinalityThreshold = 1000
    
    setStatus('Approving USDC...')
    console.log('CCTP:', getChainName(selectedChain), '->', getChainName(destinationChain), amount, 'USDC')
    
    const chainConfig = CHAIN_CONFIGS[selectedChain]
    const feeClient = createPublicClient({ 
      chain: chainConfig, 
      transport: http() 
    })
    
    // Get fee data for gas estimation
    const feeData = await feeClient.getFeeHistory({ 
      blockCount: 1, 
      rewardPercentiles: [50] 
    })
    const baseFee = feeData.baseFeePerGas[0] || 0n
    const maxFeePerGas = (baseFee * 200n / 100n) + 100000000n
    const maxPriorityFeePerGas = 100000000n
    
    // Approve USDC for TokenMessenger
    const approveHash = await walletClient.writeContract({
      chain: chainConfig,
      address: usdcAddress,
      abi: [{ 
        name: 'approve', 
        type: 'function', 
        stateMutability: 'nonpayable', 
        inputs: [
          { name: 'spender', type: 'address' }, 
          { name: 'amount', type: 'uint256' }
        ], 
        outputs: [{ type: 'bool' }] 
      }],
      functionName: 'approve',
      args: [tokenMessenger, amountInUnits],
      gas: 100000n,
      maxFeePerGas,
      maxPriorityFeePerGas,
    })
    
    console.log('Approve TX:', approveHash)
    
    const approveReceipt = await feeClient.waitForTransactionReceipt({ 
      hash: approveHash 
    })
    
    if (approveReceipt.status !== 'success') { 
      throw new Error('USDC approval reverted on-chain') 
    }
    
    setStatus('Burning via CCTP...')
    
    // Get fresh fee data for burn transaction
    const feeData2 = await feeClient.getFeeHistory({ 
      blockCount: 1, 
      rewardPercentiles: [50] 
    })
    const baseFee2 = feeData2.baseFeePerGas[0] || 0n
    const maxFeePerGas2 = (baseFee2 * 200n / 100n) + 100000000n
    
    // Log parameters for debugging
    console.log('CCTP Deposit Params:', {
      amount: amountInUnits.toString(),
      destinationDomain: destChain.domain,
      mintRecipient,
      burnToken: usdcAddress,
      destinationCaller,
      maxFee: maxFee.toString(),
      minFinalityThreshold,
      tokenMessenger,
      chainId: selectedChain,
      destinationChainId: destinationChain
    })
    
    // Execute depositForBurn with ALL 7 parameters
    const depositHash = await walletClient.writeContract({
      chain: chainConfig,
      address: tokenMessenger,
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
      args: [
        amountInUnits, 
        destChain.domain, 
        mintRecipient, 
        usdcAddress,
        destinationCaller,
        maxFee,
        minFinalityThreshold
      ],
      gas: 500000n, // Increased gas for more complex transaction
      maxFeePerGas: maxFeePerGas2,
      maxPriorityFeePerGas,
    })
    
    console.log('Burn TX:', depositHash)
    
    const burnReceipt = await feeClient.waitForTransactionReceipt({ 
      hash: depositHash 
    })
    
    if (burnReceipt.status !== 'success') { 
      throw new Error('CCTP burn transaction reverted on-chain') 
    }
    
    setDepositTx(depositHash)
    
    const sourceChain = CCTP_SUPPORTED_CHAINS.find(c => c.id === selectedChain)!
    setStatus(`Burn complete! Polling Circle for attestation...`)
    
    let messageBytes: `0x${string}` | null = null
    let attestation: string | null = null
    const maxAttempts = 120
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const resp = await fetch(
          `https://iris-api-sandbox.circle.com/v2/messages/${sourceChain.domain}?transactionHash=${depositHash}`
        )
        if (resp.ok) {
          const data = await resp.json()
          const msg = data?.messages?.[0]
          if (msg && msg.attestation && msg.attestation !== 'PENDING') {
            attestation = msg.attestation as string
            let rawMsg = (msg.message as string)
            if (!rawMsg.startsWith('0x')) rawMsg = '0x' + rawMsg
            console.log('CCTP API message (first 80):', rawMsg.substring(0, 80))
            console.log('CCTP API attestation (first 80):', (attestation as string).substring(0, 80))
            if (rawMsg.startsWith('0x000000000000000000000000000000000000000000000000000000000000002')) {
              console.log('Message is ABI-wrapped, decoding...')
              const [decoded] = decodeAbiParameters([{ type: 'bytes' }], rawMsg as `0x${string}`)
              messageBytes = decoded as `0x${string}`
            } else {
              messageBytes = rawMsg as `0x${string}`
            }
            console.log('Final messageBytes (first 80):', (messageBytes as string).substring(0, 80))
            break
          }
        }
      } catch (pollErr) {
        console.log('Attestation poll error:', pollErr)
      }
      setStatus(`Waiting for attestation... (${i + 1}/${maxAttempts})`)
      await new Promise(r => setTimeout(r, 5000))
    }
    
    if (!attestation || !messageBytes) {
      setStatus('Attestation timed out. The USDC will arrive once you manually claim it.')
      onDepositComplete?.(amount, depositHash)
      fetchBalance()
      return
    }
    
    setStatus('Attestation received! Minting on destination chain...')
    
    const destChainConfig = CHAIN_CONFIGS[destinationChain]
    const messageTransmitter = MESSAGE_TRANSMITTER_ADDRESSES[destinationChain] as Address

    const provider = (window as any).ethereum
    const destHexChainId = `0x${destinationChain.toString(16)}`
    
    setStatus('Please switch to destination chain in your wallet...')
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
            chainName: destChainConfig.name,
            nativeCurrency: destChainConfig.nativeCurrency,
            rpcUrls: [destChainConfig.rpcUrls.default.http[0]],
            blockExplorerUrls: destChainConfig.blockExplorers ? [destChainConfig.blockExplorers.default.url] : [],
          }],
        })
      } else {
        throw switchErr
      }
    }

    await new Promise(r => setTimeout(r, 2000))

    let currentChain = await provider.request({ method: 'eth_chainId' })
    let retries = 0
    while (parseInt(currentChain, 16) !== destinationChain && retries < 30) {
      await new Promise(r => setTimeout(r, 1000))
      currentChain = await provider.request({ method: 'eth_chainId' })
      retries++
    }
    if (parseInt(currentChain, 16) !== destinationChain) {
      throw new Error(`Chain switch failed. Please manually switch to ${destChainConfig.name} and retry.`)
    }

    setStatus('Minting on destination chain...')

    const receiveAbi = [{
      name: 'receiveMessage',
      type: 'function' as const,
      stateMutability: 'nonpayable' as const,
      inputs: [
        { name: 'message', type: 'bytes' as const },
        { name: 'attestation', type: 'bytes' as const }
      ],
      outputs: [{ type: 'bool' as const }]
    }]

    const calldata = encodeFunctionData({
      abi: receiveAbi,
      functionName: 'receiveMessage',
      args: [messageBytes, attestation as `0x${string}`],
    })

    console.log('Sending receiveMessage via eth_sendTransaction, chain:', currentChain)
    const receiveHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: address,
        to: messageTransmitter,
        data: calldata,
        gas: `0x${(500000).toString(16)}`,
      }],
    }) as `0x${string}`
    
    const destClient = createPublicClient({
      chain: destChainConfig,
      transport: http()
    })
    
    setStatus('Waiting for confirmation...')
    const receiveReceipt = await destClient.waitForTransactionReceipt({ hash: receiveHash })
    
    if (receiveReceipt.status !== 'success') {
      throw new Error('receiveMessage reverted on destination chain')
    }
    
    setDepositTx(receiveHash)
    setStatus(`Bridged ${amount} USDC from ${getChainName(selectedChain)} to ${getChainName(destinationChain)}! (small CCTP fee deducted)`)
    onDepositComplete?.(amount, receiveHash)
    fetchBalance()
    
  } catch (e: any) {
    console.error('CCTP failed:', e)
    
    // Check for common revert reasons
    const errorMsg = e.shortMessage || e.message || 'Transfer failed'
    
    if (errorMsg.includes('ERC20: insufficient allowance')) {
      setError('USDC allowance insufficient. Please try again.')
    } else if (errorMsg.includes('ERC20: transfer amount exceeds balance')) {
      setError('Insufficient USDC balance')
    } else if (errorMsg.includes('user rejected')) {
      setError('Transaction rejected by user')
    } else if (errorMsg.includes('CCTP burn transaction reverted')) {
      setError('CCTP burn failed. Check that you have enough USDC and the destination domain is correct.')
    } else {
      setError(errorMsg.slice(0, 120))
    }
  } finally {
    setLoading(false)
  }
}

  const getChainName = (id: number) => 
    CCTP_SUPPORTED_CHAINS.find(c => c.id === id)?.name || 'Unknown'
  
  const getShortName = (id: number) => 
    CCTP_SUPPORTED_CHAINS.find(c => c.id === id)?.shortName || '?'
  
  const getAttestation = (id: number) => 
    CCTP_SUPPORTED_CHAINS.find(c => c.id === id)?.attestation || '~15m'
  
  const getExplorerUrl = (cId: number, txHash: string) => {
    const explorers: Record<number, string> = {
      11155111: 'https://sepolia.etherscan.io/tx/',
      84532: 'https://sepolia.basescan.org/tx/',
      421614: 'https://sepolia.arbiscan.io/tx/',
      11155420: 'https://sepolia-optimism.etherscan.io/tx/',
      80002: 'https://amoy.polygonscan.com/tx/',
      43113: 'https://testnet.snowtrace.io/tx/',
      1301: 'https://testnet.monadscan.com/tx/',
      5042002: 'https://testnet.arcscan.app/tx/',
    }
    return `${explorers[cId] || 'https://sepolia.etherscan.io/tx/'}${txHash}`
  }

  if (!isConnected) {
    return (
      <div style={{ color: '#64748B', textAlign: 'center', padding: '16px' }}>
        Connect wallet to bridge USDC
      </div>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <span style={{ fontSize: '16px' }}>💳</span>
        <span style={{ fontWeight: 600, color: '#F8FAFC' }}>Cross-Chain USDC (CCTP)</span>
      </div>
      
      {/* Balance Display */}
      <div style={{ 
        background: '#1e1e2e', 
        borderRadius: '8px', 
        padding: '10px', 
        marginBottom: '10px' 
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}>
          <div>
            <div style={{ fontSize: '9px', color: '#64748B' }}>
              {getShortName(selectedChain)} Balance
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#60A5FA' }}>
              ${parseFloat(balance).toFixed(2)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '9px', color: '#64748B' }}>
              Unified (All Chains)
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#22C55E' }}>
              ${(gatewayBalance || 0).toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Source Chain Selector */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '4px' }}>
          From
        </div>
        <select 
          value={selectedChain}
          onChange={(e) => setSelectedChain(Number(e.target.value))}
          style={selectStyle}
        >
          {CCTP_SUPPORTED_CHAINS.map(chain => (
            <option key={chain.id} value={chain.id}>
              {chain.name}
            </option>
          ))}
        </select>
      </div>

      {/* Destination Chain Selector */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '4px' }}>
          To
        </div>
        <select 
          value={destinationChain}
          onChange={(e) => setDestinationChain(Number(e.target.value))}
          style={selectStyle}
        >
          {CCTP_SUPPORTED_CHAINS
            .filter(c => c.id !== selectedChain)
            .map(chain => (
              <option key={chain.id} value={chain.id}>
                {chain.name} ({chain.attestation})
              </option>
            ))
          }
        </select>
        <div style={{ fontSize: '9px', color: '#64748B', marginTop: '4px' }}>
          Attestation times: Polygon/Avax/Arc/Monad fast (~1-8s), others ~15 min
        </div>
      </div>

      {/* Amount Input */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          marginBottom: '4px' 
        }}>
          <span style={{ fontSize: '11px', color: '#64748B' }}>Amount (USDC)</span>
          <button 
            onClick={() => setAmount(balance)} 
            style={{ 
              fontSize: '10px', 
              color: '#60A5FA', 
              background: 'none', 
              border: 'none', 
              cursor: 'pointer' 
            }}
          >
            MAX
          </button>
        </div>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          min="0"
          step="0.01"
          style={{ 
            width: '100%', 
            padding: '10px', 
            borderRadius: '8px', 
            border: '1px solid #2a2a3a', 
            background: '#1e1e2e', 
            color: '#F8FAFC', 
            fontSize: '13px' 
          }}
        />
      </div>

      {/* Status Messages */}
      {error && (
        <div style={{ 
          padding: '8px', 
          background: 'rgba(239,68,68,0.1)', 
          borderRadius: '6px', 
          marginBottom: '8px', 
          fontSize: '11px', 
          color: '#F87171' 
        }}>
          {error}
        </div>
      )}
      
      {status && (
        <div style={{ 
          padding: '8px', 
          background: 'rgba(96,165,250,0.1)', 
          borderRadius: '6px', 
          marginBottom: '8px', 
          fontSize: '11px', 
          color: '#60A5FA' 
        }}>
          {status}
        </div>
      )}
      
      {depositTx && (
        <div style={{ 
          padding: '8px', 
          background: 'rgba(34,197,94,0.1)', 
          borderRadius: '6px', 
          marginBottom: '8px', 
          fontSize: '11px', 
          color: '#4ADE80' 
        }}>
          <a 
            href={getExplorerUrl(destinationChain, depositTx)} 
            target="_blank" 
            rel="noopener noreferrer" 
            style={{ color: '#4ADE80', textDecoration: 'underline' }}
          >
            View Transaction
          </a>
        </div>
      )}

      {/* Bridge Button */}
      <button
        onClick={handleDeposit}
        disabled={loading || !amount}
        style={{ 
          ...btnStyle, 
          background: loading ? '#4a4a5a' : 'linear-gradient(135deg, #60A5FA, #3B82F6)', 
          opacity: loading || !amount ? 0.6 : 1 
        }}
      >
        {loading ? 'Processing...' : `Bridge ${amount || '0'} USDC to ${getShortName(destinationChain)}`}
      </button>
      
      {/* Refresh Button */}
      <button
        onClick={onRefreshGateway}
        style={{ 
          width: '100%', 
          marginTop: '8px', 
          padding: '8px', 
          background: 'transparent', 
          border: '1px solid #2a2a3a', 
          borderRadius: '8px', 
          color: '#64748B', 
          fontSize: '11px', 
          cursor: 'pointer' 
        }}
      >
        Refresh Unified Balance
      </button>
    </>
  )
}
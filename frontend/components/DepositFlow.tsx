// components/DepositFlow.tsx 
'use client'

import { useState, useEffect } from 'react'
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi'
import { type Address, parseUnits, formatUnits } from 'viem'
import { CONTRACTS, getChainName } from '@/lib/contracts'
import { ERC20_ABI, CCTP_TOKEN_MESSENGER_ABI } from '@/lib/abis'

const panelStyle = { background: '#12121c', borderRadius: '12px', border: '1px solid #1e1e2e', padding: '16px' }
const inputStyle = { padding: '10px', background: '#1e1e2e', border: '1px solid #2d2d44', borderRadius: '8px', color: '#F8FAFC', fontSize: '13px', width: '100%' }
const btnStyle = { padding: '12px', background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', border: 'none', borderRadius: '10px', color: 'white', fontSize: '14px', fontWeight: 600 as const, cursor: 'pointer', width: '100%' }

const TOKEN_MESSENGER_ADDRESSES: Record<number, Address> = {
  11155111: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
  5042002: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA', 
  84532: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
  421614: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
  11155420: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
  80002: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
  43113: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
  1301: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
  1328: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
}

const USDC_ADDRESSES: Record<number, Address> = {
  11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  5042002: '0x3600000000000000000000000000000000000000',
  84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  421614: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  11155420: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
  80002: '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582',
  43113: '0x5425890298aed601595a70ab815c96711a31bc65',
  1301: '0x31d0220469e10c4E71834a79b1f276d740d3768F',
  1328: '0x4fCF1784B31630811181f670Aea7A7bEF803eaED',
}

function getExplorerUrl(chainId: number, txHash: string): string {
  const explorers: Record<number, string> = {
    11155111: 'https://sepolia.etherscan.io',
    84532: 'https://sepolia.basescan.org',
    421614: 'https://sepolia.arbiscan.io',
    5042002: 'https://testnet.arcscan.app',
    11155420: 'https://sepolia-optimism.etherscan.io',
  80002: 'https://amoy.polygonscan.com',
  43113: 'https://testnet.snowscan.xyz',
  10143: 'https://testnet.monadscan.com',
  1328: 'https://testnet.seistream.app',
  }
  return `${explorers[chainId] || 'https://testnet.monadscan.com'}/tx/${txHash}`
}

export default function DepositFlow() {
  const { address } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  
  const [amount, setAmount] = useState('')
  const [balance, setBalance] = useState<bigint>(0n)
  const [allowance, setAllowance] = useState<bigint>(0n)
  const [status, setStatus] = useState<'idle' | 'approving' | 'depositing'>('idle')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [lastTxHash, setLastTxHash] = useState('')
  
  const usdcAddress = USDC_ADDRESSES[chainId]
  const messengerAddress = TOKEN_MESSENGER_ADDRESSES[chainId]
  const chainName = getChainName(chainId)

  useEffect(() => {
    if (address && publicClient && usdcAddress) {
      loadBalances()
    }
  }, [address, chainId, publicClient])
  
  const loadBalances = async () => {
    if (!address || !publicClient || !usdcAddress) return
    
    try {
      const [bal, allow] = await Promise.all([
        publicClient.readContract({
          address: usdcAddress,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address]
        }) as Promise<bigint>,
        publicClient.readContract({
          address: usdcAddress,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [address, messengerAddress]
        }) as Promise<bigint>
      ])
      
      setBalance(bal)
      setAllowance(allow)
      
    } catch (err: any) {
      console.error('❌ Failed to load balances:', err.message)
    }
  }
  
  const handleApprove = async () => {
    if (!address || !amount || !walletClient || !publicClient) return
    
    try {
      setStatus('approving')
      setError('')
      setSuccess('Sign approval in MetaMask...')
      
      const amountInUnits = parseUnits(amount, 6)
      
      const txHash = await walletClient.writeContract({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [messengerAddress, amountInUnits],
        gas: 100000n,
      })
      
      setSuccess('Waiting for confirmation...')
      setLastTxHash(txHash)
      
      const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      if (approveReceipt.status !== 'success') {
        throw new Error('USDC approval reverted on-chain')
      }
      
      await loadBalances()
      setSuccess(`✅ Approved ${amount} USDC`)
      setStatus('idle')
      
    } catch (err: any) {
      console.error('❌ Approval failed:', err.message)
      setError(err.shortMessage || err.message?.slice(0, 50) || 'Approval failed')
      setStatus('idle')
    }
  }
  
  const handleDeposit = async () => {
    if (!address || !amount || !walletClient || !publicClient) return
    
    try {
      setStatus('depositing')
      setError('')
      setSuccess('Sign deposit in MetaMask...')
      
      const amountInUnits = parseUnits(amount, 6)
      // Arc Testnet (domain 26) is NOT supported by CCTP - use Ethereum Sepolia (domain 0)
      // Supported CCTP domains: 0 (Eth Sepolia), 2 (OP Sepolia), 3 (Arb Sepolia), 6 (Base Sepolia), 7 (Polygon Amoy)
      const destinationDomain = 0 // Ethereum Sepolia
      const mintRecipient = `0x000000000000000000000000${address.slice(2)}` as `0x${string}`
      
      const txHash = await walletClient.writeContract({
        address: messengerAddress,
        abi: CCTP_TOKEN_MESSENGER_ABI,
        functionName: 'depositForBurn',
        args: [amountInUnits, destinationDomain, mintRecipient, usdcAddress],
        gas: 300000n,
      })
      
      setSuccess('Waiting for confirmation...')
      setLastTxHash(txHash)
      
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      
      if (receipt.status === 'success') {
        setSuccess(`✅ Deposited ${amount} USDC! Attestation pending...`)
        setAmount('')
        await loadBalances()
      } else {
        throw new Error('Transaction reverted')
      }
      
      setStatus('idle')
      
    } catch (err: any) {
      console.error('❌ Deposit failed:', err.message)
      setError(err.shortMessage || err.message?.slice(0, 50) || 'Deposit failed')
      setStatus('idle')
    }
  }
  
  const amountInUnits = amount ? parseUnits(amount, 6) : 0n
  const needsApproval = amountInUnits > allowance
  const hasBalance = amountInUnits <= balance
  const formattedBalance = (Number(balance) / 1e6).toFixed(2)
  const formattedAllowance = (Number(allowance) / 1e6).toFixed(2)
  
  if (!messengerAddress) {
    return (
      <div style={panelStyle}>
        <div style={{ padding: '12px', background: 'rgba(251,191,36,0.1)', borderRadius: '8px', color: '#FBBF24', fontSize: '12px' }}>
          ⚠️ CCTP not available on {chainName}. Switch to Sepolia, Base Sepolia, or Arbitrum Sepolia.
        </div>
      </div>
    )
  }
  
  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={{ fontSize: '16px' }}>🌉</span>
        <span style={{ fontWeight: 600, color: '#F8FAFC' }}>CCTP Deposit to Arc</span>
      </div>
      
      <div style={{ background: '#1e1e2e', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div>
            <div style={{ fontSize: '10px', color: '#64748B' }}>Balance ({chainName})</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#60A5FA' }}>${formattedBalance}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '10px', color: '#64748B' }}>Approved</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#22C55E' }}>${formattedAllowance}</div>
          </div>
        </div>
        <div style={{ fontSize: '10px', color: '#64748B', background: '#0a0a14', padding: '6px', borderRadius: '6px' }}>
          Destination: Ethereum Sepolia (CCTP Domain 0) - Arc not supported
        </div>
      </div>
      
      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '4px' }}>Amount (USDC)</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            step="0.01"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button 
            onClick={() => setAmount(formattedBalance)} 
            style={{ padding: '10px 16px', background: '#1e1e2e', border: '1px solid #2d2d44', borderRadius: '8px', color: '#94A3B8', fontSize: '12px', cursor: 'pointer' }}
          >
            MAX
          </button>
        </div>
        {amount && !hasBalance && (
          <div style={{ fontSize: '11px', color: '#F87171', marginTop: '4px' }}>Insufficient balance</div>
        )}
      </div>
      
      {error && <div style={{ padding: '6px', background: 'rgba(239,68,68,0.1)', borderRadius: '6px', marginBottom: '8px', fontSize: '11px', color: '#F87171' }}>{error}</div>}
      {success && <div style={{ padding: '6px', background: 'rgba(34,197,94,0.1)', borderRadius: '6px', marginBottom: '8px', fontSize: '11px', color: '#4ADE80' }}>{success}</div>}
      {lastTxHash && (
        <a href={getExplorerUrl(chainId, lastTxHash)} target="_blank" rel="noopener noreferrer" 
           style={{ display: 'block', padding: '6px', background: 'rgba(96,165,250,0.1)', borderRadius: '6px', marginBottom: '8px', fontSize: '11px', color: '#60A5FA', textDecoration: 'none' }}>
          🔗 View on Etherscan ↗
        </a>
      )}
      
      {needsApproval ? (
        <button
          onClick={handleApprove}
          disabled={!address || !amount || !hasBalance || status === 'approving'}
          style={{ ...btnStyle, background: 'linear-gradient(135deg, #6366F1, #4F46E5)', opacity: (!address || !amount || !hasBalance || status === 'approving') ? 0.6 : 1 }}
        >
          {status === 'approving' ? 'Approving...' : `Approve ${amount || '0'} USDC`}
        </button>
      ) : (
        <button
          onClick={handleDeposit}
          disabled={!address || !amount || !hasBalance || status === 'depositing'}
          style={{ ...btnStyle, opacity: (!address || !amount || !hasBalance || status === 'depositing') ? 0.6 : 1 }}
        >
          {status === 'depositing' ? 'Depositing...' : `Deposit ${amount || '0'} USDC`}
        </button>
      )}
    </div>
  )
}

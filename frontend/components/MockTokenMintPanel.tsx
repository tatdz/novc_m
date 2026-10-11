// components/MockTokenMintPanel.tsx
'use client'

import { useState, useEffect } from 'react'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { type Address, parseUnits, encodeFunctionData } from 'viem'
import { CONTRACTS } from '@/lib/contracts'
import { ERC20_ABI } from '@/lib/abis'

interface MockTokenMintPanelProps {
  auctionAddress: Address
  onMinted?: (amount: bigint) => void
}

export default function MockTokenMintPanel({ auctionAddress, onMinted }: MockTokenMintPanelProps) {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  
  const [minting, setMinting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [balance, setBalance] = useState<string>('')

  // Constants
  const FAUCET_SELECTOR = '0xde5f72fd' // faucet() function selector
  const FAUCET_AMOUNT = parseUnits('2000000', 6) // 2,000,000 mUSDC
  const MOCK_TOKEN_ADDRESS = CONTRACTS.MOCK_TOKEN


  // Helper function to transfer tokens to auction
  async function transferTokensToAuction(amount: bigint) {
    if (!walletClient || !publicClient || !address) return

    
    const approveHash = await walletClient.sendTransaction({
      to: MOCK_TOKEN_ADDRESS,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [auctionAddress, amount]
      }),
      chain: walletClient.chain,
      account: address,
    })
    
    await publicClient.waitForTransactionReceipt({ 
      hash: approveHash,
      confirmations: 1 
    })
    
    const transferHash = await walletClient.sendTransaction({
      to: MOCK_TOKEN_ADDRESS,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [auctionAddress, amount]
      }),
      chain: walletClient.chain,
      account: address,
    })
    
    await publicClient.waitForTransactionReceipt({ 
      hash: transferHash,
      confirmations: 1 
    })
    
  }

  const handleMintToAuction = async () => {
    if (!address || !walletClient || !publicClient) {
      setError('Please connect your wallet first')
      return
    }

    if (!auctionAddress) {
      setError('No auction address provided')
      return
    }

    try {
      setMinting(true)
      setError('')
      setSuccess('')

      setSuccess('⏳ Calling faucet to mint 2,000,000 mUSDC...')
      
      const faucetHash = await walletClient.sendTransaction({
        to: MOCK_TOKEN_ADDRESS,
        data: FAUCET_SELECTOR as `0x${string}`,
        value: 0n,
        chain: walletClient.chain,
        account: address,
      })

      const faucetReceipt = await publicClient.waitForTransactionReceipt({ 
        hash: faucetHash,
        confirmations: 1 
      })
      
      if (faucetReceipt.status !== 'success') {
        throw new Error('Faucet transaction failed')
      }
      
      setSuccess('✅ Got 2,000,000 mUSDC from faucet! Now funding auction...')
      
      // Step 2: Transfer tokens to auction
      await transferTokensToAuction(FAUCET_AMOUNT)
      
      setSuccess('✅ Auction successfully funded with 2,000,000 mUSDC!')
      
      // Call onMinted callback
      onMinted?.(FAUCET_AMOUNT)
      
      // Update balance after successful mint
      if (publicClient && address) {
        try {
          const newBalance = await publicClient.readContract({
            address: MOCK_TOKEN_ADDRESS,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address]
          }) as bigint
          setBalance((Number(newBalance) / 1e6).toLocaleString())
        } catch (balanceErr) {
          console.error('Failed to fetch updated balance:', balanceErr)
        }
      }
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(''), 5000)

    } catch (err: any) {
      console.error('❌ Failed:', err)
      
      // Handle specific errors
      if (err.message?.includes('User rejected')) {
        setError('Transaction cancelled by user')
      } else if (err.message?.includes('insufficient funds')) {
        setError('Insufficient ETH for gas. Get test ETH from faucet first.')
      } else if (err.message?.includes('nonce')) {
        setError('Transaction nonce error. Please try again.')
      } else {
        setError(err.shortMessage || err.message || 'Failed to fund auction')
      }
      
      setTimeout(() => setError(''), 5000)
    } finally {
      setMinting(false)
    }
  }

  return (
    <div style={{ width: '100%' }}>
      <button
        onClick={handleMintToAuction}
        disabled={!isConnected || minting}
        style={{
          padding: '14px',
          background: !isConnected ? '#4B5563' : 'linear-gradient(135deg, #10B981, #059669)',
          border: 'none',
          borderRadius: '8px',
          color: '#fff',
          fontWeight: 600,
          fontSize: '15px',
          width: '100%',
          cursor: !isConnected || minting ? 'not-allowed' : 'pointer',
          opacity: !isConnected || minting ? 0.6 : 1,
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px'
        }}
      >
        {minting ? (
          <>
            <span style={{ 
              display: 'inline-block',
              width: '18px', 
              height: '18px', 
              border: '2px solid rgba(255,255,255,0.3)', 
              borderTopColor: '#fff', 
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            {success.includes('faucet') ? 'MINTING TOKENS...' : 'FUNDING AUCTION...'}
          </>
        ) : (
          <>
            <span style={{ fontSize: '20px' }}>💧</span>
            FUND AUCTION WITH 2,000,000 mUSDC
          </>
        )}
      </button>
      
      {/* Status Messages */}
      {error && (
        <div style={{ 
          marginTop: '12px',
          padding: '12px', 
          background: 'rgba(239,68,68,0.1)', 
          borderRadius: '8px',
          fontSize: '13px',
          color: '#F87171',
          textAlign: 'center',
          border: '1px solid rgba(239,68,68,0.2)',
          wordBreak: 'break-word'
        }}>
          ❌ {error}
        </div>
      )}
      
      {success && !success.includes('⏳') && (
        <div style={{ 
          marginTop: '12px',
          padding: '12px', 
          background: 'rgba(16,185,129,0.1)', 
          borderRadius: '8px',
          fontSize: '13px',
          color: '#4ADE80',
          textAlign: 'center',
          border: '1px solid rgba(16,185,129,0.2)'
        }}>
          ✅ {success}
        </div>
      )}
      
      {success.includes('⏳') && (
        <div style={{ 
          marginTop: '12px',
          padding: '12px', 
          background: 'rgba(251,191,36,0.1)', 
          borderRadius: '8px',
          fontSize: '13px',
          color: '#FBBF24',
          textAlign: 'center',
          border: '1px solid rgba(251,191,36,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px'
        }}>
          <span style={{ 
            display: 'inline-block',
            width: '14px', 
            height: '14px', 
            border: '2px solid rgba(251,191,36,0.3)', 
            borderTopColor: '#FBBF24', 
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          {success}
        </div>
      )}
      
      {/* Balance Display - only show if we have a valid balance */}
      {balance && !minting && (
        <div style={{ 
          marginTop: '8px',
          fontSize: '11px',
          color: '#64748B',
          textAlign: 'center'
        }}>
          Your mUSDC balance: {balance}
        </div>
      )}
      
      {/* Contract Info */}
      <div style={{ 
        marginTop: '8px',
        fontSize: '10px',
        color: '#4B5563',
        textAlign: 'center',
        fontFamily: 'monospace'
      }}>
        Token: {MOCK_TOKEN_ADDRESS?.slice(0, 8)}...{MOCK_TOKEN_ADDRESS?.slice(-6)}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      ` }} />
    </div>
  )
}

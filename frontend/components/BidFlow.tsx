// components/BidFlow.tsx (simplified - optional, you can delete this file)
'use client'

import { useState, useEffect } from 'react'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { parseEther, parseUnits, type Address } from 'viem'
import { readContract } from '@/lib/wagmi-contract-helpers'
import { CCA_ABI } from '@/lib/abis'

export default function BidFlow() {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  
  const [amount, setAmount] = useState('1.0')
  const [price, setPrice] = useState('0.1')
  const [auctionAddress, setAuctionAddress] = useState('')
  const [auctionCurrency, setAuctionCurrency] = useState<'ETH' | 'USDC'>('USDC')
  const [auctionDecimals, setAuctionDecimals] = useState(6)

  useEffect(() => {
    if (auctionAddress) {
      loadAuctionDetails()
    }
  }, [auctionAddress])

  const loadAuctionDetails = async () => {
    if (!auctionAddress || !publicClient) return
    
    try {
      const currency = await readContract<Address>(
        auctionAddress as Address,
        CCA_ABI,
        'currency'
      )
      
      const zeroAddress = '0x0000000000000000000000000000000000000000' as Address
      const isUSDC = currency !== zeroAddress
      
      setAuctionCurrency(isUSDC ? 'USDC' : 'ETH')
      setAuctionDecimals(isUSDC ? 6 : 18)
      
      console.log('💰 Auction currency:', isUSDC ? 'USDC' : 'ETH')
    } catch (err) {
      console.error('Failed to load auction currency:', err)
    }
  }
  
  const handleSimpleBid = async () => {
    if (!address || !auctionAddress || !walletClient) {
      alert('Please connect wallet and enter auction address')
      return
    }
    
    try {
      console.log('📝 Creating simple bid...')
      
      const amountWei = parseEther(amount)
      const priceWei = parseUnits(price, auctionDecimals)
      
      console.log('Submitting bid to auction...')
      console.log('Amount:', amount, 'tokens')
      console.log('Price:', price, auctionCurrency)
      console.log('Auction:', auctionAddress)
      
      // Note: In reality, you'd need to use the submitBid function from CCA ABI
      alert('Bid submission would go here (using CCA.submitBid)')
      
    } catch (err: any) {
      console.error('❌ Failed to submit bid:', err)
      alert(err.message)
    }
  }
  
  return (
    <div className="space-y-4">
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
        <h3 className="text-white font-semibold mb-3 text-sm">Submit Bid</h3>
        
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Auction Address</label>
            <input
              type="text"
              value={auctionAddress}
              onChange={(e) => setAuctionAddress(e.target.value)}
              placeholder="0x..."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white text-sm"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Amount (Tokens)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step="0.1"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Price ({auctionCurrency}/token)</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                step={auctionDecimals === 6 ? "0.01" : "0.000001"}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white text-sm"
              />
            </div>
          </div>
          
          <button
            onClick={handleSimpleBid}
            disabled={!address || !auctionAddress}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 text-white py-2 rounded-lg text-sm transition-colors"
          >
            Submit Bid
          </button>
        </div>
      </div>
      
      {auctionAddress && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <p className="text-xs text-slate-400 mb-2">Auction Info</p>
          <div className="space-y-1 text-xs">
            <div>
              <span className="text-slate-400">Currency: </span>
              <span className="text-blue-300">{auctionCurrency}</span>
            </div>
            <div>
              <span className="text-slate-400">Decimals: </span>
              <span className="text-blue-300">{auctionDecimals}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
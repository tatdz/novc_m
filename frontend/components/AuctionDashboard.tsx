// components/AuctionDashboard.tsx
'use client'

import { useState, useEffect } from 'react'
import { type Address, formatEther } from 'viem'
import { readContract } from '@/lib/wagmi-contract-helpers'
import { CCA_ABI } from '@/lib/abis'

interface AuctionDetails {
  clearingPrice: bigint
  currencyRaised: bigint
  totalSupply: bigint
  totalCleared: bigint
  startBlock: bigint
  endBlock: bigint
  claimBlock: bigint
  isGraduated: boolean
  floorPrice: bigint
  tickSpacing: bigint
  token: Address
  currency: Address
}

export default function AuctionDashboard() {
  const [auctionAddress, setAuctionAddress] = useState('')
  const [data, setData] = useState<AuctionDetails | null>(null)
  const [loading, setLoading] = useState(false)
  
  const loadAuction = async () => {
    if (!auctionAddress) return
    
    try {
      setLoading(true)
      console.log('📊 Loading auction data from chain...')
      
      const addr = auctionAddress as Address
      
      // Load auction data from chain
      const [
        clearingPrice,
        currencyRaised,
        totalSupply,
        totalCleared,
        startBlock,
        endBlock,
        claimBlock,
        isGraduated,
        floorPrice,
        tickSpacing,
        token,
        currency,
      ] = await Promise.all([
        readContract<bigint>(addr, CCA_ABI, 'clearingPrice'),
        readContract<bigint>(addr, CCA_ABI, 'currencyRaised'),
        readContract<bigint>(addr, CCA_ABI, 'totalSupply'),
        readContract<bigint>(addr, CCA_ABI, 'totalCleared'),
        readContract<bigint>(addr, CCA_ABI, 'startBlock'),
        readContract<bigint>(addr, CCA_ABI, 'endBlock'),
        readContract<bigint>(addr, CCA_ABI, 'claimBlock'),
        readContract<boolean>(addr, CCA_ABI, 'isGraduated'),
        readContract<bigint>(addr, CCA_ABI, 'floorPrice'),
        readContract<bigint>(addr, CCA_ABI, 'tickSpacing'),
        readContract<Address>(addr, CCA_ABI, 'token'),
        readContract<Address>(addr, CCA_ABI, 'currency'),
      ])

      const chainData: AuctionDetails = {
        clearingPrice,
        currencyRaised,
        totalSupply,
        totalCleared,
        startBlock,
        endBlock,
        claimBlock,
        isGraduated,
        floorPrice,
        tickSpacing,
        token,
        currency,
      }
      
      setData(chainData)
      console.log('✅ Auction data loaded')
      setLoading(false)
      
    } catch (err: any) {
      console.error('❌ Failed to load auction:', err)
      alert(err.message)
      setLoading(false)
    }
  }
  
  // Auto-load if auction address is provided in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const address = urlParams.get('auction')
    if (address) {
      setAuctionAddress(address)
      setTimeout(() => loadAuction(), 100) // Small delay to ensure state is set
    }
  }, [])
  
  return (
    <div className="space-y-6">
      {/* Input Section */}
      <div className="glass rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">View Auction</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-2">Auction Address</label>
            <input
              type="text"
              value={auctionAddress}
              onChange={(e) => setAuctionAddress(e.target.value)}
              placeholder="0x..."
              className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white font-mono text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          
          <button
            onClick={loadAuction}
            disabled={!auctionAddress || loading}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:opacity-90 disabled:bg-slate-700 text-white py-3 rounded-lg font-medium transition-all"
          >
            {loading ? 'Loading...' : 'Load Auction'}
          </button>
        </div>
      </div>
      
      {/* Details Section */}
      {data && (
        <div className="space-y-6">
          {/* Status */}
          <div className="glass rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Auction Status</span>
              {data.isGraduated ? (
                <span className="px-3 py-1 bg-green-500/10 border border-green-500/20 rounded text-sm text-green-400">
                  ✅ Graduated
                </span>
              ) : (
                <span className="px-3 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded text-sm text-yellow-400">
                  ⏳ In Progress
                </span>
              )}
            </div>
          </div>
          
          {/* Core Metrics from Chain */}
          <div className="glass rounded-lg p-6">
            <h4 className="text-base font-semibold text-white mb-4">📊 Auction Metrics</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="glass rounded-lg p-3">
                <p className="text-xs text-slate-400">Clearing Price</p>
                <p className="text-xl font-bold text-blue-400">
                  {formatEther(data.clearingPrice)} ETH
                </p>
              </div>
              
              <div className="glass rounded-lg p-3">
                <p className="text-xs text-slate-400">Currency Raised</p>
                <p className="text-xl font-bold text-green-400">
                  {(Number(data.currencyRaised) / 1e6).toFixed(2)} USDC
                </p>
              </div>
              
              <div className="glass rounded-lg p-3">
                <p className="text-xs text-slate-400">Floor Price</p>
                <p className="text-lg font-bold text-purple-400">
                  {formatEther(data.floorPrice)} ETH
                </p>
              </div>
              
              <div className="glass rounded-lg p-3">
                <p className="text-xs text-slate-400">Tick Spacing</p>
                <p className="text-lg font-bold text-orange-400">
                  {formatEther(data.tickSpacing)} ETH
                </p>
              </div>
            </div>
          </div>
          
          {/* Supply Progress */}
          <div className="glass rounded-lg p-6">
            <h4 className="text-base font-semibold text-white mb-4">📈 Auction Progress</h4>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">Token Supply Progress</span>
                  <span className="text-blue-400">
                    {((Number(data.totalCleared) / Number(data.totalSupply)) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                    style={{ 
                      width: `${Math.min((Number(data.totalCleared) / Number(data.totalSupply)) * 100, 100)}%` 
                    }}
                  />
                </div>
              </div>
              
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard 
                  label="Total Supply" 
                  value={data.totalSupply.toString()} 
                  color="blue"
                />
                <StatCard 
                  label="Cleared Tokens" 
                  value={data.totalCleared.toString()} 
                  color="purple"
                />
                <StatCard 
                  label="Currency Raised" 
                  value={`${(Number(data.currencyRaised) / 1e6).toFixed(0)} USDC`} 
                  color="green"
                />
                <StatCard 
                  label="Progress" 
                  value={`${((Number(data.totalCleared) / Number(data.totalSupply)) * 100).toFixed(1)}%`} 
                  color="orange"
                />
              </div>
            </div>
          </div>
          
          {/* Block Info */}
          <div className="glass rounded-lg p-6">
            <h4 className="text-base font-semibold text-white mb-4">⏰ Block Timeline</h4>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Start Block</span>
                <span className="text-white font-mono">{data.startBlock.toString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">End Block</span>
                <span className="text-white font-mono">{data.endBlock.toString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Claim Block</span>
                <span className="text-white font-mono">{data.claimBlock.toString()}</span>
              </div>
            </div>
          </div>
          
          {/* Contracts */}
          <div className="glass rounded-lg p-6">
            <h4 className="text-base font-semibold text-white mb-4">📜 Contract Addresses</h4>
            
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-400 mb-1">Auction Token</p>
                <p className="text-xs text-white font-mono break-all">{data.token}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">Currency Token (USDC)</p>
                <p className="text-xs text-white font-mono break-all">{data.currency}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {!data && !loading && (
        <div className="glass rounded-lg p-12 text-center">
          <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🔍</span>
          </div>
          <p className="text-slate-400 text-sm mb-2">
            Enter an auction address to view details
          </p>
          <p className="text-slate-500 text-xs">
            Data will be loaded directly from the blockchain
          </p>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorClasses = {
    blue: 'border-blue-500/20 bg-blue-500/5',
    purple: 'border-purple-500/20 bg-purple-500/5',
    green: 'border-green-500/20 bg-green-500/5',
    orange: 'border-orange-500/20 bg-orange-500/5',
  }
  
  return (
    <div className={`border rounded-lg p-3 ${colorClasses[color as keyof typeof colorClasses]}`}>
      <div className="text-sm font-bold text-white">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  )
}
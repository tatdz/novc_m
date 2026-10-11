// app/providers.tsx 
'use client'

import { WagmiProvider, createConfig, http } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import type { ReactNode } from 'react'
import { 
  sepolia, 
  baseSepolia, 
  arbitrumSepolia, 
  optimismSepolia, 
  polygonAmoy,
  unichainSepolia,
  monadTestnet
} from 'wagmi/chains'

// Define Arc chain
const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { 
    name: 'Ether',
    symbol: 'ETH', 
    decimals: 18 
  },
  rpcUrls: {
    default: { 
      http: ['https://rpc.testnet.arc.network'] 
    },
    public: { 
      http: ['https://rpc.testnet.arc.network'] 
    },
  },
  blockExplorers: {
    default: { 
      name: 'Arc Explorer', 
      url: 'https://testnet.arcscan.app' 
    },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11' as `0x${string}`,
      blockCreated: 11907934,
    },
  },
  testnet: true,
}

// Helper to get proxy URL for a network
const getProxyUrl = (network: string) => `/api/rpc?network=${network}`

// Create wagmi config - using proxy endpoints
const config = createConfig({
  chains: [
    monadTestnet,
    unichainSepolia,
    sepolia,
    arcTestnet,
    baseSepolia,
    arbitrumSepolia,
    optimismSepolia,
    polygonAmoy,
  ],
  transports: {
    // Use proxy endpoints for all networks
    [monadTestnet.id]: http(getProxyUrl('monad-testnet')),
    [unichainSepolia.id]: http(getProxyUrl('unichain-sepolia')),
    [sepolia.id]: http(getProxyUrl('sepolia')),
    [arcTestnet.id]: http(getProxyUrl('arc-testnet')),
    [baseSepolia.id]: http(getProxyUrl('base-sepolia')),
    [arbitrumSepolia.id]: http(getProxyUrl('arbitrum-sepolia')),
    [optimismSepolia.id]: http(getProxyUrl('op-sepolia')),
    [polygonAmoy.id]: http(getProxyUrl('polygon-amoy')),
  },
  ssr: true,
})

// Create query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
// lib/contracts.ts
import { type Address } from 'viem'
import { sepolia, monadTestnet, baseSepolia, arbitrumSepolia, optimismSepolia, polygonAmoy, arcTestnet } from 'viem/chains'

// ============================================
// HARDCODED ADDRESSES (PRESERVED)
// ============================================
const HARDCODED_ADDRESSES = {
  // NoVC Core
  NEXT_PUBLIC_FACTORY_ADDRESS: '0x7899770762d96c1F63cED8383C8B8C2dA16cD1b6' as Address,
  
  // Tokens
  NEXT_PUBLIC_USDC_MONAD_TESTNET: '0x8699FC6ec5E9976fc5D6D3A8f23AAf8bA9ec0b65' as Address,

  // Pyth
  NEXT_PUBLIC_PYTH_ADDRESS: '0xFC6bd9F9f0c6481c6Af3A7Eb46b296A5B85ed379' as Address,
  
  // CCTP
  NEXT_PUBLIC_CCTP_TOKEN_MESSENGER: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA' as Address,
  NEXT_PUBLIC_CCTP_MESSAGE_TRANSMITTER: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275' as Address,
  
} as const

// ============================================
// DEPLOYED CONTRACT ADDRESSES - MONAD TESTNET
// ============================================
export const DEPLOYED_ADDRESSES = {
  // NoVC Core - Deployed on Monad Testnet
  NOVC_ANGEL_HOOK: '0xD242803aE1840bB5FaC91EcbBC03B26BcB2eFFF0' as Address,
  POOL_MANAGER: '0x451D64ab3b650040d2aE1886602b97ed6eDc643d' as Address,
  POSITION_MANAGER: '0x3Bb14E3D0Cd50aBe3EdACa06d06c29C78676C31A' as Address,
  UNIVERSAL_ROUTER: '0x1b7bFCd2870329B987191910D85c22C7287f3c22' as Address,
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address,
  
  // Tokens 
  USDC_ARBITRUM_SEPOLIA: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d' as Address,
  USDC_BASE_SEPOLIA: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address,
  USDC_OPTIMISM_SEPOLIA: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7' as Address,
  USDC_POLYGON_AMOY: '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582' as Address,
  USDC_MONAD_TESTNET: '0x534b2f3A21130d7a60830c2Df862319e593943A3' as Address,
  USDC_ETHEREUM_SEPOLIA: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address,
  USDC_ARC_TESTNET: '0x3600000000000000000000000000000000000000' as Address,
  
  // Uniswap Factory - For creating auctions
  FACTORY: '0x7899770762d96c1F63cED8383C8B8C2dA16cD1b6' as Address,
  
  // Pyth Oracle
  PYTH: '0xFC6bd9F9f0c6481c6Af3A7Eb46b296A5B85ed379' as Address,
  
  // CCTP - Using hardcoded values
  CCTP_TOKEN_MESSENGER: HARDCODED_ADDRESSES.NEXT_PUBLIC_CCTP_TOKEN_MESSENGER,
  CCTP_MESSAGE_TRANSMITTER: HARDCODED_ADDRESSES.NEXT_PUBLIC_CCTP_MESSAGE_TRANSMITTER,
  
  // Mock tokens for testing
  MOCK_USDC: HARDCODED_ADDRESSES.NEXT_PUBLIC_USDC_MONAD_TESTNET,
  
} as const

// Helper to get value without warnings
function getEnvValue(key: string): string {
  // In SSR, return hardcoded value
  if (typeof window === 'undefined') {
    return HARDCODED_ADDRESSES[key as keyof typeof HARDCODED_ADDRESSES] || ''
  }
  
  // In browser, try process.env first, then hardcoded, then deployed
  const envValue = process.env[key]
  if (envValue) return envValue
  
  // Fallback to hardcoded
  const hardcodedValue = HARDCODED_ADDRESSES[key as keyof typeof HARDCODED_ADDRESSES]
  if (hardcodedValue) return hardcodedValue
  
  // Fallback to deployed addresses
  if (key === 'NEXT_PUBLIC_NOVC_ANGEL_HOOK') return DEPLOYED_ADDRESSES.NOVC_ANGEL_HOOK
  if (key === 'NEXT_PUBLIC_USDC_MONAD_TESTNET') return DEPLOYED_ADDRESSES.USDC_MONAD_TESTNET
  
  return ''
}

// Safe address getter
function getAddress(key: string): Address {
  const value = getEnvValue(key)
  
  // Validate address format
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    console.error(`Invalid address for ${key}: ${value}`)
    return '0x0000000000000000000000000000000000000000' as Address
  }
  
  return value as Address
}

// ============================================
// CONTRACT ADDRESSES EXPORTS
// ============================================
export const CONTRACTS = {
  // NoVC Core
  FACTORY: getAddress('NEXT_PUBLIC_FACTORY_ADDRESS'),
  
  // Deployed hook
  NOVC_ANGEL_HOOK: DEPLOYED_ADDRESSES.NOVC_ANGEL_HOOK,
  POOL_MANAGER: DEPLOYED_ADDRESSES.POOL_MANAGER,
  POSITION_MANAGER: DEPLOYED_ADDRESSES.POSITION_MANAGER,
  UNIVERSAL_ROUTER: DEPLOYED_ADDRESSES.UNIVERSAL_ROUTER,
  PERMIT2: DEPLOYED_ADDRESSES.PERMIT2,
  
  // CCTP
  CCTP_TOKEN_MESSENGER: DEPLOYED_ADDRESSES.CCTP_TOKEN_MESSENGER,
  CCTP_MESSAGE_TRANSMITTER: DEPLOYED_ADDRESSES.CCTP_MESSAGE_TRANSMITTER,
  
  // Tokens
  USDC_MONAD_TESTNET: DEPLOYED_ADDRESSES.USDC_MONAD_TESTNET,
  NEXT_PUBLIC_USDC_MONAD_TESTNET: getAddress('NEXT_PUBLIC_USDC_MONAD_TESTNET'),
  
  // Pyth
  PYTH: DEPLOYED_ADDRESSES.PYTH,
  
  // Mock tokens
  MOCK_TOKEN: DEPLOYED_ADDRESSES.MOCK_USDC,
  
} as const

// Legacy alias
export const CONTRACT_ADDRESSES = CONTRACTS

// ============================================
// Pyth Price Feed IDs
// ============================================
export const PYTH_FEEDS = {
  MON_USD: (process.env.NEXT_PUBLIC_PYTH_MON_USD || '0x31491744e2dbf6df7fcf4ac0820d18a609b49076d45066d3568424e62f686cd1') as `0x${string}`,
  USDC_USD: (process.env.NEXT_PUBLIC_PYTH_USDC_USD || '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a') as `0x${string}`,
} as const

// ============================================
// CCTP Domains
// ============================================
export const CCTP_DOMAINS = {
  SEPOLIA: 0,
  AVALANCHE_FUJI: 1,
  OP_SEPOLIA: 2,
  ARBITRUM_SEPOLIA: 3,
  BASE_SEPOLIA: 6,
  POLYGON_AMOY: 7,
  MONAD_TESTNET: 15,
  ARC_TESTNET: 26,
  SEI_ATLANTIC: 16,
} as const


// ============================================
// SUPPORTED CHAINS
// ============================================
export const SUPPORTED_CHAINS = [
  {
    id: 11155111,
    name: 'Ethereum Sepolia',
    chain: sepolia,
    cctpDomain: CCTP_DOMAINS.SEPOLIA,
    logo: '🔷',
    usdcAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address,
  },
  {
    id: 5042002,
    name: 'Arc Testnet',
    chain: arcTestnet,
    cctpDomain: CCTP_DOMAINS.ARC_TESTNET,
    logo: '🌀',
    usdcAddress: DEPLOYED_ADDRESSES.USDC_ARBITRUM_SEPOLIA,
  },
  {
    id: 84532,
    name: 'Base Sepolia',
    chain: baseSepolia,
    cctpDomain: CCTP_DOMAINS.BASE_SEPOLIA,
    logo: '🔵',
    usdcAddress: DEPLOYED_ADDRESSES.USDC_BASE_SEPOLIA,
  },
  {
    id: 421614,
    name: 'Arbitrum Sepolia',
    chain: arbitrumSepolia,
    cctpDomain: CCTP_DOMAINS.ARBITRUM_SEPOLIA,
    logo: '🔶',
    usdcAddress: DEPLOYED_ADDRESSES.USDC_ARBITRUM_SEPOLIA,
  },
  {
    id: 11155420,
    name: 'Optimism Sepolia',
    chain: optimismSepolia,
    cctpDomain: CCTP_DOMAINS.OP_SEPOLIA,
    logo: '🔴',
    usdcAddress: DEPLOYED_ADDRESSES.USDC_OPTIMISM_SEPOLIA,
  },
  {
    id: 80002,
    name: 'Polygon Amoy',
    chain: polygonAmoy,
    cctpDomain: CCTP_DOMAINS.POLYGON_AMOY,
    logo: '🟣',
    usdcAddress: DEPLOYED_ADDRESSES.USDC_POLYGON_AMOY,
  },
  {
    id: 10143, 
    name: 'Monad Testnet',
    chain: monadTestnet, 
    cctpDomain: CCTP_DOMAINS.MONAD_TESTNET, 
    logo: '🔷', 
    usdcAddress: DEPLOYED_ADDRESSES.USDC_MONAD_TESTNET, 
  },
    {
    id: 5042002, 
    name: 'Arc Testnet',
    chain: arcTestnet, 
    cctpDomain: CCTP_DOMAINS.ARC_TESTNET, 
    logo: '🏹', 
    usdcAddress: DEPLOYED_ADDRESSES.USDC_ARC_TESTNET, 
  },
] as const

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getChainName(chainId: number): string {
  const chain = SUPPORTED_CHAINS.find(c => c.id === chainId)
  return chain?.name || `Chain ${chainId}`
}

export function getCCTPDomain(chainId: number): number {
  const chain = SUPPORTED_CHAINS.find(c => c.id === chainId)
  return chain?.cctpDomain ?? CCTP_DOMAINS.SEPOLIA
}

export function getUSDCAddress(chainId?: number): Address | undefined {
  if (!chainId) return undefined
  const chain = SUPPORTED_CHAINS.find(c => c.id === chainId)
  return chain?.usdcAddress
}

export function getChainByCCTPDomain(domain: number): typeof SUPPORTED_CHAINS[number] | undefined {
  return SUPPORTED_CHAINS.find(c => c.cctpDomain === domain)
}

export function getEnvVar(key: string, defaultValue: string = ''): string {
  if (key.includes('CIRCLE') && !process.env[key]) {
    return defaultValue
  }
  return process.env[key] || defaultValue
}

// ============================================
// CIRCLE API CONFIGURATION
// ============================================
export const CIRCLE_API = {
  API_KEY: getEnvVar('CIRCLE_API_KEY', ''),
  ENTITY_SECRET: getEnvVar('CIRCLE_ENTITY_SECRET', ''),
  APP_ID: getEnvVar('NEXT_PUBLIC_CIRCLE_APP_ID', ''),
} as const

// ============================================
// TYPE EXPORTS
// ============================================
export type SupportedChain = typeof SUPPORTED_CHAINS[number]
export type ContractAddresses = typeof CONTRACTS
export type CCTPDomain = typeof CCTP_DOMAINS[keyof typeof CCTP_DOMAINS]

// ============================================
// DEVELOPMENT LOGGING
// ============================================
if (process.env.NODE_ENV === 'development') {
  console.log('🔗 Contract Addresses Loaded:')
  Object.entries(CONTRACTS).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`)
  })
  console.log('🔗 NoVC Deployed Hook:', DEPLOYED_ADDRESSES.NOVC_ANGEL_HOOK)
}

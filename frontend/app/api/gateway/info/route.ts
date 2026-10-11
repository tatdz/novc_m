// app/api/gateway/info/route.ts
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const chains = [
      {
        chain: 'Ethereum Sepolia',
        network: 'testnet',
        domain: 0,
        chainId: 11155111,
        usdcAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        tokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
        messageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        rpcUrl: 'https://rpc.sepolia.org',
        explorer: 'https://sepolia.etherscan.io',
        logo: '🔷'
      },
      {
        chain: 'Arc Testnet',
        network: 'testnet',
        domain: 26,
        chainId: 5042002,
        usdcAddress: '0x3600000000000000000000000000000000000000',
        tokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
        messageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        rpcUrl: 'https://rpc.testnet.arc.network',
        explorer: 'https://testnet.arcscan.app',
        logo: '🌀'
      },
      {
        chain: 'Base Sepolia',
        network: 'testnet',
        domain: 6,
        chainId: 84532,
        usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        tokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
        messageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        rpcUrl: 'https://sepolia.base.org',
        explorer: 'https://sepolia.basescan.org',
        logo: '🔵'
      },
      {
        chain: 'Arbitrum Sepolia',
        network: 'testnet',
        domain: 3,
        chainId: 421614,
        usdcAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
        tokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
        messageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
        explorer: 'https://sepolia.arbiscan.io',
        logo: '🔶'
      },
      {
        chain: 'OP Sepolia',
        network: 'testnet',
        domain: 2,
        chainId: 11155420,
        usdcAddress: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
        tokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
        messageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        rpcUrl: 'https://sepolia.optimism.io',
        explorer: 'https://sepolia-optimism.etherscan.io',
        logo: '🔴'
      },
      {
        chain: 'Polygon Amoy',
        network: 'testnet',
        domain: 7,
        chainId: 80002,
        usdcAddress: '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582',
        tokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
        messageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        rpcUrl: 'https://rpc-amoy.polygon.technology',
        explorer: 'https://amoy.polygonscan.com',
        logo: '🟣'
      },
      {chain: 'monadTestnet',
        network: 'testnet',
        domain: 15,
        chainID: 10143,
        usdcAddress: '0x534b2f3A21130d7a60830c2Df862319e593943A3',
        tokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
        messageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        rpcUrl: 'https://testnet-rpc.monad.xyz',
        explorer: 'https://testnet.monadscan.com',
        logo: '🦄'
      }
    ]

    return NextResponse.json({
      success: true,
      data: {
        name: 'NoVC Unified USDC Gateway',
        version: '1.0.0',
        description: 'Real-time USDC balance across all supported chains',
        supportedChains: chains,
        totalChains: chains.length,
        cctpEnabled: true,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error: any) {
    console.error('❌ Gateway info error:', error)
    
    return NextResponse.json(
      { 
        success: false, 
        message: `Failed to fetch Gateway info: ${error.message}`,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

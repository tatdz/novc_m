// app/api/rpc/route.ts
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const FALLBACK_RPCS: Record<string, string[]> = {
  'monad-testnet': [
    `https://monad-testnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    'https://testnet-rpc.monad.xyz',
    'https://rpc-testnet.monadinfra.com',
  ],
  'sepolia': [
    process.env.ALCHEMY_ETHEREUM_SEPOLIA_URL || '',
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://1rpc.io/sepolia',
    'https://rpc.sepolia.org',
  ].filter(Boolean),
  'arc-testnet': [
    process.env.ALCHEMY_ARC_SEPOLIA_URL || '',
    'https://rpc-testnet.arc.network',
    'https://testnet-rpc.arc.network',
  ].filter(Boolean),
  'arbitrum-sepolia': [
    `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    'https://sepolia-rollup.arbitrum.io/rpc',
  ],
  'op-sepolia': [
    `https://opt-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  ],
  'base-sepolia': [
    `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    'https://sepolia.base.org',
  ],
  'polygon-amoy': [
    `https://polygon-amoy.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  ],
  'arc': [
    `https://arc-testnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    'https://rpc-testnet.arc.network',
  ],
}

interface RpcResult {
  data: any
  status: number
  isBlockRangeError: boolean
}

async function tryRpc(url: string, body: any, timeoutMs = 20000): Promise<RpcResult | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timer)

    const data = await response.json().catch(() => null)
    if (!data) return null

    const isBlockRange = data?.error?.message?.includes('block range')
    if (!response.ok) {
      return { data, status: response.status, isBlockRangeError: isBlockRange }
    }
    if (data?.error && !isBlockRange) {
      return { data, status: 200, isBlockRangeError: false }
    }
    return { data, status: 200, isBlockRangeError: isBlockRange }
  } catch {
    return null
  }
}

function isLargeLogRange(body: any): boolean {
  if (body?.method !== 'eth_getLogs') return false
  const params = body?.params?.[0]
  if (!params) return false
  const from = params.fromBlock
  const to = params.toBlock
  if (from === '0x0' && (to === 'latest' || !to)) return true
  if (from && to && to !== 'latest') {
    const fromNum = parseInt(from, 16)
    const toNum = parseInt(to, 16)
    if (toNum - fromNum > 2000) return true
  }
  return false
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const network = searchParams.get('network') || 'sepolia'

    const rpcs = FALLBACK_RPCS[network]
    if (!rpcs || rpcs.length === 0) {
      return NextResponse.json({ error: 'Invalid network' }, { status: 400 })
    }

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    let lastError: RpcResult | null = null

    if (isLargeLogRange(body) && body?.params?.[0]) {
      const publicRpcs = rpcs.filter(r => !r.includes('alchemy.com'))
      const tryOrder = publicRpcs.length > 0 ? [...publicRpcs, ...rpcs.filter(r => r.includes('alchemy.com'))] : rpcs

      for (const url of tryOrder) {
        const result = await tryRpc(url, body, 15000)
        if (!result) continue
        if (result.status === 200 && !result.data?.error) {
          return NextResponse.json(result.data, { status: 200 })
        }
        if (result.data?.error && !result.isBlockRangeError) {
          return NextResponse.json(result.data, { status: result.status })
        }
        lastError = result
      }

      const latestBlockBody = { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }
      let latestBlock = 'latest'
      for (const url of rpcs) {
        const blockResult = await tryRpc(url, latestBlockBody, 5000)
        if (blockResult?.data?.result) {
          latestBlock = blockResult.data.result
          break
        }
      }

      if (latestBlock !== 'latest') {
        const latest = parseInt(latestBlock, 16)
        const lookback = 50000
        const fromBlock = '0x' + Math.max(0, latest - lookback).toString(16)
        const narrowBody = {
          ...body,
          params: [{ ...body.params[0], fromBlock, toBlock: latestBlock }]
        }
        for (const url of rpcs) {
          const result = await tryRpc(url, narrowBody, 15000)
          if (!result) continue
          if (result.status === 200 && !result.data?.error) {
            return NextResponse.json(result.data, { status: 200 })
          }
          lastError = result
        }
      }

      if (lastError) {
        return NextResponse.json(lastError.data, { status: lastError.status })
      }
      return NextResponse.json({ error: 'All RPC endpoints failed for log query' }, { status: 502 })
    }

    for (const url of rpcs) {
      const result = await tryRpc(url, body)
      if (!result) continue
      if (result.status === 200 && !result.data?.error) {
        return NextResponse.json(result.data, { status: 200 })
      }
      lastError = result
    }

    if (lastError) {
      return NextResponse.json(lastError.data, { status: lastError.status })
    }
    return NextResponse.json({ error: 'All RPC endpoints failed' }, { status: 502 })
  } catch (error: any) {
    console.error('RPC proxy error:', error)
    return NextResponse.json({ error: 'RPC request failed' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'RPC proxy endpoint',
    networks: Object.keys(FALLBACK_RPCS)
  })
}
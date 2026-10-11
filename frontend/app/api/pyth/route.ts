// app/api/pyth/route.ts
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const PYTH_REST_URL = 'https://pyth-lazer.dourolabs.app/v1/latest_price'
const PYTH_CHANNEL = 'fixed_rate@200ms'

// Pyth Pro numeric feed IDs
const FEED_IDS = {
  USDC_USD: 7,
} as const

interface PythProResponse {
  parsed?: {
    timestampUs?: string | number
    priceFeeds?: Array<{
      priceFeedId: number
      price: string | number
      feedUpdateTimestamp: number
    }>
  }
  leEcdsa?: {
    encoding: string
    data: string
  }
}

export async function GET(_request: NextRequest) {
  try {
    const apiKey = process.env.PYTH_PRO_API_KEY
    if (!apiKey) {
      console.error('[Pyth Pro] PYTH_PRO_API_KEY is not set')
      return NextResponse.json(
        { error: 'PYTH_PRO_API_KEY not configured on server' },
        { status: 500 }
      )
    }

    const feedIdList = [FEED_IDS.USDC_USD]

    const response = await fetch(PYTH_REST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        priceFeedIds: feedIdList,
        channel: PYTH_CHANNEL,
        properties: ['price', 'feedUpdateTimestamp'],
        formats: ['leEcdsa'],
        jsonBinaryEncoding: 'hex',
      }),
      // brief server-side cache so rapid refreshes don't hammer Pyth Pro
      next: { revalidate: 2 },
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.error('[Pyth Pro] upstream error', response.status, text.slice(0, 300))
      return NextResponse.json(
        { error: `Pyth Pro returned ${response.status}` },
        { status: response.status }
      )
    }

    const data = (await response.json()) as PythProResponse

    const feeds = data.parsed?.priceFeeds ?? []
    if (feeds.length === 0) {
      return NextResponse.json(
        { error: 'Pyth Pro returned no priceFeeds' },
        { status: 502 }
      )
    }

    // Pyth Pro prices come pre-scaled; typical exponent is -8.
    // If display values look off by 10x, adjust EXPO and redeploy.
    const EXPO = -8

    const prices = feeds.map((feed) => {
      let feedName = 'UNKNOWN'
      if (feed.priceFeedId === FEED_IDS.USDC_USD) feedName = 'USDC/USD'

      return {
        feedName,
        feedId: feed.priceFeedId,
        price: String(feed.price),
        conf: '0',
        expo: EXPO,
        publishTime: Math.floor(Number(feed.feedUpdateTimestamp) / 1_000_000),
      }
    })

    return NextResponse.json({
      prices,
      rawTimestamp: data.parsed?.timestampUs,
      leEcdsa: data.leEcdsa, // only used if you later submit on-chain updates
    })
  } catch (error: any) {
    console.error('[Pyth Pro] error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch Pyth Pro prices' },
      { status: 500 }
    )
  }
}
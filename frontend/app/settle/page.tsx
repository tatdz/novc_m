'use client'

import dynamic from 'next/dynamic'

const SettlePage = dynamic(() => import('./settle-client'), { ssr: false })

export default function Page() {
  return <SettlePage />
}

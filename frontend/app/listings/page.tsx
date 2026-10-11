'use client'

import dynamic from 'next/dynamic'

const ListingsPage = dynamic(() => import('./listings-client'), { ssr: false })

export default function Page() {
  return <ListingsPage />
}

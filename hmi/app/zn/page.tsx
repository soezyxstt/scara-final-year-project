'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'

const ZNPageContent = dynamic(
  () => import('./zn-page-content'),
  { ssr: false }
)

export default function ZNPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-hmi-bg text-hmi-text animate-pulse">
        <span className="text-sm font-medium">Loading ZN Tuner...</span>
      </div>
    }>
      <ZNPageContent />
    </Suspense>
  )
}

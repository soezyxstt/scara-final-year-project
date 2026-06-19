'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'

const PCBPageContent = dynamic(
  () => import('./pcb-page-content'),
  { ssr: false }
)

export default function PCBPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-hmi-bg text-hmi-text animate-pulse">
        <span className="text-sm font-medium">Loading PCB docs...</span>
      </div>
    }>
      <PCBPageContent />
    </Suspense>
  )
}

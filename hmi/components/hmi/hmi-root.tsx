'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MonitorTab } from './monitor-tab'
import { ReadmeTab } from './readme-tab'
import { AnalysisTab } from './analysis-tab'
import { ZNAnalysisTab } from './zn-analysis-tab'
import { HMITutorial } from './hmi-tutorial'
import { cn } from '@/lib/utils'

function HMIContent() {
  const search = useSearchParams()
  const router = useRouter()
  const requested = search.get('tab') ?? 'monitor'
  const tab = ['monitor', 'analysis', 'rest', 'readme'].includes(requested) ? requested : 'monitor'

  useEffect(() => {
    const switchTab = (event: Event) => {
      const next = (event as CustomEvent<string>).detail
      if (['monitor', 'analysis', 'rest', 'readme'].includes(next)) router.push(`/?tab=${next}`)
    }
    window.addEventListener('hmi_switch_tab', switchTab)
    return () => window.removeEventListener('hmi_switch_tab', switchTab)
  }, [router])

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className={cn('flex flex-col flex-1 min-h-0', tab !== 'monitor' && 'hidden')}><MonitorTab /></div>
      {tab === 'analysis' && <div className="flex-1 min-h-0 overflow-y-auto"><AnalysisTab /></div>}
      {tab === 'rest' && <div className="flex-1 min-h-0 overflow-y-auto"><ZNAnalysisTab isActive /></div>}
      {tab === 'readme' && <div className="flex-1 min-h-0 overflow-hidden"><ReadmeTab /></div>}
      <HMITutorial />
    </div>
  )
}

export function HMIRoot() {
  return <Suspense><HMIContent /></Suspense>
}

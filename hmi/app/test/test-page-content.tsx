'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MonitorTab } from '@/components/hmi/monitor-tab'
import { AnalysisTab } from '@/components/hmi/analysis-tab'
import { ZNAnalysisTab } from '@/components/hmi/zn-analysis-tab'
import { AdvTunerTab } from '@/components/hmi/adv-tuner-tab'
import { RawSignalSection } from '@/components/hmi/raw-signal-section'
import { ConsoleTabs } from '@/components/hmi/console-shell'
import { cn } from '@/lib/utils'

export default function TestPageContent() {
  const router = useRouter()
  const search = useSearchParams()
  const requested = search.get('tab') ?? 'params'
  const tab = ['monitor', 'analysis', 'rest', 'params'].includes(requested) ? requested : 'params'
  const items = [{ value: 'params', label: 'Parameters' }, { value: 'monitor', label: 'Monitor' }, { value: 'analysis', label: 'Signals' }, { value: 'rest', label: 'Step response' }]
  useEffect(() => {
    const onSwitch = (event: Event) => {
      const next = (event as CustomEvent<string>).detail
      router.push(next === 'readme' ? '/?tab=readme' : `/test?tab=${next}`)
    }
    window.addEventListener('hmi_switch_tab', onSwitch)
    return () => window.removeEventListener('hmi_switch_tab', onSwitch)
  }, [router])
  return (
    <div className="h-full flex flex-col min-h-0">
      <ConsoleTabs label="Test views" items={items} value={tab} onChange={value => router.push(`/test?tab=${value}`)} />
      <div className={cn('flex-1 flex flex-col min-h-0', tab !== 'monitor' && 'hidden')}><MonitorTab /></div>
      {tab !== 'monitor' && <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'params' && <AdvTunerTab />}
        {tab === 'analysis' && <><AnalysisTab /><RawSignalSection /></>}
        {tab === 'rest' && <ZNAnalysisTab isActive />}
      </div>}
    </div>
  )
}

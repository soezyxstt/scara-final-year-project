'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { XYTrace } from './xy-trace'
import { ChartPanel, MetricsPanel } from './chart-panel'
import { ControlPanel } from './control-panel'
import { ConsoleTabs } from './console-shell'
import { cn } from '@/lib/utils'

export function MonitorTab() {
  const t = useTranslations('Console')
  const [inspector, setInspector] = useState('controls')
  return (
    <div className="monitor-workbench min-h-0 min-w-0">
      <section className="monitor-workspace min-h-0 min-w-0" aria-label={t('workspace')}><XYTrace /></section>
      <section className="monitor-telemetry min-h-0 min-w-0" aria-label={t('telemetry')}><ChartPanel /></section>
      <aside className="monitor-inspector min-h-0 min-w-0" aria-label={t('inspect')}>
        <ConsoleTabs label={t('inspect')} value={inspector} onChange={setInspector} items={[{ value: 'controls', label: t('controls') }, { value: 'metrics', label: t('metrics') }]} />
        <div className={cn('inspector-controls', inspector !== 'controls' && 'hidden')}><ControlPanel layout="dock" /></div>
        {inspector === 'metrics' && <div className="inspector-metrics"><MetricsPanel /></div>}
      </aside>
    </div>
  )
}

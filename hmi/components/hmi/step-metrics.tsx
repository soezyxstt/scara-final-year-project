'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useHMISlow } from '@/lib/hmi-context'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { DSample, TPoint } from '@/lib/hmi-types'

type SignalKey = 'th1' | 'th2' | 'eef'

function extractSignal(key: SignalKey, dBuf: DSample[], tBuf: TPoint[]): number[] {
  if (key === 'eef') return tBuf.map(p => Math.sqrt((p.xi - p.xa) ** 2 + (p.yi - p.ya) ** 2))
  if (key === 'th1') return dBuf.map(d => d.th1 * (180 / Math.PI))
  return dBuf.map(d => d.th2 * (180 / Math.PI))
}

interface Metrics {
  tr: number | null
  tp: number | null
  os: number | null
  ts2: number | null
  ts5: number | null
  ess: number
}

function computeMetrics(signal: number[]): Metrics {
  if (signal.length < 5) return { tr: null, tp: null, os: null, ts2: null, ts5: null, ess: 0 }

  const final = signal[signal.length - 1]
  const ssWindow = Math.max(1, Math.floor(signal.length * 0.1))
  const ssSamples = signal.slice(-ssWindow)
  const ess = ssSamples.reduce((a, b) => a + b, 0) / ssSamples.length

  const peak = Math.max(...signal)
  const peakIdx = signal.indexOf(peak)

  const lo = final * 0.1, hi = final * 0.9
  const riseStart = signal.findIndex(v => v >= lo)
  const riseEnd = signal.findIndex(v => v >= hi)
  const tr = riseStart >= 0 && riseEnd >= 0 ? riseEnd - riseStart : null

  const os = final !== 0 ? ((peak - final) / Math.abs(final)) * 100 : null

  function settleIdx(pct: number) {
    const band = Math.abs(final) * (pct / 100)
    for (let i = signal.length - 1; i >= 0; i--) {
      if (Math.abs(signal[i] - final) > band) return i + 1
    }
    return 0
  }
  const ts2 = settleIdx(2)
  const ts5 = settleIdx(5)

  return { tr, tp: peakIdx, os, ts2, ts5, ess }
}

interface MetricCardProps {
  label: string
  value: string
  unit?: string
  sub?: string
  accent: string      // Tailwind border/glow color class
  textAccent: string  // Tailwind text color class
  isEmpty?: boolean
}

function MetricCard({ label, value, unit, sub, accent, textAccent, isEmpty }: MetricCardProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col justify-between rounded-xl border bg-hmi-panel p-4 overflow-hidden transition-all duration-200 hover:scale-[1.02] hover:shadow-lg',
        accent,
        isEmpty && 'opacity-40'
      )}
    >
      {/* Decorative corner glow */}
      <div
        className={cn(
          'absolute -top-4 -right-4 h-16 w-16 rounded-full opacity-10 blur-2xl pointer-events-none',
          textAccent.replace('text-', 'bg-')
        )}
      />

      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-hmi-muted">{label}</p>

      <div className="mt-3 flex items-end gap-1.5 leading-none">
        <span className={cn('font-mono text-3xl font-bold tabular-nums', textAccent)}>
          {value}
        </span>
        {unit && (
          <span className="mb-0.5 text-xs font-medium text-hmi-muted">{unit}</span>
        )}
      </div>

      {sub && (
        <p className="mt-2 text-[10px] text-hmi-muted leading-snug">{sub}</p>
      )}
    </div>
  )
}

export function StepMetrics() {
  const t = useTranslations('StepMetrics')
  const { state } = useHMISlow()
  const [signal, setSignal] = useState<SignalKey>('eef')
  const [bandPct, setBandPct] = useState<'2' | '5'>('2')

  const d = state.frozenD, tData = state.frozenT
  const sig = extractSignal(signal, d, tData)
  const m = computeMetrics(sig)
  const hasData = d.length > 0

  const unit = signal === 'eef' ? 'mm' : '°'
  const tsVal = bandPct === '2' ? m.ts2 : m.ts5

  const fmt = (v: number | null, decimals = 1) =>
    v === null ? '—' : v.toFixed(decimals)

  return (
    <section>
      {/* Section header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-hmi-text uppercase tracking-widest">
            {t('title')}
          </h2>
          <p className="mt-0.5 text-[11px] text-hmi-muted">
            {t('subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={signal} onValueChange={(v: string) => setSignal(v as SignalKey)}>
            <SelectTrigger className="w-28 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="eef">{t('signals.eef')}</SelectItem>
              <SelectItem value="th1">{t('signals.th1')}</SelectItem>
              <SelectItem value="th2">{t('signals.th2')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={bandPct} onValueChange={(v: string) => setBandPct(v as '2' | '5')}>
            <SelectTrigger className="w-20 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">{t('bands.pct2')}</SelectItem>
              <SelectItem value="5">{t('bands.pct5')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Hero metric cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label={t('riseTime.label')}
          value={hasData && m.tr !== null ? String(m.tr) : '—'}
          unit={t('units.samples')}
          sub={t('riseTime.sub')}
          accent="border-blue-500/30"
          textAccent="text-blue-400"
          isEmpty={!hasData}
        />
        <MetricCard
          label={t('overshoot.label')}
          value={hasData && m.os !== null ? fmt(m.os) : '—'}
          unit="%"
          sub={t('overshoot.sub')}
          accent="border-orange-500/30"
          textAccent="text-orange-400"
          isEmpty={!hasData}
        />
        <MetricCard
          label={t('settlingTime.label', { pct: bandPct })}
          value={hasData && tsVal !== null ? String(tsVal) : '—'}
          unit={t('units.samples')}
          sub={t('settlingTime.sub', { pct: bandPct })}
          accent="border-emerald-500/30"
          textAccent="text-emerald-400"
          isEmpty={!hasData}
        />
        <MetricCard
          label={t('steadyStateError.label')}
          value={hasData ? Math.abs(m.ess).toFixed(3) : '—'}
          unit={unit}
          sub={t('steadyStateError.sub')}
          accent="border-violet-500/30"
          textAccent="text-violet-400"
          isEmpty={!hasData}
        />
      </div>

      {!hasData && (
        <p className="mt-3 text-center text-xs text-hmi-muted">
          {t('noData')}
        </p>
      )}
    </section>
  )
}


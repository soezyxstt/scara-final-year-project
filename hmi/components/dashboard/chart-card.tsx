'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Brush, ReferenceLine,
} from 'recharts'
import { cn } from '@/lib/utils'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'

export interface SeriesConfig {
  dataKey: string
  color: string
  label: string
  dashed?: boolean
  area?: boolean
}

export interface ChartCardProps {
  title: string
  /** Array of datasets — one per run. Each dataset is an array of data points. */
  datasets: Array<{
    runId: string
    runName: string
    color: string
    data: Record<string, number | null | undefined>[]
  }>
  /** Series to plot. dataKey should exist in each data point. */
  series: SeriesConfig[]
  xKey?: string
  xLabel?: string
  yLabel?: string
  height?: number
  type?: 'line' | 'area' | 'bar'
  className?: string
}

const CHART_STYLE = {
  grid: 'var(--color-hmi-grid-subtle)',
  axis: 'var(--color-hmi-text-secondary)',
  tooltip: { 
    backgroundColor: 'var(--color-hmi-elevated)', 
    border: '1px solid var(--color-hmi-grid)', 
    borderRadius: 6,
    color: 'var(--color-hmi-text)',
  },
}

function computeStats(data: Record<string, number | null | undefined>[], key: string) {
  const vals = data.map(d => d[key]).filter((v): v is number => typeof v === 'number' && isFinite(v))
  if (vals.length === 0) return null
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length
  const std = Math.sqrt(variance)
  return { min, max, mean, std, n: vals.length }
}

export function ChartCard({
  title, datasets, series, xKey = 't', xLabel, yLabel,
  height = 240, type = 'line', className,
}: ChartCardProps) {
  const t = useTranslations('ChartCard')
  const locale = useLocale()

  const formatFloat = useCallback((val: number, decimals: number = 3) => {
    return val.toLocaleString(locale === 'id' ? 'id-ID' : 'en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })
  }, [locale])

  const [showStats, setShowStats] = useState(false)
  const [caliper, setCaliper] = useState<[number | null, number | null]>([null, null])
  const [brushDomain, setBrushDomain] = useState<[number, number] | null>(null)
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (!isFocused) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFocused(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFocused])

  // For multi-run we flatten all datasets into merged data for display
  // For single run, data is straightforward
  const primaryData = datasets[0]?.data ?? []

  const visibleData = useMemo(() => {
    if (!brushDomain || primaryData.length === 0) return primaryData
    const [lo, hi] = brushDomain
    return primaryData.filter((d, i) => {
      const x = typeof d[xKey] === 'number' ? (d[xKey] as number) : i
      return x >= lo && x <= hi
    })
  }, [primaryData, brushDomain, xKey])

  const handleChartClick = useCallback((payload: { activeLabel?: string | number } | null) => {
    if (!payload?.activeLabel) return
    const val = Number(payload.activeLabel)
    setCaliper(([c1, c2]) => {
      if (c1 === null) return [val, null]
      if (c2 === null) return [c1, val]
      return [val, null]  // reset and start new caliper
    })
  }, [])

  const caliperDelta = caliper[0] !== null && caliper[1] !== null
    ? formatFloat(Math.abs(caliper[1] - caliper[0]), 1)
    : null

  // Build merged chart data for multi-run comparison
  // Each entry has keys like `${runId}_${dataKey}`
  const mergedData = useMemo(() => {
    if (datasets.length <= 1) return primaryData

    const maxLen = Math.max(...datasets.map(ds => ds.data.length))
    return Array.from({ length: maxLen }, (_, i) => {
      const point: Record<string, number | null | undefined> = {}
      const firstDs = datasets[0]?.data[i]
      if (firstDs) point[xKey] = firstDs[xKey]
      else point[xKey] = i
      for (const ds of datasets) {
        const row = ds.data[i]
        if (!row) continue
        for (const s of series) {
          point[`${ds.runId}_${s.dataKey}`] = row[s.dataKey]
        }
      }
      return point
    })
  }, [datasets, series, xKey, primaryData])

  const chartData = datasets.length <= 1 ? primaryData : mergedData

  const formatX = (v: number) => {
    if (v >= 1000) return `${formatFloat(v / 1000, 1)}s`
    return `${v}ms`
  }

  const isMulti = datasets.length > 1

  const RootChart = type === 'area' ? AreaChart : type === 'bar' ? BarChart : LineChart

  return (
    <div 
      className={cn(
        'bg-hmi-panel border border-hmi-grid rounded-lg overflow-hidden transition-all duration-300',
        isFocused 
          ? 'fixed inset-0 z-[100] m-0 rounded-none p-6 bg-hmi-bg flex flex-col h-screen w-screen' 
          : className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-hmi-grid shrink-0">
        <span className="text-xs font-semibold text-hmi-text">{title}</span>
        <div className="flex items-center gap-1.5">
          {caliperDelta && (
            <span className="text-[10px] font-mono bg-hmi-ideal/20 text-hmi-ideal px-1.5 py-0.5 rounded">
              Δ {caliperDelta} {xLabel ?? 'ms'}
            </span>
          )}
          {caliper[0] !== null && (
            <button
              className="text-[10px] text-hmi-muted hover:text-hmi-text"
              onClick={() => setCaliper([null, null])}
            >
              ✕ {t('caliper')}
            </button>
          )}
          <button
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
              showStats
                ? 'border-hmi-ideal/60 text-hmi-ideal bg-hmi-ideal/10'
                : 'border-hmi-grid text-hmi-muted hover:text-hmi-text'
            )}
            onClick={() => setShowStats(v => !v)}
          >
            σ {t('stats')}
          </button>
          <button
            className="text-[10px] p-1 rounded border border-hmi-grid text-hmi-muted hover:text-hmi-text hover:bg-hmi-btn flex items-center justify-center h-6 w-6"
            onClick={() => setIsFocused(f => !f)}
            title={isFocused ? t('collapseChart') : t('expandChart')}
          >
            {isFocused ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Stats panel */}
      {showStats && (
        <div className="px-3 py-2 bg-hmi-bg/50 border-b border-hmi-grid grid grid-cols-2 sm:grid-cols-4 gap-2">
          {series.slice(0, 4).map(s => {
            const ds = visibleData.length > 0 ? visibleData : primaryData
            const st = computeStats(ds, s.dataKey)
            if (!st) return null
            return (
              <div key={s.dataKey} className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold" style={{ color: s.color }}>{s.label}</span>
                <div className="grid grid-cols-2 gap-x-2 text-[10px] text-hmi-muted font-mono">
                  <span>min</span><span className="text-hmi-text">{formatFloat(st.min, 3)}</span>
                  <span>max</span><span className="text-hmi-text">{formatFloat(st.max, 3)}</span>
                  <span>{t('mean')}</span><span className="text-hmi-text">{formatFloat(st.mean, 3)}</span>
                  <span>{t('std')}</span><span className="text-hmi-text">{formatFloat(st.std, 3)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Chart */}
      <div 
        className="flex-1 min-h-0" 
        style={isFocused ? { height: 'calc(100vh - 120px)' } : { height }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <RootChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }} onClick={handleChartClick}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_STYLE.grid} />
            <XAxis
              dataKey={xKey}
              tickFormatter={formatX}
              tick={{ fill: CHART_STYLE.axis, fontSize: 10 }}
              label={xLabel ? { value: xLabel, position: 'insideBottomRight', offset: -4, fill: CHART_STYLE.axis, fontSize: 10 } : undefined}
            />
            <YAxis
              tick={{ fill: CHART_STYLE.axis, fontSize: 10 }}
              width={44}
              label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fill: CHART_STYLE.axis, fontSize: 10 } : undefined}
            />
            <Tooltip
              contentStyle={CHART_STYLE.tooltip}
              labelStyle={{ color: '#9A9A9A', fontSize: 10 }}
              itemStyle={{ fontSize: 10 }}
              labelFormatter={(v) => `t = ${formatX(Number(v))}`}
              formatter={(val) => [typeof val === 'number' ? formatFloat(val, 4) : '—']}
            />
            <Legend
              wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
              formatter={(val) => <span style={{ color: '#9A9A9A' }}>{val}</span>}
            />

            {/* Caliper reference lines */}
            {caliper[0] !== null && (
              <ReferenceLine x={caliper[0]} stroke="#2196F3" strokeDasharray="4 2" strokeWidth={1.5} />
            )}
            {caliper[1] !== null && (
              <ReferenceLine x={caliper[1]} stroke="#2196F3" strokeDasharray="4 2" strokeWidth={1.5} />
            )}

            {/* Series — single run */}
            {!isMulti && series.map(s => {
              if (type === 'area') {
                return (
                  <Area
                    key={s.dataKey}
                    type="monotone"
                    dataKey={s.dataKey}
                    stroke={s.color}
                    fill={s.color}
                    fillOpacity={0.12}
                    strokeWidth={1.5}
                    name={s.label}
                    dot={false}
                    strokeDasharray={s.dashed ? '4 2' : undefined}
                    isAnimationActive={false}
                  />
                )
              }
              if (type === 'bar') {
                return <Bar key={s.dataKey} dataKey={s.dataKey} fill={s.color} name={s.label} isAnimationActive={false} />
              }
              return (
                <Line
                  key={s.dataKey}
                  type="monotone"
                  dataKey={s.dataKey}
                  stroke={s.color}
                  strokeWidth={1.5}
                  name={s.label}
                  dot={false}
                  strokeDasharray={s.dashed ? '4 2' : undefined}
                  isAnimationActive={false}
                />
              )
            })}

            {/* Series — multi-run */}
            {isMulti && datasets.map(ds =>
              series.map(s => (
                <Line
                  key={`${ds.runId}_${s.dataKey}`}
                  type="monotone"
                  dataKey={`${ds.runId}_${s.dataKey}`}
                  stroke={ds.color}
                  strokeWidth={1.5}
                  name={`${ds.runName} — ${s.label}`}
                  dot={false}
                  isAnimationActive={false}
                />
              ))
            )}

            {/* Brush for zoom */}
            <Brush
              dataKey={xKey}
              height={18}
              stroke="var(--color-hmi-grid)"
              fill="var(--color-hmi-bg)"
              tickFormatter={formatX}
              travellerWidth={6}
              onChange={(domain) => {
                if (domain?.startIndex !== undefined && domain?.endIndex !== undefined) {
                  const d0 = chartData[domain.startIndex]
                  const d1 = chartData[domain.endIndex]
                  if (d0 && d1) {
                    const x0 = d0[xKey] as number
                    const x1 = d1[xKey] as number
                    setBrushDomain([x0, x1])
                  }
                } else {
                  setBrushDomain(null)
                }
              }}
            />
          </RootChart>
        </ResponsiveContainer>
      </div>

      {caliper[0] !== null && (
        <div className="px-3 py-1 bg-hmi-bg/40 border-t border-hmi-grid text-[10px] text-hmi-muted">
          {t('caliperInstruction')} • {caliper[1] === null ? t('caliperInstructionSecond') : t('caliperDelta', { delta: caliperDelta ?? '', unit: xLabel ?? 'ms' })}
        </div>
      )}
    </div>
  )
}

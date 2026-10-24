'use client'

import { memo, useState, useCallback, useMemo, useEffect } from 'react'
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Brush, ReferenceLine,
} from 'recharts'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { MathFormula, MathLabel } from '@/components/ui/math'
import { mergeTimestampRows, peakPreservingDownsample, sliceChartWindow, type ChartRow } from '@/lib/chart-downsample'
import { Maximize2, Minimize2, X } from 'lucide-react'
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
}

function computeStats(data: readonly ChartRow[], key: string) {
  let min = Infinity, max = -Infinity, mean = 0, m2 = 0, n = 0
  for (const row of data) {
    const value = row[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    min = Math.min(min, value)
    max = Math.max(max, value)
    n++
    const delta = value - mean
    mean += delta / n
    m2 += delta * (value - mean)
  }
  return n ? { min, max, mean, std: Math.sqrt(m2 / n), n } : null
}

const EMPTY_DATA: ChartRow[] = []
const DISPLAY_POINT_LIMIT = 1000

function ChartCardView({
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

  // Statistics retain full recorded data; rendering uses a separate peak envelope.
  const primaryData = datasets[0]?.data ?? EMPTY_DATA
  const keySignature = series.map(item => item.dataKey).join('\0')
  const keys = useMemo(() => keySignature.split('\0'), [keySignature])

  const visibleData = useMemo(() => {
    if (!brushDomain || primaryData.length === 0) return primaryData
    const [lo, hi] = brushDomain
    return primaryData.filter(row => {
      const x = row[xKey]
      return typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi
    })
  }, [primaryData, brushDomain, xKey])

  const handleChartClick = useCallback((payload: { activeLabel?: string | number } | null) => {
    if (payload?.activeLabel === undefined || payload.activeLabel === null) return
    const val = Number(payload.activeLabel)
    if (!Number.isFinite(val)) return
    setCaliper(([c1, c2]) => {
      if (c1 === null) return [val, null]
      if (c2 === null) return [c1, val]
      return [val, null]  // reset and start new caliper
    })
  }, [])

  const caliperDelta = caliper[0] !== null && caliper[1] !== null
    ? formatFloat(Math.abs(caliper[1] - caliper[0]), 1)
    : null

  const timedDatasets = useMemo(() => datasets.map(dataset => ({ ...dataset,
    data: dataset.data.filter(row => typeof row[xKey] === 'number' && Number.isFinite(row[xKey])).toSorted((a, b) => a[xKey]! - b[xKey]!),
  })), [datasets, xKey])
  const sourceData = useMemo(() => timedDatasets.length <= 1
    ? timedDatasets[0]?.data ?? EMPTY_DATA
    : mergeTimestampRows(timedDatasets, xKey, keys), [timedDatasets, xKey, keys])
  const displayKeys = useMemo(() => datasets.length <= 1 ? keys : datasets.flatMap(dataset => keys.map(key => `${dataset.runId}_${key}`)), [datasets, keys])
  const chartData = useMemo(() => type === 'bar' ? sourceData : peakPreservingDownsample(sourceData, DISPLAY_POINT_LIMIT, displayKeys), [sourceData, displayKeys, type])
  const exactRows = useMemo(() => new Map(sourceData.map(row => [row[xKey], row])), [sourceData, xKey])
  const lineDatasets = useMemo(() => timedDatasets.map(dataset => ({ ...dataset,
    data: peakPreservingDownsample(sliceChartWindow(dataset.data, xKey, brushDomain), DISPLAY_POINT_LIMIT, keys),
  })), [timedDatasets, xKey, brushDomain, keys])
  const statistics = useMemo(() => showStats ? series.slice(0, 4).map(item => ({ series: item, stats: computeStats(visibleData, item.dataKey) })) : [], [showStats, series, visibleData])

  const formatX = (v: number) => xLabel === 'ms' ? `${formatFloat(v / 1000, 1)}s` : formatFloat(v, 2)

  const isMulti = datasets.length > 1

  const RootChart = type === 'area' ? AreaChart : type === 'bar' ? BarChart : LineChart

  return (
    <div 
      data-chart-panel
      data-export-surface
      className={cn(
        'bg-hmi-panel overflow-hidden transition-colors',
        isFocused 
          ? 'fixed inset-0 z-[100] m-0 rounded-none p-6 bg-hmi-bg flex flex-col h-screen w-screen' 
          : className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-hmi-grid shrink-0">
        <h3 data-chart-title className="text-[13px] font-semibold text-hmi-text"><MathLabel>{title}</MathLabel></h3>
        <div className="flex items-center gap-1.5" data-export-ignore>
          {caliperDelta && (
            <span className="text-xs font-mono text-hmi-text-secondary px-1.5">
              <MathFormula tex={'\\Delta'} /> {caliperDelta} {xLabel ?? 'ms'}
            </span>
          )}
          {caliper[0] !== null && (
            <Button variant="ghost" size="sm"
              aria-label={t('caliper')} className="text-xs text-hmi-muted hover:text-hmi-text"
              onClick={() => setCaliper([null, null])}
            >
              <X size={14} />
            </Button>
          )}
          <Button variant="ghost" size="sm"
            className={cn(
              'text-xs transition-colors',
              showStats
                ? 'text-hmi-ideal bg-hmi-ideal/10'
                : 'text-hmi-muted hover:text-hmi-text'
            )}
            aria-label={t('stats')}
            aria-pressed={showStats}
            onClick={() => setShowStats(v => !v)}
          >
            <MathFormula tex={'\\sigma'} /> {t('stats')}
          </Button>
          <Button variant="ghost" size="sm"
            className="p-1 text-hmi-muted hover:text-hmi-text hover:bg-hmi-btn h-8 w-8"
            onClick={() => setIsFocused(f => !f)}
            title={isFocused ? t('collapseChart') : t('expandChart')}
            aria-label={isFocused ? t('collapseChart') : t('expandChart')}
          >
            {isFocused ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Stats panel */}
      {showStats && (
        <div className="px-3 py-2 bg-hmi-bg/50 border-b border-hmi-grid grid grid-cols-2 sm:grid-cols-4 gap-2">
          {statistics.map(({ series: s, stats: st }) => {
            if (!st) return null
            return (
              <div key={s.dataKey} className="flex flex-col gap-0.5">
                <span className="text-xs font-medium" style={{ color: s.color }}><MathLabel>{s.label}</MathLabel></span>
                <div className="grid grid-cols-2 gap-x-2 text-xs text-hmi-muted font-mono">
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
              type="number"
              domain={brushDomain ?? ['dataMin', 'dataMax']}
              allowDataOverflow
              dataKey={xKey}
              tickFormatter={formatX}
              tick={{ fill: CHART_STYLE.axis, fontSize: 11 }}
              label={xLabel ? { value: xLabel === 'ms' ? 's' : xLabel, position: 'insideBottomRight', offset: -4, fill: CHART_STYLE.axis, fontSize: 11 } : undefined}
            />
            <YAxis
              tick={{ fill: CHART_STYLE.axis, fontSize: 11 }}
              width={44}
              label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fill: CHART_STYLE.axis, fontSize: 11 } : undefined}
            />
            <Tooltip content={({ active, label }) => {
              if (!active) return null
              const x = typeof label === 'number' ? label : typeof label === 'string' ? Number(label) : NaN
              const row = exactRows.get(x)
              if (!row) return null
              return <div className="rounded border border-hmi-grid bg-hmi-panel px-3 py-2 text-xs text-hmi-text">
                <p className="font-mono mb-1">{formatX(x)}</p>
                {datasets.flatMap(dataset => series.map(item => {
                  const key = isMulti ? `${dataset.runId}_${item.dataKey}` : item.dataKey
                  if (!Object.hasOwn(row, key)) return null
                  const value = row[key]
                  return <div key={key} className="flex justify-between gap-4"><span style={{ color: isMulti ? dataset.color : item.color }}><MathLabel>{isMulti ? `${dataset.runName} · ${item.label}` : item.label}</MathLabel></span><span className="font-mono">{typeof value === 'number' && Number.isFinite(value) ? formatFloat(value, 4) : '—'}</span></div>
                }))}
              </div>
            }} />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
              formatter={(val) => <MathLabel className="text-hmi-text-secondary">{String(val)}</MathLabel>}
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
                    type="linear"
                    dataKey={s.dataKey}
                    stroke={s.color}
                    fill={s.color}
                    fillOpacity={0.12}
                    strokeWidth={1.5}
                    name={s.label}
                    dot={false}
                    strokeDasharray={s.dashed ? '4 2' : undefined}
                    connectNulls={false}
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
                  type="linear"
                  data={lineDatasets[0]?.data}
                  dataKey={s.dataKey}
                  stroke={s.color}
                  strokeWidth={1.5}
                  name={s.label}
                  dot={false}
                  strokeDasharray={s.dashed ? '4 2' : undefined}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )
            })}

            {/* Series — multi-run */}
            {isMulti && lineDatasets.map(ds =>
              series.map(s => (
                <Line
                  key={`${ds.runId}_${s.dataKey}`}
                  type="linear"
                  data={ds.data}
                  dataKey={s.dataKey}
                  stroke={ds.color}
                  strokeWidth={1.5}
                  name={`${ds.runName} — ${s.label}`}
                  strokeDasharray={s.dashed ? '4 2' : undefined}
                  dot={false}
                  connectNulls={false}
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
    </div>
  )
}

const MemoChartCard = memo(ChartCardView)

export const ChartCard = memo(function ChartCard(props: ChartCardProps) {
  // A new recording selection resets the old zoom/caliper window.
  const recordingKey = props.datasets.map(dataset => dataset.runId).join('|')
  return <MemoChartCard key={recordingKey} {...props} />
})

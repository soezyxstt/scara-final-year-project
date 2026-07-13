'use client'

import { useMemo, useState, useEffect, useId } from 'react'
import { useHMISlow } from '@/lib/hmi-context'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Legend,
} from 'recharts'
import type { DSample, TPoint, ESample } from '@/lib/hmi-types'
import { ChartContainer } from './chart-panel'

const GRID = 'var(--color-hmi-grid-subtle)'
const AT = {
  fill: 'var(--color-hmi-text-secondary)',
  fontSize: 9,
  fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
  fontWeight: 500,
}
const AL = { stroke: 'var(--color-hmi-grid)' } // Matches --color-hmi-grid
const TS = {
  backgroundColor: 'var(--color-hmi-elevated)',
  backdropFilter: 'blur(8px)',
  border: '1px solid var(--color-hmi-grid)',
  borderRadius: '6px',
  color: 'var(--color-hmi-text)',
  fontFamily: 'var(--font-geist-sans), sans-serif',
  fontSize: '11px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
}

// Simple DFT — limit input to 512 points
function dft(signal: number[]): { k: number; mag: number }[] {
  const N = Math.min(signal.length, 512)
  const s = signal.slice(0, N)
  const out: { k: number; mag: number }[] = []
  for (let k = 0; k < N / 2; k++) {
    let re = 0, im = 0
    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * k * n) / N
      re += s[n] * Math.cos(angle)
      im -= s[n] * Math.sin(angle)
    }
    out.push({ k, mag: Math.sqrt(re * re + im * im) / N })
  }
  return out
}

type FFTSignal = 'eef' | 'th1' | 'th2'

function extractSignal(key: FFTSignal, d: DSample[], t: TPoint[]): number[] {
  if (key === 'eef') return t.map(p => Math.sqrt((p.xi - p.xa) ** 2 + (p.yi - p.ya) ** 2))
  if (key === 'th1') return d.map(s => s.th1)
  return d.map(s => s.th2)
}

export function FFTSection({
  width,
  height,
  defaultSignal,
}: {
  width?: number
  height?: number
  defaultSignal?: FFTSignal
}) {
  const t = useTranslations('AdvancedAnalysis')
  const { state } = useHMISlow()
  const [isFocused, setIsFocused] = useState(false)
  const [sig, setSig] = useState<FFTSignal>(defaultSignal ?? 'eef')

  // Listen for Escape key to close focus
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

  const fftData = useMemo(() => {
    const signal = extractSignal(sig, state.frozenD, state.frozenT)
    return dft(signal)
  }, [sig, state.frozenD, state.frozenT])

  const chart = (
    <LineChart data={fftData} margin={{ top: 4, right: 8, left: -8, bottom: 4 }} width={width} height={height}>
      <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
      <XAxis 
        dataKey="k" 
        tick={AT} 
        axisLine={AL} 
        tickLine={false}
        label={{ 
          value: t('freqBin'), 
          position: 'insideBottom', 
          offset: -2, 
          fill: 'var(--color-hmi-text-secondary)', 
          fontSize: 9,
          fontFamily: 'var(--font-geist-sans), sans-serif',
          fontWeight: 600
        }} 
      />
      <YAxis 
        tick={AT} 
        axisLine={AL} 
        tickLine={false}
        label={{ 
          value: t('magnitude'), 
          angle: -90, 
          position: 'insideLeft', 
          offset: 8, 
          fill: 'var(--color-hmi-text-secondary)', 
          fontSize: 9,
          fontFamily: 'var(--font-geist-sans), sans-serif',
          fontWeight: 600
        }} 
      />
      <Tooltip contentStyle={TS} formatter={(v) => typeof v === 'number' ? v.toFixed(4) : v} />
      <Line type="linear" dataKey="mag" stroke={sig === 'th1' ? 'var(--color-hmi-j1)' : sig === 'th2' ? 'var(--color-hmi-j2)' : 'var(--color-hmi-ideal)'} strokeWidth={1.5} dot={false} isAnimationActive={false} />
    </LineChart>
  )

  if (width !== undefined && height !== undefined) return chart

  return (
    <Card 
      className={cn(
        "shadow-md transition-all duration-300 group/graph flex flex-col",
        isFocused 
          ? "fixed inset-0 z-[100] m-0 rounded-none p-6 bg-hmi-bg" 
          : "relative cursor-zoom-in hover:border-hmi-ideal/30"
      )}
      onClick={(e) => {
        if (isFocused) return
        const target = e.target as HTMLElement
        if (
          target.closest('button') ||
          target.closest('select') ||
          target.closest('[role="tab"]') ||
          target.closest('[role="combobox"]') ||
          target.closest('a') ||
          target.closest('input')
        ) {
          return
        }
        setIsFocused(true)
      }}
    >
      <CardHeader className={cn(isFocused && "px-0 pt-0 pb-4 shrink-0")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className={cn("text-hmi-text", isFocused ? "text-lg font-bold" : "text-sm font-semibold")}>
              {t('fftTitle')}
            </CardTitle>
            {isFocused && <span className="text-xs text-hmi-muted font-normal">{t('pressEsc')}</span>}
          </div>
          <div className="flex items-center gap-2">
            <Select value={sig} onValueChange={(v: string) => setSig(v as FFTSignal)}>
              <SelectTrigger className="w-28 h-6 text-xs bg-hmi-btn border-hmi-grid text-hmi-text-secondary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eef">{t('fftSignal.eef')}</SelectItem>
                <SelectItem value="th1">θ1</SelectItem>
                <SelectItem value="th2">θ2</SelectItem>
              </SelectContent>
            </Select>

            {isFocused && (
              <Button 
                variant="outline" 
                size="sm" 
                className="flex items-center gap-1 bg-hmi-btn/40 hover:bg-hmi-btn-hover/80 border-hmi-grid/60 text-hmi-text-secondary h-8"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsFocused(false)
                }}
              >
                <Minimize2 className="h-4 w-4" />
                {t('exitFocus')}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {/* Maximize button overlay (visible on hover) */}
      {!isFocused && (
        <button
          className="absolute top-2 right-32 opacity-0 group-hover/graph:opacity-100 transition-opacity p-1.5 rounded-md bg-hmi-btn/80 border border-hmi-grid hover:bg-hmi-btn-hover hover:text-hmi-ideal text-hmi-muted z-20 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            setIsFocused(true)
          }}
          title={t('focusGraph')}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      )}

      <CardContent className={cn("p-3 pt-0", isFocused && "flex-1 min-h-0 p-0 flex flex-col")}>
        <p className="text-[11px] text-hmi-muted mb-2 font-medium shrink-0">
          {t('fftNote')}
        </p>
        <ChartContainer isEmpty={state.frozenD.length === 0} msg={t('noTelemetry')}>
          <div className={cn(isFocused ? "flex-1 min-h-0 w-full" : "w-full")} style={!isFocused ? { height: height ?? 240 } : undefined}>
            <ResponsiveContainer width="100%" height="100%">
              {chart}
            </ResponsiveContainer>
          </div>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export function ControlEffortSection({
  width,
  height,
}: {
  width?: number
  height?: number
}) {
  const t = useTranslations('AdvancedAnalysis')
  const { state } = useHMISlow()
  const gradId = useId().replace(/\W/g, '')
  const [isFocused, setIsFocused] = useState(false)

  // Listen for Escape key to close focus
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

  const data = useMemo(() => {
    let cum = 0
    const result = []
    for (let i = 0; i < state.frozenD.length; i++) {
      cum += Math.abs(state.frozenD[i].pwm1)
      result.push({ idx: state.frozenD[i].idx, effort: cum })
    }
    return result
  }, [state.frozenD])

  const chart = (
    <AreaChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 4 }} width={width} height={height}>
      <defs>
        <linearGradient id={`${gradId}-effortGradient`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="var(--color-hmi-pwm-pos)" stopOpacity={0.2} />
          <stop offset="95%" stopColor="var(--color-hmi-pwm-pos)" stopOpacity={0.0} />
        </linearGradient>
      </defs>
      <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
      <XAxis dataKey="idx" tick={AT} axisLine={AL} tickLine={false} />
      <YAxis 
        tick={AT} 
        axisLine={AL} 
        tickLine={false}
        label={{ 
          value: t('controlEffortCumulative'), 
          angle: -90, 
          position: 'insideLeft', 
          offset: 8,
          fill: 'var(--color-hmi-text-secondary)', 
          fontSize: 9,
          fontFamily: 'var(--font-geist-sans), sans-serif',
          fontWeight: 600
        }} 
      />
      <Tooltip contentStyle={TS} />
      <Area type="linear" dataKey="effort" stroke="var(--color-hmi-pwm-pos)" fill={`url(#${gradId}-effortGradient)`} strokeWidth={1.5} dot={false} isAnimationActive={false} />
    </AreaChart>
  )

  if (width !== undefined && height !== undefined) return chart

  return (
    <Card 
      className={cn(
        "shadow-md transition-all duration-300 group/graph flex flex-col",
        isFocused 
          ? "fixed inset-0 z-[100] m-0 rounded-none p-6 bg-hmi-bg" 
          : "relative cursor-zoom-in hover:border-hmi-ideal/30"
      )}
      onClick={(e) => {
        if (isFocused) return
        const target = e.target as HTMLElement
        if (
          target.closest('button') ||
          target.closest('select') ||
          target.closest('[role="tab"]') ||
          target.closest('[role="combobox"]') ||
          target.closest('a') ||
          target.closest('input')
        ) {
          return
        }
        setIsFocused(true)
      }}
    >
      <CardHeader className={cn(isFocused && "px-0 pt-0 pb-4 shrink-0")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className={cn("text-hmi-text", isFocused ? "text-lg font-bold" : "text-sm font-semibold")}>
              {t('controlEffortTitle')}
            </CardTitle>
            {isFocused && <span className="text-xs text-hmi-muted font-normal">{t('pressEsc')}</span>}
          </div>
          {isFocused && (
            <Button 
              variant="outline" 
              size="sm" 
              className="flex items-center gap-1 bg-hmi-btn/40 hover:bg-hmi-btn-hover/80 border-hmi-grid/60 text-hmi-text-secondary h-8"
              onClick={(e) => {
                e.stopPropagation()
                setIsFocused(false)
              }}
            >
              <Minimize2 className="h-4 w-4" />
              {t('exitFocus')}
            </Button>
          )}
        </div>
      </CardHeader>

      {/* Maximize button overlay (visible on hover) */}
      {!isFocused && (
        <button
          className="absolute top-2 right-2 opacity-0 group-hover/graph:opacity-100 transition-opacity p-1.5 rounded-md bg-hmi-btn/80 border border-hmi-grid hover:bg-hmi-btn-hover hover:text-hmi-ideal text-hmi-muted z-20 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            setIsFocused(true)
          }}
          title={t('focusGraph')}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      )}

      <CardContent className={cn("p-3 pt-0", isFocused && "flex-1 min-h-0 p-0 flex flex-col")}>
        <ChartContainer isEmpty={data.length === 0} msg={t('controlEffortEmpty')}>
          <div className={cn(isFocused ? "flex-1 min-h-0 w-full" : "w-full")} style={!isFocused ? { height: height ?? 240 } : undefined}>
            <ResponsiveContainer width="100%" height="100%">
              {chart}
            </ResponsiveContainer>
          </div>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

function localDownsample<T>(arr: T[], max = 500): T[] {
  if (arr.length <= max) return arr
  const step = Math.ceil(arr.length / max)
  return arr.filter((_, i) => i % step === 0)
}

// ─── 3. CTC Feedforward Torques ──────────────────────────────────────────────
export function CTCTorqueSection({
  width,
  height,
}: {
  width?: number
  height?: number
}) {
  const t = useTranslations('AdvancedAnalysis')
  const { state } = useHMISlow()
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (!isFocused) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFocused(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFocused])

  const chartData = useMemo(() => {
    if (!state.frozenF || state.frozenF.length === 0) return []
    const firstT = state.frozenF[0].t
    return localDownsample(
      state.frozenF.map((f) => ({
        t: (f.t - firstT) / 1000,
        inertia1: f.inertia1,
        coriolis1: f.coriolis1,
        gravity1: f.gravity1,
        inertia2: f.inertia2,
        coriolis2: f.coriolis2,
        gravity2: f.gravity2,
      }))
    )
  }, [state.frozenF])

  const chart = (
    <LineChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 4 }} width={width} height={height}>
      <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
      <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={{ value: t('timeSec'), position: 'insideBottom', offset: -2, fill: 'var(--color-hmi-text-secondary)', fontSize: 9, fontWeight: 600 }} />
      <YAxis tick={AT} axisLine={AL} tickLine={false} label={{ value: t('ctcTorqueUnit'), angle: -90, position: 'insideLeft', offset: 8, fill: 'var(--color-hmi-text-secondary)', fontSize: 9, fontWeight: 600 }} />
      <Tooltip contentStyle={TS} formatter={(v) => typeof v === 'number' ? v.toFixed(4) : v} />
      <Legend verticalAlign="top" height={32} wrapperStyle={{ fontSize: '10px', fontFamily: 'var(--font-geist-sans), sans-serif', fontWeight: 600, paddingBottom: '4px' }} />
      {/* Joint 1 Group */}
      <Line type="linear" dataKey="inertia1" stroke="var(--color-hmi-j1)" strokeWidth={1.5} dot={false} isAnimationActive={false} name="J1 Inertia" />
      <Line type="linear" dataKey="coriolis1" stroke="var(--color-hmi-j1-des)" strokeWidth={1.5} strokeDasharray="3 3" dot={false} isAnimationActive={false} name="J1 Coriolis" />
      <Line type="linear" dataKey="gravity1" stroke="var(--color-hmi-ideal)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} isAnimationActive={false} name="J1 Gravity" />
      {/* Joint 2 Group */}
      <Line type="linear" dataKey="inertia2" stroke="var(--color-hmi-j2)" strokeWidth={1.5} dot={false} isAnimationActive={false} name="J2 Inertia" />
      <Line type="linear" dataKey="coriolis2" stroke="var(--color-hmi-j2-des)" strokeWidth={1.5} strokeDasharray="3 3" dot={false} isAnimationActive={false} name="J2 Coriolis" />
      <Line type="linear" dataKey="gravity2" stroke="var(--color-hmi-actual)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} isAnimationActive={false} name="J2 Gravity" />
    </LineChart>
  )

  if (width !== undefined && height !== undefined) return chart

  return (
    <Card 
      className={cn(
        "shadow-md transition-all duration-300 group/graph flex flex-col",
        isFocused 
          ? "fixed inset-0 z-[100] m-0 rounded-none p-6 bg-hmi-bg" 
          : "relative cursor-zoom-in hover:border-hmi-ideal/30"
      )}
      onClick={(e) => {
        if (isFocused) return
        const target = e.target as HTMLElement
        if (target.closest('button') || target.closest('a') || target.closest('select')) return
        setIsFocused(true)
      }}
    >
      <CardHeader className={cn(isFocused && "px-0 pt-0 pb-4 shrink-0")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className={cn("text-hmi-text", isFocused ? "text-lg font-bold" : "text-sm font-semibold")}>
              {t('ctcTorqueTitle')}
            </CardTitle>
            {isFocused && <span className="text-xs text-hmi-muted font-normal">{t('pressEsc')}</span>}
          </div>
          {isFocused && (
            <Button 
              variant="outline" 
              size="sm" 
              className="flex items-center gap-1 bg-hmi-btn/40 hover:bg-hmi-btn-hover/80 border-hmi-grid/60 text-hmi-text-secondary h-8"
              onClick={(e) => {
                e.stopPropagation()
                setIsFocused(false)
              }}
            >
              <Minimize2 className="h-4 w-4" />
              {t('exitFocus')}
            </Button>
          )}
        </div>
      </CardHeader>

      {!isFocused && (
        <button
          className="absolute top-2 right-2 opacity-0 group-hover/graph:opacity-100 transition-opacity p-1.5 rounded-md bg-hmi-btn/80 border border-hmi-grid hover:bg-hmi-btn-hover hover:text-hmi-ideal text-hmi-muted z-20 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            setIsFocused(true)
          }}
          title={t('focusGraph')}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      )}

      <CardContent className={cn("p-3 pt-0", isFocused && "flex-1 min-h-0 p-0 flex flex-col")}>
        <ChartContainer isEmpty={chartData.length === 0} msg={t('ctcTorqueEmpty')}>
          <div className={cn(isFocused ? "flex-1 min-h-0 w-full" : "w-full")} style={!isFocused ? { height: height ?? 240 } : undefined}>
            <ResponsiveContainer width="100%" height="100%">
              {chart}
            </ResponsiveContainer>
          </div>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

// ─── 4. Joint 1 Control Internal Breakdown ──────────────────────────────────
export function ControlInternalSection({
  width,
  height,
}: {
  width?: number
  height?: number
}) {
  const t = useTranslations('AdvancedAnalysis')
  const { state } = useHMISlow()
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (!isFocused) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFocused(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFocused])

  const chartData = useMemo(() => {
    if (!state.frozenF || state.frozenF.length === 0) return []
    const firstT = state.frozenF[0].t
    return localDownsample(
      state.frozenF.map((f) => ({
        t: (f.t - firstT) / 1000,
        u1_total: f.u1Total,
        ff1_contrib: f.ff1Contrib,
      }))
    )
  }, [state.frozenF])

  const chart = (
    <LineChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 4 }} width={width} height={height}>
      <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
      <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={{ value: t('timeSec'), position: 'insideBottom', offset: -2, fill: 'var(--color-hmi-text-secondary)', fontSize: 9, fontWeight: 600 }} />
      <YAxis tick={AT} axisLine={AL} tickLine={false} label={{ value: t('j1InternalEffort'), angle: -90, position: 'insideLeft', offset: 8, fill: 'var(--color-hmi-text-secondary)', fontSize: 9, fontWeight: 600 }} />
      <Tooltip contentStyle={TS} formatter={(v) => typeof v === 'number' ? v.toFixed(4) : v} />
      <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: '10px', fontFamily: 'var(--font-geist-sans), sans-serif', fontWeight: 600, paddingBottom: '2px' }} />
      <Line type="linear" dataKey="u1_total" stroke="var(--color-hmi-pwm-pos)" strokeWidth={1.75} dot={false} isAnimationActive={false} name={t('totalPidEffort')} />
      <Line type="linear" dataKey="ff1_contrib" stroke="var(--color-hmi-ideal)" strokeWidth={1.5} strokeDasharray="3 3" dot={false} isAnimationActive={false} name={t('ffContribution')} />
    </LineChart>
  )

  if (width !== undefined && height !== undefined) return chart

  return (
    <Card 
      className={cn(
        "shadow-md transition-all duration-300 group/graph flex flex-col",
        isFocused 
          ? "fixed inset-0 z-[100] m-0 rounded-none p-6 bg-hmi-bg" 
          : "relative cursor-zoom-in hover:border-hmi-ideal/30"
      )}
      onClick={(e) => {
        if (isFocused) return
        const target = e.target as HTMLElement
        if (target.closest('button') || target.closest('a') || target.closest('select')) return
        setIsFocused(true)
      }}
    >
      <CardHeader className={cn(isFocused && "px-0 pt-0 pb-4 shrink-0")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className={cn("text-hmi-text", isFocused ? "text-lg font-bold" : "text-sm font-semibold")}>
              {t('j1InternalTitle')}
            </CardTitle>
            {isFocused && <span className="text-xs text-hmi-muted font-normal">{t('pressEsc')}</span>}
          </div>
          {isFocused && (
            <Button 
              variant="outline" 
              size="sm" 
              className="flex items-center gap-1 bg-hmi-btn/40 hover:bg-hmi-btn-hover/80 border-hmi-grid/60 text-hmi-text-secondary h-8"
              onClick={(e) => {
                e.stopPropagation()
                setIsFocused(false)
              }}
            >
              <Minimize2 className="h-4 w-4" />
              {t('exitFocus')}
            </Button>
          )}
        </div>
      </CardHeader>

      {!isFocused && (
        <button
          className="absolute top-2 right-2 opacity-0 group-hover/graph:opacity-100 transition-opacity p-1.5 rounded-md bg-hmi-btn/80 border border-hmi-grid hover:bg-hmi-btn-hover hover:text-hmi-ideal text-hmi-muted z-20 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            setIsFocused(true)
          }}
          title={t('focusGraph')}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      )}

      <CardContent className={cn("p-3 pt-0", isFocused && "flex-1 min-h-0 p-0 flex flex-col")}>
        <ChartContainer isEmpty={chartData.length === 0} msg={t('ctcTorqueEmpty')}>
          <div className={cn(isFocused ? "flex-1 min-h-0 w-full" : "w-full")} style={!isFocused ? { height: height ?? 240 } : undefined}>
            <ResponsiveContainer width="100%" height="100%">
              {chart}
            </ResponsiveContainer>
          </div>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

// ─── 5. Stepper Commands J2 ──────────────────────────────────────────────────
export function StepperVelocitySection({
  width,
  height,
}: {
  width?: number
  height?: number
}) {
  const t = useTranslations('AdvancedAnalysis')
  const { state } = useHMISlow()
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (!isFocused) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFocused(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFocused])

  const kp2 = state.gains?.kp2 ?? 0
  const kd2 = state.gains?.kd2 ?? 0

  const chartData = useMemo(() => {
    if (!state.frozenF || state.frozenF.length === 0) return []
    const firstT = state.frozenF[0].t
    return localDownsample(
      state.frozenF.map((f) => {
        // Find closest D sample by timestamp (ms) to align data correctly
        let bestD = null
        let minDiff = Infinity
        for (let j = 0; j < state.frozenD.length; j++) {
          const d = state.frozenD[j]
          const diff = Math.abs(d.t - f.t)
          if (diff < minDiff) {
            minDiff = diff
            bestD = d
          } else {
            break
          }
        }

        const p_out = bestD ? kp2 * bestD.e2 : 0
        const d_out = bestD ? -kd2 * bestD.dth2 : 0
        return {
          t: (f.t - firstT) / 1000,
          omega2_raw: f.omega2Raw,
          delta_omega_ff: f.deltaOmegaFf,
          p_out,
          d_out,
          integral2: f.integral2,
        }
      })
    )
  }, [state.frozenF, state.frozenD, kp2, kd2])

  const chart = (
    <LineChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 4 }} width={width} height={height}>
      <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
      <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={{ value: t('timeSec'), position: 'insideBottom', offset: -2, fill: 'var(--color-hmi-text-secondary)', fontSize: 9, fontWeight: 600 }} />
      <YAxis tick={AT} axisLine={AL} tickLine={false} label={{ value: t('j2StepperVelocity'), angle: -90, position: 'insideLeft', offset: 8, fill: 'var(--color-hmi-text-secondary)', fontSize: 9, fontWeight: 600 }} />
      <Tooltip contentStyle={TS} formatter={(v) => typeof v === 'number' ? v.toFixed(4) : v} />
      <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: '10px', fontFamily: 'var(--font-geist-sans), sans-serif', fontWeight: 600, paddingBottom: '2px' }} />
      <Line type="linear" dataKey="omega2_raw" stroke="var(--color-hmi-j2)" strokeWidth={1.75} dot={false} isAnimationActive={false} name={t('totalOmega2Command')} />
      <Line type="linear" dataKey="p_out" stroke="var(--color-hmi-j1)" strokeWidth={1.5} dot={false} isAnimationActive={false} name={t('j2POut')} />
      <Line type="linear" dataKey="d_out" stroke="var(--color-hmi-pwm-neg)" strokeWidth={1.5} dot={false} isAnimationActive={false} name={t('j2DOut')} />
      <Line type="linear" dataKey="integral2" stroke="var(--color-hmi-error)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} isAnimationActive={false} name={t('j2IOut')} />
      <Line type="linear" dataKey="delta_omega_ff" stroke="var(--color-hmi-ideal)" strokeWidth={1.5} strokeDasharray="3 3" dot={false} isAnimationActive={false} name={t('j2FfContribution')} />
    </LineChart>
  )

  if (width !== undefined && height !== undefined) return chart

  return (
    <Card 
      className={cn(
        "shadow-md transition-all duration-300 group/graph flex flex-col",
        isFocused 
          ? "fixed inset-0 z-[100] m-0 rounded-none p-6 bg-hmi-bg" 
          : "relative cursor-zoom-in hover:border-hmi-ideal/30"
      )}
      onClick={(e) => {
        if (isFocused) return
        const target = e.target as HTMLElement
        if (target.closest('button') || target.closest('a') || target.closest('select')) return
        setIsFocused(true)
      }}
    >
      <CardHeader className={cn(isFocused && "px-0 pt-0 pb-4 shrink-0")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className={cn("text-hmi-text", isFocused ? "text-lg font-bold" : "text-sm font-semibold")}>
              {t('j2StepperTitle')}
            </CardTitle>
            {isFocused && <span className="text-xs text-hmi-muted font-normal">{t('pressEsc')}</span>}
          </div>
          {isFocused && (
            <Button 
              variant="outline" 
              size="sm" 
              className="flex items-center gap-1 bg-hmi-btn/40 hover:bg-hmi-btn-hover/80 border-hmi-grid/60 text-hmi-text-secondary h-8"
              onClick={(e) => {
                e.stopPropagation()
                setIsFocused(false)
              }}
            >
              <Minimize2 className="h-4 w-4" />
              {t('exitFocus')}
            </Button>
          )}
        </div>
      </CardHeader>

      {!isFocused && (
        <button
          className="absolute top-2 right-2 opacity-0 group-hover/graph:opacity-100 transition-opacity p-1.5 rounded-md bg-hmi-btn/80 border border-hmi-grid hover:bg-hmi-btn-hover hover:text-hmi-ideal text-hmi-muted z-20 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            setIsFocused(true)
          }}
          title={t('focusGraph')}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      )}

      <CardContent className={cn("p-3 pt-0", isFocused && "flex-1 min-h-0 p-0 flex flex-col")}>
        <ChartContainer isEmpty={chartData.length === 0} msg={t('ctcTorqueEmpty')}>
          <div className={cn(isFocused ? "flex-1 min-h-0 w-full" : "w-full")} style={!isFocused ? { height: height ?? 240 } : undefined}>
            <ResponsiveContainer width="100%" height="100%">
              {chart}
            </ResponsiveContainer>
          </div>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

// ─── 6. Joint 1 PID Effort Breakdown ──────────────────────────────────────────
export function PIDBreakdownSection({
  width,
  height,
}: {
  width?: number
  height?: number
}) {
  const t = useTranslations('AdvancedAnalysis')
  const { state } = useHMISlow()
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (!isFocused) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFocused(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFocused])

  const chartData = useMemo(() => {
    if (!state.frozenE || state.frozenE.length === 0) return []
    const firstT = state.frozenE[0].t
    return localDownsample(
      state.frozenE.map((e) => ({
        t: (e.t - firstT) / 1000,
        p1_out: e.p1_out,
        i1_out: e.i1_out,
        d1_out: e.d1_out,
      }))
    )
  }, [state.frozenE])

  const chart = (
    <LineChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 4 }} width={width} height={height}>
      <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
      <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={{ value: t('timeSec'), position: 'insideBottom', offset: -2, fill: 'var(--color-hmi-text-secondary)', fontSize: 9, fontWeight: 600 }} />
      <YAxis tick={AT} axisLine={AL} tickLine={false} label={{ value: t('j1PidOutputEffort'), angle: -90, position: 'insideLeft', offset: 8, fill: 'var(--color-hmi-text-secondary)', fontSize: 9, fontWeight: 600 }} />
      <Tooltip contentStyle={TS} formatter={(v) => typeof v === 'number' ? v.toFixed(4) : v} />
      <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: '10px', fontFamily: 'var(--font-geist-sans), sans-serif', fontWeight: 600, paddingBottom: '2px' }} />
      <Line type="linear" dataKey="p1_out" stroke="var(--color-hmi-j1)" strokeWidth={1.5} dot={false} name={t('pOut')} isAnimationActive={false} />
      <Line type="linear" dataKey="i1_out" stroke="var(--color-hmi-pwm-pos)" strokeWidth={1.5} dot={false} name={t('iOut')} isAnimationActive={false} />
      <Line type="linear" dataKey="d1_out" stroke="var(--color-hmi-pwm-neg)" strokeWidth={1.5} dot={false} name={t('dOut')} isAnimationActive={false} />
    </LineChart>
  )

  if (width !== undefined && height !== undefined) return chart

  return (
    <Card 
      className={cn(
        "shadow-md transition-all duration-300 group/graph flex flex-col",
        isFocused 
          ? "fixed inset-0 z-[100] m-0 rounded-none p-6 bg-hmi-bg" 
          : "relative cursor-zoom-in hover:border-hmi-ideal/30"
      )}
      onClick={(e) => {
        if (isFocused) return
        const target = e.target as HTMLElement
        if (target.closest('button') || target.closest('a') || target.closest('select')) return
        setIsFocused(true)
      }}
    >
      <CardHeader className={cn(isFocused && "px-0 pt-0 pb-4 shrink-0")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className={cn("text-hmi-text", isFocused ? "text-lg font-bold" : "text-sm font-semibold")}>
              {t('j1PidTitle')}
            </CardTitle>
            {isFocused && <span className="text-xs text-hmi-muted font-normal">{t('pressEsc')}</span>}
          </div>
          {isFocused && (
            <Button 
              variant="outline" 
              size="sm" 
              className="flex items-center gap-1 bg-hmi-btn/40 hover:bg-hmi-btn-hover/80 border-hmi-grid/60 text-hmi-text-secondary h-8"
              onClick={(e) => {
                e.stopPropagation()
                setIsFocused(false)
              }}
            >
              <Minimize2 className="h-4 w-4" />
              {t('exitFocus')}
            </Button>
          )}
        </div>
      </CardHeader>

      {!isFocused && (
        <button
          className="absolute top-2 right-2 opacity-0 group-hover/graph:opacity-100 transition-opacity p-1.5 rounded-md bg-hmi-btn/80 border border-hmi-grid hover:bg-hmi-btn-hover hover:text-hmi-ideal text-hmi-muted z-20 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            setIsFocused(true)
          }}
          title={t('focusGraph')}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      )}

      <CardContent className={cn("p-3 pt-0", isFocused && "flex-1 min-h-0 p-0 flex flex-col")}>
        <ChartContainer isEmpty={chartData.length === 0} msg={t('j1PidEmpty')}>
          <div className={cn(isFocused ? "flex-1 min-h-0 w-full" : "w-full")} style={!isFocused ? { height: height ?? 240 } : undefined}>
            <ResponsiveContainer width="100%" height="100%">
              {chart}
            </ResponsiveContainer>
          </div>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

// ─── 7. Microcontroller Loop Execution Time ──────────────────────────────────
export function LoopDurationSection({
  width,
  height,
}: {
  width?: number
  height?: number
}) {
  const t = useTranslations('AdvancedAnalysis')
  const { state } = useHMISlow()
  const gradId = useId().replace(/\W/g, '')
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (!isFocused) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFocused(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFocused])

  const chartData = useMemo(() => {
    if (!state.frozenE || state.frozenE.length === 0) return []
    const firstT = state.frozenE[0].t
    return localDownsample(
      state.frozenE.map((e) => ({
        t: (e.t - firstT) / 1000,
        loop_duration_us: e.loop_duration_us,
      }))
    )
  }, [state.frozenE])

  const chart = (
    <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 4 }} width={width} height={height}>
      <defs>
        <linearGradient id={`${gradId}-colorLoop`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="var(--color-hmi-ideal)" stopOpacity={0.2}/>
          <stop offset="95%" stopColor="var(--color-hmi-ideal)" stopOpacity={0}/>
        </linearGradient>
      </defs>
      <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
      <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={{ value: t('timeSec'), position: 'insideBottom', offset: -2, fill: 'var(--color-hmi-text-secondary)', fontSize: 9, fontWeight: 600 }} />
      <YAxis tick={AT} axisLine={AL} tickLine={false} label={{ value: t('esp32LoopDuration'), angle: -90, position: 'insideLeft', offset: 8, fill: 'var(--color-hmi-text-secondary)', fontSize: 9, fontWeight: 600 }} />
      <Tooltip contentStyle={TS} formatter={(v) => typeof v === 'number' ? v.toFixed(1) : v} />
      <Area type="monotone" dataKey="loop_duration_us" stroke="var(--color-hmi-ideal)" strokeWidth={1.5} fillOpacity={1} fill={`url(#${gradId}-colorLoop)`} name={t('loopDurationName')} isAnimationActive={false} />
    </AreaChart>
  )

  if (width !== undefined && height !== undefined) return chart

  return (
    <Card 
      className={cn(
        "shadow-md transition-all duration-300 group/graph flex flex-col",
        isFocused 
          ? "fixed inset-0 z-[100] m-0 rounded-none p-6 bg-hmi-bg" 
          : "relative cursor-zoom-in hover:border-hmi-ideal/30"
      )}
      onClick={(e) => {
        if (isFocused) return
        const target = e.target as HTMLElement
        if (target.closest('button') || target.closest('a') || target.closest('select')) return
        setIsFocused(true)
      }}
    >
      <CardHeader className={cn(isFocused && "px-0 pt-0 pb-4 shrink-0")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className={cn("text-hmi-text", isFocused ? "text-lg font-bold" : "text-sm font-semibold")}>
              {t('esp32LoopTitle')}
            </CardTitle>
            {isFocused && <span className="text-xs text-hmi-muted font-normal">{t('pressEsc')}</span>}
          </div>
          {isFocused && (
            <Button 
              variant="outline" 
              size="sm" 
              className="flex items-center gap-1 bg-hmi-btn/40 hover:bg-hmi-btn-hover/80 border-hmi-grid/60 text-hmi-text-secondary h-8"
              onClick={(e) => {
                e.stopPropagation()
                setIsFocused(false)
              }}
            >
              <Minimize2 className="h-4 w-4" />
              {t('exitFocus')}
            </Button>
          )}
        </div>
      </CardHeader>

      {!isFocused && (
        <button
          className="absolute top-2 right-2 opacity-0 group-hover/graph:opacity-100 transition-opacity p-1.5 rounded-md bg-hmi-btn/80 border border-hmi-grid hover:bg-hmi-btn-hover hover:text-hmi-ideal text-hmi-muted z-20 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            setIsFocused(true)
          }}
          title={t('focusGraph')}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      )}

      <CardContent className={cn("p-3 pt-0", isFocused && "flex-1 min-h-0 p-0 flex flex-col")}>
        <ChartContainer isEmpty={chartData.length === 0} msg={t('esp32LoopEmpty')}>
          <div className={cn(isFocused ? "flex-1 min-h-0 w-full" : "w-full")} style={!isFocused ? { height: height ?? 240 } : undefined}>
            <ResponsiveContainer width="100%" height="100%">
              {chart}
            </ResponsiveContainer>
          </div>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}




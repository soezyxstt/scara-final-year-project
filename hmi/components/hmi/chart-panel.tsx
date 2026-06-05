'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useHMI } from '@/lib/hmi-context'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip as UiTooltip } from '@/components/ui/tooltip'
import { Maximize2, Minimize2, ZoomIn, ZoomOut, Hand, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { downloadSingleGraph } from '@/lib/capture-utils'
import { computeCTEList } from '@/lib/cte-utils'
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, AreaChart, Area, LineChart, Line, ReferenceArea,
} from 'recharts'
import type { DSample, TPoint } from '@/lib/hmi-types'

const GRID = 'rgba(255, 255, 255, 0.05)'
const AT = {
  fill: '#9CA3AF',
  fontSize: 11,
  fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
  fontWeight: 500,
}
const AL = { stroke: '#1F2937' } // Matches --color-hmi-grid
const TS = {
  backgroundColor: 'rgba(17, 24, 39, 0.9)',
  backdropFilter: 'blur(8px)',
  border: '1px solid #1F2937',
  borderRadius: '6px',
  color: '#F3F4F6',
  fontFamily: 'var(--font-geist-sans), sans-serif',
  fontSize: '12px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
}


function downsample<T>(arr: T[], max = 500): T[] {
  if (arr.length <= max) return arr
  const step = Math.ceil(arr.length / max)
  return arr.filter((_, i) => i % step === 0)
}

/** EEF error purely from T packet — no DSample index pairing needed */
function eefErrFromT(t: TPoint): number {
  return Math.sqrt((t.xi - t.xa) ** 2 + (t.yi - t.ya) ** 2)
}

/**
 * Compute EEF Cartesian velocity using the SCARA Jacobian applied to joint
 * velocities from D-telemetry.  This gives a jitter-free desired trapezoid
 * because v1d/v2d come directly from the trajectory planner (not differentiated
 * from position samples).
 *
 * L1 = 100 mm, L2 = 70 mm (fixed SCARA geometry).
 */
const L1 = 100, L2 = 70

function computeEEFVelocityJacobian(dBuf: DSample[], max = 500) {
  if (dBuf.length === 0) return []
  const sampled = downsample(dBuf, max)
  const firstT = sampled[0].t
  return sampled.map((d) => {
    const t = (d.t - firstT) / 1000

    // Actual EEF velocity via J(th1, th2) * [dth1; dth2]
    const s1a  = Math.sin(d.th1),       s12a = Math.sin(d.th1 + d.th2)
    const c1a  = Math.cos(d.th1),       c12a = Math.cos(d.th1 + d.th2)
    const vx_a = (-L1 * s1a - L2 * s12a) * d.dth1 + (-L2 * s12a) * d.dth2
    const vy_a = ( L1 * c1a + L2 * c12a) * d.dth1 + ( L2 * c12a) * d.dth2
    const v_actual = Math.sqrt(vx_a ** 2 + vy_a ** 2)

    // Desired EEF velocity via J(th1d, th2d) * [dth1d; dth2d] — smooth trapezoid
    const s1d  = Math.sin(d.th1d),      s12d = Math.sin(d.th1d + d.th2d)
    const c1d  = Math.cos(d.th1d),      c12d = Math.cos(d.th1d + d.th2d)
    const vx_i = (-L1 * s1d - L2 * s12d) * d.dth1d + (-L2 * s12d) * d.dth2d
    const vy_i = ( L1 * c1d + L2 * c12d) * d.dth1d + ( L2 * c12d) * d.dth2d
    const v_ideal = Math.sqrt(vx_i ** 2 + vy_i ** 2)

    return { t, v_actual, v_ideal }
  })
}

interface Props {
  dBuf: DSample[]
  tBuf: TPoint[]
  stats: import('@/lib/hmi-types').Stats | null
}

function StatsBanner({ stats }: { stats: Props['stats'] }) {
  if (!stats) return null
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 px-4 py-2.5 border-b border-hmi-grid bg-slate-900/40 font-sans text-xs">
      <UiTooltip content="Accuracy Index (AI): 1 - MCTE/D. Normalized spatial path tracking accuracy index where 100% is perfect tracking." align="center">
        <div className="flex flex-col cursor-help">
          <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">AI</span>
          <span className="text-hmi-ideal font-mono font-medium text-sm mt-0.5">
            {stats.accuracy_idx !== undefined ? `${(stats.accuracy_idx * 100).toFixed(2)}%` : '--'}
          </span>
        </div>
      </UiTooltip>
      <UiTooltip content="Maximum Cross Tracking Error (CTE) observed during the run (ε_max)." align="center">
        <div className="flex flex-col cursor-help">
          <span className="text-[11px] text-slate-500 tracking-wider font-semibold normal-case">ε<sub>max</sub></span>
          <span className="text-hmi-error font-mono font-medium text-sm mt-0.5">
            {stats.max_err.toFixed(2)} <span className="text-[10px] font-sans font-normal text-slate-500">mm</span>
          </span>
        </div>
      </UiTooltip>
      <UiTooltip content="Mean Cross Tracking Error (MCTE) computed as the path-integrated area of lateral deviation divided by path length (A_path / D)." align="center">
        <div className="flex flex-col cursor-help">
          <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">MCTE</span>
          <span className="text-hmi-ideal font-mono font-medium text-sm mt-0.5">
            {stats.MCTE !== undefined ? stats.MCTE.toFixed(2) : stats.mean_err.toFixed(2)} <span className="text-[10px] font-sans font-normal text-slate-500">mm</span>
          </span>
        </div>
      </UiTooltip>
      <UiTooltip content="Mean Along Track Error (MATE) computed as the path-integrated area of tracking lag divided by path length." align="center">
        <div className="flex flex-col cursor-help">
          <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">MATE</span>
          <span className="text-amber-400 font-mono font-medium text-sm mt-0.5">
            {stats.MATE !== undefined ? stats.MATE.toFixed(2) : '--'}{' '}
            {stats.MATE !== undefined && <span className="text-[10px] font-sans font-normal text-slate-500">mm</span>}
          </span>
        </div>
      </UiTooltip>
      <UiTooltip content="Error Bias (R_ε): Percentage of total tracking error due to time delay/lag vs. path shape/contour deviation. >50% Delay suggests increasing Kp/Ki/Kff; >50% Shape suggests tuning Kd or checking mechanics." align="center">
        <div className="flex flex-col cursor-help">
          <span className="text-[11px] text-slate-500 tracking-wider font-semibold normal-case">R<sub>ε</sub></span>
          <span className={cn(
            "font-mono font-semibold text-sm mt-0.5",
            stats.error_ratio !== undefined
              ? stats.error_ratio >= 0.5 ? "text-amber-400" : "text-cyan-400"
              : "text-slate-200"
          )}>
            {stats.error_ratio !== undefined
              ? stats.error_ratio >= 0.5
                ? `${(stats.error_ratio * 100).toFixed(0)}% Delay`
                : `${((1 - stats.error_ratio) * 100).toFixed(0)}% Shape`
              : '--'}
          </span>
        </div>
      </UiTooltip>
      <UiTooltip content="Cross Tracking Error at the final settling coordinate of the trajectory (ε_f)." align="center">
        <div className="flex flex-col cursor-help">
          <span className="text-[11px] text-slate-500 tracking-wider font-semibold normal-case">ε<sub>f</sub></span>
          <span className="text-slate-200 font-mono font-medium text-sm mt-0.5">
            {stats.final_err.toFixed(2)} <span className="text-[10px] font-sans font-normal text-slate-500">mm</span>
          </span>
        </div>
      </UiTooltip>
      <UiTooltip content="Time taken for the robot to complete the trajectory run (T_el, in seconds)." align="center">
        <div className="flex flex-col cursor-help">
          <span className="text-[11px] text-slate-500 tracking-wider font-semibold normal-case">T<sub>el</sub></span>
          <span className="text-slate-200 font-mono font-medium text-sm mt-0.5">
            {stats.elapsed_time !== undefined ? `${stats.elapsed_time.toFixed(3)} s` : '--'}
          </span>
        </div>
      </UiTooltip>
    </div>
  )
}



const XLABEL = (label: string) => ({
  value: label,
  position: 'insideBottom' as const,
  offset: -6,
  fill: '#9CA3AF',
  fontSize: 12,
  fontFamily: 'var(--font-geist-sans), sans-serif',
  fontWeight: 600,
})

const YLABEL = (label: string) => ({
  value: label,
  angle: -90,
  position: 'insideLeft' as const,
  offset: 8,
  fill: '#9CA3AF',
  fontSize: 12,
  fontFamily: 'var(--font-geist-sans), sans-serif',
  fontWeight: 600,
})

const MARGIN = { top: 4, right: 12, left: 10, bottom: 24 }

const YFmt = (v: number | string) =>
  typeof v === 'number' ? (Math.abs(v) >= 1000 ? v.toExponential(1) : parseFloat(v.toPrecision(4)).toString()) : v

export function EEFErrChart({
  tBuf,
  dBuf,
  width,
  height,
}: {
  tBuf: TPoint[]
  /** dBuf used only for timestamp axis when tBuf has no t field */
  dBuf?: DSample[]
  width?: number
  height?: number
}) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const handleLegendClick = (e: any) => {
    const { dataKey } = e
    setHidden(prev => ({ ...prev, [dataKey]: !prev[dataKey] }))
  }

  // EEF error computed purely from T-telemetry.
  // Time axis: use dBuf timestamps if available, otherwise 50 Hz index.
  const data = useMemo(() => {
    const sampled = downsample(tBuf, 500)
    const firstMs = dBuf?.[0]?.t ?? 0
    const useDTime = dBuf && dBuf.length === tBuf.length
    return sampled.map((pt, i) => ({
      t: useDTime ? (dBuf![i].t - firstMs) / 1000 : i * 0.02,
      err: eefErrFromT(pt),
    }))
  }, [tBuf, dBuf])

  const maxY = useMemo(() => Math.max(...data.map(d => d.err), 0.1) * 1.4, [data])

  const chart = (
    <AreaChart data={data} margin={MARGIN} width={width} height={height}>
      <defs>
        <linearGradient id="errGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#C084FC" stopOpacity={0.25} />
          <stop offset="95%" stopColor="#C084FC" stopOpacity={0.0} />
        </linearGradient>
      </defs>
      <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
      <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={XLABEL('Time (s)')} tickFormatter={(v) => typeof v === 'number' ? v.toFixed(2) : v} />
      <YAxis domain={[0, maxY]} tick={AT} axisLine={AL} tickLine={false} tickFormatter={YFmt} label={YLABEL('‖e‖ (mm)')} width={56} />
      <Tooltip contentStyle={TS} formatter={(v) => typeof v === 'number' ? v.toFixed(3) : v} labelFormatter={(label) => typeof label === 'number' ? `${label.toFixed(3)} s` : label} allowEscapeViewBox={{ x: false, y: false }} />
      <Legend verticalAlign="top" align="left" height={24} onClick={handleLegendClick} wrapperStyle={{ fontSize: '10px', fontFamily: 'var(--font-geist-sans), sans-serif', fontWeight: 600, paddingBottom: '4px', cursor: 'pointer' }} />
      {!hidden.err && (
        <Area type="linear" dataKey="err" stroke="#C084FC" fill="url(#errGradient)" strokeWidth={1.5} dot={false} isAnimationActive={false} name="EEF Error" />
      )}
    </AreaChart>
  )

  if (width !== undefined && height !== undefined) return chart

  return (
    <ResponsiveContainer width="100%" height="100%">
      {chart}
    </ResponsiveContainer>
  )
}

export function CTEChart({
  tBuf,
  dBuf,
  width,
  height,
}: {
  tBuf: TPoint[]
  dBuf?: DSample[]
  width?: number
  height?: number
}) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const handleLegendClick = (e: any) => {
    const { dataKey } = e
    setHidden(prev => ({ ...prev, [dataKey]: !prev[dataKey] }))
  }

  const data = useMemo(() => {
    const ctes = computeCTEList(tBuf)
    const sampled = downsample(tBuf, 500)
    const sampledCtes = downsample(ctes, 500)
    const firstMs = dBuf?.[0]?.t ?? 0
    const useDTime = dBuf && dBuf.length === tBuf.length
    return sampled.map((_, i) => ({
      t: useDTime ? (dBuf![i].t - firstMs) / 1000 : i * 0.02,
      cte: sampledCtes[i] ?? 0,
    }))
  }, [tBuf, dBuf])

  const maxY = useMemo(() => Math.max(...data.map(d => d.cte), 0.1) * 1.4, [data])

  const chart = (
    <AreaChart data={data} margin={MARGIN} width={width} height={height}>
      <defs>
        <linearGradient id="cteGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.25} />
          <stop offset="95%" stopColor="#F43F5E" stopOpacity={0.0} />
        </linearGradient>
      </defs>
      <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
      <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={XLABEL('Time (s)')} tickFormatter={(v) => typeof v === 'number' ? v.toFixed(2) : v} />
      <YAxis domain={[0, maxY]} tick={AT} axisLine={AL} tickLine={false} tickFormatter={YFmt} label={YLABEL('CTE (mm)')} width={56} />
      <Tooltip contentStyle={TS} formatter={(v) => typeof v === 'number' ? v.toFixed(3) : v} labelFormatter={(label) => typeof label === 'number' ? `${label.toFixed(3)} s` : label} allowEscapeViewBox={{ x: false, y: false }} />
      <Legend verticalAlign="top" align="left" height={24} onClick={handleLegendClick} wrapperStyle={{ fontSize: '10px', fontFamily: 'var(--font-geist-sans), sans-serif', fontWeight: 600, paddingBottom: '4px', cursor: 'pointer' }} />
      {!hidden.cte && (
        <Area type="linear" dataKey="cte" stroke="#F43F5E" fill="url(#cteGradient)" strokeWidth={1.5} dot={false} isAnimationActive={false} name="Cross Tracking Error" />
      )}
    </AreaChart>
  )

  if (width !== undefined && height !== undefined) return chart

  return (
    <ResponsiveContainer width="100%" height="100%">
      {chart}
    </ResponsiveContainer>
  )
}

export function EEFVelocityChart({
  dBuf,
  width,
  height,
}: {
  dBuf: DSample[]
  width?: number
  height?: number
}) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const handleLegendClick = (e: any) => {
    const { dataKey } = e
    setHidden(prev => ({ ...prev, [dataKey]: !prev[dataKey] }))
  }

  // Jacobian-based velocity: desired is jitter-free trapezoid from v1d/v2d
  const data = useMemo(() => computeEEFVelocityJacobian(dBuf), [dBuf])
  const chart = (
    <LineChart data={data} margin={MARGIN} width={width} height={height}>
      <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
      <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={XLABEL('Time (s)')} tickFormatter={(v) => typeof v === 'number' ? v.toFixed(2) : v} />
      <YAxis tick={AT} axisLine={AL} tickLine={false} label={YLABEL('v (mm/s)')} width={48} />
      <Tooltip contentStyle={TS} formatter={(v) => typeof v === 'number' ? v.toFixed(2) : v} labelFormatter={(label) => typeof label === 'number' ? `${label.toFixed(3)} s` : label} allowEscapeViewBox={{ x: false, y: false }} />
      <Legend verticalAlign="top" align="left" height={24} onClick={handleLegendClick} wrapperStyle={{ fontSize: '10px', fontFamily: 'var(--font-geist-sans), sans-serif', fontWeight: 600, paddingBottom: '4px', cursor: 'pointer' }} />
      {!hidden.v_actual && (
        <Line dataKey="v_actual" stroke="#C084FC" strokeWidth={1.75} dot={false} isAnimationActive={false} name="Actual" />
      )}
      {!hidden.v_ideal && (
        <Line dataKey="v_ideal" stroke="#06B6D4" strokeWidth={1.5} strokeDasharray="4 2" dot={false} isAnimationActive={false} name="Ideal (trapezoid)" />
      )}
    </LineChart>
  )

  if (width !== undefined && height !== undefined) return chart

  return (
    <ResponsiveContainer width="100%" height="100%">
      {chart}
    </ResponsiveContainer>
  )
}

export function PWMChart({
  dBuf,
  width,
  height,
}: {
  dBuf: DSample[]
  width?: number
  height?: number
}) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const handleLegendClick = (e: any) => {
    const { dataKey } = e
    setHidden(prev => ({ ...prev, [dataKey]: !prev[dataKey] }))
  }

  const firstT = dBuf[0]?.t ?? 0
  const data = useMemo(() => {
    const sampled = downsample(dBuf, 500)
    return sampled.map(d => ({ t: (d.t - firstT) / 1000, pwm: d.pwm1 }))
  }, [dBuf, firstT])

  const chart = (
    <AreaChart data={data} margin={MARGIN} width={width} height={height}>
      <defs>
        <linearGradient id="pwmGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#10B981" stopOpacity={0.25} />
          <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
        </linearGradient>
      </defs>
      <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
      <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={XLABEL('Time (s)')} tickFormatter={(v) => typeof v === 'number' ? v.toFixed(2) : v} />
      <YAxis domain={[-255, 255]} tick={AT} axisLine={AL} tickLine={false} label={YLABEL('PWM')} width={48} />
      <ReferenceLine y={0} stroke="#4B5563" strokeDasharray="4 2" />
      <Tooltip contentStyle={TS} labelFormatter={(label) => typeof label === 'number' ? `${label.toFixed(3)} s` : label} allowEscapeViewBox={{ x: false, y: false }} />
      <Legend verticalAlign="top" align="left" height={24} onClick={handleLegendClick} wrapperStyle={{ fontSize: '10px', fontFamily: 'var(--font-geist-sans), sans-serif', fontWeight: 600, paddingBottom: '4px', cursor: 'pointer' }} />
      {!hidden.pwm && (
        <Area type="linear" dataKey="pwm" stroke="#10B981" fill="url(#pwmGradient)" strokeWidth={1.5} dot={false} isAnimationActive={false} name="PWM Output" />
      )}
    </AreaChart>
  )

  if (width !== undefined && height !== undefined) return chart

  return (
    <ResponsiveContainer width="100%" height="100%">
      {chart}
    </ResponsiveContainer>
  )
}

export function PositionChart({
  dBuf,
  width,
  height,
}: {
  dBuf: DSample[]
  width?: number
  height?: number
}) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const handleLegendClick = (e: any) => {
    const { dataKey } = e
    setHidden(prev => ({ ...prev, [dataKey]: !prev[dataKey] }))
  }

  let useDegrees = false
  if (typeof window !== 'undefined') {
    useDegrees = localStorage.getItem('hmi_angular_unit') === 'degrees'
  }
  const r2d = 180 / Math.PI
  const scale = useDegrees ? r2d : 1

  const firstT = dBuf[0]?.t ?? 0
  const data = useMemo(() => {
    const sampled = downsample(dBuf, 500)
    return sampled.map(d => ({
      t: (d.t - firstT) / 1000,
      th1: d.th1 * scale,
      th1d: d.th1d * scale,
      th2: d.th2 * scale,
      th2d: d.th2d * scale,
    }))
  }, [dBuf, firstT, scale])

  const chart = (
    <LineChart data={data} margin={MARGIN} width={width} height={height}>
      <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
      <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={XLABEL('Time (s)')} tickFormatter={(v) => typeof v === 'number' ? v.toFixed(2) : v} />
      <YAxis tick={AT} axisLine={AL} tickLine={false} label={YLABEL(useDegrees ? 'θ (°)' : 'θ (rad)')} width={48} />
      <Tooltip contentStyle={TS} formatter={(v) => typeof v === 'number' ? v.toFixed(4) : v} labelFormatter={(label) => typeof label === 'number' ? `${label.toFixed(3)} s` : label} allowEscapeViewBox={{ x: false, y: false }} />
      <Legend verticalAlign="top" align="left" height={24} onClick={handleLegendClick} wrapperStyle={{ fontSize: '10px', fontFamily: 'var(--font-geist-sans), sans-serif', fontWeight: 600, paddingBottom: '4px', cursor: 'pointer' }} />
      {!hidden.th1 && (
        <Line dataKey="th1"  stroke="#2196F3" strokeWidth={1.75}   dot={false} isAnimationActive={false} name={useDegrees ? "θ1 Actual (°)" : "θ1 Actual (rad)"} />
      )}
      {!hidden.th1d && (
        <Line dataKey="th1d" stroke="#1E88E5" strokeWidth={1.5} strokeDasharray="4 2" dot={false} isAnimationActive={false} name={useDegrees ? "θ1 Desired (°)" : "θ1 Desired (rad)"} />
      )}
      {!hidden.th2 && (
        <Line dataKey="th2"  stroke="#FF9800" strokeWidth={1.75}   dot={false} isAnimationActive={false} name={useDegrees ? "θ2 Actual (°)" : "θ2 Actual (rad)"} />
      )}
      {!hidden.th2d && (
        <Line dataKey="th2d" stroke="#F57C00" strokeWidth={1.5} strokeDasharray="4 2" dot={false} isAnimationActive={false} name={useDegrees ? "θ2 Desired (°)" : "θ2 Desired (rad)"} />
      )}
    </LineChart>
  )

  if (width !== undefined && height !== undefined) return chart

  return (
    <ResponsiveContainer width="100%" height="100%">
      {chart}
    </ResponsiveContainer>
  )
}

export function VelocityChart({
  dBuf,
  width,
  height,
}: {
  dBuf: DSample[]
  width?: number
  height?: number
}) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const handleLegendClick = (e: any) => {
    const { dataKey } = e
    setHidden(prev => ({ ...prev, [dataKey]: !prev[dataKey] }))
  }

  let useDegrees = false
  if (typeof window !== 'undefined') {
    useDegrees = localStorage.getItem('hmi_angular_unit') === 'degrees'
  }
  const r2d = 180 / Math.PI
  const scale = useDegrees ? r2d : 1

  const firstT = dBuf[0]?.t ?? 0
  const data = useMemo(() => {
    const sampled = downsample(dBuf, 500)
    return sampled.map(d => ({
      t: (d.t - firstT) / 1000,
      v1: d.dth1 * scale,
      v1d: d.dth1d * scale,
      v2: d.dth2 * scale,
      v2d: d.dth2d * scale,
    }))
  }, [dBuf, firstT, scale])

  const chart = (
    <LineChart data={data} margin={MARGIN} width={width} height={height}>
      <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
      <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={XLABEL('Time (s)')} tickFormatter={(v) => typeof v === 'number' ? v.toFixed(2) : v} />
      <YAxis tick={AT} axisLine={AL} tickLine={false} label={YLABEL(useDegrees ? 'θ̇ (°/s)' : 'θ̇ (rad/s)')} width={48} />
      <Tooltip contentStyle={TS} formatter={(v) => typeof v === 'number' ? v.toFixed(4) : v} labelFormatter={(label) => typeof label === 'number' ? `${label.toFixed(3)} s` : label} allowEscapeViewBox={{ x: false, y: false }} />
      <Legend verticalAlign="top" align="left" height={24} onClick={handleLegendClick} wrapperStyle={{ fontSize: '10px', fontFamily: 'var(--font-geist-sans), sans-serif', fontWeight: 600, paddingBottom: '4px', cursor: 'pointer' }} />
      {!hidden.v1 && (
        <Line dataKey="v1"  stroke="#2196F3" strokeWidth={1.75}   dot={false} isAnimationActive={false} name={useDegrees ? "θ̇1 Actual (°/s)" : "θ̇1 Actual (rad/s)"} />
      )}
      {!hidden.v1d && (
        <Line dataKey="v1d" stroke="#1E88E5" strokeWidth={1.5} strokeDasharray="4 2" dot={false} isAnimationActive={false} name={useDegrees ? "θ̇1 Desired (°/s)" : "θ̇1 Desired (rad/s)"} />
      )}
      {!hidden.v2 && (
        <Line dataKey="v2"  stroke="#FF9800" strokeWidth={1.75}   dot={false} isAnimationActive={false} name={useDegrees ? "θ̇2 Actual (°/s)" : "θ̇2 Actual (rad/s)"} />
      )}
      {!hidden.v2d && (
        <Line dataKey="v2d" stroke="#F57C00" strokeWidth={1.5} strokeDasharray="4 2" dot={false} isAnimationActive={false} name={useDegrees ? "θ̇2 Desired (°/s)" : "θ̇2 Desired (rad/s)"} />
      )}
    </LineChart>
  )

  if (width !== undefined && height !== undefined) return chart

  return (
    <ResponsiveContainer width="100%" height="100%">
      {chart}
    </ResponsiveContainer>
  )
}

// Helper function for visible window statistics in industrial scope view
const statsForSeries = (data: any[], key: string) => {
  if (data.length === 0) return { min: 0, max: 0, mean: 0, rms: 0, std: 0, p2p: 0 }
  const vals = data.map(d => d[key]).filter(v => typeof v === 'number' && !isNaN(v))
  if (vals.length === 0) return { min: 0, max: 0, mean: 0, rms: 0, std: 0, p2p: 0 }

  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const p2p = max - min
  
  let sum = 0
  let sqSum = 0
  for (const v of vals) {
    sum += v
    sqSum += v * v
  }
  const mean = sum / vals.length
  const rms = Math.sqrt(sqSum / vals.length)
  
  let varSum = 0
  for (const v of vals) {
    varSum += (v - mean) ** 2
  }
  const std = Math.sqrt(varSum / vals.length)

  return { min, max, mean, rms, std, p2p }
}

interface AnalyzerSeries {
  key: string
  name: string
  stroke: string
  type: 'line' | 'area'
  fill?: string
  strokeDasharray?: string
}

function prepareAnalyzerData(
  activeTab: 'eef' | 'cte' | 'eef_vel' | 'pwm' | 'pos' | 'vel',
  dBuf: DSample[],
  tBuf: TPoint[],
  angularUnit: string
): {
  rawData: any[]
  series: AnalyzerSeries[]
  yLabel: string
  defaultYDomain: [any, any]
} {
  if (dBuf.length === 0) {
    return { rawData: [], series: [], yLabel: '', defaultYDomain: ['auto', 'auto'] as [any, any] }
  }
  const firstT = dBuf[0].t

  switch (activeTab) {
    case 'eef': {
      const rawData = tBuf.map((pt, i) => ({
        t: dBuf[i] ? (dBuf[i].t - firstT) / 1000 : i * 0.02,
        err: eefErrFromT(pt),
      }))
      const series = [
        { key: 'err', name: 'EEF Error', stroke: '#C084FC', type: 'area' as const, fill: '#C084FC' }
      ]
      return { rawData, series, yLabel: '‖e‖ (mm)', defaultYDomain: [0, 'auto'] as [any, any] }
    }
    case 'cte': {
      const ctes = computeCTEList(tBuf)
      const rawData = tBuf.map((pt, i) => ({
        t: dBuf[i] ? (dBuf[i].t - firstT) / 1000 : i * 0.02,
        cte: ctes[i] ?? 0,
      }))
      const series = [
        { key: 'cte', name: 'Cross Tracking Error', stroke: '#F43F5E', type: 'area' as const, fill: '#F43F5E' }
      ]
      return { rawData, series, yLabel: 'CTE (mm)', defaultYDomain: [0, 'auto'] as [any, any] }
    }
    case 'eef_vel': {
      const velocities = computeEEFVelocityJacobian(dBuf)
      const series = [
        { key: 'v_actual', name: 'Actual Velocity', stroke: '#C084FC', type: 'line' as const },
        { key: 'v_ideal', name: 'Ideal (trapezoid)', stroke: '#06B6D4', type: 'line' as const, strokeDasharray: '4 2' }
      ]
      return { rawData: velocities, series, yLabel: 'v (mm/s)', defaultYDomain: ['auto', 'auto'] as [any, any] }
    }
    case 'pwm': {
      const rawData = dBuf.map(d => ({
        t: (d.t - firstT) / 1000,
        pwm: d.pwm1,
      }))
      const series = [
        { key: 'pwm', name: 'PWM Output', stroke: '#10B981', type: 'area' as const, fill: '#10B981' }
      ]
      return { rawData, series, yLabel: 'PWM Command', defaultYDomain: [-255, 255] as [any, any] }
    }
    case 'pos': {
      const scale = angularUnit === 'degrees' ? 180 / Math.PI : 1
      const rawData = dBuf.map(d => ({
        t: (d.t - firstT) / 1000,
        th1: d.th1 * scale,
        th1d: d.th1d * scale,
        th2: d.th2 * scale,
        th2d: d.th2d * scale,
      }))
      const series = [
        { key: 'th1', name: 'θ1 Actual', stroke: '#2196F3', type: 'line' as const },
        { key: 'th1d', name: 'θ1 Desired', stroke: '#1E88E5', type: 'line' as const, strokeDasharray: '4 2' },
        { key: 'th2', name: 'θ2 Actual', stroke: '#FF9800', type: 'line' as const },
        { key: 'th2d', name: 'θ2 Desired', stroke: '#F57C00', type: 'line' as const, strokeDasharray: '4 2' },
      ]
      const labelSuffix = angularUnit === 'degrees' ? '(°)' : '(rad)'
      return { rawData, series, yLabel: `Position ${labelSuffix}`, defaultYDomain: ['auto', 'auto'] as [any, any] }
    }
    case 'vel': {
      const scale = angularUnit === 'degrees' ? 180 / Math.PI : 1
      const rawData = dBuf.map(d => ({
        t: (d.t - firstT) / 1000,
        v1: d.dth1 * scale,
        v1d: d.dth1d * scale,
        v2: d.dth2 * scale,
        v2d: d.dth2d * scale,
      }))
      const series = [
        { key: 'v1', name: 'θ̇1 Actual', stroke: '#2196F3', type: 'line' as const },
        { key: 'v1d', name: 'θ̇1 Desired', stroke: '#1E88E5', type: 'line' as const, strokeDasharray: '4 2' },
        { key: 'v2', name: 'θ̇2 Actual', stroke: '#FF9800', type: 'line' as const },
        { key: 'v2d', name: 'θ̇2 Desired', stroke: '#F57C00', type: 'line' as const, strokeDasharray: '4 2' },
      ]
      const labelSuffix = angularUnit === 'degrees' ? '(°/s)' : '(rad/s)'
      return { rawData, series, yLabel: `Velocity ${labelSuffix}`, defaultYDomain: ['auto', 'auto'] as [any, any] }
    }
  }
}

// Industrial grade analysis console component
function AdvancedAnalyzer({
  activeTab,
  dBuf,
  tBuf,
  angularUnit,
}: {
  activeTab: 'eef' | 'cte' | 'eef_vel' | 'pwm' | 'pos' | 'vel'
  dBuf: DSample[]
  tBuf: TPoint[]
  angularUnit: string
}) {
  const [activeTool, setActiveTool] = useState<'zoom' | 'cursor' | 'pan'>('zoom')
  const [zoomLeft, setZoomLeft] = useState<number | 'dataMin'>('dataMin')
  const [zoomRight, setZoomRight] = useState<number | 'dataMax'>('dataMax')
  const [yZoomFactor, setYZoomFactor] = useState(1.0)
  
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null)
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null)
  const [cursorA, setCursorA] = useState<number | null>(null)
  const [cursorB, setCursorB] = useState<number | null>(null)
  const [activeCursor, setActiveCursor] = useState<'A' | 'B'>('A')
  const [gridDensity, setGridDensity] = useState(0.05)
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({})

  const [isPanning, setIsPanning] = useState(false)
  const [panStartLabel, setPanStartLabel] = useState<number | null>(null)

  // Extract raw and structured series descriptions for current tab
  const { rawData, series, yLabel, defaultYDomain } = useMemo(() => {
    return prepareAnalyzerData(activeTab, dBuf, tBuf, angularUnit)
  }, [activeTab, dBuf, tBuf, angularUnit])

  // Reset tools and view constraints on active telemetry series switch
  useEffect(() => {
    setZoomLeft('dataMin')
    setZoomRight('dataMax')
    setYZoomFactor(1.0)
    setCursorA(null)
    setCursorB(null)
    setRefAreaLeft(null)
    setRefAreaRight(null)
    setHiddenSeries({})
    setIsPanning(false)
    setPanStartLabel(null)
  }, [activeTab])

  // Slice raw data to zoomed X range
  const filteredData = useMemo(() => {
    if (rawData.length === 0) return []
    const minT = zoomLeft === 'dataMin' ? rawData[0].t : (zoomLeft as number)
    const maxT = zoomRight === 'dataMax' ? rawData[rawData.length - 1].t : (zoomRight as number)
    return rawData.filter(d => d.t >= minT && d.t <= maxT)
  }, [rawData, zoomLeft, zoomRight])

  // Dynamic Downsampling (LOD downsampling): downsample sliced window ONLY when it exceeds 800 pts
  const displayData = useMemo(() => {
    return downsample(filteredData, 800)
  }, [filteredData])

  // Computes statistical metrics dynamically for the zoomed/filtered range
  const visibleStats = useMemo(() => {
    const sMap: Record<string, ReturnType<typeof statsForSeries>> = {}
    for (const s of series) {
      if (!hiddenSeries[s.key]) {
        sMap[s.key] = statsForSeries(filteredData, s.key)
      }
    }
    return sMap
  }, [filteredData, series, hiddenSeries])

  // Snaps caliper markers to nearest available data samples for accuracy
  const caliperPoints = useMemo(() => {
    if (rawData.length === 0) return { ptA: null, ptB: null }

    const findNearest = (tVal: number | null) => {
      if (tVal === null) return null
      return rawData.reduce((prev, curr) => {
        return Math.abs(curr.t - tVal) < Math.abs(prev.t - tVal) ? curr : prev
      })
    }

    return {
      ptA: findNearest(cursorA),
      ptB: findNearest(cursorB)
    }
  }, [rawData, cursorA, cursorB])

  // Autoscales the Y axis to the visible/zoomed range of enabled series
  const yDomain = useMemo(() => {
    if (displayData.length === 0) return defaultYDomain
    
    let minVal = Infinity
    let maxVal = -Infinity
    
    const activeKeys = series.filter(s => !hiddenSeries[s.key]).map(s => s.key)
    if (activeKeys.length === 0) return defaultYDomain
    
    for (const d of displayData) {
      for (const k of activeKeys) {
        const v = (d as any)[k]
        if (typeof v === 'number' && !isNaN(v)) {
          if (v < minVal) minVal = v
          if (v > maxVal) maxVal = v
        }
      }
    }
    
    if (minVal === Infinity || maxVal === -Infinity) {
      return defaultYDomain
    }
    
    const diff = maxVal - minVal
    const margin = diff === 0 ? 0.1 : diff * 0.1
    let computedMin = minVal - margin
    let computedMax = maxVal + margin
    
    const center = (computedMin + computedMax) / 2
    const range = (computedMax - computedMin) * yZoomFactor
    computedMin = center - range / 2
    computedMax = center + range / 2
    
    if (activeTab === 'pwm' && yZoomFactor === 1.0) {
      return [-255, 255] as [number, number]
    }
    
    return [computedMin, computedMax] as [number, number]
  }, [displayData, series, hiddenSeries, defaultYDomain, yZoomFactor, activeTab])

  // Mouse interaction event routing
  const handleMouseDown = (e: any) => {
    if (!e || typeof e.activeLabel !== 'number') return
    
    if (activeTool === 'zoom') {
      setRefAreaLeft(e.activeLabel)
    } else if (activeTool === 'cursor') {
      const val = e.activeLabel
      if (activeCursor === 'A') {
        setCursorA(val)
        setActiveCursor('B')
      } else {
        setCursorB(val)
        setActiveCursor('A')
      }
    } else if (activeTool === 'pan') {
      setIsPanning(true)
      setPanStartLabel(e.activeLabel)
    }
  }

  const handleMouseMove = (e: any) => {
    if (!e) return
    
    if (activeTool === 'zoom' && refAreaLeft !== null) {
      if (typeof e.activeLabel === 'number') {
        setRefAreaRight(e.activeLabel)
      }
    } else if (activeTool === 'pan' && isPanning && panStartLabel !== null && typeof e.activeLabel === 'number') {
      const delta = e.activeLabel - panStartLabel
      if (Math.abs(delta) > 0.0001) {
        const totalMin = rawData[0]?.t ?? 0
        const totalMax = rawData[rawData.length - 1]?.t ?? 1
        
        const currentLeft = zoomLeft === 'dataMin' ? totalMin : (zoomLeft as number)
        const currentRight = zoomRight === 'dataMax' ? totalMax : (zoomRight as number)
        
        let newLeft = currentLeft - delta
        let newRight = currentRight - delta
        
        if (newLeft < totalMin) {
          newRight += (totalMin - newLeft)
          newLeft = totalMin
        }
        if (newRight > totalMax) {
          newLeft -= (newRight - totalMax)
          newRight = totalMax
        }
        
        setZoomLeft(newLeft)
        setZoomRight(newRight)
        setPanStartLabel(e.activeLabel)
      }
    }
  }

  const handleMouseUp = () => {
    if (activeTool === 'zoom') {
      if (refAreaLeft !== null && refAreaRight !== null && refAreaLeft !== refAreaRight) {
        const leftVal = Math.min(refAreaLeft, refAreaRight)
        const rightVal = Math.max(refAreaLeft, refAreaRight)
        setZoomLeft(leftVal)
        setZoomRight(rightVal)
      }
      setRefAreaLeft(null)
      setRefAreaRight(null)
    } else if (activeTool === 'pan') {
      setIsPanning(false)
      setPanStartLabel(null)
    }
  }

  const handleMouseLeave = () => {
    setRefAreaLeft(null)
    setRefAreaRight(null)
    setIsPanning(false)
    setPanStartLabel(null)
  }

  const handleDoubleClick = () => {
    setZoomLeft('dataMin')
    setZoomRight('dataMax')
    setYZoomFactor(1.0)
  }

  const zoomTimeAxis = (factor: number) => {
    if (rawData.length === 0) return
    const totalMin = rawData[0].t
    const totalMax = rawData[rawData.length - 1].t
    const currentLeft = zoomLeft === 'dataMin' ? totalMin : (zoomLeft as number)
    const currentRight = zoomRight === 'dataMax' ? totalMax : (zoomRight as number)
    
    const center = (currentLeft + currentRight) / 2
    const currentSpan = currentRight - currentLeft
    const newSpan = currentSpan * factor
    
    let newLeft = center - newSpan / 2
    let newRight = center + newSpan / 2
    
    if (newLeft < totalMin) newLeft = totalMin
    if (newRight > totalMax) newRight = totalMax
    
    setZoomLeft(newLeft)
    setZoomRight(newRight)
  }

  return (
    <div className="flex flex-col h-full w-full min-h-0 overflow-hidden font-sans">
      {/* 1. Analyzer Toolbar Controls */}
      <div className="flex flex-wrap items-center gap-3 py-2 border-b border-hmi-grid/60 bg-slate-900/10 px-1 mb-3 text-xs shrink-0 select-none">
        
        {/* Interaction Tool Selector */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-hmi-grid">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold px-1.5 mr-1">Tool:</span>
          <Button
            type="button"
            variant={activeTool === 'zoom' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-2.5 text-xs rounded flex items-center gap-1"
            onClick={() => setActiveTool('zoom')}
          >
            <ZoomIn className="h-3 w-3" />
            Zoom
          </Button>
          <Button
            type="button"
            variant={activeTool === 'cursor' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-2.5 text-xs rounded flex items-center gap-1"
            onClick={() => setActiveTool('cursor')}
          >
            📐 Calipers
          </Button>
          <Button
            type="button"
            variant={activeTool === 'pan' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-2.5 text-xs rounded flex items-center gap-1"
            onClick={() => setActiveTool('pan')}
          >
            <Hand className="h-3 w-3" />
            Pan
          </Button>
        </div>

        {/* Quick Zoom Fit & Scale Buttons */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-hmi-grid">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold px-1.5 mr-1">Scaling:</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-8 text-xs hover:bg-slate-900"
            onClick={() => zoomTimeAxis(0.8)}
            title="Zoom In X (Time)"
          >
            X+
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-8 text-xs hover:bg-slate-900"
            onClick={() => zoomTimeAxis(1.25)}
            title="Zoom Out X (Time)"
          >
            X-
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-8 text-xs hover:bg-slate-900"
            onClick={() => setYZoomFactor(prev => prev * 0.8)}
            title="Zoom In Y (Amplitude)"
          >
            Y+
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-8 text-xs hover:bg-slate-900"
            onClick={() => setYZoomFactor(prev => prev * 1.25)}
            title="Zoom Out Y (Amplitude)"
          >
            Y-
          </Button>
          <div className="w-px h-4 bg-hmi-grid mx-1" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs font-semibold text-hmi-ideal hover:bg-slate-900 flex items-center gap-1"
            onClick={handleDoubleClick}
          >
            <RefreshCw className="h-2.5 w-2.5" />
            Reset Zoom
          </Button>
        </div>

        {/* Caliper Configuration Mode */}
        {activeTool === 'cursor' && (
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-hmi-grid animate-tooltip-left">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold px-1.5">Caliper:</span>
            <Button
              type="button"
              variant={activeCursor === 'A' ? 'default' : 'ghost'}
              size="sm"
              className={cn("h-6 px-2 text-[10px] rounded border border-blue-500/20 data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-200")}
              onClick={() => setActiveCursor('A')}
            >
              Set A
            </Button>
            <Button
              type="button"
              variant={activeCursor === 'B' ? 'default' : 'ghost'}
              size="sm"
              className={cn("h-6 px-2 text-[10px] rounded border border-orange-500/20 data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-200")}
              onClick={() => setActiveCursor('B')}
            >
              Set B
            </Button>
            <div className="w-px h-4 bg-hmi-grid mx-1" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] text-slate-400 hover:text-slate-200"
              onClick={() => {
                setCursorA(null)
                setCursorB(null)
                setActiveCursor('A')
              }}
            >
              Clear
            </Button>
          </div>
        )}

        {/* Grid Density Slider */}
        <div className="flex items-center gap-2 ml-auto bg-slate-950/60 p-1 rounded border border-hmi-grid/50 text-[11px] text-slate-400">
          <span className="select-none pl-1">Grid:</span>
          <input
            type="range"
            min="0.01"
            max="0.25"
            step="0.01"
            value={gridDensity}
            onChange={(e) => setGridDensity(parseFloat(e.target.value))}
            className="w-16 h-1 cursor-pointer accent-hmi-ideal bg-slate-800 rounded-lg appearance-none"
          />
          <span className="w-8 font-mono text-[10px] text-slate-500 text-right pr-1">{(gridDensity * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* 2. Main content area (Split layout with Recharts left and diagnostics panel right) */}
      <div className="flex-1 min-h-0 w-full flex gap-4 overflow-hidden">
        
        {/* Left: Recharts interactive screen */}
        <div className="flex-1 min-h-0 bg-slate-950/30 border border-hmi-grid/50 rounded-lg p-4 relative flex flex-col justify-center select-none overflow-hidden">
          {displayData.length === 0 ? (
            <div className="text-center text-hmi-muted text-xs font-semibold py-8 uppercase tracking-wider">
              No telemetry samples in active buffer.
            </div>
          ) : (
            <div className="w-full h-full relative">
              <ResponsiveContainer width="100%" height="100%">
                {activeTab === 'eef' || activeTab === 'pwm' ? (
                  <AreaChart
                    data={displayData}
                    margin={MARGIN}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseLeave}
                    onDoubleClick={handleDoubleClick}
                    style={{ cursor: activeTool === 'pan' ? 'grab' : 'crosshair' }}
                  >
                    <defs>
                      {series.map(s => s.fill && (
                        <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={s.fill} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={s.fill} stopOpacity={0.0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid stroke={`rgba(255, 255, 255, ${gridDensity})`} strokeDasharray="2 2" />
                    <XAxis
                      dataKey="t"
                      type="number"
                      domain={[zoomLeft, zoomRight]}
                      tick={AT}
                      axisLine={AL}
                      tickLine={false}
                      label={XLABEL('Time (seconds)')}
                      tickFormatter={(v) => typeof v === 'number' ? v.toFixed(2) : v}
                    />
                    <YAxis
                      type="number"
                      domain={yDomain}
                      tick={AT}
                      axisLine={AL}
                      tickLine={false}
                      tickFormatter={YFmt}
                      label={YLABEL(yLabel)}
                      width={56}
                    />
                    <Tooltip contentStyle={TS} formatter={(v) => typeof v === 'number' ? v.toFixed(4) : v} labelFormatter={(label) => typeof label === 'number' ? `${label.toFixed(3)} s` : label} allowEscapeViewBox={{ x: false, y: false }} />
                    
                    {series.map(s => !hiddenSeries[s.key] && (
                      <Area
                        key={s.key}
                        type="linear"
                        dataKey={s.key}
                        stroke={s.stroke}
                        fill={s.fill ? `url(#grad-${s.key})` : 'none'}
                        strokeWidth={1.75}
                        dot={false}
                        isAnimationActive={false}
                        name={s.name}
                      />
                    ))}

                    {cursorA !== null && (
                      <ReferenceLine
                        x={cursorA}
                        stroke="#2196F3"
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                        label={{ value: 'Caliper A', fill: '#2196F3', position: 'top', fontSize: 10, fontWeight: 'bold' }}
                      />
                    )}
                    {cursorB !== null && (
                      <ReferenceLine
                        x={cursorB}
                        stroke="#FF9800"
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                        label={{ value: 'Caliper B', fill: '#FF9800', position: 'top', fontSize: 10, fontWeight: 'bold' }}
                      />
                    )}

                    {refAreaLeft !== null && refAreaRight !== null && (
                      <ReferenceArea
                        x1={refAreaLeft}
                        x2={refAreaRight}
                        strokeOpacity={0.3}
                        fill="#06B6D4"
                        fillOpacity={0.15}
                      />
                    )}
                  </AreaChart>
                ) : (
                  <LineChart
                    data={displayData}
                    margin={MARGIN}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseLeave}
                    onDoubleClick={handleDoubleClick}
                    style={{ cursor: activeTool === 'pan' ? 'grab' : 'crosshair' }}
                  >
                    <CartesianGrid stroke={`rgba(255, 255, 255, ${gridDensity})`} strokeDasharray="2 2" />
                    <XAxis
                      dataKey="t"
                      type="number"
                      domain={[zoomLeft, zoomRight]}
                      tick={AT}
                      axisLine={AL}
                      tickLine={false}
                      label={XLABEL('Time (seconds)')}
                      tickFormatter={(v) => typeof v === 'number' ? v.toFixed(2) : v}
                    />
                    <YAxis
                      type="number"
                      domain={yDomain}
                      tick={AT}
                      axisLine={AL}
                      tickLine={false}
                      tickFormatter={YFmt}
                      label={YLABEL(yLabel)}
                      width={56}
                    />
                    <Tooltip contentStyle={TS} formatter={(v) => typeof v === 'number' ? v.toFixed(4) : v} labelFormatter={(label) => typeof label === 'number' ? `${label.toFixed(3)} s` : label} allowEscapeViewBox={{ x: false, y: false }} />
                    
                    {series.map(s => !hiddenSeries[s.key] && (
                      <Line
                        key={s.key}
                        type="linear"
                        dataKey={s.key}
                        stroke={s.stroke}
                        strokeDasharray={s.strokeDasharray}
                        strokeWidth={1.75}
                        dot={false}
                        isAnimationActive={false}
                        name={s.name}
                      />
                    ))}

                    {cursorA !== null && (
                      <ReferenceLine
                        x={cursorA}
                        stroke="#2196F3"
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                        label={{ value: 'Caliper A', fill: '#2196F3', position: 'top', fontSize: 10, fontWeight: 'bold' }}
                      />
                    )}
                    {cursorB !== null && (
                      <ReferenceLine
                        x={cursorB}
                        stroke="#FF9800"
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                        label={{ value: 'Caliper B', fill: '#FF9800', position: 'top', fontSize: 10, fontWeight: 'bold' }}
                      />
                    )}

                    {refAreaLeft !== null && refAreaRight !== null && (
                      <ReferenceArea
                        x1={refAreaLeft}
                        x2={refAreaRight}
                        strokeOpacity={0.3}
                        fill="#06B6D4"
                        fillOpacity={0.15}
                      />
                    )}
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Right: Analyzer Diagnostics Panel Sidebar */}
        <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto pr-1">
          
          {/* Signal visibility configuration checklist */}
          <div className="border border-hmi-grid bg-slate-900/40 rounded-lg p-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 select-none border-b border-hmi-grid/50 pb-1.5">
              Visible Signals
            </h3>
            <div className="flex flex-col gap-2">
              {series.map(s => (
                <label key={s.key} className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer hover:bg-slate-900/30 py-0.5 rounded">
                  <input
                    type="checkbox"
                    checked={!hiddenSeries[s.key]}
                    onChange={() => setHiddenSeries(prev => ({ ...prev, [s.key]: !prev[s.key] }))}
                    className="rounded border-slate-700 bg-slate-950 text-hmi-ideal focus:ring-hmi-ideal focus:ring-offset-slate-950"
                  />
                  <span className="w-3 h-3 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: s.stroke }} />
                  <span className="font-medium truncate">{s.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Caliper delta and amplitude measurements */}
          <div className="border border-hmi-grid bg-slate-900/40 rounded-lg p-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 select-none border-b border-hmi-grid/50 pb-1.5 flex justify-between items-center">
              Caliper Measurements
              {activeTool !== 'cursor' && (
                <span className="text-[9px] text-slate-500 normal-case font-normal">Enable Calipers to place</span>
              )}
            </h3>
            {caliperPoints.ptA || caliperPoints.ptB ? (
              <div className="flex flex-col gap-3 font-mono text-[11px]">
                
                {/* Caliper Time values */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 bg-slate-950/40 p-2 rounded border border-hmi-grid/30">
                  <div>
                    <span className="text-[10px] text-slate-500 font-sans block">Time (A):</span>
                    <span className="text-blue-400 font-medium">
                      {caliperPoints.ptA ? `${caliperPoints.ptA.t.toFixed(4)} s` : '--'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-sans block">Time (B):</span>
                    <span className="text-orange-400 font-medium">
                      {caliperPoints.ptB ? `${caliperPoints.ptB.t.toFixed(4)} s` : '--'}
                    </span>
                  </div>
                  {caliperPoints.ptA && caliperPoints.ptB && (
                    <div className="col-span-2 border-t border-hmi-grid/30 pt-1.5 mt-1 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-500 font-sans block">Delta Time (Δt):</span>
                        <span className="text-emerald-400 font-medium text-xs">
                          {Math.abs(caliperPoints.ptB.t - caliperPoints.ptA.t).toFixed(4)} s
                        </span>
                      </div>
                      {Math.abs(caliperPoints.ptB.t - caliperPoints.ptA.t) > 0 && (
                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 font-sans block">Frequency (1/Δt):</span>
                          <span className="text-purple-400 font-semibold text-xs">
                            {(1 / Math.abs(caliperPoints.ptB.t - caliperPoints.ptA.t)).toFixed(2)} Hz
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Caliper Signal Amplitudes */}
                <div className="flex flex-col gap-2">
                  {series.map(s => {
                    if (hiddenSeries[s.key]) return null
                    const valA = caliperPoints.ptA ? (caliperPoints.ptA as any)[s.key] : null
                    const valB = caliperPoints.ptB ? (caliperPoints.ptB as any)[s.key] : null
                    const diff = (valA !== null && valB !== null) ? (valB - valA) : null

                    return (
                      <div key={s.key} className="p-2 rounded border border-hmi-grid/20 bg-slate-900/30 flex flex-col gap-0.5 animate-tooltip-left">
                        <span className="text-[10px] text-slate-400 font-sans truncate font-medium block">
                          {s.name}
                        </span>
                        <div className="grid grid-cols-3 text-center gap-1 font-mono mt-1">
                          <div className="text-left">
                            <span className="text-[9px] text-slate-500 block">Y(A)</span>
                            <span className="text-blue-400 font-medium text-[10px]">
                              {valA !== null ? valA.toFixed(3) : '--'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-500 block">Y(B)</span>
                            <span className="text-orange-400 font-medium text-[10px]">
                              {valB !== null ? valB.toFixed(3) : '--'}
                            </span>
                          </div>
                          <div className="text-right border-l border-hmi-grid/20">
                            <span className="text-[9px] text-slate-500 block">ΔY</span>
                            <span className={cn(
                              "font-medium text-[10px]",
                              diff !== null && diff > 0 ? "text-emerald-400" : diff !== null && diff < 0 ? "text-red-400" : "text-slate-400"
                            )}>
                              {diff !== null ? (diff > 0 ? '+' : '') + diff.toFixed(3) : '--'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 font-sans italic leading-relaxed">
                Select Calipers tool and click at two distinct times along the horizontal axis to measure settling oscillations or overshoot ratios.
              </p>
            )}
          </div>

          {/* Regional Window Statistics Dashboard */}
          <div className="border border-hmi-grid bg-slate-900/40 rounded-lg p-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 select-none border-b border-hmi-grid/50 pb-1.5">
              Visible Window Stats
            </h3>
            <div className="flex flex-col gap-2 font-mono text-[11px]">
              {series.map(s => {
                if (hiddenSeries[s.key]) return null
                const stats = visibleStats[s.key]
                if (!stats) return null

                return (
                  <div key={s.key} className="p-2 rounded border border-hmi-grid/20 bg-slate-900/30 animate-tooltip-left">
                    <span className="text-[10px] text-slate-400 font-sans truncate font-medium block border-b border-hmi-grid/10 pb-0.5 mb-1.5">
                      {s.name}
                    </span>
                    <div className="grid grid-cols-2 gap-y-1.5 gap-x-2">
                      <div>
                        <span className="text-[9px] text-slate-500 font-sans block">Peak-to-Peak:</span>
                        <span className="text-slate-200 font-medium">{stats.p2p.toFixed(3)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 font-sans block">Mean (Average):</span>
                        <span className="text-slate-200 font-medium">{stats.mean.toFixed(3)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 font-sans block">RMS value:</span>
                        <span className="text-slate-200 font-medium">{stats.rms.toFixed(3)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 font-sans block">Std Dev (σ):</span>
                        <span className="text-slate-200 font-medium">{stats.std.toFixed(3)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ChartPanel() {
  const { state } = useHMI()
  const [isFocused, setIsFocused] = useState(false)
  const [angularUnit, setAngularUnit] = useState('radians')

  const [activeTab, setActiveTabState] = useState<'cte' | 'eef' | 'eef_vel' | 'pwm' | 'pos' | 'vel'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      return (params.get('chart') as 'cte' | 'eef' | 'eef_vel' | 'pwm' | 'pos' | 'vel') || 'cte'
    }
    return 'cte'
  })

  const setActiveTab = (tab: 'cte' | 'eef' | 'eef_vel' | 'pwm' | 'pos' | 'vel') => {
    setActiveTabState(tab)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      params.set('chart', tab)
      const newUrl = `${window.location.pathname}?${params.toString()}`
      window.history.replaceState(null, '', newUrl)
    }
  }

  useEffect(() => {
    const handleConfigChange = () => {
      const val = localStorage.getItem('hmi_angular_unit') || 'radians'
      setAngularUnit(val)
    }
    handleConfigChange()
    window.addEventListener('hmi_config_updated', handleConfigChange)
    return () => window.removeEventListener('hmi_config_updated', handleConfigChange)
  }, [])

  const isLive = state.recordingState === 'REC'

  // ── DOM throttle: accumulate data in refs, push to chart state at 5 Hz ────
  // This prevents Recharts from re-rendering on every 50 Hz BATCH_SAMPLES
  // dispatch while still keeping buffer data up-to-date for analysis.
  const dBufRef = useRef<DSample[]>([])
  const tBufRef = useRef<TPoint[]>([])
  const [chartD, setChartD] = useState<DSample[]>(() =>
    state.recordingState === 'REC' ? state.dBuffer : state.frozenD
  )
  const [chartT, setChartT] = useState<TPoint[]>(() =>
    state.recordingState === 'REC' ? state.tBuffer : state.frozenT
  )

  // Always keep refs in sync with context (no re-render triggered)
  const liveDSource = isLive ? state.dBuffer : state.frozenD
  const liveTSource = isLive ? state.tBuffer : state.frozenT
  dBufRef.current = liveDSource
  tBufRef.current = liveTSource

  useEffect(() => {
    if (!isLive) {
      // Frozen: update once immediately
      setChartD(state.frozenD)
      setChartT(state.frozenT)
      return
    }
    // Live: throttle DOM updates to 5 Hz (200 ms)
    const id = setInterval(() => {
      setChartD([...dBufRef.current])
      setChartT([...tBufRef.current])
    }, 200)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, state.frozenD, state.frozenT])

  // aliases used by focused AdvancedAnalyzer (not throttled — only shown when frozen)
  const dBuf = isFocused ? liveDSource : chartD
  const tBuf = isFocused ? liveTSource : chartT

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

  // Listen for graph download event
  useEffect(() => {
    const handleDownload = (e: Event) => {
      if (isFocused) {
        e.preventDefault()
        const nameMap: Record<string, string> = {
          eef: 'End-Effector Error Chart',
          cte: 'Cross Tracking Error Chart',
          eef_vel: 'End-Effector Velocity Chart',
          pwm: 'PWM Command Chart',
          pos: 'Joint Position Chart',
          vel: 'Joint Velocity Chart',
        }
        const chartKey = activeTab === 'eef_vel' ? 'eef-vel' : activeTab
        toast.promise(
          downloadSingleGraph(chartKey, nameMap[activeTab] || 'Telemetry Chart', state),
          {
            loading: `Exporting ${nameMap[activeTab] || 'Telemetry Chart'}...`,
            success: `${nameMap[activeTab] || 'Telemetry Chart'} downloaded successfully!`,
            error: (err) => `Export failed: ${err.message || err}`,
          }
        )
      }
    }
    window.addEventListener('hmi_download_graph', handleDownload)
    return () => window.removeEventListener('hmi_download_graph', handleDownload)
  }, [isFocused, activeTab, state])



  return (
    <Card 
      className={cn(
        "flex flex-col flex-1 min-h-0 shadow-md transition-all duration-300 group/graph",
        isFocused 
          ? "fixed inset-0 z-[100] m-0 rounded-none p-6 bg-hmi-bg" 
          : "relative"
      )}
    >
      {/* Focused mode header */}
      {isFocused && (
        <div className="flex items-center justify-between mb-2 border-b border-hmi-grid pb-2 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-hmi-text">Telemetry Analyzer Console</h2>
            <Badge className="bg-slate-900 border border-hmi-grid text-slate-300">
              {state.recordingState === 'REC' ? '🔴 Live stream' : '⏸ Sliced Run'}
            </Badge>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Quick tab switcher inside full screen analyzer */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-md border border-hmi-grid mr-4">
              {(['cte', 'eef', 'eef_vel', 'pwm', 'pos', 'vel'] as const).map(tab => (
                <Button
                  key={tab}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-7 px-3 text-xs rounded",
                    activeTab === tab 
                      ? "bg-hmi-btn text-hmi-text font-semibold shadow-sm" 
                      : "text-hmi-muted hover:text-slate-200"
                  )}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === 'cte' ? 'CTE' : tab === 'eef' ? 'EEF err' : tab === 'eef_vel' ? 'EEF vel' : tab === 'pwm' ? 'PWM' : tab === 'pos' ? 'Position' : 'Velocity'}
                </Button>
              ))}
            </div>

            <Button 
              variant="outline" 
              size="sm" 
              className="flex items-center gap-1 bg-slate-900/60 hover:bg-slate-800/80 border-slate-700/60 text-slate-300 h-8"
              onClick={(e) => {
                e.stopPropagation()
                setIsFocused(false)
              }}
            >
              <Minimize2 className="h-4 w-4" />
              Exit Focus
            </Button>
          </div>
        </div>
      )}

      {!isFocused && <StatsBanner stats={state.recordingState === 'IDLE' ? state.stats : null} />}
      
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="flex flex-col flex-1 min-h-0">
        {!isFocused && (
          <TabsList className="rounded-none border-b border-hmi-grid bg-hmi-panel px-2 py-0 h-9 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-0.5">
              <TabsTrigger
                value="cte"
                className="h-9 rounded-none border-b-2 border-transparent text-sm font-semibold data-[state=active]:border-hmi-ideal data-[state=active]:bg-transparent data-[state=active]:text-hmi-text"
              >
                CTE
              </TabsTrigger>
              <TabsTrigger
                value="eef"
                className="h-9 rounded-none border-b-2 border-transparent text-sm font-semibold data-[state=active]:border-hmi-ideal data-[state=active]:bg-transparent data-[state=active]:text-hmi-text"
              >
                EEF err
              </TabsTrigger>
              <TabsTrigger
                value="eef_vel"
                className="h-9 rounded-none border-b-2 border-transparent text-sm font-semibold data-[state=active]:border-hmi-ideal data-[state=active]:bg-transparent data-[state=active]:text-hmi-text"
              >
                EEF vel
              </TabsTrigger>
              <TabsTrigger
                value="pwm"
                className="h-9 rounded-none border-b-2 border-transparent text-sm font-semibold data-[state=active]:border-hmi-ideal data-[state=active]:bg-transparent data-[state=active]:text-hmi-text"
              >
                PWM
              </TabsTrigger>
              <TabsTrigger
                value="pos"
                className="h-9 rounded-none border-b-2 border-transparent text-sm font-semibold data-[state=active]:border-hmi-ideal data-[state=active]:bg-transparent data-[state=active]:text-hmi-text"
              >
                Position
              </TabsTrigger>
              <TabsTrigger
                value="vel"
                className="h-9 rounded-none border-b-2 border-transparent text-sm font-semibold data-[state=active]:border-hmi-ideal data-[state=active]:bg-transparent data-[state=active]:text-hmi-text"
              >
                Velocity
              </TabsTrigger>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <UiTooltip content={isFocused ? "Collapse: Restores the panel to normal size." : "Expand: Maximizes the telemetry charts."} align="center">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={(e) => { e.stopPropagation(); setIsFocused(!isFocused); }} 
                  className="h-7 px-1.5 text-[10px] text-slate-300 border-slate-700/60 hover:bg-slate-800/80 hover:text-white"
                >
                  {isFocused ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  <span className="ml-1">{isFocused ? 'Collapse' : 'Expand'}</span>
                </Button>
              </UiTooltip>
            </div>
          </TabsList>
        )}

        <CardContent className="flex-1 min-h-0 p-2 overflow-hidden">
          {isFocused ? (
            <AdvancedAnalyzer
              activeTab={activeTab}
              dBuf={dBuf}
              tBuf={tBuf}
              angularUnit={angularUnit}
            />
          ) : (
            <>
              <TabsContent value="eef" className="h-full w-full relative overflow-hidden">
                {activeTab === 'eef' && <EEFErrChart tBuf={chartT} dBuf={chartD} />}
              </TabsContent>
              <TabsContent value="cte" className="h-full w-full relative overflow-hidden">
                {activeTab === 'cte' && <CTEChart tBuf={chartT} dBuf={chartD} />}
              </TabsContent>
              <TabsContent value="eef_vel" className="h-full w-full relative overflow-hidden">
                {activeTab === 'eef_vel' && <EEFVelocityChart dBuf={chartD} />}
              </TabsContent>
              <TabsContent value="pwm" className="h-full w-full relative overflow-hidden">
                {activeTab === 'pwm' && <PWMChart dBuf={dBuf} />}
              </TabsContent>
              <TabsContent value="pos" className="h-full w-full relative overflow-hidden">
                {activeTab === 'pos' && <PositionChart dBuf={dBuf} />}
              </TabsContent>
              <TabsContent value="vel" className="h-full w-full relative overflow-hidden">
                {activeTab === 'vel' && <VelocityChart dBuf={dBuf} />}
              </TabsContent>
            </>
          )}
        </CardContent>
      </Tabs>
    </Card>
  )
}

'use client'

import { useEffect, useMemo, useRef, useState, useId } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useHMI, useHMISlow } from '@/lib/hmi-context'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip as UiTooltip } from '@/components/ui/tooltip'
import { Maximize2, Minimize2, ZoomIn, ZoomOut, Hand, RefreshCw, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { downloadSingleGraph } from '@/lib/capture-utils'
import { computeCTEList, computeATEList } from '@/lib/cte-utils'
// sections only used for the focused/fullscreen AdvancedAnalyzer – raw charts now inline
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, AreaChart, Area, LineChart, Line, ReferenceArea,
} from 'recharts'
import type { DSample, TPoint } from '@/lib/hmi-types'
import localLoess from '@/lib/localMean'
import UniversalTimeSeriesChart, { ChartSeries } from './universal-time-series-chart'

const GRID = 'var(--color-hmi-grid-subtle)'
const AT = {
  fill: 'var(--color-hmi-text-secondary)',
  fontSize: 11,
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

    return { t, v_actual, v_ideal, v_actual_smoothed: 0 }
  })
}

// ── Pure chart components for PID / J1 Ctrl / J2 Vel tabs ──────────────────
// All read their own data via useHMISlow so they plug in exactly like CTEChart etc.

export function ChartContainer({
  isEmpty,
  msg,
  children,
}: {
  isEmpty: boolean
  msg?: string
  children: React.ReactNode
}) {
  const cleanedMsg = msg
    ? msg.replace(/\s*[-—]\s*run a move to capture data/gi, "").replace(/\s*run a move to capture data/gi, "").trim()
    : msg

  return (
    <div className="relative w-full h-full min-h-[160px]">
      {isEmpty && cleanedMsg && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <span className="text-xs font-semibold text-hmi-muted uppercase tracking-wider select-none">
            {cleanedMsg}
          </span>
        </div>
      )}
      {children}
    </div>
  )
}

export function PIDChart() {
  const { state } = useHMISlow()
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const data = useMemo(() => {
    if (!state.frozenE || state.frozenE.length === 0) return []
    const firstT = state.frozenE[0].t
    return downsample(state.frozenE.map(e => ({
      t: (e.t - firstT) / 1000,
      p1_out: e.p1_out,
      i1_out: e.i1_out,
      d1_out: e.d1_out,
    })), 500)
  }, [state.frozenE])

  const series: ChartSeries[] = [
    { key: 'p1_out', name: 'P Out', stroke: 'var(--color-hmi-j1)', strokeWidth: 1.5 },
    { key: 'i1_out', name: 'I Out', stroke: 'var(--color-hmi-pwm-pos)', strokeWidth: 1.5 },
    { key: 'd1_out', name: 'D Out', stroke: 'var(--color-hmi-pwm-neg)', strokeWidth: 1.5 },
  ]

  return (
    <UniversalTimeSeriesChart
      data={data}
      series={series}
      yLabel="Output"
      isEmpty={data.length === 0}
      msg="No PID telemetry — run a move to capture data"
      hiddenSeries={hidden}
      onLegendClick={(key) => setHidden(prev => ({ ...prev, [key]: !prev[key] }))}
    />
  )
}

export function J1CtrlChart() {
  const { state } = useHMISlow()
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const u1max = state.params?.u1max ?? 1
  const data = useMemo(() => {
    const frozenD = state.frozenD
    const frozenF = state.frozenF
    if (!frozenD || frozenD.length === 0) return []
    const firstT = frozenD[0].t

    const params = state.params
    const x0 = state.frozenT && state.frozenT.length > 0 ? state.frozenT[0].xi : (state.currentMove?.x0 ?? 0)
    const y0 = state.frozenT && state.frozenT.length > 0 ? state.frozenT[0].yi : (state.currentMove?.y0 ?? 0)
    const xf = state.frozenT && state.frozenT.length > 0 ? state.frozenT[state.frozenT.length - 1].xi : (state.currentMove?.xf ?? 0)
    const yf = state.frozenT && state.frozenT.length > 0 ? state.frozenT[state.frozenT.length - 1].yi : (state.currentMove?.yf ?? 0)

    const dx = (xf - x0) / 1000
    const dy = (yf - y0) / 1000
    const traj_D = Math.sqrt(dx * dx + dy * dy)

    const vmax = params?.vmax ?? 0.5
    const amax = params?.amax ?? 2.0
    const trapEnabled = params?.trapEnabled ?? true

    let traj_ta = 0
    if (traj_D >= 0.001) {
      if (trapEnabled) {
        const ta = vmax / amax
        const da = 0.5 * amax * ta * ta
        if (2.0 * da > traj_D) {
          traj_ta = Math.sqrt(traj_D / amax)
        } else {
          traj_ta = ta
        }
      } else {
        traj_ta = 0
      }
    }

    const ds = downsample(frozenD.map(d => {
      const t_traj = (d.t - firstT) / 1000
      const is_moving = true

      let active_frac_thresh = params?.fzt ?? 0.04
      if (params?.kickstartEnabled && is_moving && t_traj <= traj_ta) {
        active_frac_thresh = (params?.fzt ?? 0.04) * (params?.fztKickPct ?? 0.1)
      }

      const pwmDb = params?.pwmDb ?? 68
      const dbAmp = 21.0 * (pwmDb / 68.0)
      const s = Math.sin(d.th1)
      let dynamicDbHold = Math.round(pwmDb + dbAmp * s * s)
      dynamicDbHold = Math.max(0, Math.min(255, dynamicDbHold))

      let dynamicDb = dynamicDbHold
      if (params?.dbMovingEnabled && is_moving && t_traj > traj_ta) {
        dynamicDb = Math.round(dynamicDbHold * (params?.dbEngageScale ?? 0.75))
        dynamicDb = Math.max(0, Math.min(255, dynamicDb))
      }

      const mag = Math.abs(d.pwm1)
      let pwm1_adj = 0
      if (mag > 0) {
        const frac_eff = (255 > dynamicDb) ? Math.min(1.0, Math.max(0.0, (mag - dynamicDb) / (255 - dynamicDb))) : 0
        const frac_abs = frac_eff * (1.0 - active_frac_thresh) + active_frac_thresh
        pwm1_adj = Math.sign(d.pwm1) * frac_abs
      }

      const u1_total = d.u1Total / u1max

      let ff1_contrib = 0
      if (frozenF && frozenF.length > 0) {
        let bestF = frozenF[0], minDiff = Infinity
        for (const f of frozenF) {
          const diff = Math.abs(f.t - d.t)
          if (diff < minDiff) { minDiff = diff; bestF = f } else break
        }
        ff1_contrib = bestF.ff1Contrib / u1max
      }

      const vff1 = (d.vff1 ?? 0) / u1max
      const pid1_total = u1_total - ff1_contrib - vff1

      return {
        t: (d.t - firstT) / 1000,
        pid1_total,
        ff1_contrib,
        vff1,
        pwm1_adj,
      }
    }), 500)

    return ds
  }, [state.frozenD, state.frozenF, state.frozenT, state.currentMove, state.params, u1max])

  const series: ChartSeries[] = [
    { key: 'pid1_total', name: 'PID Total / u1max', stroke: 'var(--color-hmi-pwm-pos)', strokeWidth: 1.25 },
    { key: 'ff1_contrib', name: 'FF Contribution', stroke: 'var(--color-hmi-ideal)', strokeWidth: 1.5, strokeDasharray: '3 3' },
    { key: 'vff1', name: 'Velocity FF', stroke: 'var(--color-hmi-pwm-neg)', strokeWidth: 1.5, strokeDasharray: '5 2' },
    { key: 'pwm1_adj', name: 'PWM / 255', stroke: 'var(--color-hmi-j1)', strokeWidth: 1.25, strokeOpacity: 0.75 },
  ]

  return (
    <UniversalTimeSeriesChart
      data={data}
      series={series}
      yLabel="Fraction of max"
      isEmpty={data.length === 0}
      msg="No J1 control telemetry — run a move to capture data (requires updated firmware)"
      hiddenSeries={hidden}
      onLegendClick={(key) => setHidden(prev => ({ ...prev, [key]: !prev[key] }))}
    />
  )
}

export function J2VelChart() {
  const { state } = useHMISlow()
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const kp2 = state.gains?.kp2 ?? 0
  const kd2 = state.gains?.kd2 ?? 0
  const data = useMemo(() => {
    if (!state.frozenF || state.frozenF.length === 0) return []
    const firstT = state.frozenF[0].t
    const frozenD = state.frozenD
    return downsample(state.frozenF.map(f => {
      let bestD = null, minDiff = Infinity
      for (const d of frozenD) {
        const diff = Math.abs(d.t - f.t)
        if (diff < minDiff) { minDiff = diff; bestD = d } else break
      }
      return {
        t: (f.t - firstT) / 1000,
        omega2_raw:     f.omega2Raw,
        delta_omega_ff: f.deltaOmegaFf,
        p_out:          bestD ? kp2 * bestD.e2 : 0,
        d_out:          bestD ? -kd2 * bestD.dth2 : 0,
        integral2:      f.integral2,
      }
    }), 500)
  }, [state.frozenF, state.frozenD, kp2, kd2])

  const series: ChartSeries[] = [
    { key: 'omega2_raw', name: 'Total ω2 Command', stroke: 'var(--color-hmi-j2)', strokeWidth: 1.75 },
    { key: 'p_out', name: 'J2 P Out', stroke: 'var(--color-hmi-j1)', strokeWidth: 1.5 },
    { key: 'd_out', name: 'J2 D Out', stroke: 'var(--color-hmi-pwm-neg)', strokeWidth: 1.5 },
    { key: 'integral2', name: 'J2 I Out', stroke: 'var(--color-hmi-error)', strokeWidth: 1.5, strokeDasharray: '4 2' },
    { key: 'delta_omega_ff', name: 'J2 FF Contrib', stroke: 'var(--color-hmi-ideal)', strokeWidth: 1.5, strokeDasharray: '3 3' },
  ]

  return (
    <UniversalTimeSeriesChart
      data={data}
      series={series}
      yLabel="Velocity (rad/s)"
      isEmpty={data.length === 0}
      msg="No J2 velocity telemetry — run a move to capture data"
      hiddenSeries={hidden}
      onLegendClick={(key) => setHidden(prev => ({ ...prev, [key]: !prev[key] }))}
    />
  )
}

// Self-contained metrics panel — reads from context, always visible.
// Exported so monitor-tab can place it in the bottom 30% split.
export function MetricsPanel() {
  const { state } = useHMISlow()
  // Show stats whenever we're not actively recording — persists through disconnect/refresh
  const stats = state.recordingState !== 'REC' ? state.stats : null
  const frozenD = state.frozenD

  const frozenT = state.frozenT

  const computed = useMemo(() => {
    if (!frozenD || frozenD.length === 0) return null
    const N = frozenD.length
    const r2d = 180 / Math.PI
    let sq1 = 0, sq2 = 0, sqEEF = 0
    for (let i = 0; i < N; i++) {
      const d = frozenD[i]
      const t = frozenT[i]
      sq1   += (d.e1 * r2d) ** 2
      sq2   += (d.e2 * r2d) ** 2
      sqEEF += t ? (t.xi - t.xa) ** 2 + (t.yi - t.ya) ** 2 : 0
    }
    const pwms    = frozenD.map(d => d.pwm1)
    const meanPwm = pwms.reduce((a, b) => a + b, 0) / N
    const varPwm  = pwms.reduce((s, v) => s + (v - meanPwm) ** 2, 0) / N
    let jitter = 0
    if (N > 1) { let ds = 0; for (let i = 1; i < N; i++) ds += Math.abs(pwms[i] - pwms[i-1]); jitter = ds / (N - 1) }
    const firstT  = frozenD[0].t
    const times   = frozenD.map(d => (d.t - firstT) / 1000)
    let settleIdx = -1
    for (let i = N - 1; i >= 0; i--) {
      const t = frozenT[i]
      if (t && Math.sqrt((t.xi - t.xa) ** 2 + (t.yi - t.ya) ** 2) > 2.0) { settleIdx = i; break }
    }
    return {
      rmseJ1:    Math.sqrt(sq1   / N),
      rmseJ2:    Math.sqrt(sq2   / N),
      rmseEEF:   Math.sqrt(sqEEF / N),
      varPwm,
      jitter,
      settleTime: settleIdx >= 0 && settleIdx < N - 1 ? times[settleIdx + 1] : 0,
    }
  }, [frozenD, frozenT])

  const dash = <span className="text-slate-600">-</span>

  const fmt = (v: number | undefined, digits = 2, unit?: string) =>
    v !== undefined
      ? <>{v.toFixed(digits)}{unit && <span className="text-[10px] font-sans font-normal text-slate-500"> {unit}</span>}</>
      : dash

  const rows: { label: React.ReactNode; value: React.ReactNode; tooltip: string }[] = [
    {
      label: 'AI',
      value: <span className="text-hmi-ideal">{stats?.accuracy_idx !== undefined ? `${(stats.accuracy_idx * 100).toFixed(2)}%` : dash}</span>,
      tooltip: 'Accuracy Index (AI): 1 − MCTE/D. 100% = perfect path tracking.',
    },
    {
      label: <span>ε<sub>max</sub></span>,
      value: <span className="text-hmi-text-error">{fmt(stats?.max_err, 2, 'mm')}</span>,
      tooltip: 'Maximum Cross Tracking Error (ε_max): worst lateral deviation in the run.',
    },
    {
      label: 'MCTE',
      value: <span className="text-hmi-ideal">{fmt(stats?.MCTE ?? stats?.mean_err, 2, 'mm')}</span>,
      tooltip: 'Mean CTE (MCTE): path-integrated lateral area divided by path length.',
    },
    {
      label: 'RMS ATE',
      value: <span className="text-hmi-text-warning">{fmt(stats?.RMS_ATE, 2, 'mm')}</span>,
      tooltip: 'RMS Along-Track Error: quadratic average of lead/lag without sign cancellation.',
    },
    {
      label: <span>R<sub>ε</sub></span>,
      value: (
        <span className={cn(
          "font-semibold",
          stats?.error_ratio !== undefined
            ? stats.error_ratio >= 0.5 ? "text-hmi-text-warning" : "text-hmi-text-cyan"
            : "text-hmi-muted"
        )}>
          {stats?.error_ratio !== undefined
            ? stats.error_ratio >= 0.5
              ? `${(stats.error_ratio * 100).toFixed(0)}% Delay`
              : `${((1 - stats.error_ratio) * 100).toFixed(0)}% Shape`
            : '-'}
        </span>
      ),
      tooltip: 'Error Bias (R_ε): >50% Delay → raise Kp/Ki/Kff; >50% Shape → tune Kd or check mechanics.',
    },
    {
      label: <span>ε<sub>f</sub></span>,
      value: <span className="text-hmi-text-neutral">{fmt(stats?.final_err, 2, 'mm')}</span>,
      tooltip: 'Final CTE (ε_f): cross-track error at the end of the trajectory.',
    },
    {
      label: <span>T<sub>el</sub></span>,
      value: <span className="text-hmi-text-neutral">{stats?.elapsed_time !== undefined ? `${stats.elapsed_time.toFixed(3)} s` : dash}</span>,
      tooltip: 'Elapsed time (T_el): total duration of the last trajectory run.',
    },
    {
      label: 'RMSE J1',
      value: <span className="text-hmi-text-purple">{fmt(computed?.rmseJ1, 3, '°')}</span>,
      tooltip: 'Joint 1 tracking RMSE (°): root-mean-square of θ1 position error over the run.',
    },
    {
      label: 'RMSE J2',
      value: <span className="text-hmi-text-purple">{fmt(computed?.rmseJ2, 3, '°')}</span>,
      tooltip: 'Joint 2 tracking RMSE (°): root-mean-square of θ2 position error over the run.',
    },
    {
      label: 'RMSE EEF',
      value: <span className="text-hmi-text-purple">{fmt(computed?.rmseEEF, 3, 'mm')}</span>,
      tooltip: 'End-effector RMSE (mm): root-mean-square of Cartesian EEF position error over the run.',
    },
    {
      label: 'Ctrl Var',
      value: <span className="text-hmi-text-success">{fmt(computed?.varPwm, 1)}</span>,
      tooltip: 'Control Effort Variance (PWM σ²): higher values indicate more active correction. Very high values may indicate oscillation.',
    },
    {
      label: 'Jitter',
      value: <span className="text-hmi-text-violet">{fmt(computed?.jitter, 2)}</span>,
      tooltip: 'Actuator Jitter Proxy (mean |ΔPWM| per step): indicator of chattering. Lower is smoother.',
    },

  ]

  const handleDownloadMetrics = async () => {
    try {
      await downloadSingleGraph('metrics', 'Run Metrics Report', state as import('@/lib/hmi-types').HMIState)
    } catch (err: any) {
      toast.error(err.message || 'Export failed')
    }
  }

  return (
    <div className="h-full w-full bg-hmi-panel border border-hmi-grid rounded-lg flex flex-col overflow-hidden">
      <div className="px-3 py-1.5 border-b border-hmi-grid shrink-0 flex items-center gap-2">
        <span className="text-[11px] font-bold text-hmi-text-secondary uppercase tracking-wider select-none">
          Run Metrics
        </span>
        {!stats && (
          <span className="text-[10px] text-hmi-muted italic">— waiting for move data</span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadMetrics}
          disabled={!stats && (!computed)}
          className="ml-auto h-5 px-1.5 text-[10px] border-hmi-grid text-hmi-text-secondary bg-hmi-btn hover:bg-hmi-btn-hover hover:text-hmi-text"
          title="Download Run Metrics"
        >
          <Download className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-3 auto-rows-min gap-px bg-hmi-grid/30 overflow-y-auto">
        {rows.map((row, i) => (
          <UiTooltip key={i} content={row.tooltip} align="center">
            <div className="flex flex-col justify-center px-3 py-2 bg-hmi-panel cursor-help hover:bg-hmi-elevated transition-colors">
              <span className="text-[10px] text-hmi-text-secondary font-semibold tracking-wide uppercase leading-tight select-none">
                {row.label}
              </span>
              <span className="font-mono font-medium text-sm mt-0.5 leading-tight">
                {row.value}
              </span>
            </div>
          </UiTooltip>
        ))}
      </div>
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
  const series: ChartSeries[] = [
    { key: 'err', name: 'EEF Error', stroke: 'var(--color-hmi-error)', fill: 'var(--color-hmi-error)', type: 'area' }
  ]

  return (
    <UniversalTimeSeriesChart
      data={data}
      series={series}
      yLabel="‖e‖ (mm)"
      yDomain={[0, maxY]}
      isEmpty={data.length === 0}
      msg="No end-effector error telemetry — run a move to capture data"
      width={width}
      height={height}
      hiddenSeries={hidden}
      onLegendClick={(key) => setHidden(prev => ({ ...prev, [key]: !prev[key] }))}
    />
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
  const series: ChartSeries[] = [
    { key: 'cte', name: 'Cross Tracking Error', stroke: 'var(--color-hmi-actual)', fill: 'var(--color-hmi-actual)', type: 'area' }
  ]

  return (
    <UniversalTimeSeriesChart
      data={data}
      series={series}
      yLabel="CTE (mm)"
      yDomain={[0, maxY]}
      isEmpty={data.length === 0}
      msg="No CTE telemetry — run a move to capture data"
      width={width}
      height={height}
      hiddenSeries={hidden}
      onLegendClick={(key) => setHidden(prev => ({ ...prev, [key]: !prev[key] }))}
    />
  )
}

export function ATEChart({
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
  const data = useMemo(() => {
    const ates = computeATEList(tBuf)
    const sampled = downsample(tBuf, 500)
    const sampledAtes = downsample(ates, 500)
    const firstMs = dBuf?.[0]?.t ?? 0
    const useDTime = dBuf && dBuf.length === tBuf.length
    return sampled.map((_, i) => ({
      t: useDTime ? (dBuf![i].t - firstMs) / 1000 : i * 0.02,
      ate: sampledAtes[i] ?? 0,
    }))
  }, [tBuf, dBuf])

  const minY = useMemo(() => Math.min(...data.map(d => d.ate), -0.1) * 1.4, [data])
  const maxY = useMemo(() => Math.max(...data.map(d => d.ate), 0.1) * 1.4, [data])
  const series: ChartSeries[] = [
    { key: 'ate', name: 'Along Tracking Error', stroke: 'var(--color-hmi-warn)', fill: 'var(--color-hmi-warn)', type: 'area' }
  ]

  return (
    <UniversalTimeSeriesChart
      data={data}
      series={series}
      yLabel="ATE (mm)"
      yDomain={[minY, maxY]}
      isEmpty={data.length === 0}
      msg="No ATE telemetry — run a move to capture data"
      width={width}
      height={height}
      referenceLines={[{ y: 0, stroke: 'var(--color-hmi-grid)', strokeDasharray: '4 2', strokeOpacity: 1.0 }]}
      hiddenSeries={hidden}
      onLegendClick={(key) => setHidden(prev => ({ ...prev, [key]: !prev[key] }))}
    />
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
  const data = useMemo(() => {
    const base = computeEEFVelocityJacobian(dBuf)
    try {
      const xs = base.map(d => d.t)
      const ys = base.map(d => d.v_actual)
      const sm = localLoess(ys, xs, 0.08, 1)
      for (let i = 0; i < base.length; i++) base[i].v_actual_smoothed = sm[i]
    } catch (e) {
      console.warn('localLoess smoothing failed for EEF velocity', e)
    }
    return base
  }, [dBuf])

  const series: ChartSeries[] = [
    { key: 'v_actual', name: 'Actual', stroke: 'var(--color-hmi-actual)' },
    { key: 'v_actual_smoothed', name: 'Actual (smoothed)', stroke: 'var(--color-hmi-ok)', strokeDasharray: '6 4' },
    { key: 'v_ideal', name: 'Ideal (trapezoid)', stroke: 'var(--color-hmi-j1-des)', strokeDasharray: '4 2' },
  ]

  return (
    <UniversalTimeSeriesChart
      data={data}
      series={series}
      yLabel="v (mm/s)"
      isEmpty={data.length === 0}
      msg="No end-effector velocity telemetry — run a move to capture data"
      width={width}
      height={height}
      hiddenSeries={hidden}
      onLegendClick={(key) => setHidden(prev => ({ ...prev, [key]: !prev[key] }))}
      tooltipValueFormatter={(v) => typeof v === 'number' ? v.toFixed(2) : v}
    />
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
  const firstT = dBuf[0]?.t ?? 0
  const data = useMemo(() => {
    const sampled = downsample(dBuf, 500)
    return sampled.map(d => ({ t: (d.t - firstT) / 1000, pwm: d.pwm1 }))
  }, [dBuf, firstT])

  const series: ChartSeries[] = [
    { key: 'pwm', name: 'PWM Output', stroke: 'var(--color-hmi-pwm-pos)', fill: '#10B981', type: 'area' }
  ]

  return (
    <UniversalTimeSeriesChart
      data={data}
      series={series}
      yLabel="PWM"
      yDomain={[-255, 255]}
      isEmpty={data.length === 0}
      msg="No PWM telemetry — run a move to capture data"
      width={width}
      height={height}
      referenceLines={[{ y: 0, stroke: 'var(--color-hmi-grid)', strokeDasharray: '4 2', strokeOpacity: 1.0 }]}
      hiddenSeries={hidden}
      onLegendClick={(key) => setHidden(prev => ({ ...prev, [key]: !prev[key] }))}
    />
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

  const series: ChartSeries[] = [
    { key: 'th1', name: useDegrees ? 'θ1 Actual (°)' : 'θ1 Actual (rad)', stroke: 'var(--color-hmi-j1)' },
    { key: 'th1d', name: useDegrees ? 'θ1 Desired (°)' : 'θ1 Desired (rad)', stroke: 'var(--color-hmi-j1-des)', strokeDasharray: '4 2' },
    { key: 'th2', name: useDegrees ? 'θ2 Actual (°)' : 'θ2 Actual (rad)', stroke: 'var(--color-hmi-j2)' },
    { key: 'th2d', name: useDegrees ? 'θ2 Desired (°)' : 'θ2 Desired (rad)', stroke: 'var(--color-hmi-j2-des)', strokeDasharray: '4 2' },
  ]

  return (
    <UniversalTimeSeriesChart
      data={data}
      series={series}
      yLabel={useDegrees ? 'θ (°)' : 'θ (rad)'}
      isEmpty={data.length === 0}
      msg="No position telemetry — run a move to capture data"
      width={width}
      height={height}
      hiddenSeries={hidden}
      onLegendClick={(key) => setHidden(prev => ({ ...prev, [key]: !prev[key] }))}
    />
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

  const series: ChartSeries[] = [
    { key: 'v1', name: useDegrees ? 'θ̇1 Actual (°/s)' : 'θ̇1 Actual (rad/s)', stroke: 'var(--color-hmi-j1)' },
    { key: 'v1d', name: useDegrees ? 'θ̇1 Desired (°/s)' : 'θ̇1 Desired (rad/s)', stroke: 'var(--color-hmi-j1-des)', strokeDasharray: '4 2' },
    { key: 'v2', name: useDegrees ? 'θ̇2 Actual (°/s)' : 'θ̇2 Actual (rad/s)', stroke: 'var(--color-hmi-j2)' },
    { key: 'v2d', name: useDegrees ? 'θ̇2 Desired (°/s)' : 'θ̇2 Desired (rad/s)', stroke: 'var(--color-hmi-j2-des)', strokeDasharray: '4 2' },
  ]

  return (
    <UniversalTimeSeriesChart
      data={data}
      series={series}
      yLabel={useDegrees ? 'θ̇ (°/s)' : 'θ̇ (rad/s)'}
      isEmpty={data.length === 0}
      msg="No velocity telemetry — run a move to capture data"
      width={width}
      height={height}
      hiddenSeries={hidden}
      onLegendClick={(key) => setHidden(prev => ({ ...prev, [key]: !prev[key] }))}
    />
  )
}

export function J1EncoderVelocityChart({
  dBuf,
  useDegrees = false,
  width,
  height,
}: {
  dBuf: DSample[]
  useDegrees?: boolean
  width?: number
  height?: number
}) {
  const { state } = useHMISlow()
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const r2d = 180 / Math.PI
  const scale = useDegrees ? r2d : 1

  const firstT = dBuf[0]?.t ?? 0

  const tf = useMemo(() => {
    if (!state.currentMove) return null
    const { x0, y0, xf, yf } = state.currentMove
    const dx = (xf - x0) / 1000
    const dy = (yf - y0) / 1000
    const D = Math.sqrt(dx * dx + dy * dy)
    if (D < 0.001) return 0

    const V_MAX = state.params?.vmax ?? 0.1
    const A_MAX = state.params?.amax ?? 0.5
    const trapEnabled = state.params?.trapEnabled ?? true

    if (trapEnabled) {
      let ta = V_MAX / A_MAX
      let da = 0.5 * A_MAX * ta * ta
      let tc = 0
      if (2 * da > D) {
        ta = Math.sqrt(D / A_MAX)
        tc = 0
      } else {
        tc = (D - 2 * da) / V_MAX
      }
      return 2 * ta + tc
    } else {
      return D / V_MAX
    }
  }, [state.currentMove, state.params])

  const data = useMemo(() => {
    let filteredBuf = dBuf
    if (tf !== null && tf > 0) {
      const cutoffMs = firstT + tf * 1.05 * 1000
      filteredBuf = dBuf.filter(d => d.t <= cutoffMs)
    }

    const sampled = downsample(filteredBuf, 500)
    return sampled.map(d => ({
      t: (d.t - firstT) / 1000,
      v1: d.dth1 * scale,
      v1_enc: (d.v1Enc ?? 0) * scale,
      enc_count: d.encCount ?? 0,
    }))
  }, [dBuf, firstT, scale, tf])

  const series: ChartSeries[] = [
    { key: 'v1', name: useDegrees ? 'J1 TD Velocity (°/s)' : 'J1 TD Velocity (rad/s)', stroke: 'var(--color-hmi-j1)' },
    { key: 'v1_enc', name: useDegrees ? 'J1 Encoder Velocity (°/s)' : 'J1 Encoder Velocity (rad/s)', stroke: 'var(--color-hmi-j2)', strokeDasharray: '4 2' },
  ]

  return (
    <UniversalTimeSeriesChart
      data={data}
      series={series}
      yLabel={useDegrees ? 'Velocity (°/s)' : 'Velocity (rad/s)'}
      isEmpty={data.length === 0}
      msg="No velocity telemetry — run a move to capture data"
      width={width}
      height={height}
      hiddenSeries={hidden}
      onLegendClick={(key) => setHidden(prev => ({ ...prev, [key]: !prev[key] }))}
      tooltipValueFormatter={(v, name, item) => {
        if (typeof v !== 'number') return v;
        if (name.includes('Encoder')) {
          const count = item.payload.enc_count;
          return `${v.toFixed(4)} (Count: ${count})`;
        }
        return v.toFixed(4);
      }}
    />
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

interface Peak {
  index: number
  t: number
  val: number
}

// Simple peak detector with a minimum height difference constraint for noise rejection
function findPeaks(times: number[], values: number[], minHeightDiff = 0.002): Peak[] {
  const peaks: Peak[] = []
  if (values.length < 3) return peaks

  for (let i = 1; i < values.length - 1; i++) {
    const prev = values[i - 1]
    const curr = values[i]
    const next = values[i + 1]

    if (curr > prev && curr > next) {
      peaks.push({ index: i, t: times[i], val: curr })
    }
  }

  return peaks
}

export function calculateCaliperDiagnostics(
  activeTab: 'cte' | 'ate' | 'pos' | 'vel' | 'pid' | 'j1ctrl' | 'j2vel',
  rawData: any[],
  ptA: any | null,
  ptB: any | null,
  angularUnit: string,
  params?: any
) {
  if (!ptA || !ptB || rawData.length === 0) return null

  const tStart = Math.min(ptA.t, ptB.t)
  const tEnd = Math.max(ptA.t, ptB.t)

  const windowData = rawData.filter(d => d.t >= tStart && d.t <= tEnd)
  if (windowData.length < 2) return null

  const dt = tEnd - tStart
  const results: Record<string, any> = {}

  if (activeTab === 'pos' || activeTab === 'vel') {
    const isPos = activeTab === 'pos'
    const scale = angularUnit === 'degrees' ? 180 / Math.PI : 1
    const targetThreshold = isPos ? (angularUnit === 'degrees' ? 0.05 : 0.001) : 0.05

    const joints = [
      {
        id: 1,
        yKey: isPos ? 'th1' : 'v1',
        yTargetKey: isPos ? 'th1d' : 'v1d',
        name: isPos ? 'Joint 1' : 'Joint 1 Vel',
        unit: isPos ? (angularUnit === 'degrees' ? '°' : 'rad') : (angularUnit === 'degrees' ? '°/s' : 'rad/s')
      },
      {
        id: 2,
        yKey: isPos ? 'th2' : 'v2',
        yTargetKey: isPos ? 'th2d' : 'v2d',
        name: isPos ? 'Joint 2' : 'Joint 2 Vel',
        unit: isPos ? (angularUnit === 'degrees' ? '°' : 'rad') : (angularUnit === 'degrees' ? '°/s' : 'rad/s')
      }
    ]

    for (const joint of joints) {
      const { yKey, yTargetKey, name, unit } = joint
      const vals = windowData.map(d => d[yKey])
      const targets = windowData.map(d => d[yTargetKey])
      const times = windowData.map(d => d.t)

      const yStartVal = vals[0]
      const yTargetStartVal = targets[0]
      const yTargetEndVal = targets[targets.length - 1]
      const stepChange = yTargetEndVal - yTargetStartVal

      const ssCount = Math.max(1, Math.floor(vals.length * 0.15))
      const ssVals = vals.slice(-ssCount)
      const ySS = ssVals.reduce((a, b) => a + b, 0) / ssCount
      const steadyStateError = Math.abs(ySS - yTargetEndVal)

      let metrics: any = {
        name,
        unit,
        stepDetected: false,
        yStart: yStartVal,
        yTarget: yTargetEndVal,
        ySS,
        steadyStateError
      }

      if (Math.abs(stepChange) > targetThreshold) {
        metrics.stepDetected = true
        metrics.stepChange = stepChange

        let stepIdx = 0
        for (let i = 0; i < targets.length; i++) {
          if (Math.abs(targets[i] - yTargetStartVal) > 0.05 * Math.abs(stepChange)) {
            stepIdx = i
            break
          }
        }
        const tStepStart = times[stepIdx]
        const yStartActual = vals[stepIdx]
        const h = ySS - yStartActual

        metrics.tStepStart = tStepStart

        let yPeak = yStartActual
        let peakIdx = stepIdx
        const isPositiveStep = stepChange > 0

        for (let i = stepIdx; i < vals.length; i++) {
          if (isPositiveStep) {
            if (vals[i] > yPeak) {
              yPeak = vals[i]
              peakIdx = i
            }
          } else {
            if (vals[i] < yPeak) {
              yPeak = vals[i]
              peakIdx = i
            }
          }
        }

        const tPeak = times[peakIdx]
        const peakTime = tPeak - tStepStart
        const overshootVal = isPositiveStep ? Math.max(0, yPeak - ySS) : Math.max(0, ySS - yPeak)
        const overshootPct = Math.abs(h) > 0.001 ? (overshootVal / Math.abs(h)) * 100 : 0

        metrics.yPeak = yPeak
        metrics.peakTime = peakTime
        metrics.overshootVal = overshootVal
        metrics.overshootPct = overshootPct

        const y10 = yStartActual + 0.1 * h
        const y90 = yStartActual + 0.9 * h
        let idx10 = -1
        let idx90 = -1

        for (let i = stepIdx; i < vals.length; i++) {
          if (isPositiveStep) {
            if (idx10 === -1 && vals[i] >= y10) idx10 = i
            if (idx90 === -1 && vals[i] >= y90) idx90 = i
          } else {
            if (idx10 === -1 && vals[i] <= y10) idx10 = i
            if (idx90 === -1 && vals[i] <= y90) idx90 = i
          }
        }

        const t10 = idx10 !== -1 ? times[idx10] : tStepStart
        const t90 = idx90 !== -1 ? times[idx90] : tEnd
        metrics.riseTime = Math.max(0, t90 - t10)

        let idxSettle2 = -1
        const tol2 = 0.02 * Math.abs(h)
        for (let i = vals.length - 1; i >= stepIdx; i--) {
          if (Math.abs(vals[i] - ySS) > tol2) {
            idxSettle2 = i
            break
          }
        }
        metrics.settlingTime2 = idxSettle2 !== -1 ? Math.max(0, times[idxSettle2] - tStepStart) : 0

        let idxSettle5 = -1
        const tol5 = 0.05 * Math.abs(h)
        for (let i = vals.length - 1; i >= stepIdx; i--) {
          if (Math.abs(vals[i] - ySS) > tol5) {
            idxSettle5 = i
            break
          }
        }
        metrics.settlingTime5 = idxSettle5 !== -1 ? Math.max(0, times[idxSettle5] - tStepStart) : 0

        if (overshootPct > 0.5 && peakTime > 0) {
          const OS = overshootPct / 100
          const lnOS = Math.log(OS)
          const zeta = -lnOS / Math.sqrt(Math.PI * Math.PI + lnOS * lnOS)
          metrics.zeta = zeta

          if (zeta < 1) {
            const omegaD = Math.PI / peakTime
            const omegaN = omegaD / Math.sqrt(1 - zeta * zeta)
            metrics.fn = omegaN / (2 * Math.PI)
          }
        }
      } else {
        const pks = findPeaks(times, vals)
        if (pks.length >= 2) {
          let totalPeakDt = 0
          for (let i = 1; i < pks.length; i++) {
            totalPeakDt += pks[i].t - pks[i - 1].t
          }
          const avgPeakDt = totalPeakDt / (pks.length - 1)
          metrics.oscillationFreq = 1 / avgPeakDt

          if (pks.length >= 2) {
            const pk1 = Math.abs(pks[0].val - ySS)
            const pk2 = Math.abs(pks[pks.length - 1].val - ySS)
            if (pk1 > 0.001 && pk2 > 0.001 && pk1 > pk2) {
              const numCycles = pks.length - 1
              const delta = (1 / numCycles) * Math.log(pk1 / pk2)
              const zeta = delta / Math.sqrt(4 * Math.PI * Math.PI + delta * delta)
              metrics.zeta = zeta
            }
          }
        }
      }

      results[yKey] = metrics
    }
  } else if (activeTab === 'cte' || activeTab === 'ate') {
    const errorKey = activeTab === 'cte' ? 'cte' : 'ate'
    const name = activeTab === 'cte' ? 'Cross Tracking Error' : 'Along Tracking Error'
    const errors = windowData.map(d => d[errorKey])
    const times = windowData.map(d => d.t)

    const absErrors = errors.map(Math.abs)
    const maxError = Math.max(...absErrors)
    const mae = absErrors.reduce((a, b) => a + b, 0) / errors.length
    const rmse = Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / errors.length)

    let iae = 0
    let itae = 0
    for (let i = 1; i < windowData.length; i++) {
      const segDt = times[i] - times[i - 1]
      const eAvg = (absErrors[i] + absErrors[i - 1]) / 2
      iae += eAvg * segDt
      const tMid = ((times[i] - tStart) + (times[i - 1] - tStart)) / 2
      itae += tMid * eAvg * segDt
    }

    results[errorKey] = { name, maxError, mae, rmse, iae, itae }
  } else if (activeTab === 'pid' || activeTab === 'j1ctrl' || activeTab === 'j2vel') {
    let effortKeys: { key: string; name: string }[] = []
    if (activeTab === 'pid') {
      effortKeys = [
        { key: 'p1_out', name: 'P Out' },
        { key: 'i1_out', name: 'I Out' },
        { key: 'd1_out', name: 'D Out' }
      ]
    } else if (activeTab === 'j1ctrl') {
      effortKeys = [
        { key: 'pid1_total', name: 'PID Total' },
        { key: 'ff1_contrib', name: 'FF Contrib' },
        { key: 'vff1', name: 'Velocity FF' },
        { key: 'pwm1_adj', name: 'PWM Adj' }
      ]
    } else if (activeTab === 'j2vel') {
      effortKeys = [
        { key: 'omega2_raw', name: 'Total ω2' },
        { key: 'p_out', name: 'P Out' },
        { key: 'd_out', name: 'D Out' },
        { key: 'integral2', name: 'I Out' },
        { key: 'delta_omega_ff', name: 'FF Contrib' }
      ]
    }

    for (const item of effortKeys) {
      const { key, name } = item
      const vals = windowData.map(d => d[key]).filter(v => typeof v === 'number' && !isNaN(v))
      if (vals.length < 2) continue

      const minVal = Math.min(...vals)
      const maxVal = Math.max(...vals)
      const p2p = maxVal - minVal
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length
      const std = Math.sqrt(vals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / vals.length)
      const variance = std * std

      const isPWM = key === 'pwm1_adj' || key === 'pwm' || key === 'pwm1'
      const satLimit = isPWM ? 250 : 0.98
      const satCount = vals.filter(v => Math.abs(v) >= satLimit).length
      const saturationRate = (satCount / vals.length) * 100

      let totalVariation = 0
      for (let i = 1; i < vals.length; i++) {
        totalVariation += Math.abs(vals[i] - vals[i - 1])
      }
      const chatteringIndex = totalVariation / dt

      let switchCount = 0
      for (let i = 2; i < vals.length; i++) {
        const diff1 = vals[i] - vals[i - 1]
        const diff2 = vals[i - 1] - vals[i - 2]
        if (Math.sign(diff1) !== Math.sign(diff2) && Math.abs(diff1) > 0.0001 && Math.abs(diff2) > 0.0001) {
          switchCount++
        }
      }
      const switchingFreq = switchCount / dt

      results[key] = { name, minVal, maxVal, p2p, mean, std, variance, saturationRate, chatteringIndex, switchingFreq }
    }
  }

  return { tStart, tEnd, dt, results }
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
  activeTab: 'cte' | 'ate' | 'pos' | 'vel' | 'pid' | 'j1ctrl' | 'j2vel',
  dBuf: DSample[],
  tBuf: TPoint[],
  eBuf: any[],
  fBuf: any[],
  angularUnit: string,
  params?: any,
  gains?: any
): {
  rawData: any[]
  series: AnalyzerSeries[]
  yLabel: string
  defaultYDomain: [any, any]
} {
  if (dBuf.length === 0 && eBuf.length === 0 && fBuf.length === 0) {
    return { rawData: [], series: [], yLabel: '', defaultYDomain: ['auto', 'auto'] as [any, any] }
  }
  const firstT = dBuf.length > 0 ? dBuf[0].t : (eBuf.length > 0 ? eBuf[0].t : (fBuf.length > 0 ? fBuf[0].t : 0))

  switch (activeTab) {
    case 'cte': {
      const ctes = computeCTEList(tBuf)
      const rawData = tBuf.map((pt, i) => ({
        t: dBuf[i] ? (dBuf[i].t - firstT) / 1000 : i * 0.02,
        cte: ctes[i] ?? 0,
      }))
      const series = [
        { key: 'cte', name: 'Cross Tracking Error', stroke: 'var(--color-hmi-actual)', type: 'area' as const, fill: 'var(--color-hmi-actual)' }
      ]
      return { rawData, series, yLabel: 'CTE (mm)', defaultYDomain: [0, 'auto'] as [any, any] }
    }
    case 'ate': {
      const ates = computeATEList(tBuf)
      const rawData = tBuf.map((pt, i) => ({
        t: dBuf[i] ? (dBuf[i].t - firstT) / 1000 : i * 0.02,
        ate: ates[i] ?? 0,
      }))
      const series = [
        { key: 'ate', name: 'Along Tracking Error', stroke: 'var(--color-hmi-warn)', type: 'area' as const, fill: 'var(--color-hmi-warn)' }
      ]
      return { rawData, series, yLabel: 'ATE (mm)', defaultYDomain: ['auto', 'auto'] as [any, any] }
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
        { key: 'th1', name: 'θ1 Actual', stroke: 'var(--color-hmi-j1)', type: 'line' as const },
        { key: 'th1d', name: 'θ1 Desired', stroke: 'var(--color-hmi-j1-des)', type: 'line' as const, strokeDasharray: '4 2' },
        { key: 'th2', name: 'θ2 Actual', stroke: 'var(--color-hmi-j2)', type: 'line' as const },
        { key: 'th2d', name: 'θ2 Desired', stroke: 'var(--color-hmi-j2-des)', type: 'line' as const, strokeDasharray: '4 2' },
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
        { key: 'v1', name: 'θ̇1 Actual', stroke: 'var(--color-hmi-j1)', type: 'line' as const },
        { key: 'v1d', name: 'θ̇1 Desired', stroke: 'var(--color-hmi-j1-des)', type: 'line' as const, strokeDasharray: '4 2' },
        { key: 'v2', name: 'θ̇2 Actual', stroke: 'var(--color-hmi-j2)', type: 'line' as const },
        { key: 'v2d', name: 'θ̇2 Desired', stroke: 'var(--color-hmi-j2-des)', type: 'line' as const, strokeDasharray: '4 2' },
      ]
      const labelSuffix = angularUnit === 'degrees' ? '(°/s)' : '(rad/s)'
      return { rawData, series, yLabel: `Velocity ${labelSuffix}`, defaultYDomain: ['auto', 'auto'] as [any, any] }
    }
    case 'pid': {
      if (eBuf.length === 0) return { rawData: [], series: [], yLabel: '', defaultYDomain: ['auto', 'auto'] as [any, any] }
      const rawData = eBuf.map(e => ({
        t: (e.t - firstT) / 1000,
        p1_out: e.p1_out,
        i1_out: e.i1_out,
        d1_out: e.d1_out,
      }))
      const series = [
        { key: 'p1_out', name: 'P Out', stroke: 'var(--color-hmi-j1)', type: 'line' as const },
        { key: 'i1_out', name: 'I Out', stroke: 'var(--color-hmi-pwm-pos)', type: 'line' as const },
        { key: 'd1_out', name: 'D Out', stroke: 'var(--color-hmi-pwm-neg)', type: 'line' as const },
      ]
      return { rawData, series, yLabel: 'PID Output', defaultYDomain: ['auto', 'auto'] as [any, any] }
    }
    case 'j1ctrl': {
      if (dBuf.length === 0) return { rawData: [], series: [], yLabel: '', defaultYDomain: ['auto', 'auto'] as [any, any] }
      const u1max = params?.u1max ?? 1

      const x0 = tBuf && tBuf.length > 0 ? tBuf[0].xi : 0
      const y0 = tBuf && tBuf.length > 0 ? tBuf[0].yi : 0
      const xf = tBuf && tBuf.length > 0 ? tBuf[tBuf.length - 1].xi : 0
      const yf = tBuf && tBuf.length > 0 ? tBuf[tBuf.length - 1].yi : 0

      const dx = (xf - x0) / 1000
      const dy = (yf - y0) / 1000
      const traj_D = Math.sqrt(dx * dx + dy * dy)

      const vmax = params?.vmax ?? 0.5
      const amax = params?.amax ?? 2.0
      const trapEnabled = params?.trapEnabled ?? true

      let traj_ta = 0
      if (traj_D >= 0.001) {
        if (trapEnabled) {
          const ta = vmax / amax
          const da = 0.5 * amax * ta * ta
          if (2.0 * da > traj_D) {
            traj_ta = Math.sqrt(traj_D / amax)
          } else {
            traj_ta = ta
          }
        } else {
          traj_ta = 0
        }
      }

      const rawData = dBuf.map(d => {
        const t_traj = (d.t - firstT) / 1000
        const is_moving = true

        let active_frac_thresh = params?.fzt ?? 0.04
        if (params?.kickstartEnabled && is_moving && t_traj <= traj_ta) {
          active_frac_thresh = (params?.fzt ?? 0.04) * (params?.fztKickPct ?? 0.1)
        }

        const pwmDb = params?.pwmDb ?? 68
        const dbAmp = 21.0 * (pwmDb / 68.0)
        const s = Math.sin(d.th1)
        let dynamicDbHold = Math.round(pwmDb + dbAmp * s * s)
        dynamicDbHold = Math.max(0, Math.min(255, dynamicDbHold))

        let dynamicDb = dynamicDbHold
        if (params?.dbMovingEnabled && is_moving && t_traj > traj_ta) {
          dynamicDb = Math.round(dynamicDbHold * (params?.dbEngageScale ?? 0.75))
          dynamicDb = Math.max(0, Math.min(255, dynamicDb))
        }

        const mag = Math.abs(d.pwm1)
        let pwm1_adj = 0
        if (mag > 0) {
          const frac_eff = (255 > dynamicDb) ? Math.min(1.0, Math.max(0.0, (mag - dynamicDb) / (255 - dynamicDb))) : 0
          const frac_abs = frac_eff * (1.0 - active_frac_thresh) + active_frac_thresh
          pwm1_adj = Math.sign(d.pwm1) * frac_abs
        }

        const u1_total = d.u1Total / u1max

        let ff1_contrib = 0
        if (fBuf && fBuf.length > 0) {
          let bestF = fBuf[0], minDiff = Infinity
          for (const f of fBuf) {
            const diff = Math.abs(f.t - d.t)
            if (diff < minDiff) { minDiff = diff; bestF = f } else break
          }
          ff1_contrib = bestF.ff1Contrib / u1max
        }

        // PID-only contribution: u1_total minus the CTC feedforward and velocity feedforward terms
        const vff1 = (d.vff1 ?? 0) / u1max
        const pid1_total = u1_total - ff1_contrib - vff1

        return {
          t: (d.t - firstT) / 1000,
          pid1_total,
          ff1_contrib,
          vff1,
          pwm1_adj,
        }
      })

      const series = [
        { key: 'pid1_total', name: 'PID Total / u1max', stroke: 'var(--color-hmi-pwm-pos)', type: 'line' as const },
        { key: 'ff1_contrib', name: 'FF Contribution', stroke: 'var(--color-hmi-ideal)', type: 'line' as const, strokeDasharray: '3 3' },
        { key: 'vff1', name: 'Velocity FF', stroke: 'var(--color-hmi-pwm-neg)', type: 'line' as const, strokeDasharray: '5 2' },
        { key: 'pwm1_adj', name: 'PWM / 255', stroke: 'var(--color-hmi-j1)', type: 'line' as const },
      ]
      return { rawData, series, yLabel: 'Fraction of max', defaultYDomain: ['auto', 'auto'] as [any, any] }
    }
    case 'j2vel': {
      if (fBuf.length === 0) return { rawData: [], series: [], yLabel: '', defaultYDomain: ['auto', 'auto'] as [any, any] }
      const kp2 = gains?.kp2 ?? 0
      const kd2 = gains?.kd2 ?? 0
      const rawData = fBuf.map(f => {
        let bestD = null, minDiff = Infinity
        for (const d of dBuf) {
          const diff = Math.abs(d.t - f.t)
          if (diff < minDiff) { minDiff = diff; bestD = d } else break
        }
        return {
          t: (f.t - firstT) / 1000,
          omega2_raw: f.omega2Raw,
          delta_omega_ff: f.deltaOmegaFf,
          p_out: bestD ? kp2 * bestD.e2 : 0,
          d_out: bestD ? -kd2 * bestD.dth2 : 0,
          integral2: f.integral2,
        }
      })
      const series = [
        { key: 'omega2_raw', name: 'Total ω2 Command', stroke: 'var(--color-hmi-j2)', type: 'line' as const },
        { key: 'p_out', name: 'J2 P Out', stroke: 'var(--color-hmi-j1)', type: 'line' as const },
        { key: 'd_out', name: 'J2 D Out', stroke: 'var(--color-hmi-pwm-neg)', type: 'line' as const },
        { key: 'integral2', name: 'J2 I Out', stroke: 'var(--color-hmi-error)', type: 'line' as const, strokeDasharray: '4 2' },
        { key: 'delta_omega_ff', name: 'J2 FF Contrib', stroke: 'var(--color-hmi-ideal)', type: 'line' as const, strokeDasharray: '3 3' },
      ]
      return { rawData, series, yLabel: 'Velocity (rad/s)', defaultYDomain: ['auto', 'auto'] as [any, any] }
    }
  }
}

// Industrial grade analysis console component
function AdvancedAnalyzer({
  activeTab,
  dBuf,
  tBuf,
  eBuf,
  fBuf,
  angularUnit,
  params,
  gains,
}: {
  activeTab: 'cte' | 'ate' | 'pos' | 'vel' | 'pid' | 'j1ctrl' | 'j2vel'
  dBuf: DSample[]
  tBuf: TPoint[]
  eBuf: any[]
  fBuf: any[]
  angularUnit: string
  params: any
  gains: any
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
    return prepareAnalyzerData(activeTab, dBuf, tBuf, eBuf, fBuf, angularUnit, params, gains)
  }, [activeTab, dBuf, tBuf, eBuf, fBuf, angularUnit, params, gains])

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

  const caliperDiagnostics = useMemo(() => {
    return calculateCaliperDiagnostics(
      activeTab,
      rawData,
      caliperPoints.ptA,
      caliperPoints.ptB,
      angularUnit,
      params
    )
  }, [activeTab, rawData, caliperPoints.ptA, caliperPoints.ptB, angularUnit, params])

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
    
    if ((activeTab as string) === 'pwm' && yZoomFactor === 1.0) {
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

  const refLines = []
  if (cursorA !== null) {
    refLines.push({
      x: cursorA,
      stroke: "#2196F3",
      strokeDasharray: "3 3",
      strokeOpacity: 1.0,
      label: { value: 'Caliper A', fill: '#2196F3', position: 'top' as const, fontSize: 10, fontWeight: 'bold' }
    })
  }
  if (cursorB !== null) {
    refLines.push({
      x: cursorB,
      stroke: "#FF9800",
      strokeDasharray: "3 3",
      strokeOpacity: 1.0,
      label: { value: 'Caliper B', fill: '#FF9800', position: 'top' as const, fontSize: 10, fontWeight: 'bold' }
    })
  }

  const refArea = refAreaLeft !== null && refAreaRight !== null ? {
    x1: refAreaLeft,
    x2: refAreaRight,
    fill: "#06B6D4",
    fillOpacity: 0.15,
    stroke: "#06B6D4",
    strokeOpacity: 0.3
  } : undefined

  return (
    <div className="flex flex-col h-full w-full min-h-0 overflow-hidden font-sans">
      {/* 1. Analyzer Toolbar Controls */}
      <div className="flex flex-wrap items-center gap-3 py-2 border-b border-hmi-grid/60 bg-hmi-elevated/10 px-1 mb-3 text-xs shrink-0 select-none">
        
        {/* Interaction Tool Selector */}
        <div className="flex items-center gap-1 bg-hmi-bg p-1 rounded border border-hmi-grid">
          <span className="text-[10px] text-hmi-muted uppercase tracking-wider font-semibold px-1.5 mr-1">Tool:</span>
          <Button
            type="button"
            variant={activeTool === 'zoom' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-2.5 text-xs rounded flex items-center gap-1 cursor-pointer"
            onClick={() => setActiveTool('zoom')}
          >
            <ZoomIn className="h-3 w-3" />
            Zoom
          </Button>
          <Button
            type="button"
            variant={activeTool === 'cursor' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-2.5 text-xs rounded flex items-center gap-1 cursor-pointer"
            onClick={() => setActiveTool('cursor')}
          >
            📐 Calipers
          </Button>
          <Button
            type="button"
            variant={activeTool === 'pan' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-2.5 text-xs rounded flex items-center gap-1 cursor-pointer"
            onClick={() => setActiveTool('pan')}
          >
            <Hand className="h-3 w-3" />
            Pan
          </Button>
        </div>

        {/* Quick Zoom Fit & Scale Buttons */}
        <div className="flex items-center gap-1 bg-hmi-bg p-1 rounded border border-hmi-grid">
          <span className="text-[10px] text-hmi-muted uppercase tracking-wider font-semibold px-1.5 mr-1">Scaling:</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-8 text-xs hover:bg-hmi-btn-hover cursor-pointer"
            onClick={() => zoomTimeAxis(0.8)}
            title="Zoom In X (Time)"
          >
            X+
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-8 text-xs hover:bg-hmi-btn-hover cursor-pointer"
            onClick={() => zoomTimeAxis(1.25)}
            title="Zoom Out X (Time)"
          >
            X-
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-8 text-xs hover:bg-hmi-btn-hover cursor-pointer"
            onClick={() => setYZoomFactor(prev => prev * 0.8)}
            title="Zoom In Y (Amplitude)"
          >
            Y+
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-8 text-xs hover:bg-hmi-btn-hover cursor-pointer"
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
            className="h-6 px-2 text-xs font-semibold text-hmi-ideal hover:bg-hmi-btn-hover flex items-center gap-1 cursor-pointer"
            onClick={handleDoubleClick}
          >
            <RefreshCw className="h-2.5 w-2.5" />
            Reset Zoom
          </Button>
        </div>

        {/* Caliper Configuration Mode */}
        {activeTool === 'cursor' && (
          <div className="flex items-center gap-1 bg-hmi-bg p-1 rounded border border-hmi-grid animate-tooltip-left">
            <span className="text-[10px] text-hmi-muted uppercase tracking-wider font-semibold px-1.5">Caliper:</span>
            <Button
              type="button"
              variant={activeCursor === 'A' ? 'default' : 'ghost'}
              size="sm"
              className={cn(
                "h-6 px-2 text-[10px] rounded border transition-all cursor-pointer", 
                activeCursor === 'A' 
                  ? "bg-hmi-j1/15 border-hmi-j1 text-hmi-j1 font-bold" 
                  : "border-hmi-grid text-hmi-muted hover:text-hmi-text hover:bg-hmi-btn-hover"
              )}
              onClick={() => setActiveCursor('A')}
            >
              Set A
            </Button>
            <Button
              type="button"
              variant={activeCursor === 'B' ? 'default' : 'ghost'}
              size="sm"
              className={cn(
                "h-6 px-2 text-[10px] rounded border transition-all cursor-pointer", 
                activeCursor === 'B' 
                  ? "bg-hmi-j2/15 border-hmi-j2 text-hmi-j2 font-bold" 
                  : "border-hmi-grid text-hmi-muted hover:text-hmi-text hover:bg-hmi-btn-hover"
              )}
              onClick={() => setActiveCursor('B')}
            >
              Set B
            </Button>
            <div className="w-px h-4 bg-hmi-grid mx-1" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] text-hmi-text-secondary hover:text-hmi-text cursor-pointer"
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
        <div className="flex items-center gap-2 ml-auto bg-hmi-bg/60 p-1 rounded border border-hmi-grid text-[11px] text-hmi-text-secondary">
          <span className="select-none pl-1">Grid:</span>
          <input
            type="range"
            min="0.01"
            max="0.25"
            step="0.01"
            value={gridDensity}
            onChange={(e) => setGridDensity(parseFloat(e.target.value))}
            className="w-16 h-1 cursor-pointer accent-hmi-ideal bg-hmi-btn rounded-lg appearance-none"
          />
          <span className="w-8 font-mono text-[10px] text-hmi-muted text-right pr-1">{(gridDensity * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* 2. Main content area (Split layout with Recharts left and diagnostics panel right) */}
      <div className="flex-1 min-h-0 w-full flex gap-4 overflow-hidden">
        
        {/* Left: Recharts interactive screen */}
        <div className="flex-1 min-h-0 bg-hmi-bg/30 border border-hmi-grid rounded-lg p-4 relative flex flex-col justify-center select-none overflow-hidden">
          <UniversalTimeSeriesChart
            data={displayData}
            series={series.map(s => ({
              ...s,
              type: s.type || 'line',
              strokeWidth: 1.75
            }))}
            xAxisKey="t"
            xDomain={[zoomLeft, zoomRight]}
            yDomain={yDomain}
            yLabel={yLabel}
            referenceLines={refLines}
            referenceArea={refArea}
            isEmpty={displayData.length === 0}
            msg="No telemetry samples in active buffer"
            gridDensity={gridDensity}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onDoubleClick={handleDoubleClick}
            cursorStyle={activeTool === 'pan' ? 'grab' : 'crosshair'}
            hiddenSeries={hiddenSeries}
            onLegendClick={(key) => setHiddenSeries(prev => ({ ...prev, [key]: !prev[key] }))}
          />
        </div>

        {/* Right: Analyzer Diagnostics Panel Sidebar */}
        <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto pr-1">
          {/* Signal visibility configuration checklist */}
          <div className="border border-hmi-grid bg-hmi-elevated/40 rounded-lg p-3">
            <h3 className="text-xs font-bold text-hmi-text-secondary uppercase tracking-wider mb-2 select-none border-b border-hmi-grid/50 pb-1.5">
              Visible Signals
            </h3>
            <div className="flex flex-col gap-2">
              {series.map(s => (
                <label key={s.key} className="flex items-center gap-2.5 text-xs text-hmi-text cursor-pointer hover:bg-hmi-btn-hover/30 py-0.5 rounded">
                  <input
                    type="checkbox"
                    checked={!hiddenSeries[s.key]}
                    onChange={() => setHiddenSeries(prev => ({ ...prev, [s.key]: !prev[s.key] }))}
                    className="rounded border-hmi-grid bg-hmi-bg text-hmi-ideal focus:ring-hmi-ideal focus:ring-offset-hmi-bg"
                  />
                  <span className="w-3 h-3 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: s.stroke }} />
                  <span className="font-medium truncate">{s.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Caliper delta and amplitude measurements */}
          <div className="border border-hmi-grid bg-hmi-elevated/40 rounded-lg p-3">
            <h3 className="text-xs font-bold text-hmi-text-secondary uppercase tracking-wider mb-2 select-none border-b border-hmi-grid/50 pb-1.5 flex justify-between items-center">
              Caliper Measurements
              {activeTool !== 'cursor' && (
                <span className="text-[9px] text-hmi-muted normal-case font-normal">Enable Calipers to place</span>
              )}
            </h3>
            {caliperPoints.ptA || caliperPoints.ptB ? (
              <div className="flex flex-col gap-3 font-mono text-[11px]">
                
                {/* Caliper Time values */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 bg-hmi-bg/40 p-2 rounded border border-hmi-grid/30">
                  <div>
                    <span className="text-[10px] text-hmi-muted font-sans block">Time (A):</span>
                    <span className="text-hmi-j1 font-medium">
                      {caliperPoints.ptA ? `${caliperPoints.ptA.t.toFixed(4)} s` : '--'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-hmi-muted font-sans block">Time (B):</span>
                    <span className="text-hmi-j2 font-medium">
                      {caliperPoints.ptB ? `${caliperPoints.ptB.t.toFixed(4)} s` : '--'}
                    </span>
                  </div>
                  {caliperPoints.ptA && caliperPoints.ptB && (
                    <div className="col-span-2 border-t border-hmi-grid/30 pt-1.5 mt-1 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-hmi-muted font-sans block">Delta Time (Δt):</span>
                        <span className="text-hmi-text-success font-medium text-xs">
                          {Math.abs(caliperPoints.ptB.t - caliperPoints.ptA.t).toFixed(4)} s
                        </span>
                      </div>
                      {Math.abs(caliperPoints.ptB.t - caliperPoints.ptA.t) > 0 && (
                        <div className="text-right">
                          <span className="text-[10px] text-hmi-muted font-sans block">Frequency (1/Δt):</span>
                          <span className="text-hmi-text-purple font-semibold text-xs">
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
                      <div key={s.key} className="p-2 rounded border border-hmi-grid/20 bg-hmi-elevated/30 flex flex-col gap-0.5 animate-tooltip-left">
                        <span className="text-[10px] text-hmi-text-secondary font-sans truncate font-medium block">
                          {s.name}
                        </span>
                        <div className="grid grid-cols-3 text-center gap-1 font-mono mt-1">
                          <div className="text-left">
                            <span className="text-[9px] text-hmi-muted block">Y(A)</span>
                            <span className="text-hmi-j1 font-medium text-[10px]">
                              {valA !== null ? valA.toFixed(3) : '--'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[9px] text-hmi-muted block">Y(B)</span>
                            <span className="text-hmi-j2 font-medium text-[10px]">
                              {valB !== null ? valB.toFixed(3) : '--'}
                            </span>
                          </div>
                          <div className="text-right border-l border-hmi-grid/20">
                            <span className="text-[9px] text-hmi-muted block">ΔY</span>
                            <span className={cn(
                              "font-medium text-[10px]",
                              diff !== null && diff > 0 ? "text-hmi-text-success" : diff !== null && diff < 0 ? "text-hmi-text-error" : "text-hmi-text-secondary"
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
              <p className="text-[11px] text-hmi-muted font-sans italic leading-relaxed">
                Select Calipers tool and click at two distinct times along the horizontal axis to measure settling oscillations or overshoot ratios.
              </p>
            )}
          </div>

          {/* Context-aware Control Systems Analysis */}
          {caliperPoints.ptA && caliperPoints.ptB && caliperDiagnostics && (
            <div className="border border-hmi-grid bg-hmi-elevated/40 rounded-lg p-3">
              <h3 className="text-xs font-bold text-hmi-ideal uppercase tracking-wider mb-2 select-none border-b border-hmi-grid/50 pb-1.5">
                {activeTab === 'pos' || activeTab === 'vel' ? '📐 Control Systems Analysis' :
                 activeTab === 'cte' || activeTab === 'ate' ? '📐 Tracking Performance' :
                 '📐 Actuator Dynamics'}
              </h3>
              <div className="flex flex-col gap-3 font-mono text-[11px]">
                {/* POSITION/VELOCITY SPECIFIC UI */}
                {(activeTab === 'pos' || activeTab === 'vel') && (() => {
                  const keys = activeTab === 'pos' ? ['th1', 'th2'] : ['v1', 'v2']
                  return keys.map(k => {
                    if (hiddenSeries[k]) return null
                    const m = caliperDiagnostics.results[k]
                    if (!m) return null

                    return (
                      <div key={k} className="p-2 rounded border border-hmi-grid/20 bg-hmi-elevated/30 flex flex-col gap-1.5 animate-tooltip-left">
                        <span className="text-[10px] text-hmi-text-secondary font-sans font-semibold block border-b border-hmi-grid/10 pb-0.5 mb-1 text-hmi-ideal">
                          {m.name}
                        </span>
                        {m.stepDetected ? (
                          <div className="grid grid-cols-2 gap-y-1.5 gap-x-2">
                            <div className="col-span-2 text-[9px] text-emerald-400 font-sans font-semibold">
                              ✓ Target Step Response ({m.stepChange > 0 ? '+' : ''}{m.stepChange.toFixed(2)}{m.unit})
                            </div>
                            <div>
                              <span className="text-[9px] text-hmi-muted font-sans block">Rise Time (Tr):</span>
                              <span className="text-hmi-text font-medium">{m.riseTime.toFixed(4)} s</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-hmi-muted font-sans block">Settling (2%):</span>
                              <span className="text-hmi-text font-medium">{m.settlingTime2.toFixed(4)} s</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-hmi-muted font-sans block">Max Overshoot:</span>
                              <span className={cn("font-semibold", m.overshootPct > 5 ? "text-hmi-text-warning" : "text-hmi-text-success")}>
                                {m.overshootPct.toFixed(2)}% ({m.overshootVal.toFixed(2)}{m.unit})
                              </span>
                            </div>
                            <div>
                              <span className="text-[9px] text-hmi-muted font-sans block">Peak Time (Tp):</span>
                              <span className="text-hmi-text font-medium">{m.peakTime.toFixed(4)} s</span>
                            </div>
                            {m.zeta !== undefined && (
                              <div>
                                <span className="text-[9px] text-hmi-muted font-sans block">Damping (ζ):</span>
                                <span className="text-hmi-text-success font-medium">{m.zeta.toFixed(3)}</span>
                              </div>
                            )}
                            {m.fn !== undefined && (
                              <div>
                                <span className="text-[9px] text-hmi-muted font-sans block">Nat Freq (fn):</span>
                                <span className="text-hmi-text-purple font-semibold">{m.fn.toFixed(2)} Hz</span>
                              </div>
                            )}
                            <div className="col-span-2 border-t border-hmi-grid/10 pt-1 mt-0.5">
                              <span className="text-[9px] text-hmi-muted font-sans block">Steady Error (ess):</span>
                              <span className="text-hmi-text font-medium text-xs">{m.steadyStateError.toFixed(5)}{m.unit}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-y-1.5 gap-x-2">
                            <div className="col-span-2 text-[9px] text-hmi-muted font-sans italic">
                              No target step transition
                            </div>
                            <div>
                              <span className="text-[9px] text-hmi-muted font-sans block">Steady Error (ess):</span>
                              <span className="text-hmi-text font-medium">{m.steadyStateError.toFixed(5)}{m.unit}</span>
                            </div>
                            {m.oscillationFreq !== undefined && (
                              <>
                                <div>
                                  <span className="text-[9px] text-hmi-muted font-sans block">Oscillation Freq:</span>
                                  <span className="text-hmi-text-purple font-semibold">{m.oscillationFreq.toFixed(2)} Hz</span>
                                </div>
                                {m.zeta !== undefined && (
                                  <div>
                                    <span className="text-[9px] text-hmi-muted font-sans block">Est. Damping (ζ):</span>
                                    <span className="text-hmi-text-success font-medium">{m.zeta.toFixed(3)}</span>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                })()}

                {/* ERROR METRICS SPECIFIC UI */}
                {(activeTab === 'cte' || activeTab === 'ate') && (() => {
                  const key = activeTab === 'cte' ? 'cte' : 'ate'
                  const m = caliperDiagnostics.results[key]
                  if (!m) return null

                  return (
                    <div className="p-2 rounded border border-hmi-grid/20 bg-hmi-elevated/30 flex flex-col gap-1.5 animate-tooltip-left">
                      <span className="text-[10px] text-hmi-text-secondary font-sans font-semibold block border-b border-hmi-grid/10 pb-0.5 mb-1 text-hmi-ideal">
                        {m.name}
                      </span>
                      <div className="grid grid-cols-2 gap-y-1.5 gap-x-2">
                        <div>
                          <span className="text-[9px] text-hmi-muted font-sans block">Max Abs Error:</span>
                          <span className="text-hmi-text-error font-medium">{m.maxError.toFixed(4)} mm</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-hmi-muted font-sans block">RMSE value:</span>
                          <span className="text-hmi-text font-medium">{m.rmse.toFixed(4)} mm</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-hmi-muted font-sans block">Mean Abs Error:</span>
                          <span className="text-hmi-text font-medium">{m.mae.toFixed(4)} mm</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-hmi-muted font-sans block">IAE (∫|e| dt):</span>
                          <span className="text-hmi-text font-medium">{m.iae.toFixed(4)} mm·s</span>
                        </div>
                        <div className="col-span-2 border-t border-hmi-grid/10 pt-1 mt-0.5">
                          <span className="text-[9px] text-hmi-muted font-sans block">ITAE (∫t|e| dt):</span>
                          <span className="text-hmi-text-purple font-semibold text-xs">{m.itae.toFixed(4)} mm·s²</span>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* PWM/ACTUATOR SPECIFIC UI */}
                {(activeTab === 'pid' || activeTab === 'j1ctrl' || activeTab === 'j2vel') && (() => {
                  const keys = Object.keys(caliperDiagnostics.results)
                  return keys.map(k => {
                    if (hiddenSeries[k]) return null
                    const m = caliperDiagnostics.results[k]
                    if (!m) return null

                    return (
                      <div key={k} className="p-2 rounded border border-hmi-grid/20 bg-hmi-elevated/30 flex flex-col gap-1.5 animate-tooltip-left">
                        <span className="text-[10px] text-hmi-text-secondary font-sans font-semibold block border-b border-hmi-grid/10 pb-0.5 mb-1 text-hmi-ideal">
                          {m.name}
                        </span>
                        <div className="grid grid-cols-2 gap-y-1 gap-x-2">
                          <div>
                            <span className="text-[9px] text-hmi-muted font-sans block">Peak-to-Peak:</span>
                            <span className="text-hmi-text font-medium">{m.p2p.toFixed(3)}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-hmi-muted font-sans block">Variance:</span>
                            <span className="text-hmi-text font-medium">{m.variance.toFixed(5)}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-hmi-muted font-sans block">Sat. Rate:</span>
                            <span className={cn("font-medium", m.saturationRate > 5 ? "text-hmi-text-error" : "text-hmi-text-secondary")}>
                              {m.saturationRate.toFixed(1)}%
                            </span>
                          </div>
                          <div>
                            <span className="text-[9px] text-hmi-muted font-sans block">Switch Freq:</span>
                            <span className="text-hmi-text font-medium">{m.switchingFreq.toFixed(2)} Hz</span>
                          </div>
                          <div className="col-span-2 border-t border-hmi-grid/10 pt-1 mt-0.5">
                            <span className="text-[9px] text-hmi-muted font-sans block">Chattering Index (TV):</span>
                            <span className="text-hmi-text-purple font-semibold text-xs">{m.chatteringIndex.toFixed(3)} unit/s</span>
                          </div>
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
          )}

          {/* Regional Window Statistics Dashboard */}
          <div className="border border-hmi-grid bg-hmi-elevated/40 rounded-lg p-3">
            <h3 className="text-xs font-bold text-hmi-text-secondary uppercase tracking-wider mb-2 select-none border-b border-hmi-grid/50 pb-1.5">
              Visible Window Stats
            </h3>
            <div className="flex flex-col gap-2 font-mono text-[11px]">
              {series.map(s => {
                if (hiddenSeries[s.key]) return null
                const stats = visibleStats[s.key]
                if (!stats) return null

                return (
                  <div key={s.key} className="p-2 rounded border border-hmi-grid/20 bg-hmi-elevated/30 animate-tooltip-left">
                    <span className="text-[10px] text-hmi-text-secondary font-sans truncate font-medium block border-b border-hmi-grid/10 pb-0.5 mb-1.5">
                      {s.name}
                    </span>
                    <div className="grid grid-cols-2 gap-y-1.5 gap-x-2">
                      <div>
                        <span className="text-[9px] text-hmi-muted font-sans block">Peak-to-Peak:</span>
                        <span className="text-hmi-text font-medium">{stats.p2p.toFixed(3)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-hmi-muted font-sans block">Mean (Average):</span>
                        <span className="text-hmi-text font-medium">{stats.mean.toFixed(3)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-hmi-muted font-sans block">RMS value:</span>
                        <span className="text-hmi-text font-medium">{stats.rms.toFixed(3)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-hmi-muted font-sans block">Std Dev (σ):</span>
                        <span className="text-hmi-text font-medium">{stats.std.toFixed(3)}</span>
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

const TAB_LABELS: Record<string, string> = {
  cte: 'CTE',
  ate: 'ATE',
  pos: 'Position',
  vel: 'Velocity',
  pid: 'PID',
  j1ctrl: 'J1 Ctrl',
  j2vel: 'J2 Vel',
}

export function ChartPanel() {
  const { state } = useHMI()
  const [isFocused, setIsFocused] = useState(false)
  const [angularUnit, setAngularUnit] = useState('radians')

  const CHART_TABS = ['cte', 'ate', 'pos', 'vel', 'pid', 'j1ctrl', 'j2vel'] as const
  type ChartTab = typeof CHART_TABS[number]

  const [activeTab, setActiveTabState] = useState<ChartTab>(() => {
    if (typeof window !== 'undefined') {
      const v = new URLSearchParams(window.location.search).get('chart')
      return (CHART_TABS.includes(v as ChartTab) ? v : 'cte') as ChartTab
    }
    return 'cte'
  })

  const setActiveTab = (tab: ChartTab) => {
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
  const eBufRef = useRef<any[]>([])
  const fBufRef = useRef<any[]>([])
  const [chartD, setChartD] = useState<DSample[]>(() =>
    state.recordingState === 'REC' ? state.dBuffer : state.frozenD
  )
  const [chartT, setChartT] = useState<TPoint[]>(() =>
    state.recordingState === 'REC' ? state.tBuffer : state.frozenT
  )
  const [chartE, setChartE] = useState<any[]>(() =>
    state.recordingState === 'REC' ? state.eBuffer : state.frozenE
  )
  const [chartF, setChartF] = useState<any[]>(() =>
    state.recordingState === 'REC' ? state.fBuffer : state.frozenF
  )

  // Always keep refs in sync with context (no re-render triggered)
  const liveDSource = isLive ? state.dBuffer : state.frozenD
  const liveTSource = isLive ? state.tBuffer : state.frozenT
  const liveESource = isLive ? state.eBuffer : state.frozenE
  const liveFSource = isLive ? state.fBuffer : state.frozenF
  dBufRef.current = liveDSource
  tBufRef.current = liveTSource
  eBufRef.current = liveESource
  fBufRef.current = liveFSource

  useEffect(() => {
    if (!isLive) {
      // Frozen: update once immediately
      setChartD(state.frozenD)
      setChartT(state.frozenT)
      setChartE(state.frozenE)
      setChartF(state.frozenF)
      return
    }
    // Live: throttle DOM updates to 5 Hz (200 ms)
    const id = setInterval(() => {
      setChartD([...dBufRef.current])
      setChartT([...tBufRef.current])
      setChartE([...eBufRef.current])
      setChartF([...fBufRef.current])
    }, 200)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, state.frozenD, state.frozenT, state.frozenE, state.frozenF])

  // aliases used by focused AdvancedAnalyzer (not throttled — only shown when frozen)
  const dBuf = isFocused ? liveDSource : chartD
  const tBuf = isFocused ? liveTSource : chartT
  const eBuf = isFocused ? liveESource : chartE
  const fBuf = isFocused ? liveFSource : chartF

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
        const nameMap: Record<string, string> = {
          cte: 'Cross Tracking Error Chart',
          ate: 'Along Tracking Error Chart',
          pos: 'Joint Position Chart',
          vel: 'Joint Velocity Chart',
        }
        const chartKey = activeTab
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
            <Badge className="bg-hmi-bg border border-hmi-grid text-hmi-text-secondary">
              {state.recordingState === 'REC' ? '🔴 Live stream' : '⏸ Sliced Run'}
            </Badge>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Quick tab switcher inside full screen analyzer */}
            <div className="flex items-center gap-1 bg-hmi-bg p-1 rounded-md border border-hmi-grid mr-4">
              {CHART_TABS.map(tab => (
                <Button
                  key={tab}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-7 px-3 text-xs rounded cursor-pointer",
                    activeTab === tab
                      ? "bg-hmi-btn text-hmi-text font-semibold shadow-sm"
                      : "text-hmi-muted hover:text-hmi-text"
                  )}
                  onClick={() => setActiveTab(tab)}
                >
                  {TAB_LABELS[tab]}
                </Button>
              ))}
            </div>

            <Button 
              variant="outline" 
              size="sm" 
              className="flex items-center gap-1 bg-hmi-btn hover:bg-hmi-btn-hover border-hmi-grid text-hmi-text-secondary hover:text-hmi-text h-8 cursor-pointer"
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

      
      <Tabs value={activeTab} onValueChange={(val: string) => setActiveTab(val as any)} className="flex flex-col flex-1 min-h-0">
        {!isFocused && (
          <TabsList className="rounded-none border-b border-hmi-grid bg-hmi-panel px-2 py-0 h-9 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-0.5">
              {CHART_TABS.map(tab => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="h-9 rounded-none border-b-2 border-transparent text-sm font-semibold data-[state=active]:border-hmi-ideal data-[state=active]:bg-transparent data-[state=active]:text-hmi-text px-3 cursor-pointer"
                >
                  {TAB_LABELS[tab]}
                </TabsTrigger>
              ))}
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <UiTooltip content={isFocused ? "Collapse: Restores the panel to normal size." : "Expand: Maximizes the telemetry charts."} align="center">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={(e) => { e.stopPropagation(); setIsFocused(!isFocused); }} 
                  className="h-7 px-1.5 text-[10px] text-hmi-text-secondary border-hmi-grid hover:bg-hmi-btn-hover hover:text-hmi-text cursor-pointer"
                >
                  {isFocused ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
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
              eBuf={eBuf}
              fBuf={fBuf}
              angularUnit={angularUnit}
              params={state.params}
              gains={state.gains}
            />
          ) : (
            <>
              <TabsContent value="cte" className="h-full w-full relative overflow-hidden">
                {activeTab === 'cte' && <CTEChart tBuf={chartT} dBuf={chartD} />}
              </TabsContent>
              <TabsContent value="ate" className="h-full w-full relative overflow-hidden">
                {activeTab === 'ate' && <ATEChart tBuf={chartT} dBuf={chartD} />}
              </TabsContent>
              <TabsContent value="pos" className="h-full w-full relative overflow-hidden">
                {activeTab === 'pos' && <PositionChart dBuf={dBuf} />}
              </TabsContent>
              <TabsContent value="vel" className="h-full w-full relative overflow-hidden">
                {activeTab === 'vel' && <VelocityChart dBuf={dBuf} />}
              </TabsContent>
              <TabsContent value="pid" className="h-full w-full relative overflow-hidden">
                {activeTab === 'pid' && <PIDChart />}
              </TabsContent>
              <TabsContent value="j1ctrl" className="h-full w-full relative overflow-hidden">
                {activeTab === 'j1ctrl' && <J1CtrlChart />}
              </TabsContent>
              <TabsContent value="j2vel" className="h-full w-full relative overflow-hidden">
                {activeTab === 'j2vel' && <J2VelChart />}
              </TabsContent>
            </>
          )}
        </CardContent>
      </Tabs>
    </Card>
  )
}

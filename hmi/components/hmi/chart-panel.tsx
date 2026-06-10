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

    return { t, v_actual, v_ideal, v_actual_smoothed: 0 }
  })
}

// ── Pure chart components for PID / J1 Ctrl / J2 Vel tabs ──────────────────
// All read their own data via useHMISlow so they plug in exactly like CTEChart etc.

function ChartEmpty({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center h-full text-hmi-muted text-xs font-semibold uppercase tracking-wider">
      {msg}
    </div>
  )
}

export function PIDChart() {
  const { state } = useHMISlow()
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

  if (data.length === 0) return <ChartEmpty msg="No PID telemetry — run a move to capture data" />
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={MARGIN}>
        <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
        <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={XLABEL('Time (s)')} tickFormatter={v => typeof v === 'number' ? v.toFixed(2) : v} />
        <YAxis tick={AT} axisLine={AL} tickLine={false} tickFormatter={YFmt} label={YLABEL('Output')} width={56} />
        <Tooltip contentStyle={TS} formatter={v => typeof v === 'number' ? v.toFixed(4) : v} labelFormatter={l => typeof l === 'number' ? `${l.toFixed(3)} s` : l} allowEscapeViewBox={{ x: false, y: false }} />
        <Legend verticalAlign="top" align="left" height={24} wrapperStyle={{ fontSize: '10px', fontFamily: 'var(--font-geist-sans)', fontWeight: 600, paddingBottom: '4px' }} />
        <Line type="linear" dataKey="p1_out" stroke="#3B82F6" strokeWidth={1.5} dot={false} isAnimationActive={false} name="P Out" />
        <Line type="linear" dataKey="i1_out" stroke="#10B981" strokeWidth={1.5} dot={false} isAnimationActive={false} name="I Out" />
        <Line type="linear" dataKey="d1_out" stroke="#EF4444" strokeWidth={1.5} dot={false} isAnimationActive={false} name="D Out" />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function J1CtrlChart() {
  const { state } = useHMISlow()
  const u1max = state.params?.u1max ?? 1
  const pwmDb = state.params?.pwmDb ?? 68
  const data = useMemo(() => {
    const frozenD = state.frozenD
    const frozenF = state.frozenF
    if (!frozenD || frozenD.length === 0) return []
    const firstT = frozenD[0].t

    // Build primary data from D-packet: u1Total and pwm1 are the SAME 500 Hz tick.
    const ds = downsample(frozenD.map(d => {
      // Normalize PWM: remove static deadband floor, no fzt, no dynDb.
      // Threshold = pwmDb (static) so box count matches raw PWM chart.
      const mag    = Math.abs(d.pwm1)
      const pwm1_adj = mag > pwmDb
        ? Math.sign(d.pwm1) * (mag - pwmDb) / (255 - pwmDb)
        : 0

      const u1_total = d.u1Total / u1max

      // Match to nearest F-sample for FF contribution (unique to F-packet)
      let ff1_contrib = 0
      if (frozenF && frozenF.length > 0) {
        let bestF = frozenF[0], minDiff = Infinity
        for (const f of frozenF) {
          const diff = Math.abs(f.t - d.t)
          if (diff < minDiff) { minDiff = diff; bestF = f } else break
        }
        ff1_contrib = bestF.ff1Contrib / u1max
      }

      return {
        t: (d.t - firstT) / 1000,
        u1_total,
        ff1_contrib,
        pwm1_adj,
        u1_total_smoothed: 0,
      }
    }), 500)

    // Smooth u1_total
    try {
      const xs = ds.map(d => d.t)
      const ys = ds.map(d => d.u1_total)
      const sm = localLoess(ys, xs, 0.08, 1)
      for (let i = 0; i < ds.length; i++) ds[i].u1_total_smoothed = sm[i]
    } catch (e) {
      console.warn('localLoess smoothing failed', e)
    }

    return ds
  }, [state.frozenD, state.frozenF, u1max, pwmDb])

  if (data.length === 0) return <ChartEmpty msg="No J1 control telemetry — run a move to capture data (requires updated firmware)" />
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={MARGIN}>
        <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
        <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={XLABEL('Time (s)')} tickFormatter={v => typeof v === 'number' ? v.toFixed(2) : v} />
        <YAxis tick={AT} axisLine={AL} tickLine={false} tickFormatter={YFmt} label={YLABEL('Fraction of max')} width={56} />
        <Tooltip
          contentStyle={TS}
          formatter={v => typeof v === 'number' ? v.toFixed(4) : v}
          labelFormatter={l => typeof l === 'number' ? `${l.toFixed(3)} s` : l}
          allowEscapeViewBox={{ x: false, y: false }}
        />
        <Legend verticalAlign="top" align="left" height={24} wrapperStyle={{ fontSize: '10px', fontFamily: 'var(--font-geist-sans)', fontWeight: 600, paddingBottom: '4px' }} />
        <Line type="linear" dataKey="u1_total"          stroke="#4CAF50" strokeWidth={1.25} dot={false} isAnimationActive={false} name="u1_total / u1max" />
        <Line type="linear" dataKey="u1_total_smoothed" stroke="#4CAF50" strokeWidth={1.75} dot={false} isAnimationActive={false} name="u1_total / u1max (smoothed)" strokeDasharray="6 4" />
        <Line type="linear" dataKey="ff1_contrib"       stroke="#9C27B0" strokeWidth={1.5}  dot={false} isAnimationActive={false} name="FF Contribution" strokeDasharray="3 3" />
        <Line type="linear" dataKey="pwm1_adj"          stroke="#06B6D4" strokeWidth={1.25} dot={false} isAnimationActive={false} name="PWM / 255" connectNulls={false} opacity={0.75} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function J2VelChart() {
  const { state } = useHMISlow()
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

  if (data.length === 0) return <ChartEmpty msg="No J2 velocity telemetry — run a move to capture data" />
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={MARGIN}>
        <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
        <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={XLABEL('Time (s)')} tickFormatter={v => typeof v === 'number' ? v.toFixed(2) : v} />
        <YAxis tick={AT} axisLine={AL} tickLine={false} tickFormatter={YFmt} label={YLABEL('Velocity (rad/s)')} width={60} />
        <Tooltip contentStyle={TS} formatter={v => typeof v === 'number' ? v.toFixed(4) : v} labelFormatter={l => typeof l === 'number' ? `${l.toFixed(3)} s` : l} allowEscapeViewBox={{ x: false, y: false }} />
        <Legend verticalAlign="top" align="left" height={24} wrapperStyle={{ fontSize: '10px', fontFamily: 'var(--font-geist-sans)', fontWeight: 600, paddingBottom: '4px' }} />
        <Line type="linear" dataKey="omega2_raw"     stroke="#FF9800" strokeWidth={1.75} dot={false} isAnimationActive={false} name="Total ω2 Command" />
        <Line type="linear" dataKey="p_out"          stroke="#2196F3" strokeWidth={1.5}  dot={false} isAnimationActive={false} name="J2 P Out" />
        <Line type="linear" dataKey="d_out"          stroke="#EF4444" strokeWidth={1.5}  dot={false} isAnimationActive={false} name="J2 D Out" />
        <Line type="linear" dataKey="integral2"      stroke="#FFEB3B" strokeWidth={1.5}  dot={false} isAnimationActive={false} name="J2 I Out" strokeDasharray="4 2" />
        <Line type="linear" dataKey="delta_omega_ff" stroke="#9C27B0" strokeWidth={1.5}  dot={false} isAnimationActive={false} name="J2 FF Contrib" strokeDasharray="3 3" />
      </LineChart>
    </ResponsiveContainer>
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
      value: <span className="text-hmi-error">{fmt(stats?.max_err, 2, 'mm')}</span>,
      tooltip: 'Maximum Cross Tracking Error (ε_max): worst lateral deviation in the run.',
    },
    {
      label: 'MCTE',
      value: <span className="text-hmi-ideal">{fmt(stats?.MCTE ?? stats?.mean_err, 2, 'mm')}</span>,
      tooltip: 'Mean CTE (MCTE): path-integrated lateral area divided by path length.',
    },
    {
      label: 'RMS ATE',
      value: <span className="text-amber-500">{fmt(stats?.RMS_ATE, 2, 'mm')}</span>,
      tooltip: 'RMS Along-Track Error: quadratic average of lead/lag without sign cancellation.',
    },
    {
      label: <span>R<sub>ε</sub></span>,
      value: (
        <span className={cn(
          "font-semibold",
          stats?.error_ratio !== undefined
            ? stats.error_ratio >= 0.5 ? "text-amber-400" : "text-cyan-400"
            : "text-slate-600"
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
      value: <span className="text-slate-200">{fmt(stats?.final_err, 2, 'mm')}</span>,
      tooltip: 'Final CTE (ε_f): cross-track error at the end of the trajectory.',
    },
    {
      label: <span>T<sub>el</sub></span>,
      value: <span className="text-slate-200">{stats?.elapsed_time !== undefined ? `${stats.elapsed_time.toFixed(3)} s` : dash}</span>,
      tooltip: 'Elapsed time (T_el): total duration of the last trajectory run.',
    },
    {
      label: 'RMSE J1',
      value: <span className="text-purple-400">{fmt(computed?.rmseJ1, 3, '°')}</span>,
      tooltip: 'Joint 1 tracking RMSE (°): root-mean-square of θ1 position error over the run.',
    },
    {
      label: 'RMSE J2',
      value: <span className="text-purple-400">{fmt(computed?.rmseJ2, 3, '°')}</span>,
      tooltip: 'Joint 2 tracking RMSE (°): root-mean-square of θ2 position error over the run.',
    },
    {
      label: 'RMSE EEF',
      value: <span className="text-purple-400">{fmt(computed?.rmseEEF, 3, 'mm')}</span>,
      tooltip: 'End-effector RMSE (mm): root-mean-square of Cartesian EEF position error over the run.',
    },
    {
      label: 'Ctrl Var',
      value: <span className="text-emerald-400">{fmt(computed?.varPwm, 1)}</span>,
      tooltip: 'Control Effort Variance (PWM σ²): higher values indicate more active correction. Very high values may indicate oscillation.',
    },
    {
      label: 'Jitter',
      value: <span className="text-violet-400">{fmt(computed?.jitter, 2)}</span>,
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
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider select-none">
          Run Metrics
        </span>
        {!stats && (
          <span className="text-[10px] text-slate-600 italic">— waiting for move data</span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadMetrics}
          disabled={!stats && (!computed)}
          className="ml-auto h-5 px-1.5 text-[10px] border-slate-700/60 text-slate-400 bg-slate-900/60 hover:bg-slate-800/80 hover:text-slate-200"
          title="Download Run Metrics"
        >
          <Download className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-3 auto-rows-min gap-px bg-hmi-grid/30 overflow-y-auto">
        {rows.map((row, i) => (
          <UiTooltip key={i} content={row.tooltip} align="center">
            <div className="flex flex-col justify-center px-3 py-2 bg-hmi-panel cursor-help hover:bg-slate-900/60 transition-colors">
              <span className="text-[10px] text-slate-500 font-semibold tracking-wide uppercase leading-tight select-none">
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
  const gradId = useId().replace(/\W/g, '')
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
        <linearGradient id={`${gradId}-errGradient`} x1="0" y1="0" x2="0" y2="1">
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
        <Area type="linear" dataKey="err" stroke="#C084FC" fill={`url(#${gradId}-errGradient)`} strokeWidth={1.5} dot={false} isAnimationActive={false} name="EEF Error" />
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
  const gradId = useId().replace(/\W/g, '')
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
        <linearGradient id={`${gradId}-cteGradient`} x1="0" y1="0" x2="0" y2="1">
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
        <Area type="linear" dataKey="cte" stroke="#F43F5E" fill={`url(#${gradId}-cteGradient)`} strokeWidth={1.5} dot={false} isAnimationActive={false} name="Cross Tracking Error" />
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
  const gradId = useId().replace(/\W/g, '')
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const handleLegendClick = (e: any) => {
    const { dataKey } = e
    setHidden(prev => ({ ...prev, [dataKey]: !prev[dataKey] }))
  }

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

  const chart = (
    <AreaChart data={data} margin={MARGIN} width={width} height={height}>
      <defs>
        <linearGradient id={`${gradId}-ateGradient`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.25} />
          <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0} />
        </linearGradient>
      </defs>
      <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
      <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={XLABEL('Time (s)')} tickFormatter={(v) => typeof v === 'number' ? v.toFixed(2) : v} />
      <YAxis domain={[minY, maxY]} tick={AT} axisLine={AL} tickLine={false} tickFormatter={YFmt} label={YLABEL('ATE (mm)')} width={56} />
      <Tooltip contentStyle={TS} formatter={(v) => typeof v === 'number' ? v.toFixed(3) : v} labelFormatter={(label) => typeof label === 'number' ? `${label.toFixed(3)} s` : label} allowEscapeViewBox={{ x: false, y: false }} />
      <Legend verticalAlign="top" align="left" height={24} onClick={handleLegendClick} wrapperStyle={{ fontSize: '10px', fontFamily: 'var(--font-geist-sans), sans-serif', fontWeight: 600, paddingBottom: '4px', cursor: 'pointer' }} />
      <ReferenceLine y={0} stroke="#4B5563" strokeDasharray="4 2" />
      {!hidden.ate && (
        <Area type="linear" dataKey="ate" stroke="#F59E0B" fill={`url(#${gradId}-ateGradient)`} strokeWidth={1.5} dot={false} isAnimationActive={false} name="Along Tracking Error" />
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
      {!hidden.v_actual_smoothed && (
        <Line dataKey="v_actual_smoothed" stroke="#4CAF50" strokeWidth={1.75} dot={false} isAnimationActive={false} name="Actual (smoothed)" strokeDasharray="6 4" />
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
  const gradId = useId().replace(/\W/g, '')
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
        <linearGradient id={`${gradId}-pwmGradient`} x1="0" y1="0" x2="0" y2="1">
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
        <Area type="linear" dataKey="pwm" stroke="#10B981" fill={`url(#${gradId}-pwmGradient)`} strokeWidth={1.5} dot={false} isAnimationActive={false} name="PWM Output" />
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
  activeTab: 'cte' | 'ate' | 'pos' | 'vel',
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
    case 'ate': {
      const ates = computeATEList(tBuf)
      const rawData = tBuf.map((pt, i) => ({
        t: dBuf[i] ? (dBuf[i].t - firstT) / 1000 : i * 0.02,
        ate: ates[i] ?? 0,
      }))
      const series = [
        { key: 'ate', name: 'Along Tracking Error', stroke: '#F59E0B', type: 'area' as const, fill: '#F59E0B' }
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
  activeTab: 'cte' | 'ate' | 'pos' | 'vel'
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
                {activeTab === 'cte' || activeTab === 'ate' ? (
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
            <Badge className="bg-slate-900 border border-hmi-grid text-slate-300">
              {state.recordingState === 'REC' ? '🔴 Live stream' : '⏸ Sliced Run'}
            </Badge>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Quick tab switcher inside full screen analyzer */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-md border border-hmi-grid mr-4">
              {CHART_TABS.map(tab => (
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
                  {TAB_LABELS[tab]}
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

      
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="flex flex-col flex-1 min-h-0">
        {!isFocused && (
          <TabsList className="rounded-none border-b border-hmi-grid bg-hmi-panel px-2 py-0 h-9 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-0.5">
              {CHART_TABS.map(tab => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="h-9 rounded-none border-b-2 border-transparent text-sm font-semibold data-[state=active]:border-hmi-ideal data-[state=active]:bg-transparent data-[state=active]:text-hmi-text px-3"
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
                  className="h-7 px-1.5 text-[10px] text-slate-300 border-slate-700/60 hover:bg-slate-800/80 hover:text-white"
                >
                  {isFocused ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </Button>
              </UiTooltip>
            </div>
          </TabsList>
        )}

        <CardContent className="flex-1 min-h-0 p-2 overflow-hidden">
          {isFocused ? (
            // For CTE/ATE/POS/VEL use the interactive AdvancedAnalyzer;
            // for the new tabs, the section components handle their own fullscreen.
            (['cte', 'ate', 'pos', 'vel'] as const).includes(activeTab as any) ? (
              <AdvancedAnalyzer
                activeTab={activeTab as 'cte' | 'ate' | 'pos' | 'vel'}
                dBuf={dBuf}
                tBuf={tBuf}
                angularUnit={angularUnit}
              />
            ) : (
              <div className="h-full w-full">
                {activeTab === 'pid'    && <PIDChart />}
                {activeTab === 'j1ctrl' && <J1CtrlChart />}
                {activeTab === 'j2vel'  && <J2VelChart />}
              </div>
            )
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

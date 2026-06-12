'use client'

import { useState, useMemo, useTransition, useEffect } from 'react'
import { useHMISlow } from '@/lib/hmi-context'
import { Button } from '@/components/ui/button'
import type { ExperimentRun } from '@/lib/db/schema/experiment'
import { getExperimentData, deleteExperimentRun, deleteExperiment } from '@/lib/actions/experiment'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Loader2, ArrowRight, ArrowLeft, Database, FileText,
  Trash2, Maximize2, Minimize2, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CommandPaletteTrigger } from '@/components/hmi/command-palette'
import { ThemeToggle } from '@/components/hmi/theme-toggle'

import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
  ErrorBar,
  ScatterChart, Scatter,
  ReferenceLine,
} from 'recharts'

// ── Design tokens matching chart-panel.tsx ───────────────────────────────────
const GRID = 'var(--color-hmi-grid-subtle)'
const AT = {
  fill: 'var(--color-hmi-text-secondary)',
  fontSize: 11,
  fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
  fontWeight: 500,
}
const AL = { stroke: 'var(--color-hmi-grid)' }
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
const MARGIN = { top: 8, right: 16, left: 4, bottom: 28 }

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
const YFmt = (v: number | string) =>
  typeof v === 'number'
    ? Math.abs(v) >= 1000
      ? v.toExponential(1)
      : parseFloat(v.toPrecision(4)).toString()
    : v

const LEGEND_STYLE = {
  fontSize: '10px',
  fontFamily: 'var(--font-geist-sans)',
  fontWeight: 600,
  paddingBottom: '4px',
}

// ── Interfaces ────────────────────────────────────────────────────────────────
interface Props {
  initialRuns: ExperimentRun[]
}

const EXPERIMENT_KEYS = ['EXP-1', 'EXP-2', 'EXP-3', 'EXP-4', 'EXP-5', 'EXP-6'] as const

const EXPERIMENT_NAMES: Record<string, string> = {
  'EXP-1': 'TD Filter',
  'EXP-2': 'Inertia Comp',
  'EXP-3': 'Coriolis Comp',
  'EXP-4': 'Gravity Comp',
  'EXP-5': 'Trap Profile',
  'EXP-6': 'PID Variation',
}
const EXPERIMENT_DESC: Record<string, string> = {
  'EXP-1': 'Evaluate Tracking Differentiator filter performance for J1 & J2',
  'EXP-2': 'Test inertia compensation contribution in dynamic model feedforward',
  'EXP-3': 'Test Coriolis & Centrifugal force compensation contribution',
  'EXP-4': 'Test gravity force compensation at various tilt angles',
  'EXP-5': 'Evaluate trapezoidal profile vs raw step input',
  'EXP-6': 'Test performance with various PID gains',
}
const RAD2DEG = 180 / Math.PI

// Workspace arcs (only for per-run XY scatter)
const outerArcData = Array.from({ length: 37 }, (_, i) => {
  const rad = (i * 5 * Math.PI) / 180
  return { x: 170 * Math.cos(rad), y: 170 * Math.sin(rad) }
})
const innerArcData = Array.from({ length: 37 }, (_, i) => {
  const rad = (i * 5 * Math.PI) / 180
  return { x: 70.7 * Math.cos(rad), y: 70.7 * Math.sin(rad) }
})
const leftEdgeData = [{ x: -170, y: 0 }, { x: -70.7, y: 0 }]
const rightEdgeData = [{ x: 70.7, y: 0 }, { x: 170, y: 0 }]

function downsample<T>(arr: T[], maxPts = 400): T[] {
  if (arr.length <= maxPts) return arr
  const step = Math.ceil(arr.length / maxPts)
  return arr.filter((_, i) => i % step === 0)
}

// ── ExpandableChart wrapper ───────────────────────────────────────────────────
// Mirrors the maximize/minimize pattern from chart-panel.tsx.
// Click the ⤢ icon to open a full-screen overlay; click ✕ or press Escape to close.
function ExpandableChart({
  title,
  subtitle,
  className,
  children,
}: {
  title: string
  subtitle?: string
  className?: string
  children: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(false)

  // Close on Escape
  if (typeof window !== 'undefined') {
    // We use a simple inline handler so we don't need useEffect here
  }

  const header = (
    <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] shrink-0">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">{title}</p>
        {subtitle && <p className="text-[9px] text-slate-600 mt-0.5 select-none">{subtitle}</p>}
      </div>
      <button
        onClick={() => setExpanded(v => !v)}
        className="p-1 rounded hover:bg-white/5 text-slate-500 hover:text-slate-200 transition-colors"
        title={expanded ? 'Collapse' : 'Expand'}
      >
        {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  )

  // Fullscreen overlay
  if (expanded) {
    return (
      <div
        className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
        onClick={() => setExpanded(false)}
        onKeyDown={e => e.key === 'Escape' && setExpanded(false)}
      >
        <div
          className="w-full max-w-5xl h-[80vh] bg-hmi-panel border border-hmi-grid rounded-xl flex flex-col shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-hmi-grid/60 shrink-0">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-300 select-none">{title}</p>
              {subtitle && <p className="text-[10px] text-slate-500 mt-0.5 select-none">{subtitle}</p>}
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="p-1.5 rounded hover:bg-white/5 text-slate-400 hover:text-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0 p-4">
            {children}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('bg-hmi-panel border border-hmi-grid rounded-lg flex flex-col overflow-hidden', className)}>
      {header}
      <div className="flex-1 min-h-0 p-3">
        {children}
      </div>
    </div>
  )
}

// ── Extracted Subcomponents for RunCharts ─────────────────────────────────────
function JointPositionChart({ data }: { data: any[] }) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const handleLegendClick = (e: any) => {
    const { dataKey } = e
    setHidden(prev => ({ ...prev, [dataKey]: !prev[dataKey] }))
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={MARGIN}>
        <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
        <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={XLABEL('Time (ms)')} />
        <YAxis tick={AT} axisLine={AL} tickLine={false} tickFormatter={YFmt} label={YLABEL('θ (°)')} width={52} />
        <Tooltip contentStyle={TS} formatter={(v: any) => typeof v === 'number' ? v.toFixed(3) + '°' : v} />
        <Legend verticalAlign="top" align="left" height={20} onClick={handleLegendClick} wrapperStyle={{ ...LEGEND_STYLE, cursor: 'pointer' }} />
        <Line type="monotone" dataKey="th1" stroke="var(--color-hmi-j1)" strokeWidth={1.5} dot={false} isAnimationActive={false} name="J1 Act" hide={!!hidden.th1} />
        <Line type="monotone" dataKey="th1d" stroke="var(--color-hmi-j1-des)" strokeWidth={1} strokeDasharray="4 2" dot={false} isAnimationActive={false} name="J1 Des" hide={!!hidden.th1d} />
        <Line type="monotone" dataKey="th2" stroke="var(--color-hmi-j2)" strokeWidth={1.5} dot={false} isAnimationActive={false} name="J2 Act" hide={!!hidden.th2} />
        <Line type="monotone" dataKey="th2d" stroke="var(--color-hmi-j2-des)" strokeWidth={1} strokeDasharray="4 2" dot={false} isAnimationActive={false} name="J2 Des" hide={!!hidden.th2d} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function JointVelocityChart({ data }: { data: any[] }) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const handleLegendClick = (e: any) => {
    const { dataKey } = e
    setHidden(prev => ({ ...prev, [dataKey]: !prev[dataKey] }))
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={MARGIN}>
        <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
        <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={XLABEL('Time (ms)')} />
        <YAxis tick={AT} axisLine={AL} tickLine={false} tickFormatter={YFmt} label={YLABEL('ω (°/s)')} width={52} />
        <Tooltip contentStyle={TS} formatter={(v: any) => typeof v === 'number' ? v.toFixed(3) + '°/s' : v} />
        <Legend verticalAlign="top" align="left" height={20} onClick={handleLegendClick} wrapperStyle={{ ...LEGEND_STYLE, cursor: 'pointer' }} />
        <Line type="monotone" dataKey="v1" stroke="var(--color-hmi-j1)" strokeWidth={1.5} dot={false} isAnimationActive={false} name="J1 Act" hide={!!hidden.v1} />
        <Line type="monotone" dataKey="v1d" stroke="var(--color-hmi-j1-des)" strokeWidth={1} strokeDasharray="4 2" dot={false} isAnimationActive={false} name="J1 Des" hide={!!hidden.v1d} />
        <Line type="monotone" dataKey="v2" stroke="var(--color-hmi-j2)" strokeWidth={1.5} dot={false} isAnimationActive={false} name="J2 Act" hide={!!hidden.v2} />
        <Line type="monotone" dataKey="v2d" stroke="var(--color-hmi-j2-des)" strokeWidth={1} strokeDasharray="4 2" dot={false} isAnimationActive={false} name="J2 Des" hide={!!hidden.v2d} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function CartesianXYChart({ data }: { data: any[] }) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const handleLegendClick = (e: any) => {
    const { dataKey } = e
    setHidden(prev => ({ ...prev, [dataKey]: !prev[dataKey] }))
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={MARGIN}>
        <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
        <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={XLABEL('Time (ms)')} />
        <YAxis tick={AT} axisLine={AL} tickLine={false} tickFormatter={YFmt} label={YLABEL('mm')} width={52} />
        <Tooltip contentStyle={TS} formatter={(v: any) => typeof v === 'number' ? v.toFixed(2) + ' mm' : v} />
        <Legend verticalAlign="top" align="left" height={20} onClick={handleLegendClick} wrapperStyle={{ ...LEGEND_STYLE, cursor: 'pointer' }} />
        <Line type="monotone" dataKey="x" stroke="var(--color-hmi-j1)" strokeWidth={1.5} dot={false} isAnimationActive={false} name="X Act" hide={!!hidden.x} />
        <Line type="monotone" dataKey="xd" stroke="var(--color-hmi-j1-des)" strokeWidth={1} strokeDasharray="4 2" dot={false} isAnimationActive={false} name="X Des" hide={!!hidden.xd} />
        <Line type="monotone" dataKey="y" stroke="var(--color-hmi-j2)" strokeWidth={1.5} dot={false} isAnimationActive={false} name="Y Act" hide={!!hidden.y} />
        <Line type="monotone" dataKey="yd" stroke="var(--color-hmi-j2-des)" strokeWidth={1} strokeDasharray="4 2" dot={false} isAnimationActive={false} name="Y Des" hide={!!hidden.yd} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function PwmOutputChart({ data, runId }: { data: any[], runId: string }) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const handleLegendClick = (e: any) => {
    const { dataKey } = e
    setHidden(prev => ({ ...prev, [dataKey]: !prev[dataKey] }))
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={MARGIN}>
        <defs>
          <linearGradient id={`pwmGrad-${runId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-hmi-pwm-pos)" stopOpacity={0.25} />
            <stop offset="95%" stopColor="var(--color-hmi-pwm-pos)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
        <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={XLABEL('Time (ms)')} />
        <YAxis domain={[-260, 260]} tick={AT} axisLine={AL} tickLine={false} label={YLABEL('PWM')} width={48} />
        <ReferenceLine y={0} stroke="var(--color-hmi-grid)" strokeDasharray="4 2" />
        <Tooltip contentStyle={TS} />
        <Legend verticalAlign="top" align="left" height={20} onClick={handleLegendClick} wrapperStyle={{ ...LEGEND_STYLE, cursor: 'pointer' }} />
        <Area type="monotone" dataKey="pwm1" stroke="var(--color-hmi-pwm-pos)" fill={`url(#pwmGrad-${runId})`} strokeWidth={1.5} dot={false} isAnimationActive={false} name="PWM J1" hide={!!hidden.pwm1} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function ControlEffortChart({ data }: { data: any[] }) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const handleLegendClick = (e: any) => {
    const { dataKey } = e
    setHidden(prev => ({ ...prev, [dataKey]: !prev[dataKey] }))
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={MARGIN}>
        <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
        <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={XLABEL('Time (ms)')} />
        <YAxis tick={AT} axisLine={AL} tickLine={false} tickFormatter={YFmt} label={YLABEL('Control')} width={52} />
        <Tooltip contentStyle={TS} formatter={(v: any) => typeof v === 'number' ? v.toFixed(4) : v} />
        <Legend verticalAlign="top" align="left" height={20} onClick={handleLegendClick} wrapperStyle={{ ...LEGEND_STYLE, cursor: 'pointer' }} />
        <Line type="monotone" dataKey="u1" stroke="var(--color-hmi-j1)" strokeWidth={1.5} dot={false} isAnimationActive={false} name="U1 Total" hide={!!hidden.u1} />
        <Line type="monotone" dataKey="ff1" stroke="var(--color-hmi-ideal)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} isAnimationActive={false} name="FF1 Contrib" hide={!!hidden.ff1} />
        <Line type="monotone" dataKey="omega2" stroke="var(--color-hmi-pwm-pos)" strokeWidth={1.25} dot={false} isAnimationActive={false} name="ω2 Raw" hide={!!hidden.omega2} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function PidBreakdownChart({ data }: { data: any[] }) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const handleLegendClick = (e: any) => {
    const { dataKey } = e
    setHidden(prev => ({ ...prev, [dataKey]: !prev[dataKey] }))
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={MARGIN}>
        <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
        <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={XLABEL('Time (ms)')} />
        <YAxis tick={AT} axisLine={AL} tickLine={false} tickFormatter={YFmt} label={YLABEL('Output')} width={52} />
        <Tooltip contentStyle={TS} formatter={(v: any) => typeof v === 'number' ? v.toFixed(4) : v} />
        <Legend verticalAlign="top" align="left" height={20} onClick={handleLegendClick} wrapperStyle={{ ...LEGEND_STYLE, cursor: 'pointer' }} />
        <Line type="monotone" dataKey="p1" stroke="var(--color-hmi-j1)" strokeWidth={1.5} dot={false} isAnimationActive={false} name="P Out" hide={!!hidden.p1} />
        <Line type="monotone" dataKey="i1" stroke="var(--color-hmi-pwm-pos)" strokeWidth={1.5} dot={false} isAnimationActive={false} name="I Out" hide={!!hidden.i1} />
        <Line type="monotone" dataKey="d1" stroke="var(--color-hmi-pwm-neg)" strokeWidth={1.5} dot={false} isAnimationActive={false} name="D Out" hide={!!hidden.d1} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function VelocityProfileChart({ data }: { data: any[] }) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const handleLegendClick = (e: any) => {
    const { dataKey } = e
    setHidden(prev => ({ ...prev, [dataKey]: !prev[dataKey] }))
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={MARGIN}>
        <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
        <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={XLABEL('Time (ms)')} />
        <YAxis tick={AT} axisLine={AL} tickLine={false} tickFormatter={YFmt} label={YLABEL('ω (°/s)')} width={52} />
        <Tooltip contentStyle={TS} formatter={(v: any) => typeof v === 'number' ? v.toFixed(3) + '°/s' : v} />
        <Legend verticalAlign="top" align="left" height={20} onClick={handleLegendClick} wrapperStyle={{ ...LEGEND_STYLE, cursor: 'pointer' }} />
        <Line type="monotone" dataKey="v1" stroke="var(--color-hmi-actual)" strokeWidth={1.5} dot={false} isAnimationActive={false} name="Measured" hide={!!hidden.v1} />
        <Line type="monotone" dataKey="v1d" stroke="var(--color-hmi-j1-des)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={false} name="Profile" hide={!!hidden.v1d} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Individual run 9-chart section ────────────────────────────────────────────
function RunCharts({ runId, runSamples, runMetrics }: { runId: string; runSamples: any[]; runMetrics?: any }) {
  if (runSamples.length === 0) {
    return (
      <div className="text-center py-8 text-xs text-slate-500 italic">
        Data telemetri sampel kosong untuk run ini.
      </div>
    )
  }

  const samplesDs = downsample(runSamples, 600)
  const formatted = samplesDs.map(s => ({
    t: s.tMs,
    th1: (s.theta1 ?? 0) * RAD2DEG,
    th1d: (s.theta1D ?? 0) * RAD2DEG,
    th2: (s.theta2 ?? 0) * RAD2DEG,
    th2d: (s.theta2D ?? 0) * RAD2DEG,
    v1: (s.dtheta1 ?? 0) * RAD2DEG,
    v1d: (s.dtheta1D ?? 0) * RAD2DEG,
    v2: (s.dtheta2 ?? 0) * RAD2DEG,
    v2d: (s.dtheta2D ?? 0) * RAD2DEG,
    x: s.xActual, xd: s.xDesired,
    y: s.yActual, yd: s.yDesired,
    pwm1: s.pwm1,
    u1: s.u1Total, ff1: s.ff1Contrib,
    omega2: s.omega2Raw,
    p1: s.p1Out, i1: s.i1Out, d1: s.d1Out,
  }))

  const xyPts = downsample(runSamples.map(s => ({ x: s.xActual ?? 0, y: s.yActual ?? 0 })), 300)

  const metricsBar = [
    { name: 'MATE', value: Math.abs(runMetrics?.mateMean ?? 0), fill: 'var(--color-hmi-j1)' },
    { name: 'MCTE', value: Math.abs(runMetrics?.mcteMean ?? 0), fill: 'var(--color-hmi-j2)' },
    { name: 'EEF', value: Math.abs(runMetrics?.eefErrorMean ?? 0), fill: 'var(--color-hmi-pwm-pos)' },
    { name: 'Final EEF', value: Math.abs(runMetrics?.finalEefError ?? 0), fill: 'var(--color-hmi-ideal)' },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-3">

      {/* 1. Error Summary */}
      <ExpandableChart title="1. Error Metrics Summary" className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={metricsBar} margin={MARGIN}>
            <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
            <XAxis dataKey="name" tick={AT} axisLine={AL} tickLine={false} />
            <YAxis tick={AT} axisLine={AL} tickLine={false} tickFormatter={YFmt} label={YLABEL('mm')} width={48} />
            <Tooltip contentStyle={TS} formatter={(v: any) => typeof v === 'number' ? v.toFixed(3) + ' mm' : v} />
            <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {metricsBar.map((entry, i) => (
                <rect key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ExpandableChart>

      {/* 2. XY Workspace Trace */}
      <ExpandableChart title="2. XY Workspace Trace" className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
            <XAxis type="number" dataKey="x" name="X" tick={AT} axisLine={AL} tickLine={false} label={XLABEL('X (mm)')} domain={[-185, 185]} ticks={[-150, -100, -50, 0, 50, 100, 150]} />
            <YAxis type="number" dataKey="y" name="Y" tick={AT} axisLine={AL} tickLine={false} label={YLABEL('Y (mm)')} domain={[-10, 210]} ticks={[0, 50, 100, 150, 200]} />
            <Tooltip contentStyle={TS} cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={outerArcData} line={{ stroke: '#374151', strokeDasharray: '3 3' }} shape={() => null} name="Outer" />
            <Scatter data={innerArcData} line={{ stroke: '#374151', strokeDasharray: '3 3' }} shape={() => null} name="Inner" />
            <Scatter data={leftEdgeData} line={{ stroke: '#374151', strokeDasharray: '3 3' }} shape={() => null} name="Edge L" />
            <Scatter data={rightEdgeData} line={{ stroke: '#374151', strokeDasharray: '3 3' }} shape={() => null} name="Edge R" />
            <Scatter data={xyPts} line={{ stroke: 'var(--color-hmi-actual)', strokeWidth: 1.5 }} shape={() => null} name="Actual Path" />
          </ScatterChart>
        </ResponsiveContainer>
      </ExpandableChart>

      {/* 3. Joint Position */}
      <ExpandableChart title="3. Posisi Sendi J1 & J2" className="h-64">
        <JointPositionChart data={formatted} />
      </ExpandableChart>

      {/* 4. Joint Velocity */}
      <ExpandableChart title="4. Kecepatan Sendi J1 & J2" className="h-64">
        <JointVelocityChart data={formatted} />
      </ExpandableChart>

      {/* 5. Cartesian X & Y */}
      <ExpandableChart title="5. Cartesian X & Y vs Time" className="h-64">
        <CartesianXYChart data={formatted} />
      </ExpandableChart>

      {/* 6. PWM Output */}
      <ExpandableChart title="6. Output PWM J1" className="h-64">
        <PwmOutputChart data={formatted} runId={runId} />
      </ExpandableChart>

      {/* 7. Control Effort */}
      <ExpandableChart title="7. Total & Feedforward Control" className="h-64">
        <ControlEffortChart data={formatted} />
      </ExpandableChart>

      {/* 8. PID Breakdown */}
      <ExpandableChart title="8. PID Breakdown J1" className="h-64">
        <PidBreakdownChart data={formatted} />
      </ExpandableChart>

      {/* 9. Velocity Profile Comparison */}
      <ExpandableChart title="9. Velocity Profile J1" className="h-64">
        <VelocityProfileChart data={formatted} />
      </ExpandableChart>

    </div>
  )
}

// ── Main ResultsClient ────────────────────────────────────────────────────────
export function ResultsClient({ initialRuns }: Props) {
  const { state: hmiState, serial } = useHMISlow()
  const { serialStatus, online, estopped } = hmiState

  const [allRuns, setAllRuns] = useState<ExperimentRun[]>(initialRuns)

  const availableExperiments = useMemo(() => {
    return EXPERIMENT_KEYS.filter(key =>
      allRuns.some(run => run.experimentId.startsWith(key))
    )
  }, [allRuns])

  const [selectedExp, setSelectedExp] = useState<'EXP-1' | 'EXP-2' | 'EXP-3' | 'EXP-4' | 'EXP-5' | 'EXP-6'>(() => {
    const first = EXPERIMENT_KEYS.find(key => initialRuns.some(run => run.experimentId.startsWith(key)))
    return first || 'EXP-1'
  })
  const [directionFilter, setDirectionFilter] = useState<'all' | 'forward' | 'return'>('all')
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)

  const [isPending, startTransition] = useTransition()
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null)
  const [deletingExp, setDeletingExp] = useState(false)

  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<{ runs: any[]; metrics: any[]; samples: any[] } | null>(null)

  const refreshData = (exp = selectedExp) => {
    setLoading(true)
    getExperimentData(exp)
      .then(res => setData(res ?? { runs: [], metrics: [], samples: [] }))
      .catch(() => toast.error('Gagal memuat data eksperimen.'))
      .finally(() => setLoading(false))
  }

  // Load on mount + when selectedExp changes
  useEffect(() => {
    refreshData(selectedExp)
  }, [selectedExp])

  const filteredRuns = useMemo(() => {
    if (!data) return []
    return data.runs.filter(r => directionFilter === 'all' || r.direction === directionFilter)
  }, [data, directionFilter])

  const filteredMetrics = useMemo(() => {
    if (!data) return []
    const runIds = filteredRuns.map(r => r.id)
    return data.metrics.filter(m => runIds.includes(m.runId))
  }, [data, filteredRuns])

  const computeMeanStd = (values: number[]) => {
    if (values.length === 0) return { mean: 0, std: 0 }
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
    return { mean, std: Math.sqrt(variance) }
  }

  // Standard conditions (EXP-1/2/3/5)
  const standardConditions = useMemo(() => {
    if (selectedExp === 'EXP-4' || selectedExp === 'EXP-6') return []
    const predA = (r: any) => {
      if (selectedExp === 'EXP-1') return r.tdEnabled === 1
      if (selectedExp === 'EXP-2') return r.ffiEnabled === 1
      if (selectedExp === 'EXP-3') return r.ffcEnabled === 1
      if (selectedExp === 'EXP-5') return r.trapEnabled === 1
      return false
    }
    const nameA = selectedExp === 'EXP-1' ? 'TD ON' : selectedExp === 'EXP-2' ? 'Inertia ON' : selectedExp === 'EXP-3' ? 'Coriolis ON' : 'Trap ON'
    const nameB = selectedExp === 'EXP-1' ? 'TD OFF' : selectedExp === 'EXP-2' ? 'Inertia OFF' : selectedExp === 'EXP-3' ? 'Coriolis OFF' : 'Trap OFF'
    const idsA = filteredRuns.filter(predA).map(r => r.id)
    const idsB = filteredRuns.filter(r => !predA(r)).map(r => r.id)
    const mets = (ids: string[]) => filteredMetrics.filter(m => ids.includes(m.runId))
    return [
      { name: nameA, runs: idsA.length, metrics: mets(idsA) },
      { name: nameB, runs: idsB.length, metrics: mets(idsB) },
    ]
  }, [selectedExp, filteredRuns, filteredMetrics])

  const summaryTableRows = useMemo(() => standardConditions.map(cond => {
    const getVal = (k: string) => cond.metrics.map(m => (m[k] as number) ?? 0)
    return {
      name: cond.name, n: cond.runs,
      mate: computeMeanStd(getVal('mateMean')),
      mcte: computeMeanStd(getVal('mcteMean')),
      eef: computeMeanStd(getVal('eefErrorMean')),
      settle: computeMeanStd(getVal('settleTimeMs')),
      finalEef: computeMeanStd(getVal('finalEefError')),
    }
  }), [standardConditions])

  const barChartData = useMemo(() => summaryTableRows.map(r => ({
    name: r.name,
    MATE: Math.abs(r.mate.mean), mateError: r.mate.std,
    MCTE: r.mcte.mean, mcteError: r.mcte.std,
  })), [summaryTableRows])

  const eefBarChartData = useMemo(() => summaryTableRows.map(r => ({
    name: r.name,
    'EEF Mean': r.eef.mean, eefError: r.eef.std,
    'Final EEF': r.finalEef.mean, finalError: r.finalEef.std,
  })), [summaryTableRows])

  // EXP-4
  const exp4AlphasData = useMemo(() => {
    if (selectedExp !== 'EXP-4') return []
    return ['0', '15', '30', '45'].map(a => {
      const runsA = filteredRuns.filter(r => r.alphaDeg === parseFloat(a))
      const idsOn = runsA.filter(r => r.ffgEnabled === 1).map(r => r.id)
      const idsOff = runsA.filter(r => r.ffgEnabled === 0).map(r => r.id)
      const mOn = filteredMetrics.filter(m => idsOn.includes(m.runId))
      const mOff = filteredMetrics.filter(m => idsOff.includes(m.runId))
      const mateOn = computeMeanStd(mOn.map(m => Math.abs(m.mateMean ?? 0)))
      const mateOff = computeMeanStd(mOff.map(m => Math.abs(m.mateMean ?? 0)))
      const eefOn = computeMeanStd(mOn.map(m => m.finalEefError ?? 0))
      const eefOff = computeMeanStd(mOff.map(m => m.finalEefError ?? 0))
      return {
        alpha: `α=${a}°`,
        'FFG ON': mateOn.mean, 'FFG ON Std': mateOn.std,
        'FFG OFF': mateOff.mean, 'FFG OFF Std': mateOff.std,
        'EEF ON': eefOn.mean, 'EEF ON Std': eefOn.std,
        'EEF OFF': eefOff.mean, 'EEF OFF Std': eefOff.std,
      }
    })
  }, [selectedExp, filteredRuns, filteredMetrics])

  const exp4SummaryRows = useMemo(() => {
    if (selectedExp !== 'EXP-4') return []
    const rows: any[] = []
    for (const a of ['0', '15', '30', '45']) {
      const runsA = filteredRuns.filter(r => r.alphaDeg === parseFloat(a))
      const idsOn = runsA.filter(r => r.ffgEnabled === 1).map(r => r.id)
      const idsOff = runsA.filter(r => r.ffgEnabled === 0).map(r => r.id)
      const gm = (ids: string[]) => filteredMetrics.filter(m => ids.includes(m.runId))
      rows.push({ name: `α=${a}° FFG ON`, n: idsOn.length, mate: computeMeanStd(gm(idsOn).map(m => m.mateMean ?? 0)), mcte: computeMeanStd(gm(idsOn).map(m => m.mcteMean ?? 0)), eef: computeMeanStd(gm(idsOn).map(m => m.eefErrorMean ?? 0)), settle: computeMeanStd(gm(idsOn).map(m => m.settleTimeMs ?? 0)), finalEef: computeMeanStd(gm(idsOn).map(m => m.finalEefError ?? 0)) })
      rows.push({ name: `α=${a}° FFG OFF`, n: idsOff.length, mate: computeMeanStd(gm(idsOff).map(m => m.mateMean ?? 0)), mcte: computeMeanStd(gm(idsOff).map(m => m.mcteMean ?? 0)), eef: computeMeanStd(gm(idsOff).map(m => m.eefErrorMean ?? 0)), settle: computeMeanStd(gm(idsOff).map(m => m.settleTimeMs ?? 0)), finalEef: computeMeanStd(gm(idsOff).map(m => m.finalEefError ?? 0)) })
    }
    return rows
  }, [selectedExp, filteredRuns, filteredMetrics])

  // EXP-6
  const exp6ChartsData = useMemo(() => {
    if (selectedExp !== 'EXP-6') return { Kp: [], Ki: [], Kd: [] }
    const levels = ['0.5', '1.0', '1.5']
    const getLine = (sub: '6A' | '6B' | '6C') => levels.map(lvl => {
      const key = `EXP-${sub}-${lvl}x`
      const ids = filteredRuns.filter(r => r.experimentId === key).map(r => r.id)
      const mets = filteredMetrics.filter(m => ids.includes(m.runId))
      return {
        level: `${lvl}x`,
        MATE: computeMeanStd(mets.map(m => Math.abs(m.mateMean ?? 0))).mean,
        SettleTime: computeMeanStd(mets.map(m => m.settleTimeMs ?? 0)).mean,
        MaxErrJ1: computeMeanStd(mets.map(m => m.joint1ErrorMax ?? 0)).mean,
      }
    })
    return { Kp: getLine('6A'), Ki: getLine('6B'), Kd: getLine('6C') }
  }, [selectedExp, filteredRuns, filteredMetrics])

  const exp6SummaryRows = useMemo(() => {
    if (selectedExp !== 'EXP-6') return []
    const rows: any[] = []
    for (const sub of ['6A', '6B', '6C'] as const) {
      for (const lvl of ['0.5', '1.0', '1.5']) {
        const key = `EXP-${sub}-${lvl}x`
        const ids = filteredRuns.filter(r => r.experimentId === key).map(r => r.id)
        const gm = filteredMetrics.filter(m => ids.includes(m.runId))
        const label = sub === '6A' ? 'Kp1' : sub === '6B' ? 'Ki1' : 'Kd1'
        rows.push({ name: `${label} (${lvl}x)`, n: ids.length, mate: computeMeanStd(gm.map(m => m.mateMean ?? 0)), mcte: computeMeanStd(gm.map(m => m.mcteMean ?? 0)), eef: computeMeanStd(gm.map(m => m.eefErrorMean ?? 0)), settle: computeMeanStd(gm.map(m => m.settleTimeMs ?? 0)), finalEef: computeMeanStd(gm.map(m => m.finalEefError ?? 0)) })
      }
    }
    return rows
  }, [selectedExp, filteredRuns, filteredMetrics])

  // The table rows to render
  const activeTableRows = selectedExp === 'EXP-4' ? exp4SummaryRows : selectedExp === 'EXP-6' ? exp6SummaryRows : summaryTableRows

  // ── Delete handlers ─────────────────────────────────────────────────────────
  const handleDeleteRun = (runId: string) => {
    if (!confirm(`Delete run ${runId}?\nAll associated samples & metrics will be permanently deleted.`)) return
    setDeletingRunId(runId)
    startTransition(async () => {
      const res = await deleteExperimentRun(runId)
      setDeletingRunId(null)
      if (res.ok) {
        toast.success(`Run ${runId} successfully deleted.`)
        if (expandedRunId === runId) setExpandedRunId(null)
        refreshData()
        setAllRuns(prev => prev.filter(r => r.id !== runId))
      } else {
        toast.error(`Failed to delete run: ${res.error}`)
      }
    })
  }

  const handleDeleteExperiment = () => {
    if (!confirm(`Delete ALL runs for ${selectedExp} (${EXPERIMENT_NAMES[selectedExp]})?\n\nThis action cannot be undone.`)) return
    setDeletingExp(true)
    startTransition(async () => {
      const res = await deleteExperiment(selectedExp)
      setDeletingExp(false)
      if (res.ok) {
        toast.success(`Successfully deleted ${res.deletedCount} runs for ${selectedExp}.`)
        setData({ runs: [], metrics: [], samples: [] })
        setExpandedRunId(null)
        setAllRuns(prev => prev.filter(r => !r.experimentId.startsWith(selectedExp)))
      } else {
        toast.error(`Failed: ${res.error}`)
      }
    })
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-hmi-bg text-hmi-text overflow-hidden results-container">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 border-r border-hmi-grid bg-hmi-panel flex flex-col justify-between overflow-hidden">
        <div>
          <div className="px-4 py-4 border-b border-hmi-grid flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-hmi-bg border border-hmi-grid flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                <path d="M12 3L3 8.5V15.5L12 21L21 15.5V8.5L12 3Z" stroke="#2196F3" strokeWidth={1.5} strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-hmi-text">SCARA Robot</p>
              <p className="text-[10px] text-hmi-muted uppercase tracking-wider font-semibold">Experiment Results</p>
            </div>
          </div>

          <nav className="p-2 space-y-0.5">
            {EXPERIMENT_KEYS.map(key => {
              const hasData = allRuns.some(r => r.experimentId.startsWith(key))
              const runCount = allRuns.filter(r => r.experimentId.startsWith(key)).length
              return (
                <button
                  key={key}
                  onClick={() => { if (hasData) { setSelectedExp(key); setExpandedRunId(null); setDirectionFilter('all') } }}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded text-xs font-medium transition-all duration-150',
                    selectedExp === key && hasData
                      ? 'bg-hmi-tab-active text-hmi-text border-l-2 border-hmi-ideal'
                      : hasData
                        ? 'text-hmi-muted hover:bg-hmi-grid/30 hover:text-hmi-text border-l-2 border-transparent'
                        : 'text-slate-700 border-l-2 border-transparent cursor-default'
                  )}
                  disabled={!hasData}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold">{key}</span>
                      <span className={cn('text-[10px] ml-1.5', hasData ? 'opacity-70' : 'opacity-30')}>
                        {EXPERIMENT_NAMES[key]}
                      </span>
                    </div>
                    <span className={cn(
                      'text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded',
                      hasData
                        ? selectedExp === key ? 'bg-hmi-ideal/20 text-hmi-ideal' : 'bg-hmi-bg/80 text-hmi-muted'
                        : 'text-slate-700'
                    )}>
                      {hasData ? runCount : '—'}
                    </span>
                  </div>
                  {hasData && (
                    <p className="text-[9px] text-slate-500 mt-0.5 leading-tight truncate">
                      {EXPERIMENT_DESC[key]}
                    </p>
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        <div className="p-3 border-t border-hmi-grid space-y-2">
          {availableExperiments.includes(selectedExp) && (
            <button
              onClick={handleDeleteExperiment}
              disabled={deletingExp || isPending}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-xs font-semibold transition-all border',
                'border-red-900/40 text-red-500/60 hover:bg-red-950/30 hover:border-red-700/60 hover:text-red-400',
                (deletingExp || isPending) && 'opacity-40 cursor-not-allowed'
              )}
            >
              {deletingExp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Delete All {selectedExp}
            </button>
          )}
          <a href="/" className="w-full text-center text-xs py-1.5 rounded border border-hmi-grid text-hmi-muted hover:text-hmi-text hover:border-hmi-grid/80 transition-colors block">
            ← Back to HMI
          </a>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <header className="sticky top-0 z-50 bg-hmi-panel border-b border-hmi-grid px-6 h-12 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-hmi-text uppercase tracking-wider">{EXPERIMENT_NAMES[selectedExp]}</span>
            <span className="text-xs text-hmi-muted">({selectedExp})</span>
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-hmi-muted" />}
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <CommandPaletteTrigger />
            {/* Direction filter */}
            <div className="bg-hmi-bg border border-hmi-grid rounded-md p-0.5 flex">
              {(['all', 'forward', 'return'] as const).map(dir => (
                <button
                  key={dir}
                  onClick={() => setDirectionFilter(dir)}
                  className={cn(
                    'px-2.5 py-1 rounded text-[10px] uppercase font-bold tracking-wider transition-all',
                    directionFilter === dir ? 'bg-hmi-tab-active text-hmi-ideal' : 'text-hmi-muted hover:text-hmi-text'
                  )}
                >
                  {dir === 'all' ? 'All' : dir}
                </button>
              ))}
            </div>
            <div className="h-6 w-px bg-hmi-grid/60" />
            <Badge className={`${online ? 'bg-hmi-ok text-white' : 'bg-hmi-off text-hmi-muted'} text-[10px] px-1.5 py-0 font-normal`}>
              {online ? '● Online' : '○ Offline'}
            </Badge>
            <Badge className={cn('text-[10px] px-1.5 py-0 font-normal uppercase', serialStatus === 'connected' ? 'bg-hmi-ok/20 text-hmi-ok border border-hmi-ok/30' : 'bg-hmi-off text-hmi-muted border border-hmi-grid')}>
              {serialStatus === 'connected' ? 'Connected' : 'Disconnected'}
            </Badge>
            {serialStatus === 'connected'
              ? <Button variant="outline" size="sm" className="h-6 px-2.5 text-[11px] font-semibold" onClick={() => serial.disconnect()}>Disconnect</Button>
              : <Button variant="outline" size="sm" className="h-6 px-2.5 text-[11px] font-semibold" onClick={() => serial.connect()}>Connect</Button>
            }
            <div className="flex items-center pl-2 border-l border-hmi-grid/60">
              {estopped
                ? <Button variant="resume" size="sm" className="h-7 px-3 text-xs font-bold animate-pulse" onClick={() => serial.sendCommand('resume')}>🔄 RESUME</Button>
                : <Button variant="estop" size="sm" className="h-7 px-3 text-xs font-bold" onClick={() => serial.sendCommand('estop')}>🛑 E-STOP</Button>
              }
            </div>
          </div>
        </header>

        {/* Scroll content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center text-xs text-slate-500 gap-3">
              <Loader2 className="w-7 h-7 animate-spin text-hmi-ideal" />
              <span className="uppercase tracking-widest font-semibold">Loading data...</span>
            </div>
          ) : !data || data.runs.length === 0 ? (
            <div className="h-96 flex flex-col items-center justify-center text-center p-8 bg-hmi-panel/40 border border-hmi-grid rounded-xl max-w-lg mx-auto mt-12">
              <Database className="w-12 h-12 text-slate-700 mb-3" />
              <h3 className="text-sm font-bold text-hmi-text uppercase tracking-wider">No Data Available</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                This experiment has no saved data yet. Please complete at least one sequence in the Experiment menu.
              </p>
            </div>
          ) : (
            <div className="space-y-5">

              {/* ── Summary Table ──────────────────────────────────────────── */}
              <div className="bg-hmi-panel border border-hmi-grid rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 border-b border-hmi-grid/60 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-hmi-ideal" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Performance Metrics Summary ({selectedExp}) — {filteredRuns.length} runs
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-hmi-grid/60 hover:bg-transparent">
                        <TableHead className="text-[10px] text-slate-500 font-bold uppercase tracking-wider py-2 w-44">Kondisi</TableHead>
                        <TableHead className="text-[10px] text-slate-500 font-bold uppercase tracking-wider py-2 text-center w-16">N</TableHead>
                        <TableHead className="text-[10px] text-slate-500 font-bold uppercase tracking-wider py-2 text-center">MATE (mm)</TableHead>
                        <TableHead className="text-[10px] text-slate-500 font-bold uppercase tracking-wider py-2 text-center">MCTE (mm)</TableHead>
                        <TableHead className="text-[10px] text-slate-500 font-bold uppercase tracking-wider py-2 text-center">EEF Error (mm)</TableHead>
                        <TableHead className="text-[10px] text-slate-500 font-bold uppercase tracking-wider py-2 text-center">Settle Time (ms)</TableHead>
                        <TableHead className="text-[10px] text-slate-500 font-bold uppercase tracking-wider py-2 text-center">Final EEF (mm)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeTableRows.map((row: any, idx: number) => (
                        <TableRow key={idx} className="border-hmi-grid/40 hover:bg-hmi-btn/30">
                          <TableCell className="text-xs font-semibold text-slate-200 py-2.5">{row.name}</TableCell>
                          <TableCell className="text-center font-mono text-xs text-slate-400 py-2.5">{row.n}</TableCell>
                          <TableCell className="text-center font-mono text-[11px] text-blue-400 py-2.5">{row.mate.mean.toFixed(3)} <span className="text-slate-600">±</span> {row.mate.std.toFixed(3)}</TableCell>
                          <TableCell className="text-center font-mono text-[11px] text-amber-400 py-2.5">{row.mcte.mean.toFixed(3)} <span className="text-slate-600">±</span> {row.mcte.std.toFixed(3)}</TableCell>
                          <TableCell className="text-center font-mono text-[11px] text-emerald-400 py-2.5">{row.eef.mean.toFixed(3)} <span className="text-slate-600">±</span> {row.eef.std.toFixed(3)}</TableCell>
                          <TableCell className="text-center font-mono text-[11px] text-slate-300 py-2.5">{row.settle.mean.toFixed(0)} <span className="text-slate-600">±</span> {row.settle.std.toFixed(0)}</TableCell>
                          <TableCell className="text-center font-mono text-[11px] text-violet-400 py-2.5">{row.finalEef.mean.toFixed(3)} <span className="text-slate-600">±</span> {row.finalEef.std.toFixed(3)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* ── Comparative Charts ─────────────────────────────────────── */}
              {selectedExp === 'EXP-4' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ExpandableChart title="MATE vs Tilt Angle" subtitle="FFG ON vs OFF per sudut kemiringan" className="h-[340px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={exp4AlphasData} margin={MARGIN}>
                        <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
                        <XAxis dataKey="alpha" tick={AT} axisLine={AL} tickLine={false} />
                        <YAxis tick={AT} axisLine={AL} tickLine={false} tickFormatter={YFmt} label={YLABEL('mm')} width={52} />
                        <Tooltip contentStyle={TS} formatter={(v: any) => typeof v === 'number' ? v.toFixed(3) + ' mm' : v} />
                        <Legend verticalAlign="top" align="left" height={24} wrapperStyle={LEGEND_STYLE} />
                        <Bar dataKey="FFG ON" fill="var(--color-hmi-j1)" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                          <ErrorBar dataKey="FFG ON Std" stroke="var(--color-hmi-j1-des)" strokeWidth={1.5} />
                        </Bar>
                        <Bar dataKey="FFG OFF" fill="var(--color-hmi-j2)" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                          <ErrorBar dataKey="FFG OFF Std" stroke="var(--color-hmi-j2-des)" strokeWidth={1.5} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ExpandableChart>

                  <ExpandableChart title="Final EEF Error vs Tilt" subtitle="Steady-state positioning error" className="h-[340px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={exp4AlphasData} margin={MARGIN}>
                        <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
                        <XAxis dataKey="alpha" tick={AT} axisLine={AL} tickLine={false} />
                        <YAxis tick={AT} axisLine={AL} tickLine={false} tickFormatter={YFmt} label={YLABEL('mm')} width={52} />
                        <Tooltip contentStyle={TS} formatter={(v: any) => typeof v === 'number' ? v.toFixed(3) + ' mm' : v} />
                        <Legend verticalAlign="top" align="left" height={24} wrapperStyle={LEGEND_STYLE} />
                        <Bar dataKey="EEF ON" fill="var(--color-hmi-pwm-pos)" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                          <ErrorBar dataKey="EEF ON Std" stroke="var(--color-hmi-pwm-pos)" strokeWidth={1.5} />
                        </Bar>
                        <Bar dataKey="EEF OFF" fill="var(--color-hmi-ideal)" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                          <ErrorBar dataKey="EEF OFF Std" stroke="var(--color-hmi-ideal)" strokeWidth={1.5} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ExpandableChart>
                </div>
              ) : selectedExp === 'EXP-6' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {(['Kp', 'Ki', 'Kd'] as const).map((k, ki) => (
                    <ExpandableChart key={k} title={`${k} Gain Scaling`} subtitle={`6${['A','B','C'][ki]}: ${k}1 variation`} className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={exp6ChartsData[k]} margin={MARGIN}>
                          <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
                          <XAxis dataKey="level" tick={AT} axisLine={AL} tickLine={false} />
                          <YAxis tick={AT} axisLine={AL} tickLine={false} tickFormatter={YFmt} width={48} />
                          <Tooltip contentStyle={TS} />
                          <Legend verticalAlign="top" align="left" height={20} wrapperStyle={LEGEND_STYLE} />
                          <Line type="monotone" dataKey="MATE" stroke="var(--color-hmi-j1)" strokeWidth={2} dot={{ r: 3, fill: 'var(--color-hmi-j1)' }} isAnimationActive={false} name="MATE (mm)" />
                          <Line type="monotone" dataKey="SettleTime" stroke="var(--color-hmi-j2)" strokeWidth={2} dot={{ r: 3, fill: 'var(--color-hmi-j2)' }} isAnimationActive={false} name="Settle (ms)" />
                          <Line type="monotone" dataKey="MaxErrJ1" stroke="var(--color-hmi-pwm-pos)" strokeWidth={2} dot={{ r: 3, fill: 'var(--color-hmi-pwm-pos)' }} isAnimationActive={false} name="Max Err J1" />
                        </LineChart>
                      </ResponsiveContainer>
                    </ExpandableChart>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ExpandableChart title="MATE & MCTE per Kondisi" subtitle="Mean ± std error across all filtered runs" className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barChartData} margin={MARGIN}>
                        <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
                        <XAxis dataKey="name" tick={AT} axisLine={AL} tickLine={false} />
                        <YAxis tick={AT} axisLine={AL} tickLine={false} tickFormatter={YFmt} label={YLABEL('mm')} width={52} />
                        <Tooltip contentStyle={TS} formatter={(v: any) => typeof v === 'number' ? v.toFixed(3) + ' mm' : v} />
                        <Legend verticalAlign="top" align="left" height={24} wrapperStyle={LEGEND_STYLE} />
                        <Bar dataKey="MATE" fill="var(--color-hmi-j1)" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                          <ErrorBar dataKey="mateError" stroke="var(--color-hmi-j1-des)" strokeWidth={1.5} />
                        </Bar>
                        <Bar dataKey="MCTE" fill="var(--color-hmi-j2)" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                          <ErrorBar dataKey="mcteError" stroke="var(--color-hmi-j2-des)" strokeWidth={1.5} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ExpandableChart>

                  <ExpandableChart title="EEF Error & Final EEF per Kondisi" subtitle="End-effector positioning quality" className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={eefBarChartData} margin={MARGIN}>
                        <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
                        <XAxis dataKey="name" tick={AT} axisLine={AL} tickLine={false} />
                        <YAxis tick={AT} axisLine={AL} tickLine={false} tickFormatter={YFmt} label={YLABEL('mm')} width={52} />
                        <Tooltip contentStyle={TS} formatter={(v: any) => typeof v === 'number' ? v.toFixed(3) + ' mm' : v} />
                        <Legend verticalAlign="top" align="left" height={24} wrapperStyle={LEGEND_STYLE} />
                        <Bar dataKey="EEF Mean" fill="var(--color-hmi-pwm-pos)" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                          <ErrorBar dataKey="eefError" stroke="var(--color-hmi-pwm-pos)" strokeWidth={1.5} />
                        </Bar>
                        <Bar dataKey="Final EEF" fill="var(--color-hmi-ideal)" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                          <ErrorBar dataKey="finalError" stroke="var(--color-hmi-ideal)" strokeWidth={1.5} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ExpandableChart>
                </div>
              )}

              {/* ── Individual Runs Table ───────────────────────────────────── */}
              <div className="bg-hmi-panel border border-hmi-grid rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 border-b border-hmi-grid/60">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Individual Run Results List — {filteredRuns.length} runs
                  </p>
                  <p className="text-[9px] text-slate-600 mt-0.5">
                    Click row to view 9 telemetry charts. Click ⤢ on any chart to fullscreen.
                  </p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="border-hmi-grid/60 hover:bg-transparent">
                      <TableHead className="text-[10px] text-slate-500 font-bold uppercase tracking-wider py-2 w-36">Run ID</TableHead>
                      <TableHead className="text-[10px] text-slate-500 font-bold uppercase tracking-wider py-2 text-center w-16">Run #</TableHead>
                      <TableHead className="text-[10px] text-slate-500 font-bold uppercase tracking-wider py-2 text-center w-24">Direction</TableHead>
                      <TableHead className="text-[10px] text-slate-500 font-bold uppercase tracking-wider py-2 text-center">Gains J1</TableHead>
                      <TableHead className="text-[10px] text-slate-500 font-bold uppercase tracking-wider py-2 text-center w-24">Status</TableHead>
                      <TableHead className="text-[10px] text-slate-500 font-bold uppercase tracking-wider py-2 text-right pr-6 w-40">Timestamp</TableHead>
                      <TableHead className="text-[10px] text-slate-500 font-bold uppercase tracking-wider py-2 text-center w-12">Del</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRuns.map(r => {
                      const isExpanded = expandedRunId === r.id
                      const runSamples = data.samples.filter(s => s.runId === r.id)
                      const isDeleting = deletingRunId === r.id

                      return (
                        <>
                          <TableRow
                            key={r.id}
                            className={cn(
                              'border-b border-hmi-grid/40 cursor-pointer transition-colors text-[11px]',
                              isExpanded ? 'bg-hmi-ideal/5 hover:bg-hmi-ideal/10' : 'hover:bg-hmi-btn/30'
                            )}
                          >
                            <TableCell className="font-mono font-bold text-slate-200 py-2.5" onClick={() => setExpandedRunId(isExpanded ? null : r.id)}>
                              {r.id}
                            </TableCell>
                            <TableCell className="text-center font-mono text-slate-400 py-2.5" onClick={() => setExpandedRunId(isExpanded ? null : r.id)}>
                              #{r.runNumber}
                            </TableCell>
                            <TableCell className="text-center py-2.5" onClick={() => setExpandedRunId(isExpanded ? null : r.id)}>
                              <span className={cn(
                                'inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full',
                                r.direction === 'forward'
                                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              )}>
                                {r.direction === 'forward' ? <ArrowRight className="w-2.5 h-2.5" /> : <ArrowLeft className="w-2.5 h-2.5" />}
                                {r.direction}
                              </span>
                            </TableCell>
                            <TableCell className="text-center font-mono text-[10px] text-slate-400 py-2.5" onClick={() => setExpandedRunId(isExpanded ? null : r.id)}>
                              Kp={r.kp1.toFixed(2)}, Ki={r.ki1.toFixed(3)}, Kd={r.kd1.toFixed(3)}
                            </TableCell>
                            <TableCell className="text-center py-2.5" onClick={() => setExpandedRunId(isExpanded ? null : r.id)}>
                              <span className={cn(
                                'text-[9px] font-bold uppercase px-1.5 py-0.5 rounded',
                                r.status === 'ok' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                r.status === 'retrying' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                'bg-red-500/10 text-red-400 border border-red-500/20'
                              )}>
                                {r.status}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono text-[10px] text-slate-500 py-2.5 pr-6" onClick={() => setExpandedRunId(isExpanded ? null : r.id)}>
                              {new Date(r.createdAt).toLocaleString('en-US')}
                            </TableCell>
                            <TableCell className="text-center py-2.5">
                              <button
                                onClick={e => { e.stopPropagation(); handleDeleteRun(r.id) }}
                                disabled={isDeleting || isPending}
                                className={cn(
                                  'p-1.5 rounded transition-colors text-slate-600 hover:text-red-400 hover:bg-red-950/40',
                                  (isDeleting || isPending) && 'opacity-30 cursor-not-allowed'
                                )}
                                title={`Delete ${r.id}`}
                              >
                                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                              </button>
                            </TableCell>
                          </TableRow>

                          {/* Expanded charts */}
                          {isExpanded && (
                            <TableRow className="bg-hmi-bg border-b border-hmi-grid/60 hover:bg-transparent">
                              <TableCell colSpan={7} className="p-0">
                                <div className="p-4">
                                  <div className="flex items-center justify-between mb-3">
                                    <p className="text-[10px] font-bold text-hmi-ideal uppercase font-mono tracking-widest">
                                      Telemetri Run {r.id}
                                    </p>
                                    <span className="text-[9px] text-slate-600">
                                      {runSamples.length} samples
                                      {runSamples.length > 600 && ' · downsampled to 600 pts'}
                                    </span>
                                  </div>
                                  <RunCharts runId={r.id} runSamples={runSamples} runMetrics={data.metrics.find(m => m.runId === r.id)} />
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  )
}

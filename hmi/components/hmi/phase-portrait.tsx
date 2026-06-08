'use client'

import { useState, useEffect } from 'react'
import { useHMISlow } from '@/lib/hmi-context'
import { Button } from '@/components/ui/button'
import { Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

const GRID = 'rgba(255, 255, 255, 0.05)'
const AXIS_TICK = {
  fill: '#9CA3AF',
  fontSize: 11,
  fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
  fontWeight: 500,
}
const AXIS_LINE = { stroke: '#1F2937' } // Matches --color-hmi-grid
const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(17, 24, 39, 0.9)',
  backdropFilter: 'blur(8px)',
  border: '1px solid #1F2937',
  borderRadius: '6px',
  color: '#F3F4F6',
  fontFamily: 'var(--font-geist-sans), sans-serif',
  fontSize: '12px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
}

function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr
  const step = Math.ceil(arr.length / max)
  return arr.filter((_, i) => i % step === 0)
}

interface PhasePortraitProps {
  /** If provided, renders from this frozen data instead of live buffers */
  frozenD?: import('@/lib/hmi-types').DSample[]
  width?: number
  height?: number
}

export function PhasePortrait({ frozenD, width, height }: PhasePortraitProps) {
  const { state } = useHMISlow()
  const [isFocused, setIsFocused] = useState(false)
  const buf = frozenD ?? state.frozenD

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

  const j1 = buf.map(d => ({ th: d.th1, dth: d.dth1 }))
  const j2 = buf.map(d => ({ th: d.th2, dth: d.dth2 }))
  const ds1 = downsample(j1, 400)
  const ds2 = downsample(j2, 400)

  const chart = (
    <LineChart margin={{ top: 4, right: 8, left: 4, bottom: 14 }} width={width} height={height}>
      <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
      <XAxis 
        type="number"
        dataKey="th" 
        tick={AXIS_TICK} 
        axisLine={AXIS_LINE} 
        tickLine={false}
        domain={['auto', 'auto']}
        label={{ 
          value: 'θ (rad)', 
          position: 'insideBottom', 
          offset: -3, 
          fill: '#9CA3AF', 
          fontSize: 11,
          fontFamily: 'var(--font-geist-sans), sans-serif',
          fontWeight: 600
        }} 
      />
      <YAxis 
        type="number"
        tick={AXIS_TICK} 
        axisLine={AXIS_LINE} 
        tickLine={false} 
        width={36}
        domain={['auto', 'auto']}
        label={{ 
          value: 'θ̇ (rad/s)', 
          angle: -90, 
          position: 'insideLeft', 
          offset: 8, 
          fill: '#9CA3AF', 
          fontSize: 11,
          fontFamily: 'var(--font-geist-sans), sans-serif',
          fontWeight: 600
        }} 
      />
      <Tooltip 
        contentStyle={TOOLTIP_STYLE} 
        formatter={(v) => typeof v === 'number' ? v.toFixed(3) : v}
        labelFormatter={(label) => typeof label === 'number' ? `θ: ${label.toFixed(3)} rad` : label}
      />
      <Legend
        verticalAlign="top"
        height={20}
        wrapperStyle={{
          fontSize: '11px',
          fontFamily: 'var(--font-geist-sans), sans-serif',
          fontWeight: 600,
          paddingBottom: '2px'
        }}
      />
      <Line data={ds1} type="linear" dataKey="dth" stroke="#2196F3" strokeWidth={1.5} dot={false} isAnimationActive={false} name="Joint 1" />
      <Line data={ds2} type="linear" dataKey="dth" stroke="#FF9800" strokeWidth={1.5} dot={false} isAnimationActive={false} name="Joint 2" />
    </LineChart>
  )

  if (width !== undefined && height !== undefined) return chart

  return (
    <div 
      className={cn(
        "bg-hmi-panel border border-hmi-grid rounded-lg p-2 shadow-md flex flex-col transition-all duration-300 group/graph",
        isFocused 
          ? "fixed inset-0 z-[100] m-0 rounded-none p-6 bg-hmi-bg" 
          : "relative cursor-zoom-in hover:border-hmi-ideal/30 h-full w-full"
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
      {/* Focused mode header */}
      {isFocused ? (
        <div className="flex items-center justify-between mb-4 border-b border-hmi-grid pb-2 shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-hmi-text">Phase Portrait (θ vs θ̇)</h2>
            <span className="text-xs text-hmi-muted font-normal">(Press ESC to exit focus)</span>
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
      ) : (
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 px-1">Phase Portrait (θ vs θ̇)</p>
      )}

      {/* Maximize button overlay (visible on hover) */}
      {!isFocused && (
        <button
          className="absolute top-2 right-2 opacity-0 group-hover/graph:opacity-100 transition-opacity p-1.5 rounded-md bg-slate-900/80 border border-slate-800 hover:bg-slate-800 hover:text-hmi-ideal text-hmi-muted z-20 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            setIsFocused(true)
          }}
          title="Focus Graph"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      )}

      {/* Charts container — flex-1 min-h-0 required so ResponsiveContainer gets a non-zero height */}
      <div className="w-full flex-1 min-h-0" style={!isFocused && height ? { height } : undefined}>
        <ResponsiveContainer width="100%" height="100%">
          {chart}
        </ResponsiveContainer>
      </div>
    </div>
  )
}


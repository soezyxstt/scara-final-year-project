'use client'

import { useId, useState } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ReferenceArea,
} from 'recharts'
import { cn } from '@/lib/utils'

// Styling configurations matching the Zinc/Slate theme
const GRID_COLOR = 'rgba(255, 255, 255, 0.05)'
const AXIS_TICK_STYLE = {
  fill: 'var(--color-hmi-text-secondary)',
  fontSize: 10,
  fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
  fontWeight: 500,
}
const AXIS_LINE_STYLE = { stroke: 'var(--color-hmi-grid)' }

const TOOLTIP_BOX_STYLE = {
  backgroundColor: 'var(--color-hmi-elevated)',
  backdropFilter: 'blur(8px)',
  border: '1px solid var(--color-hmi-grid)',
  borderRadius: '6px',
  color: 'var(--color-hmi-text)',
  fontFamily: 'var(--font-geist-sans), sans-serif',
  fontSize: '12px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
}

export interface ChartSeries {
  key: string
  name: string
  stroke: string
  fill?: string          // Color for gradient area fill
  type?: 'line' | 'area' // Default to 'line'
  strokeDasharray?: string
  strokeWidth?: number
  strokeOpacity?: number
  yAxisId?: string       // For secondary y-axis charts
}

export interface SecondaryYAxisProps {
  id: string
  domain?: [any, any]
  tickFormatter?: (v: any) => string
  label?: string
  orientation?: 'left' | 'right'
  width?: number
}

export interface CustomReferenceLine {
  y?: number
  x?: number
  yAxisId?: string
  stroke: string
  strokeDasharray?: string
  strokeOpacity?: number
  label?: { value: string; fill: string; fontSize: number; position: any; fontWeight?: string }
}

export interface UniversalTimeSeriesChartProps {
  data: any[]
  series: ChartSeries[]
  xAxisKey?: string
  xDomain?: [any, any]
  yDomain?: [any, any]
  yLabel?: string
  secondaryYAxis?: SecondaryYAxisProps
  referenceLines?: CustomReferenceLine[]
  referenceArea?: { x1: number | null; x2: number | null; fill: string; fillOpacity: number; stroke?: string; strokeOpacity?: number; yAxisId?: string }
  isEmpty: boolean
  msg: string
  width?: number
  height?: number
  gridDensity?: number // Cartesian grid opacity multiplier
  tooltipValueFormatter?: (value: any, name: any, item: any, index: any) => any
  tooltipLabelFormatter?: (label: any) => string
  onMouseDown?: (e: any) => void
  onMouseMove?: (e: any) => void
  onMouseUp?: () => void
  onMouseLeave?: () => void
  onDoubleClick?: () => void
  cursorStyle?: string
  hiddenSeries?: Record<string, boolean>
  onLegendClick?: (dataKey: string) => void
  yAxisTickFormatter?: (v: any) => string
}

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
          <span className="text-[10px] font-bold text-hmi-muted uppercase tracking-wider select-none bg-hmi-bg/85 px-4 py-2 border border-hmi-grid/50 rounded shadow-sm">
            {cleanedMsg}
          </span>
        </div>
      )}
      {children}
    </div>
  )
}

export default function UniversalTimeSeriesChart({
  data,
  series,
  xAxisKey = 't',
  xDomain,
  yDomain = ['auto', 'auto'],
  yLabel,
  secondaryYAxis,
  referenceLines,
  referenceArea,
  isEmpty,
  msg,
  width,
  height,
  gridDensity = 0.05,
  tooltipValueFormatter = (v) => typeof v === 'number' ? (Math.abs(v) >= 1000 ? v.toExponential(1) : parseFloat(v.toPrecision(4)).toString()) : v,
  tooltipLabelFormatter = (label) => typeof label === 'number' ? `${label.toFixed(3)} s` : label,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onDoubleClick,
  cursorStyle = 'crosshair',
  hiddenSeries = {},
  onLegendClick,
  yAxisTickFormatter,
}: UniversalTimeSeriesChartProps) {
  const gradId = useId().replace(/\W/g, '')
  const [internalHidden, setInternalHidden] = useState<Record<string, boolean>>({})

  const handleLegendClick = (e: any) => {
    if (onLegendClick) {
      onLegendClick(e.dataKey)
    } else {
      setInternalHidden((prev) => ({ ...prev, [e.dataKey]: !prev[e.dataKey] }))
    }
  }

  const isSeriesHidden = (key: string) => {
    return hiddenSeries[key] !== undefined ? hiddenSeries[key] : !!internalHidden[key]
  }

  const chartMargin = { top: 12, right: secondaryYAxis ? 14 : 12, left: 10, bottom: 20 }

  const xLabelProps = yLabel ? {
    value: 'Time (seconds)',
    position: 'insideBottom' as const,
    offset: -6,
    fill: 'var(--color-hmi-text-secondary)',
    fontSize: 10,
    fontFamily: 'var(--font-geist-sans), sans-serif',
    fontWeight: 600,
  } : undefined

  const yLabelProps = yLabel ? {
    value: yLabel,
    angle: -90,
    position: 'insideLeft' as const,
    offset: 8,
    fill: 'var(--color-hmi-text-secondary)',
    fontSize: 10,
    fontFamily: 'var(--font-geist-sans), sans-serif',
    fontWeight: 600,
  } : undefined

  const chartContent = (
    <ComposedChart
      data={isEmpty ? [] : data}
      margin={chartMargin}
      width={width}
      height={height}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onDoubleClick={onDoubleClick}
      style={{ cursor: cursorStyle }}
      className="select-none font-sans"
    >
      <defs>
        {series.map((s) => {
          if (s.type === 'area' && s.fill) {
            return (
              <linearGradient key={s.key} id={`${gradId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.fill} stopOpacity={0.25} />
                <stop offset="95%" stopColor={s.fill} stopOpacity={0.0} />
              </linearGradient>
            )
          }
          return null
        })}
      </defs>

      <CartesianGrid stroke={`rgba(255, 255, 255, ${gridDensity})`} strokeDasharray="2 2" />

      <XAxis
        dataKey={xAxisKey}
        type="number"
        domain={xDomain || ['auto', 'auto']}
        tick={AXIS_TICK_STYLE}
        axisLine={AXIS_LINE_STYLE}
        tickLine={false}
        tickFormatter={(v) => typeof v === 'number' ? v.toFixed(2) : v}
        label={xLabelProps}
      />

      <YAxis
        yAxisId="default"
        type="number"
        domain={yDomain}
        tick={AXIS_TICK_STYLE}
        axisLine={AXIS_LINE_STYLE}
        tickLine={false}
        tickFormatter={yAxisTickFormatter || ((v) => typeof v === 'number' ? (Math.abs(v) >= 1000 ? v.toExponential(1) : parseFloat(v.toPrecision(4)).toString()) : v)}
        label={yLabelProps}
        width={50}
      />

      {secondaryYAxis && (
        <YAxis
          yAxisId={secondaryYAxis.id}
          orientation={secondaryYAxis.orientation || 'right'}
          type="number"
          domain={secondaryYAxis.domain || ['auto', 'auto']}
          tick={AXIS_TICK_STYLE}
          axisLine={AXIS_LINE_STYLE}
          tickLine={false}
          tickFormatter={secondaryYAxis.tickFormatter || ((v) => typeof v === 'number' ? v.toFixed(1) : v)}
          width={secondaryYAxis.width || 40}
          label={secondaryYAxis.label ? {
            value: secondaryYAxis.label,
            angle: 90,
            position: 'insideRight' as const,
            offset: -2,
            fill: 'var(--color-hmi-text-secondary)',
            fontSize: 10,
            fontFamily: 'var(--font-geist-sans), sans-serif',
            fontWeight: 600,
          } : undefined}
        />
      )}

      <Tooltip
        contentStyle={TOOLTIP_BOX_STYLE}
        formatter={tooltipValueFormatter}
        labelFormatter={tooltipLabelFormatter}
        allowEscapeViewBox={{ x: false, y: false }}
      />

      <Legend
        verticalAlign="top"
        align="left"
        height={24}
        onClick={handleLegendClick}
        wrapperStyle={{
          fontSize: '10px',
          fontFamily: 'var(--font-geist-sans), sans-serif',
          fontWeight: 600,
          paddingBottom: '4px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      />

      {/* Render Reference Area if provided */}
      {referenceArea && referenceArea.x1 !== null && referenceArea.x2 !== null && (
        <ReferenceArea
          x1={referenceArea.x1}
          x2={referenceArea.x2}
          yAxisId={referenceArea.yAxisId || 'default'}
          stroke={referenceArea.stroke || '#06B6D4'}
          strokeOpacity={referenceArea.strokeOpacity !== undefined ? referenceArea.strokeOpacity : 0.3}
          fill={referenceArea.fill}
          fillOpacity={referenceArea.fillOpacity}
        />
      )}

      {/* Render Custom Reference Lines */}
      {referenceLines?.map((line, idx) => {
        if (line.y !== undefined) {
          return (
            <ReferenceLine
              key={`ref-line-y-${idx}`}
              y={line.y}
              yAxisId={line.yAxisId || 'default'}
              stroke={line.stroke}
              strokeDasharray={line.strokeDasharray}
              strokeOpacity={line.strokeOpacity}
              label={line.label ? {
                ...line.label,
                fontSize: line.label.fontSize || 9,
                fontWeight: line.label.fontWeight || 'bold',
              } : undefined}
            />
          )
        }
        if (line.x !== undefined) {
          return (
            <ReferenceLine
              key={`ref-line-x-${idx}`}
              x={line.x}
              yAxisId={line.yAxisId || 'default'}
              stroke={line.stroke}
              strokeDasharray={line.strokeDasharray}
              strokeOpacity={line.strokeOpacity}
              label={line.label ? {
                ...line.label,
                fontSize: line.label.fontSize || 10,
                fontWeight: line.label.fontWeight || 'bold',
              } : undefined}
            />
          )
        }
        return null
      })}

      {/* Render Telemetry Series curves */}
      {series.map((s) => {
        const isHidden = isSeriesHidden(s.key)
        const yAxisId = s.yAxisId || 'default'

        if (s.type === 'area') {
          return (
            <Area
              key={s.key}
              yAxisId={yAxisId}
              type="linear"
              dataKey={s.key}
              stroke={s.stroke}
              fill={s.fill ? `url(#${gradId}-${s.key})` : 'none'}
              strokeWidth={s.strokeWidth !== undefined ? s.strokeWidth : 1.75}
              strokeOpacity={s.strokeOpacity !== undefined ? s.strokeOpacity : 1}
              dot={false}
              isAnimationActive={false}
              name={s.name}
              hide={isHidden}
            />
          )
        } else {
          return (
            <Line
              key={s.key}
              yAxisId={yAxisId}
              type="linear"
              dataKey={s.key}
              stroke={s.stroke}
              strokeDasharray={s.strokeDasharray}
              strokeWidth={s.strokeWidth !== undefined ? s.strokeWidth : 1.75}
              strokeOpacity={s.strokeOpacity !== undefined ? s.strokeOpacity : 1}
              dot={false}
              isAnimationActive={false}
              name={s.name}
              hide={isHidden}
            />
          )
        }
      })}
    </ComposedChart>
  )

  if (width !== undefined && height !== undefined) {
    return (
      <ChartContainer isEmpty={isEmpty} msg={msg}>
        {chartContent}
      </ChartContainer>
    )
  }

  return (
    <ChartContainer isEmpty={isEmpty} msg={msg}>
      <ResponsiveContainer width="100%" height="100%">
        {chartContent}
      </ResponsiveContainer>
    </ChartContainer>
  )
}

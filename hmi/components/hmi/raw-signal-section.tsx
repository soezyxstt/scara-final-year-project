'use client'

import { useMemo } from 'react'
import { useHMISlow } from '@/lib/hmi-context'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const GRID = 'rgba(255, 255, 255, 0.05)'
const AT = {
  fill: '#9CA3AF',
  fontSize: 9,
  fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
  fontWeight: 500,
}
const AL = { stroke: '#1F2937' }
const TS = {
  backgroundColor: 'rgba(17, 24, 39, 0.9)',
  backdropFilter: 'blur(8px)',
  border: '1px solid #1F2937',
  borderRadius: '6px',
  color: '#F3F4F6',
  fontFamily: 'var(--font-geist-sans), sans-serif',
  fontSize: '11px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
}

function localDownsample<T>(arr: T[], max = 500): T[] {
  if (arr.length <= max) return arr
  const step = Math.ceil(arr.length / max)
  return arr.filter((_, i) => i % step === 0)
}

export function RawSignalSection() {
  const { state } = useHMISlow()
  const { frozenD } = state

  let useDegrees = false
  if (typeof window !== 'undefined') {
    useDegrees = localStorage.getItem('hmi_angular_unit') === 'degrees'
  }
  const RAD2DEG = 180 / Math.PI
  const scale = useDegrees ? RAD2DEG : 1

  const chartData = useMemo(() => {
    if (!frozenD || frozenD.length === 0) return []
    const firstT = frozenD[0].t
    return localDownsample(
      frozenD.map((d) => ({
        t: (d.t - firstT) / 1000,
        th1: d.th1 * scale,
        th1raw: d.th1raw * scale,
        th2: d.th2 * scale,
        th2raw: d.th2raw * scale,
      }))
    )
  }, [frozenD, scale])

  return (
    <Card className="shadow-md transition-all duration-300 flex flex-col border border-hmi-grid bg-hmi-panel/40 backdrop-blur">
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-semibold text-slate-200">
          Raw vs Filtered Position
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {chartData.length === 0 ? (
          <p className="text-xs text-hmi-muted italic">No position data. Run a move to capture telemetry.</p>
        ) : (
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 4 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
                <XAxis dataKey="t" tick={AT} axisLine={AL} tickLine={false} label={{ value: 'Time (s)', position: 'insideBottom', offset: -2, fill: '#9CA3AF', fontSize: 9, fontWeight: 600 }} />
                <YAxis tick={AT} axisLine={AL} tickLine={false} label={{ value: useDegrees ? 'Angle (°)' : 'Angle (rad)', angle: -90, position: 'insideLeft', offset: 8, fill: '#9CA3AF', fontSize: 9, fontWeight: 600 }} />
                <Tooltip contentStyle={TS} formatter={(v) => typeof v === 'number' ? v.toFixed(4) : v} />
                <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: '10px', fontFamily: 'var(--font-geist-sans), sans-serif', fontWeight: 600, paddingBottom: '2px' }} />
                <Line type="linear" dataKey="th1" stroke="#2196F3" strokeWidth={1.5} dot={false} isAnimationActive={false} name="θ1 Filtered" />
                <Line type="linear" dataKey="th1raw" stroke="#9CA3AF" strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} name="θ1 Raw" />
                <Line type="linear" dataKey="th2" stroke="#FF9800" strokeWidth={1.5} dot={false} isAnimationActive={false} name="θ2 Filtered" />
                <Line type="linear" dataKey="th2raw" stroke="#4B5563" strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} name="θ2 Raw" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

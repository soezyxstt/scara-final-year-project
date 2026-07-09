'use client'

import { useMemo } from 'react'
import { ChartCard } from './chart-card'
import type { Sample, TrajectoryPoint } from '@/lib/db/schema'
import { computeCTEList, computeATEList } from '@/lib/cte-utils'
import type { TPoint } from '@/lib/hmi-types'

interface RunData {
  runId: string
  runName: string
  color: string
  samples: Sample[]
  trajectoryPoints: TrajectoryPoint[]
}

interface Props { runs: RunData[] }

export function PidTab({ runs }: Props) {
  const pidDatasets = useMemo(() =>
    runs.map(r => {
      const t0 = r.samples[0]?.t ?? 0
      return {
        runId: r.runId,
        runName: r.runName,
        color: r.color,
        data: r.samples.map(s => ({
          t: s.t - t0,
          p1_out: s.p1Out ?? 0,
          i1_out: s.i1Out ?? 0,
          d1_out: s.d1Out ?? 0,
        })),
      }
    }), [runs])

  const cteDatasets = useMemo(() =>
    runs.map(r => {
      const t0 = r.samples[0]?.t ?? 0
      const tPoints: TPoint[] = r.trajectoryPoints.map(p => ({
        xi: p.xi ?? 0, yi: p.yi ?? 0, xa: p.xa ?? 0, ya: p.ya ?? 0,
      }))
      const ctes = computeCTEList(tPoints)
      return {
        runId: r.runId,
        runName: r.runName,
        color: r.color,
        data: tPoints.map((_, i) => {
          const sample = r.samples[i]
          const tRel = sample ? (sample.t - t0) : i * 10
          return { t: tRel, cte: ctes[i] ?? 0 }
        }),
      }
    }), [runs])

  const ateDatasets = useMemo(() =>
    runs.map(r => {
      const t0 = r.samples[0]?.t ?? 0
      const tPoints: TPoint[] = r.trajectoryPoints.map(p => ({
        xi: p.xi ?? 0, yi: p.yi ?? 0, xa: p.xa ?? 0, ya: p.ya ?? 0,
      }))
      const ates = computeATEList(tPoints)
      return {
        runId: r.runId,
        runName: r.runName,
        color: r.color,
        data: tPoints.map((_, i) => {
          const sample = r.samples[i]
          const tRel = sample ? (sample.t - t0) : i * 10
          return { t: tRel, ate: ates[i] ?? 0 }
        }),
      }
    }), [runs])

  const loopDatasets = useMemo(() =>
    runs.map(r => {
      const t0 = r.samples[0]?.t ?? 0
      return {
        runId: r.runId,
        runName: r.runName,
        color: r.color,
        data: r.samples
          .filter(s => s.loopDurationUs != null)
          .map(s => ({ t: s.t - t0, loop_us: s.loopDurationUs ?? 0 })),
      }
    }), [runs])

  const errorDatasets = useMemo(() =>
    runs.map(r => {
      const t0 = r.samples[0]?.t ?? 0
      return {
        runId: r.runId,
        runName: r.runName,
        color: r.color,
        data: r.samples.map(s => ({ t: s.t - t0, e1: s.e1 ?? 0, e2: s.e2 ?? 0 })),
      }
    }), [runs])

  if (runs.length === 0) return <Empty />

  return (
    <div className="flex flex-col gap-4 p-4">
      <ChartCard
        title="PID Output Breakdown — P, I, D (J1)"
        datasets={pidDatasets}
        series={[
          { dataKey: 'p1_out', color: '#2196F3', label: 'P₁' },
          { dataKey: 'i1_out', color: '#FF9800', label: 'I₁' },
          { dataKey: 'd1_out', color: '#4CAF50', label: 'D₁' },
        ]}
        xKey="t" xLabel="ms" yLabel="output" height={220}
      />

      <ChartCard
        title="Cross-Track Error — CTE (mm)"
        datasets={cteDatasets}
        series={[{ dataKey: 'cte', color: '#FF9800', label: 'CTE' }]}
        xKey="t" xLabel="ms" yLabel="mm" height={200} type="area"
      />

      <ChartCard
        title="Along-Track Error — ATE (mm)"
        datasets={ateDatasets}
        series={[{ dataKey: 'ate', color: '#E91E63', label: 'ATE' }]}
        xKey="t" xLabel="ms" yLabel="mm" height={200} type="area"
      />

      <ChartCard
        title="Joint Position Error (rad)"
        datasets={errorDatasets}
        series={[
          { dataKey: 'e1', color: '#2196F3', label: 'e₁' },
          { dataKey: 'e2', color: '#FF9800', label: 'e₂' },
        ]}
        xKey="t" xLabel="ms" yLabel="rad" height={200}
      />

      <ChartCard
        title="Control Loop Duration (µs)"
        datasets={loopDatasets}
        series={[{ dataKey: 'loop_us', color: '#00BCD4', label: 'loop µs' }]}
        xKey="t" xLabel="ms" yLabel="µs" height={180}
      />
    </div>
  )
}

function Empty() {
  return <div className="p-8 text-center text-xs text-hmi-muted">Select one or more runs from the sidebar.</div>
}

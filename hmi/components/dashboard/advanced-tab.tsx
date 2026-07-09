'use client'

import { useMemo } from 'react'
import { ChartCard } from './chart-card'
import type { Sample, TrajectoryPoint } from '@/lib/db/schema'
import { computeATEList } from '@/lib/cte-utils'
import type { TPoint } from '@/lib/hmi-types'

interface RunData {
  runId: string
  runName: string
  color: string
  samples: Sample[]
  trajectoryPoints: TrajectoryPoint[]
}

interface Props { runs: RunData[] }

export function AdvancedTab({ runs }: Props) {
  // Phase portrait: e1 vs dth1 (error vs error-rate)
  const phaseDatasets = useMemo(() =>
    runs.map(r => ({
      runId: r.runId,
      runName: r.runName,
      color: r.color,
      data: r.samples.map(s => ({
        t: s.e1 ?? 0,  // x-axis is position error
        e1_dot: s.dth1d != null && s.dth1 != null ? s.dth1d - s.dth1 : 0,  // velocity error
        e2: s.e2 ?? 0,
        e2_dot: s.dth2d != null && s.dth2 != null ? s.dth2d - s.dth2 : 0,
      })),
    })), [runs])

  // Raw vs filtered: th1_raw vs th1
  const rawJ1Datasets = useMemo(() =>
    runs.map(r => {
      const t0 = r.samples[0]?.t ?? 0
      return {
        runId: r.runId,
        runName: r.runName,
        color: r.color,
        data: r.samples.map(s => ({
          t: s.t - t0,
          th1_raw: s.th1Raw ?? 0,
          th1: s.th1 ?? 0,
        })),
      }
    }), [runs])

  const rawJ2Datasets = useMemo(() =>
    runs.map(r => {
      const t0 = r.samples[0]?.t ?? 0
      return {
        runId: r.runId,
        runName: r.runName,
        color: r.color,
        data: r.samples.map(s => ({
          t: s.t - t0,
          th2_raw: s.th2Raw ?? 0,
          th2: s.th2 ?? 0,
        })),
      }
    }), [runs])

  // VFF1 over time
  const vffDatasets = useMemo(() =>
    runs.map(r => {
      const t0 = r.samples[0]?.t ?? 0
      return {
        runId: r.runId,
        runName: r.runName,
        color: r.color,
        data: r.samples.map(s => ({ t: s.t - t0, vff1: s.vff1 ?? 0 })),
      }
    }), [runs])

  // EEF XY error (Euclidean distance between ideal and actual)
  const eefErrDatasets = useMemo(() =>
    runs.map(r => {
      const t0 = r.samples[0]?.t ?? 0
      return {
        runId: r.runId,
        runName: r.runName,
        color: r.color,
        data: r.trajectoryPoints.map((p, i) => {
          const dx = (p.xa ?? 0) - (p.xi ?? 0)
          const dy = (p.ya ?? 0) - (p.yi ?? 0)
          const sample = r.samples[i]
          const tRel = sample ? (sample.t - t0) : i * 10
          return { t: tRel, eef_err: Math.sqrt(dx ** 2 + dy ** 2) }
        }),
      }
    }), [runs])

  // ATE datasets
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

  if (runs.length === 0) return <Empty />

  return (
    <div className="flex flex-col gap-4 p-4">
      <ChartCard
        title="Phase Portrait J1 — Error vs Error-Rate (rad, rad/s)"
        datasets={phaseDatasets}
        series={[
          { dataKey: 'e1_dot', color: '#2196F3', label: 'ė₁' },
          { dataKey: 'e2_dot', color: '#FF9800', label: 'ė₂' },
        ]}
        xKey="t"
        xLabel="e (rad)"
        yLabel="ė (rad/s)"
        height={240}
      />

      <ChartCard
        title="EEF Cartesian Error — Euclidean (mm)"
        datasets={eefErrDatasets}
        series={[{ dataKey: 'eef_err', color: '#EF5350', label: 'EEF error' }]}
        xKey="t" xLabel="ms" yLabel="mm" height={200} type="area"
      />

      <ChartCard
        title="Along-Track Error — ATE (mm)"
        datasets={ateDatasets}
        series={[{ dataKey: 'ate', color: '#E91E63', label: 'ATE' }]}
        xKey="t" xLabel="ms" yLabel="mm" height={200} type="area"
      />

      <div className="grid grid-cols-2 gap-4">
        <ChartCard
          title="J1 Raw vs TD-Filtered (rad)"
          datasets={rawJ1Datasets}
          series={[
            { dataKey: 'th1_raw', color: '#EF5350', label: 'θ₁ raw' },
            { dataKey: 'th1', color: '#2196F3', label: 'θ₁ filtered', dashed: true },
          ]}
          xKey="t" xLabel="ms" yLabel="rad" height={200}
        />

        <ChartCard
          title="J2 Raw vs TD-Filtered (rad)"
          datasets={rawJ2Datasets}
          series={[
            { dataKey: 'th2_raw', color: '#FF5722', label: 'θ₂ raw' },
            { dataKey: 'th2', color: '#FF9800', label: 'θ₂ filtered', dashed: true },
          ]}
          xKey="t" xLabel="ms" yLabel="rad" height={200}
        />
      </div>

      <ChartCard
        title="Velocity Feedforward VFF₁ (fraction of U1_MAX)"
        datasets={vffDatasets}
        series={[{ dataKey: 'vff1', color: '#E91E63', label: 'vff₁' }]}
        xKey="t" xLabel="ms" yLabel="frac" height={180}
      />
    </div>
  )
}

function Empty() {
  return <div className="p-8 text-center text-xs text-hmi-muted">Select one or more runs from the sidebar.</div>
}

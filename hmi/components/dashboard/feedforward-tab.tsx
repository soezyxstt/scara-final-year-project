'use client'

import { useMemo } from 'react'
import { ChartCard } from './chart-card'
import type { Sample, TrajectoryPoint } from '@/lib/db/schema'

interface RunData {
  runId: string
  runName: string
  color: string
  samples: Sample[]
  trajectoryPoints: TrajectoryPoint[]
}

interface Props { runs: RunData[] }

export function FeedforwardTab({ runs }: Props) {
  // J1 feedforward torque components
  const j1FfDatasets = useMemo(() =>
    runs.map(r => {
      const t0 = r.samples[0]?.t ?? 0
      return {
        runId: r.runId, runName: r.runName, color: r.color,
        data: r.samples.map(s => ({
          t: s.t - t0,
          inertia1: s.inertia1 ?? 0,
          coriolis1: s.coriolis1 ?? 0,
          gravity1: s.gravity1 ?? 0,
          ff1Contrib: s.ff1Contrib ?? 0,
        })),
      }
    }), [runs])

  // J2 feedforward torque components
  const j2FfDatasets = useMemo(() =>
    runs.map(r => {
      const t0 = r.samples[0]?.t ?? 0
      return {
        runId: r.runId, runName: r.runName, color: r.color,
        data: r.samples.map(s => ({
          t: s.t - t0,
          inertia2: s.inertia2 ?? 0,
          coriolis2: s.coriolis2 ?? 0,
          gravity2: s.gravity2 ?? 0,
        })),
      }
    }), [runs])

  // FF vs PID contribution
  const contribDatasets = useMemo(() =>
    runs.map(r => {
      const t0 = r.samples[0]?.t ?? 0
      return {
        runId: r.runId, runName: r.runName, color: r.color,
        data: r.samples.map(s => ({
          t: s.t - t0,
          ff1Contrib: s.ff1Contrib ?? 0,
          u1Total: s.u1Total ?? 0,
          integral1: s.integral1 ?? 0,
        })),
      }
    }), [runs])

  // Integral terms
  const integralDatasets = useMemo(() =>
    runs.map(r => {
      const t0 = r.samples[0]?.t ?? 0
      return {
        runId: r.runId, runName: r.runName, color: r.color,
        data: r.samples.map(s => ({
          t: s.t - t0,
          integral1: s.integral1 ?? 0,
          integral2: s.integral2 ?? 0,
          omega2Raw: s.omega2Raw ?? 0,
        })),
      }
    }), [runs])

  if (runs.length === 0) return <Empty />

  return (
    <div className="flex flex-col gap-4 p-4">
      <ChartCard
        title="J1 CTC Feedforward — Inertia, Coriolis, Gravity"
        datasets={j1FfDatasets}
        series={[
          { dataKey: 'inertia1', color: '#2196F3', label: 'Inertia₁' },
          { dataKey: 'coriolis1', color: '#FF9800', label: 'Coriolis₁' },
          { dataKey: 'gravity1', color: '#4CAF50', label: 'Gravity₁' },
          { dataKey: 'ff1Contrib', color: '#E91E63', label: 'FF₁ contrib', dashed: true },
        ]}
        xKey="t" xLabel="ms" yLabel="torque" height={240}
      />

      <ChartCard
        title="J2 CTC Feedforward — Inertia, Coriolis, Gravity"
        datasets={j2FfDatasets}
        series={[
          { dataKey: 'inertia2', color: '#9C27B0', label: 'Inertia₂' },
          { dataKey: 'coriolis2', color: '#FF5722', label: 'Coriolis₂' },
          { dataKey: 'gravity2', color: '#8BC34A', label: 'Gravity₂' },
        ]}
        xKey="t" xLabel="ms" yLabel="torque" height={220}
      />

      <ChartCard
        title="FF vs PID Contribution (J1)"
        datasets={contribDatasets}
        series={[
          { dataKey: 'ff1Contrib', color: '#2196F3', label: 'FF₁ contrib' },
          { dataKey: 'u1Total', color: '#FF9800', label: 'u₁ total' },
          { dataKey: 'integral1', color: '#4CAF50', label: 'Integral₁', dashed: true },
        ]}
        xKey="t" xLabel="ms" yLabel="norm." height={220}
      />

      <ChartCard
        title="Integrator State & ω₂ Raw"
        datasets={integralDatasets}
        series={[
          { dataKey: 'integral1', color: '#2196F3', label: 'Integral₁' },
          { dataKey: 'integral2', color: '#FF9800', label: 'Integral₂' },
          { dataKey: 'omega2Raw', color: '#9C27B0', label: 'ω₂ raw', dashed: true },
        ]}
        xKey="t" xLabel="ms" yLabel="state" height={200}
      />
    </div>
  )
}

function Empty() {
  return <div className="p-8 text-center text-xs text-hmi-muted">Select one or more runs from the sidebar.</div>
}

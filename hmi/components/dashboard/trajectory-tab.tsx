'use client'

import { buildReplayRecording } from '@/lib/saved-run-replay'
import { useMemo } from 'react'
import { ChartCard } from './chart-card'
import type { Sample, TrajectoryPoint } from '@/lib/db/schema'
import { DashboardXYTrace, type SavedRunDataset } from './dashboard-xy-trace'
import { useTranslations } from 'next-intl'

interface Props {
  runs: SavedRunDataset[]
  replayRequest?: { runId: string; token: number } | null
  onPrimaryChange?: (id: string) => void
}

export function TrajectoryTab({ runs, replayRequest, onPrimaryChange }: Props) {
  const t = useTranslations('DashboardTrajectoryTab')

  // Build joint position data from samples
  const posDatasets = useMemo(() =>
    runs.map(r => {
      const t0 = r.samples[0]?.t ?? 0
      return {
        runId: r.runId,
        runName: r.runName,
        color: r.color,
        data: r.samples.map(s => ({
          t: s.t - t0,
          th1: s.th1, th2: s.th2,
          th1d: s.th1d, th2d: s.th2d,
        })),
      }
    }), [runs])

  // Build joint error data
  const errDatasets = useMemo(() =>
    runs.map(r => {
      const t0 = r.samples[0]?.t ?? 0
      return {
        runId: r.runId,
        runName: r.runName,
        color: r.color,
        data: r.samples.map(s => ({
          t: s.t - t0,
          e1: s.e1,
          e2: s.e2,
        })),
      }
    }), [runs])

  // Use the same independent trajectory clock as visual replay.
  const xyActual = useMemo(() => runs.map(run => ({
    runId: run.runId, runName: run.runName, color: run.color,
    data: buildReplayRecording(run).pathFrames.map(frame => ({ t: frame.time, ...frame.value })),
  })), [runs])

  if (runs.length === 0) {
    return <Empty />
  }

  return (
    <div className="saved-trajectory flex flex-col gap-4 p-4">
      {/* 2D XY Robot Workspace and Arm Visualizer */}
      <DashboardXYTrace key={`${runs[0].runId}:${replayRequest?.runId === runs[0].runId ? replayRequest.token : 0}`} runs={runs} autoPlay={replayRequest?.runId === runs[0].runId} onPrimaryChange={onPrimaryChange} />

      {/* XY Cartesian path */}
      <ChartCard
        title={t('xyTrajectoryTitle')}
        datasets={xyActual}
        series={[
          { dataKey: 'xa', color: '#EF5350', label: t('actualX') },
          { dataKey: 'ya', color: '#FF9800', label: t('actualY') },
          { dataKey: 'xi', color: '#2196F3', label: t('idealX'), dashed: true },
          { dataKey: 'yi', color: '#42A5F5', label: t('idealY'), dashed: true },
        ]}
        xKey="t"
        xLabel="ms"
        yLabel="mm"
        height={220}
      />

      {/* Joint positions */}
      <ChartCard
        title={t('jointPositionTitle')}
        datasets={posDatasets}
        series={[
          { dataKey: 'th1', color: '#2196F3', label: t('th1Actual') },
          { dataKey: 'th1d', color: '#1565C0', label: t('th1Desired'), dashed: true },
          { dataKey: 'th2', color: '#FF9800', label: t('th2Actual') },
          { dataKey: 'th2d', color: '#E65100', label: t('th2Desired'), dashed: true },
        ]}
        xKey="t"
        xLabel="ms"
        yLabel="rad"
        height={220}
      />

      {/* Joint errors */}
      <ChartCard
        title={t('jointErrorTitle')}
        datasets={errDatasets}
        series={[
          { dataKey: 'e1', color: '#2196F3', label: 'e₁ = θ₁d − θ₁' },
          { dataKey: 'e2', color: '#FF9800', label: 'e₂ = θ₂d − θ₂' },
        ]}
        xKey="t"
        xLabel="ms"
        yLabel="rad"
        height={200}
      />
    </div>
  )
}

function Empty() {
  const t = useTranslations('DashboardTrajectoryTab')
  return (
    <div className="p-8 text-center text-xs text-hmi-muted">
      {t('selectRunsMessage')}
    </div>
  )
}

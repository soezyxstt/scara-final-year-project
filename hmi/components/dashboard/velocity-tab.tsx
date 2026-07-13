'use client'

import { useMemo } from 'react'
import { ChartCard } from './chart-card'
import type { Sample, TrajectoryPoint } from '@/lib/db/schema'
import { useTranslations } from 'next-intl'

interface RunData {
  runId: string
  runName: string
  color: string
  samples: Sample[]
  trajectoryPoints: TrajectoryPoint[]
}

interface Props {
  runs: RunData[]
}

const L1 = 100, L2 = 70  // SCARA link lengths (mm)

function computeEEFVelocity(samples: Sample[]) {
  const t0 = samples[0]?.t ?? 0
  return samples.map(s => {
    const th1 = s.th1 ?? 0, th2 = s.th2 ?? 0
    const dth1 = s.dth1 ?? 0, dth2 = s.dth2 ?? 0
    const dth1d = s.dth1d ?? 0, dth2d = s.dth2d ?? 0
    const s12 = Math.sin(th1 + th2)
    const c12 = Math.cos(th1 + th2)
    const vxA = (-L1 * Math.sin(th1) - L2 * s12) * dth1 + (-L2 * s12) * dth2
    const vyA = (L1 * Math.cos(th1) + L2 * c12) * dth1 + (L2 * c12) * dth2
    const vxD = (-L1 * Math.sin(th1) - L2 * s12) * dth1d + (-L2 * s12) * dth2d
    const vyD = (L1 * Math.cos(th1) + L2 * c12) * dth1d + (L2 * c12) * dth2d
    return {
      t: s.t - t0,
      v_eef_actual: Math.sqrt(vxA ** 2 + vyA ** 2),
      v_eef_desired: Math.sqrt(vxD ** 2 + vyD ** 2),
      dth1, dth2,
      dth1d, dth2d,
      pwm1: s.pwm1 ?? 0,
      u1Total: s.u1Total ?? 0,
      vff1: s.vff1 ?? 0,
    }
  })
}

export function VelocityTab({ runs }: Props) {
  const t = useTranslations('DashboardVelocityTab')

  const velDatasets = useMemo(() =>
    runs.map(r => ({
      runId: r.runId,
      runName: r.runName,
      color: r.color,
      data: computeEEFVelocity(r.samples),
    })), [runs])

  const jointVelDatasets = useMemo(() =>
    runs.map(r => {
      const t0 = r.samples[0]?.t ?? 0
      return {
        runId: r.runId,
        runName: r.runName,
        color: r.color,
        data: r.samples.map(s => ({
          t: s.t - t0,
          dth1: s.dth1 ?? 0, dth2: s.dth2 ?? 0,
          dth1d: s.dth1d ?? 0, dth2d: s.dth2d ?? 0,
        })),
      }
    }), [runs])

  const pwmDatasets = useMemo(() =>
    runs.map(r => {
      const t0 = r.samples[0]?.t ?? 0
      return {
        runId: r.runId,
        runName: r.runName,
        color: r.color,
        data: r.samples.map(s => ({ t: s.t - t0, pwm1: s.pwm1 ?? 0 })),
      }
    }), [runs])

  const u1Datasets = useMemo(() =>
    runs.map(r => {
      const t0 = r.samples[0]?.t ?? 0
      return {
        runId: r.runId,
        runName: r.runName,
        color: r.color,
        data: r.samples.map(s => ({ t: s.t - t0, u1Total: s.u1Total ?? 0, vff1: s.vff1 ?? 0 })),
      }
    }), [runs])

  if (runs.length === 0) return <Empty />

  return (
    <div className="flex flex-col gap-4 p-4">
      <ChartCard
        title={t('eefVelocityTitle')}
        datasets={velDatasets}
        series={[
          { dataKey: 'v_eef_actual', color: '#EF5350', label: t('vEefActual') },
          { dataKey: 'v_eef_desired', color: '#2196F3', label: t('vEefDesired'), dashed: true },
        ]}
        xKey="t" xLabel="ms" yLabel="mm/s" height={220}
      />

      <ChartCard
        title={t('jointVelocityTitle')}
        datasets={jointVelDatasets}
        series={[
          { dataKey: 'dth1', color: '#2196F3', label: t('w1Actual') },
          { dataKey: 'dth1d', color: '#1565C0', label: t('w1Desired'), dashed: true },
          { dataKey: 'dth2', color: '#FF9800', label: t('w2Actual') },
          { dataKey: 'dth2d', color: '#E65100', label: t('w2Desired'), dashed: true },
        ]}
        xKey="t" xLabel="ms" yLabel="rad/s" height={220}
      />

      <ChartCard
        title={t('pwmControlSignal')}
        datasets={pwmDatasets}
        series={[{ dataKey: 'pwm1', color: '#4CAF50', label: 'PWM₁' }]}
        xKey="t" xLabel="ms" yLabel="PWM" height={200} type="area"
      />

      <ChartCard
        title={t('controlEffortTitle')}
        datasets={u1Datasets}
        series={[
          { dataKey: 'u1Total', color: '#9C27B0', label: 'u₁ total' },
          { dataKey: 'vff1', color: '#E91E63', label: 'vff₁', dashed: true },
        ]}
        xKey="t" xLabel="ms" yLabel="norm." height={200}
      />
    </div>
  )
}

function Empty() {
  const t = useTranslations('DashboardVelocityTab')
  return <div className="p-8 text-center text-xs text-hmi-muted">{t('selectRunsMessage')}</div>
}

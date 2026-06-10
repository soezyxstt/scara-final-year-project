'use client'

import { memo, useEffect, useState } from 'react'
import { useHMISlow } from '@/lib/hmi-context'
import {
  registerCaptureSessionListener,
  type CaptureScope,
  ALL_CAPTURE_CHART_KEYS,
} from '@/lib/capture-session'
import {
  EEFErrChart,
  EEFVelocityChart,
  PWMChart,
  PositionChart,
  VelocityChart,
  CTEChart,
  ATEChart,
} from './chart-panel'
import { PhasePortrait } from './phase-portrait'
import {
  FFTSection,
  ControlEffortSection,
  CTCTorqueSection,
  ControlInternalSection,
  StepperVelocitySection,
  PIDBreakdownSection,
  LoopDurationSection,
} from './advanced-analysis'
import { ParamsReportChart, MetricsReportChart } from './params-report'

const W = 800
const CH = (h: number) => ({ width: W, height: h, overflow: 'hidden' as const })

const HiddenCaptureCharts = memo(function HiddenCaptureCharts({ scope }: { scope: CaptureScope }) {
  const { state } = useHMISlow()
  const frozenD = state.frozenD
  const frozenT = state.frozenT
  const keys = scope === 'all' ? ALL_CAPTURE_CHART_KEYS : scope
  const show = (key: string) => (keys as readonly string[]).includes(key)

  return (
    <div
      id="hmi-capture-root"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: W,
        opacity: 0,
        pointerEvents: 'none',
        zIndex: -1,
        overflow: 'hidden',
      }}
      aria-hidden="true"
    >
      {show('cte') && (
        <div id="capture-chart-cte" style={CH(400)}>
          <CTEChart tBuf={frozenT} dBuf={frozenD} width={W} height={400} />
        </div>
      )}
      {show('ate') && (
        <div id="capture-chart-ate" style={CH(400)}>
          <ATEChart tBuf={frozenT} dBuf={frozenD} width={W} height={400} />
        </div>
      )}
      {show('eef') && (
        <div id="capture-chart-eef" style={CH(400)}>
          <EEFErrChart tBuf={frozenT} dBuf={frozenD} width={W} height={400} />
        </div>
      )}
      {show('eef-vel') && (
        <div id="capture-chart-eef-vel" style={CH(400)}>
          <EEFVelocityChart dBuf={frozenD} width={W} height={400} />
        </div>
      )}
      {show('pwm') && (
        <div id="capture-chart-pwm" style={CH(400)}>
          <PWMChart dBuf={frozenD} width={W} height={400} />
        </div>
      )}
      {show('pos') && (
        <div id="capture-chart-pos" style={CH(400)}>
          <PositionChart dBuf={frozenD} width={W} height={400} />
        </div>
      )}
      {show('vel') && (
        <div id="capture-chart-vel" style={CH(400)}>
          <VelocityChart dBuf={frozenD} width={W} height={400} />
        </div>
      )}
      {show('phase') && (
        <div id="capture-chart-phase" style={CH(400)}>
          <PhasePortrait frozenD={frozenD} width={W} height={400} />
        </div>
      )}
      {show('fft-eef') && (
        <div id="capture-chart-fft-eef" style={CH(400)}>
          <FFTSection defaultSignal="eef" width={W} height={400} />
        </div>
      )}
      {show('fft-th1') && (
        <div id="capture-chart-fft-th1" style={CH(400)}>
          <FFTSection defaultSignal="th1" width={W} height={400} />
        </div>
      )}
      {show('fft-th2') && (
        <div id="capture-chart-fft-th2" style={CH(400)}>
          <FFTSection defaultSignal="th2" width={W} height={400} />
        </div>
      )}
      {show('effort') && (
        <div id="capture-chart-effort" style={CH(400)}>
          <ControlEffortSection width={W} height={400} />
        </div>
      )}
      {show('ctc') && (
        <div id="capture-chart-ctc" style={CH(400)}>
          <CTCTorqueSection width={W} height={400} />
        </div>
      )}
      {show('internal') && (
        <div id="capture-chart-internal" style={CH(400)}>
          <ControlInternalSection width={W} height={400} />
        </div>
      )}
      {show('stepper') && (
        <div id="capture-chart-stepper" style={CH(400)}>
          <StepperVelocitySection width={W} height={400} />
        </div>
      )}
      {show('pid-breakdown') && (
        <div id="capture-chart-pid-breakdown" style={CH(400)}>
          <PIDBreakdownSection width={W} height={400} />
        </div>
      )}
      {show('loop') && (
        <div id="capture-chart-loop" style={CH(400)}>
          <LoopDurationSection width={W} height={400} />
        </div>
      )}
      {show('params') && (
        <div id="capture-chart-params" style={CH(600)}>
          <ParamsReportChart width={W} height={600} />
        </div>
      )}
      {show('metrics') && (
        <div id="capture-chart-metrics" style={CH(500)}>
          <MetricsReportChart width={W} height={500} />
        </div>
      )}
    </div>
  )
})

/** Renders off-screen capture charts only while an export session is active. */
export function CaptureChartsHost() {
  const [scope, setScope] = useState<CaptureScope | null>(null)

  useEffect(() => registerCaptureSessionListener(setScope), [])

  if (!scope) return null
  return <HiddenCaptureCharts scope={scope} />
}

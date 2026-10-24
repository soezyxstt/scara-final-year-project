'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useHMISlow } from '@/lib/hmi-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import UniversalTimeSeriesChart, { ChartSeries } from './universal-time-series-chart'
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  RotateCcw,
  AlertTriangle,
  HelpCircle,
  Activity,
  TrendingUp,
  Gauge,
  Zap,
  Clock,
  ArrowRight,
  Target,
  ShieldAlert,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ZNSample } from '@/lib/hmi-types'
import { useTranslations } from 'next-intl'

interface DynamicMetrics {
  stepDetected: boolean
  tStart: number
  yStart: number
  yTargetBefore: number
  yTargetAfter: number
  stepSize: number
  ySS: number
  stepHeight: number
  yPeak: number
  tPeak: number
  peakTime: number
  overshootDeg: number
  overshootPct: number
  riseTime1090: number | null
  riseTime0100: number | null
  settlingTime2: number | null
  settlingTime5: number | null
  settledInSelection2: boolean
  settledInSelection5: boolean
  dampingRatio: number | null
  omegaD: number | null
  omegaN: number | null
  fD: number | null
  fN: number | null
  estimationMethod: 'log-decrement' | 'overshoot' | 'model-fit' | null
}

interface StatMetrics {
  mean: number
  stdDev: number
  p2p: number
  target: number
  snrProxy: number
  rating: 'negligible' | 'marginal' | 'significant'
}

interface ZNMetrics {
  tMin: number
  tMax: number
  peaksCount: number
  Tu: number | null
  fu: number | null
  p2p: number
  rms: number
  maxAbs: number
  ssErr: number
  peaks: { t: number; val: number }[]
  dynProps: DynamicMetrics
  statProps: StatMetrics
}

const MAX_BUFFER = 10000
// Seconds of history mirrored into React state for the live chart (the chart
// windows to the last 10 s; margin keeps edge selection usable). Full history
// stays in bufferRef — caliper metrics and persistence read from there.
const LIVE_WINDOW_S = 12

function downsample<T>(arr: T[], max = 500): T[] {
  if (arr.length <= max) return arr
  const step = Math.ceil(arr.length / max)
  return arr.filter((_, i) => i % step === 0)
}

const median = (values: number[]) => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

const smoothValues = (values: number[], radius = 2) => values.map((_, index) => {
  const from = Math.max(0, index - radius)
  const to = Math.min(values.length, index + radius + 1)
  return median(values.slice(from, to))
})

function secondOrderStep(t: number, zeta: number, omegaN: number) {
  if (t <= 0) return 0
  if (Math.abs(zeta - 1) < 1e-3) {
    return 1 - Math.exp(-omegaN * t) * (1 + omegaN * t)
  }
  if (zeta < 1) {
    const root = Math.sqrt(1 - zeta * zeta)
    const omegaD = omegaN * root
    return 1 - Math.exp(-zeta * omegaN * t)
      * (Math.cos(omegaD * t) + (zeta / root) * Math.sin(omegaD * t))
  }

  const root = Math.sqrt(zeta * zeta - 1)
  const r1 = -omegaN * (zeta - root)
  const r2 = -omegaN * (zeta + root)
  return 1 + (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r1 - r2)
}

function fitSecondOrderResponse(
  samples: ZNSample[],
  getVal: (sample: ZNSample) => number,
  tOrigin: number,
  yStart: number,
  ySS: number,
) {
  const height = ySS - yStart
  const duration = samples.at(-1)!.t - tOrigin
  if (samples.length < 8 || Math.abs(height) < 0.1 || duration <= 0.05) return null

  const fittedSamples = downsample(samples, 240)
    .map(sample => ({ t: sample.t - tOrigin, y: (getVal(sample) - yStart) / height }))
    .filter(sample => sample.t >= 0 && Number.isFinite(sample.y))
  if (fittedSamples.length < 8) return null

  const positiveDts = fittedSamples.slice(1)
    .map((sample, index) => sample.t - fittedSamples[index].t)
    .filter(dt => dt > 0)
  const sampleDt = median(positiveDts) || duration / fittedSamples.length
  const omegaMin = Math.max(0.05, 0.25 / duration)
  const omegaMax = Math.min(200, Math.max(omegaMin * 4, Math.PI / sampleDt))

  let best = { zeta: 0.7, omegaN: 1.8 / duration, error: Infinity }
  const evaluate = (zeta: number, omegaN: number) => {
    let error = 0
    for (const sample of fittedSamples) {
      const residual = sample.y - secondOrderStep(sample.t, zeta, omegaN)
      const clipped = Math.max(-3, Math.min(3, residual))
      error += clipped * clipped
    }
    return error / fittedSamples.length
  }

  for (let zi = 0; zi <= 48; zi++) {
    const zeta = 0.05 + (2.35 * zi) / 48
    for (let wi = 0; wi <= 64; wi++) {
      const ratio = wi / 64
      const omegaN = omegaMin * Math.pow(omegaMax / omegaMin, ratio)
      const error = evaluate(zeta, omegaN)
      if (error < best.error) best = { zeta, omegaN, error }
    }
  }

  for (let pass = 0; pass < 2; pass++) {
    const zetaSpan = pass === 0 ? 0.16 : 0.05
    const omegaSpan = pass === 0 ? 0.25 : 0.08
    const center = best
    for (let zi = -6; zi <= 6; zi++) {
      const zeta = Math.max(0.01, Math.min(3, center.zeta + (zi / 6) * zetaSpan))
      for (let wi = -6; wi <= 6; wi++) {
        const omegaN = Math.max(0.01, center.omegaN * (1 + (wi / 6) * omegaSpan))
        const error = evaluate(zeta, omegaN)
        if (error < best.error) best = { zeta, omegaN, error }
      }
    }
  }

  // Reject selections that do not resemble a second-order step at all.
  return best.error <= 0.35 ? best : null
}

interface ChartPointerEvent {
  activeLabel?: unknown
}

export function ZNTunerTab() {
  const t = useTranslations('ZNTuner')
  const { state, serial } = useHMISlow()
  const { serialStatus, portName, gains, estopped } = state

  // 1. Joint Selection State
  const [activeJoint, setActiveJoint] = useState<1 | 2>(1)
  const [isChartExpanded, setIsChartExpanded] = useState(false)

  // 2. Gain & Deadband configuration steps
  const [kpStep, setKpStep] = useState(0.05)
  const [kiStep, setKiStep] = useState(0.05)
  const [kdStep, setKdStep] = useState(0.05)
  const [dbStep, setDbStep] = useState(5)

  // Local state deadband (as deadband is not reported in gains G message)
  const [deadband, setDeadband] = useState(() => {
    if (typeof window !== 'undefined') {
      const val = localStorage.getItem('hmi_zn_deadband')
      return val ? parseInt(val) : 10
    }
    return 10
  })

  // Other input states
  const [stepTarget, setStepTarget] = useState('45.0')
  const [customCmd, setCustomCmd] = useState('')

  // 3. Scroll Pause / Freeze state for drag-to-select analysis
  const [isFrozen, setIsFrozen] = useState(false)
  const [frozenEndTime, setFrozenEndTime] = useState<number | null>(null)

  // 4. Recharts drag-selection coordinates
  const [selecting, setSelecting] = useState(false)
  const [selectStart, setSelectStart] = useState<number | null>(null)
  const [selectEnd, setSelectEnd] = useState<number | null>(null)
  const [metrics, setMetrics] = useState<ZNMetrics | null>(null)

  // 5. Collapsible hint box state
  const [isHintOpen, setIsHintOpen] = useState(true)

  // 6. Sub-tab inside Caliper Analyzer ('zn' | 'dyn' | 'stats')
  const [analyzerTab, setAnalyzerTab] = useState<'zn' | 'dyn' | 'stats'>('zn')

  // Local state for editable Kp, Ki, Kd values
  const [kp, setKp] = useState(0.0)
  const [ki, setKi] = useState(0.0)
  const [kd, setKd] = useState(0.0)

  // Local string input states to prevent numeric text-typing decimal point bugs
  const [kpInput, setKpInput] = useState('0.0')
  const [kiInput, setKiInput] = useState('0.0')
  const [kdInput, setKdInput] = useState('0.0')
  const [dbInput, setDbInput] = useState(deadband.toString())

  const [kpStepInput, setKpStepInput] = useState('0.05')
  const [kiStepInput, setKiStepInput] = useState('0.05')
  const [kdStepInput, setKdStepInput] = useState('0.05')
  const [dbStepInput, setDbStepInput] = useState('5')

  // Focus tracking to prevent background gains sync from overwriting active typing fields
  const [kpFocused, setKpFocused] = useState(false)
  const [kiFocused, setKiFocused] = useState(false)
  const [kdFocused, setKdFocused] = useState(false)
  const [dbFocused, setDbFocused] = useState(false)

  // Synchronize local states with gains from the global context
  useEffect(() => {
    if (!gains) return
    const frame = requestAnimationFrame(() => {
      if (activeJoint === 1) {
        const positiveKp1 = Math.round(Math.max(0, gains.kp1) * 1000) / 1000
        const positiveKi1 = Math.round(Math.max(0, gains.ki1) * 1000) / 1000
        const positiveKd1 = Math.round(Math.max(0, gains.kd1) * 1000) / 1000
        setKp(positiveKp1)
        if (!kpFocused) setKpInput(positiveKp1.toString())
        setKi(positiveKi1)
        if (!kiFocused) setKiInput(positiveKi1.toString())
        setKd(positiveKd1)
        if (!kdFocused) setKdInput(positiveKd1.toString())
      } else {
        const positiveKp2 = Math.round(Math.max(0, gains.kp2) * 1000) / 1000
        const positiveKd2 = Math.round(Math.max(0, gains.kd2) * 1000) / 1000
        setKp(positiveKp2)
        if (!kpFocused) setKpInput(positiveKp2.toString())
        setKd(positiveKd2)
        if (!kdFocused) setKdInput(positiveKd2.toString())
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [gains, activeJoint, kpFocused, kiFocused, kdFocused])

  useEffect(() => {
    localStorage.setItem('hmi_zn_deadband', deadband.toString())
    if (!dbFocused) {
      const frame = requestAnimationFrame(() => setDbInput(deadband.toString()))
      return () => cancelAnimationFrame(frame)
    }
  }, [deadband, dbFocused])

  // Synchronize deadband local state with global params context if available
  useEffect(() => {
    if (state.params?.pwmDb !== undefined) {
      const pwmDb = state.params.pwmDb
      const frame = requestAnimationFrame(() => setDeadband(pwmDb))
      return () => cancelAnimationFrame(frame)
    }
  }, [state.params?.pwmDb])

  // ── High Performance Decoupled Telemetry States ──
  const bufferRef = useRef<ZNSample[]>([])
  const [chartData, setChartData] = useState<ZNSample[]>([])
  const lastRxRef = useRef('—')
  const lastTxRef = useRef('—')
  const [rxLine, setRxLine] = useState('—')
  const [txLine, setTxLine] = useState('—')
  // Total samples in bufferRef (chartData only mirrors the live window)
  const [sampleCount, setSampleCount] = useState(0)
  // Tracks ESP32 millis() at first sample after buffer clear — for elapsed-time axis
  const startTsRef = useRef<number | null>(null)

  // Load ZN buffer and start time from localStorage on mount (for page refresh/tab switch tolerance)
  useEffect(() => {
    try {
      const persisted = localStorage.getItem('hmi_zn_buffer')
      if (persisted) {
        const parsed = JSON.parse(persisted)
        if (Array.isArray(parsed)) {
          const sanitized = parsed.map((value: unknown) => {
            if (!value || typeof value !== 'object') return null
            const s = value as Partial<ZNSample>
            return {
              idx: s.idx ?? 0,
              t: s.t ?? 0,
              t1_target: s.t1_target ?? 0,
              t1_actual: s.t1_actual ?? 0,
              t2_target: s.t2_target ?? 0,
              t2_actual: s.t2_actual ?? 0,
              pwm1: s.pwm1 ?? 0,
              t1_raw: s.t1_raw ?? s.t1_actual ?? 0,
              t2_raw: s.t2_raw ?? s.t2_actual ?? 0,
              v1: s.v1 ?? 0,
              v2: s.v2 ?? 0,
              p1_out: s.p1_out ?? 0,
              i1_out: s.i1_out ?? 0,
              d1_out: s.d1_out ?? 0,
              ff_total: s.ff_total ?? 0,
            }
          }).filter(Boolean) as ZNSample[]
          bufferRef.current = sanitized
          // chartData fills from the render tick with only the live window —
          // pushing 10k restored samples through Recharts froze the page.
        }
      }
      const persistedStartTs = localStorage.getItem('hmi_zn_start_ts')
      if (persistedStartTs) {
        startTsRef.current = parseInt(persistedStartTs, 10)
      }
    } catch { /* ignore */ }
  }, [])

  // Persist ZN buffer and start time to localStorage on unmount
  useEffect(() => {
    return () => {
      try {
        localStorage.setItem('hmi_zn_buffer', JSON.stringify(bufferRef.current))
        if (startTsRef.current !== null) {
          localStorage.setItem('hmi_zn_start_ts', startTsRef.current.toString())
        } else {
          localStorage.removeItem('hmi_zn_start_ts')
        }
      } catch { /* ignore */ }
    }
  }, [])

  // Custom Event listeners for telemetry and CLI streams (avoids React Context updates at 20 Hz)
  useEffect(() => {
    const handleSample = (e: Event) => {
      const rawSample = (e as CustomEvent).detail as {
        ts_ms: number
        t1_actual: number
        t1_target: number
        t2_actual: number
        t2_target: number
        pwm1: number
        t1_raw: number
        t2_raw: number
        v1?: number
        v2?: number
      }

      const buffer = bufferRef.current

      // Anchor elapsed time to the first sample after each buffer clear
      const lastT = buffer.length > 0 ? buffer[buffer.length - 1].t : null
      if (startTsRef.current === null) {
        startTsRef.current = rawSample.ts_ms
      } else if (lastT !== null) {
        // ts_ms is firmware millis(): after an ESP32 reboot it restarts near
        // zero, and the anchor restored from localStorage may be from another
        // boot — re-anchor so the time axis continues at the buffer tail
        // instead of jumping. Long forward gaps (plot paused) compress too.
        const expectedT = (rawSample.ts_ms - startTsRef.current) / 1000
        if (expectedT < lastT || expectedT - lastT > 5) {
          startTsRef.current = rawSample.ts_ms - (lastT + 0.02) * 1000
        }
      }

      // Elapsed time in seconds from first sample
      const newT = (rawSample.ts_ms - startTsRef.current) / 1000
      const newIdx = buffer.length > 0 ? buffer[buffer.length - 1].idx + 1 : 0

      const sample: ZNSample = {
        idx:       newIdx,
        t:         newT,
        t1_target: rawSample.t1_target ?? 0,
        t1_actual: rawSample.t1_actual ?? 0,
        t2_target: rawSample.t2_target ?? 0,
        t2_actual: rawSample.t2_actual ?? 0,
        pwm1:      rawSample.pwm1 ?? 0,
        // Rev 15-TD: raw ADC values before TD filter (fallback = filtered when old firmware)
        t1_raw:    rawSample.t1_raw ?? rawSample.t1_actual ?? 0,
        t2_raw:    rawSample.t2_raw ?? rawSample.t2_actual ?? 0,
        v1:        rawSample.v1 ?? 0,
        v2:        rawSample.v2 ?? 0,
        p1_out:    0,
        i1_out:    0,
        d1_out:    0,
        ff_total:  0,
      }

      buffer.push(sample)
    }

    const handleRx = (e: Event) => {
      const line = (e as CustomEvent).detail
      lastRxRef.current = line.length > 60 ? line.slice(0, 60) + '...' : line
    }

    const handleTx = (e: Event) => {
      lastTxRef.current = (e as CustomEvent).detail
    }

    window.addEventListener('zn_sample', handleSample)
    window.addEventListener('hmi_rx', handleRx)
    window.addEventListener('hmi_tx', handleTx)

    return () => {
      window.removeEventListener('zn_sample', handleSample)
      window.removeEventListener('hmi_rx', handleRx)
      window.removeEventListener('hmi_tx', handleTx)
    }
  }, [])

  // Throttled UI render loop (10 Hz). Only the live window enters React
  // state — copying the full 10k-sample history through Recharts at 16 Hz
  // starved the Web Serial read loop and lagged the display by seconds.
  useEffect(() => {
    const interval = setInterval(() => {
      let buffer = bufferRef.current
      if (buffer.length > MAX_BUFFER) {
        buffer = bufferRef.current = buffer.slice(buffer.length - MAX_BUFFER)
      }
      if (!isFrozen) {
        // Buffer is time-ordered: walk back from the tail, no full filter
        const tEnd = buffer.length > 0 ? buffer[buffer.length - 1].t : 0
        let start = buffer.length - 1
        while (start > 0 && tEnd - buffer[start - 1].t <= LIVE_WINDOW_S) start--
        setChartData(start <= 0 ? [...buffer] : buffer.slice(start))
      }
      setSampleCount(buffer.length)
      setRxLine(lastRxRef.current)
      setTxLine(lastTxRef.current)
    }, 100)

    return () => clearInterval(interval)
  }, [isFrozen])

  // Get active Ku (microcontroller Kp parameter for recommendations)
  const Ku = kp

  const handleGainChange = (gainName: 'kp' | 'ki' | 'kd', valStr: string) => {
    const cleanedVal = valStr.replace(/-/g, '')
    const parts = cleanedVal.split('.')
    let limitedVal = cleanedVal
    if (parts.length > 1) {
      limitedVal = parts[0] + '.' + parts[1].substring(0, 3)
    }
    if (gainName === 'kp') setKpInput(limitedVal)
    else if (gainName === 'ki') setKiInput(limitedVal)
    else if (gainName === 'kd') setKdInput(limitedVal)

    const val = parseFloat(limitedVal)
    if (isNaN(val)) return
    
    const clampedVal = Math.round(Math.max(0, val) * 1000) / 1000
    if (gainName === 'kp') setKp(clampedVal)
    else if (gainName === 'ki') setKi(clampedVal)
    else if (gainName === 'kd') setKd(clampedVal)
  }

  const handleGainBlur = async (gainName: 'kp' | 'ki' | 'kd') => {
    let val = 0
    let cmdPrefix = ''
    if (gainName === 'kp') {
      setKpFocused(false)
      val = parseFloat(kpInput)
      if (isNaN(val)) {
        setKpInput(kp.toString())
        return
      }
      cmdPrefix = activeJoint === 1 ? 'kp1' : 'kp2'
    } else if (gainName === 'ki') {
      setKiFocused(false)
      val = parseFloat(kiInput)
      if (isNaN(val)) {
        setKiInput(ki.toString())
        return
      }
      cmdPrefix = 'ki1'
    } else if (gainName === 'kd') {
      setKdFocused(false)
      val = parseFloat(kdInput)
      if (isNaN(val)) {
        setKdInput(kd.toString())
        return
      }
      cmdPrefix = activeJoint === 1 ? 'kd1' : 'kd2'
    }
    
    const cleanVal = Math.max(0.0, Math.round(val * 1000) / 1000)
    // Update local state directly so it feels responsive
    if (gainName === 'kp') {
      setKp(cleanVal)
      setKpInput(cleanVal.toString())
    } else if (gainName === 'ki') {
      setKi(cleanVal)
      setKiInput(cleanVal.toString())
    } else if (gainName === 'kd') {
      setKd(cleanVal)
      setKdInput(cleanVal.toString())
    }

    await serial.sendCommand(`${cmdPrefix},${cleanVal.toFixed(3)}`)
    await serial.sendCommand('getgains')
  }

  const handleGainKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.currentTarget as HTMLInputElement).blur()
    }
  }

  // Up/Down button click handler
  const adjustGain = async (gainName: 'kp' | 'ki' | 'kd' | 'db', direction: 'up' | 'down') => {
    let currentVal = 0
    let step = 0.05
    let cmdPrefix = ''

    if (gainName === 'kp') {
      currentVal = kp
      step = kpStep
      cmdPrefix = activeJoint === 1 ? 'kp1' : 'kp2'
    } else if (gainName === 'ki') {
      currentVal = ki
      step = kiStep
      cmdPrefix = 'ki1'
    } else if (gainName === 'kd') {
      currentVal = kd
      step = kdStep
      cmdPrefix = activeJoint === 1 ? 'kd1' : 'kd2'
    } else if (gainName === 'db') {
      currentVal = deadband
      step = dbStep
      cmdPrefix = 'db'
    }

    let newVal = direction === 'up' ? currentVal + step : currentVal - step

    if (gainName === 'db') {
      newVal = Math.max(0, Math.min(254, Math.round(newVal)))
      setDeadband(newVal)
      setDbInput(newVal.toString())
    } else {
      newVal = Math.max(0.0, newVal)
      newVal = Math.round(newVal * 1000) / 1000
      
      // Update local states immediately
      if (gainName === 'kp') {
        setKp(newVal)
        setKpInput(newVal.toString())
      } else if (gainName === 'ki') {
        setKi(newVal)
        setKiInput(newVal.toString())
      } else if (gainName === 'kd') {
        setKd(newVal)
        setKdInput(newVal.toString())
      }
    }

    await serial.sendCommand(`${cmdPrefix},${gainName === 'db' ? newVal : newVal.toFixed(3)}`)
    if (gainName === 'db') {
      await serial.sendCommand('getparams')
    }
    await serial.sendCommand('getgains')
  }
  // Target command dispatcher
  const handleSendStep = async () => {
    const val = parseFloat(stepTarget)
    if (!isNaN(val)) {
      const cmd = activeJoint === 1 ? `t1,${val.toFixed(2)}` : `t2,${val.toFixed(2)}`
      await serial.sendCommand(cmd)
    }
  }

  // Arbitrary command dispatcher
  const handleSendCustom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (customCmd.trim()) {
      await serial.sendCommand(customCmd.trim())
      setCustomCmd('')
    }
  }

  // Reset graph buffers
  const handleClearGraph = () => {
    bufferRef.current = []
    startTsRef.current = null   // reset elapsed-time anchor
    setChartData([])
    setSampleCount(0)
    setMetrics(null)
    setSelectStart(null)
    setSelectEnd(null)
    setIsFrozen(false)
    setFrozenEndTime(null)
    localStorage.removeItem('hmi_zn_buffer')
    localStorage.removeItem('hmi_zn_start_ts')
  }

  // Clear selections
  const handleResetCursor = () => {
    setSelectStart(null)
    setSelectEnd(null)
    setMetrics(null)
    setIsFrozen(false)
    setFrozenEndTime(null)
  }

  // Filter and process chart timeline
  const chartEndTime = useMemo(() => {
    if (isFrozen && frozenEndTime !== null) {
      return frozenEndTime
    }
    return chartData[chartData.length - 1]?.t ?? 0
  }, [isFrozen, frozenEndTime, chartData])

  const selectedRange = useMemo(() => {
    if (selecting || selectStart === null || selectEnd === null) return null
    const tMin = Math.min(selectStart, selectEnd)
    const tMax = Math.max(selectStart, selectEnd)
    return tMax - tMin >= 0.1 ? { tMin, tMax } : null
  }, [selecting, selectStart, selectEnd])

  const visibleData = useMemo(() => {
    if (selectedRange) {
      const selected = chartData
        .filter((sample) => sample.t >= selectedRange.tMin && sample.t <= selectedRange.tMax)
        .map((sample) => ({ ...sample, t: sample.t - selectedRange.tMin }))
      return downsample(selected, 500)
    }

    const minT = chartEndTime - 10
    const filtered = chartData.filter((d) => d.t >= minT && d.t <= chartEndTime)
    return downsample(filtered, 500)
  }, [chartData, chartEndTime, selectedRange])

  // Caliper selection events
  const handleMouseDown = (e: ChartPointerEvent | null) => {
    if (!e || typeof e.activeLabel !== 'number') return
    setSelecting(true)
    setSelectStart(e.activeLabel)
    setSelectEnd(e.activeLabel)

    // Freeze viewport scrolling when editing calipers
    if (!isFrozen && chartData.length > 0) {
      setIsFrozen(true)
      setFrozenEndTime(chartData[chartData.length - 1].t)
    }
  }

  const handleMouseMove = (e: ChartPointerEvent | null) => {
    if (selecting && e && typeof e.activeLabel === 'number') {
      setSelectEnd(e.activeLabel)
    }
  }

  const handleMouseUp = () => {
    if (selecting) {
      setSelecting(false)
      if (selectStart === null || selectEnd === null || Math.abs(selectEnd - selectStart) < 0.1) {
        setSelectStart(null)
        setSelectEnd(null)
        setMetrics(null)
        setIsFrozen(false)
        setFrozenEndTime(null)
        return
      }
      computeMetrics(selectStart, selectEnd)
    }
  }

  // Calculate ZN metrics & Dynamic Properties
  const computeMetrics = (selectionStart = selectStart, selectionEnd = selectEnd) => {
    if (selectionStart === null || selectionEnd === null) return
    const tMin = Math.min(selectionStart, selectionEnd)
    const tMax = Math.max(selectionStart, selectionEnd)

    if (tMax - tMin < 0.1) {
      setMetrics(null)
      return
    }

    const fullBuffer = bufferRef.current
    const samples = fullBuffer.filter((d) => d.t >= tMin && d.t <= tMax)
    if (samples.length < 3) {
      setMetrics(null)
      return
    }

    const getVal = (s: ZNSample) => (activeJoint === 1 ? s.t1_actual : s.t2_actual)
    const getTar = (s: ZNSample) => (activeJoint === 1 ? s.t1_target : s.t2_target)

    // Peaks calculation via first-difference slope change
    const peaks: { t: number; val: number }[] = []
    for (let i = 1; i < samples.length - 1; i++) {
      const prev = getVal(samples[i - 1])
      const curr = getVal(samples[i])
      const next = getVal(samples[i + 1])

      if (curr > prev && curr > next) {
        peaks.push({ t: samples[i].t, val: curr })
      }
    }

    // Tu ultimate period (mean interval between consecutive peaks)
    let Tu: number | null = null
    let fu: number | null = null
    if (peaks.length >= 2) {
      Tu = (peaks[peaks.length - 1].t - peaks[0].t) / (peaks.length - 1)
      fu = 1 / Tu
    }

    // Peak-to-peak amplitude
    const actuals = samples.map(getVal)
    const maxVal = Math.max(...actuals)
    const minVal = Math.min(...actuals)
    const p2p = maxVal - minVal

    // Errors
    const errors = samples.map((s) => getTar(s) - getVal(s))
    const sqSum = errors.reduce((acc, e) => acc + e * e, 0)
    const rms = Math.sqrt(sqSum / samples.length)
    const maxAbs = Math.max(...errors.map(Math.abs))

    // Steady state: last 20%
    const ssIndex = Math.floor(samples.length * 0.8)
    const ssSamples = samples.slice(ssIndex)
    const ssErrors = ssSamples.map((s) => Math.abs(getTar(s) - getVal(s)))
    const ssErr = ssErrors.length > 0 ? ssErrors.reduce((a, b) => a + b, 0) / ssErrors.length : 0

    // ── DYNAMIC PROPERTIES STEP RESPONSE ANALYSIS ──
    // Find the strongest target transition with tolerance instead of relying on
    // exact float equality. A short look-behind catches a step at the drag edge.
    const lookBehind = Math.min(1, Math.max(0.15, (tMax - tMin) * 0.2))
    const firstSearchIndex = fullBuffer.findIndex(sample => sample.t >= tMin - lookBehind)
    const searchStartIdx = Math.max(1, firstSearchIndex === -1 ? 1 : firstSearchIndex)
    let stepIdx = -1
    let largestTargetDelta = 0
    for (let i = searchStartIdx; i < fullBuffer.length && fullBuffer[i].t <= tMax; i++) {
      const delta = Math.abs(getTar(fullBuffer[i]) - getTar(fullBuffer[i - 1]))
      if (delta > largestTargetDelta) {
        largestTargetDelta = delta
        stepIdx = i
      }
    }

    const stepDetected = stepIdx > 0 && largestTargetDelta >= 0.05
    const tStart = stepDetected ? Math.max(tMin, fullBuffer[stepIdx].t) : tMin
    const beforeTargets = stepDetected
      ? fullBuffer.slice(Math.max(0, stepIdx - 8), stepIdx).map(getTar)
      : [getTar(samples[0])]
    const afterTargets = stepDetected
      ? fullBuffer.slice(stepIdx, Math.min(fullBuffer.length, stepIdx + 8)).map(getTar)
      : samples.slice(-Math.max(1, Math.floor(samples.length * 0.15))).map(getTar)
    const yTargetBefore = median(beforeTargets)
    const yTargetAfter = median(afterTargets)
    let stepSize = yTargetAfter - yTargetBefore

    const responseSamples = samples.filter(sample => sample.t >= tStart)
    const fallbackSamples = responseSamples.length >= 3 ? responseSamples : samples
    const smoothedResponseValues = smoothValues(fallbackSamples.map(getVal))
    const baselineCount = Math.max(1, Math.min(10, Math.floor(fallbackSamples.length * 0.1)))
    const yStart = median(smoothedResponseValues.slice(0, baselineCount))
    const ssCountActual = Math.max(3, Math.floor(fallbackSamples.length * 0.15))
    const ySS = median(smoothedResponseValues.slice(-ssCountActual))
    const actualChange = ySS - yStart
    if (Math.abs(stepSize) < 0.1) stepSize = actualChange
    const stepHeight = Math.abs(actualChange) > 0.1 ? actualChange : stepSize

    const baselineNoise = median(
      smoothedResponseValues.slice(0, baselineCount).map(value => Math.abs(value - yStart))
    )
    const onsetThreshold = Math.max(0.03, Math.abs(stepHeight) * 0.02, baselineNoise * 4)
    let onsetIndex = 0
    for (let i = 0; i < smoothedResponseValues.length; i++) {
      if (Math.abs(smoothedResponseValues[i] - yStart) >= onsetThreshold) {
        onsetIndex = i
        break
      }
    }
    const responseOrigin = fallbackSamples[onsetIndex]?.t ?? tStart

    let peakIndex = onsetIndex
    for (let i = onsetIndex; i < smoothedResponseValues.length; i++) {
      if ((stepHeight >= 0 && smoothedResponseValues[i] > smoothedResponseValues[peakIndex])
        || (stepHeight < 0 && smoothedResponseValues[i] < smoothedResponseValues[peakIndex])) {
        peakIndex = i
      }
    }
    const yPeak = smoothedResponseValues[peakIndex]
    const tPeak = fallbackSamples[peakIndex].t
    const peakTime = Math.max(0, tPeak - responseOrigin)

    // Calculate overshoot relative to the settled value ySS
    let overshootDeg = 0
    if (stepHeight >= 0) {
      overshootDeg = Math.max(0, yPeak - ySS)
    } else {
      overshootDeg = Math.max(0, ySS - yPeak)
    }
    const overshootPct = Math.abs(stepHeight) > 0.1 ? (overshootDeg / Math.abs(stepHeight)) * 100 : 0

    // Rise time calculations (10% to 90%, 0% to 100%) scaled to stepHeight
    const y10 = yStart + 0.1 * stepHeight
    const y90 = yStart + 0.9 * stepHeight
    const y100 = ySS

    let t10: number | null = null
    for (let i = 0; i < fallbackSamples.length - 1; i++) {
      const v1 = smoothedResponseValues[i]
      const v2 = smoothedResponseValues[i + 1]
      const t1 = fallbackSamples[i].t
      const t2 = fallbackSamples[i + 1].t

      if ((stepHeight >= 0 && v1 <= y10 && v2 >= y10) || (stepHeight < 0 && v1 >= y10 && v2 <= y10)) {
        t10 = v2 === v1 ? t1 : t1 + ((y10 - v1) / (v2 - v1)) * (t2 - t1)
        break
      }
    }
    if (t10 === null && fallbackSamples.length > 0) {
      const initialVal = smoothedResponseValues[0]
      if ((stepHeight >= 0 && initialVal >= y10) || (stepHeight < 0 && initialVal <= y10)) {
        t10 = responseOrigin
      }
    }

    let t90: number | null = null
    for (let i = 0; i < fallbackSamples.length - 1; i++) {
      const v1 = smoothedResponseValues[i]
      const v2 = smoothedResponseValues[i + 1]
      const t1 = fallbackSamples[i].t
      const t2 = fallbackSamples[i + 1].t

      if ((stepHeight >= 0 && v1 <= y90 && v2 >= y90) || (stepHeight < 0 && v1 >= y90 && v2 <= y90)) {
        t90 = v2 === v1 ? t1 : t1 + ((y90 - v1) / (v2 - v1)) * (t2 - t1)
        break
      }
    }

    let t100: number | null = null
    for (let i = 0; i < fallbackSamples.length - 1; i++) {
      const v1 = smoothedResponseValues[i]
      const v2 = smoothedResponseValues[i + 1]
      const t1 = fallbackSamples[i].t
      const t2 = fallbackSamples[i + 1].t

      if ((stepHeight >= 0 && v1 <= y100 && v2 >= y100) || (stepHeight < 0 && v1 >= y100 && v2 <= y100)) {
        t100 = v2 === v1 ? t1 : t1 + ((y100 - v1) / (v2 - v1)) * (t2 - t1)
        break
      }
    }

    const riseTime1090 = (t10 !== null && t90 !== null) ? Math.max(0, t90 - t10) : null
    const riseTime0100 = (t100 !== null) ? Math.max(0, t100 - responseOrigin) : null

    // Settling time calculations (2% and 5%) relative to ySS and stepHeight
    const tol2 = 0.02 * Math.abs(stepHeight)
    const tol5 = 0.05 * Math.abs(stepHeight)

    let settleIndex2 = -1
    for (let i = fallbackSamples.length - 1; i >= 0; i--) {
      const err = Math.abs(smoothedResponseValues[i] - ySS)
      if (err > tol2) {
        settleIndex2 = i
        break
      }
    }
    let settlingTime2: number | null = null
    let settledInSelection2 = true
    if (settleIndex2 === fallbackSamples.length - 1) {
      settledInSelection2 = false
    } else if (settleIndex2 === -1) {
      settlingTime2 = 0
    } else {
      settlingTime2 = Math.max(0, fallbackSamples[settleIndex2].t - responseOrigin)
    }

    let settleIndex5 = -1
    for (let i = fallbackSamples.length - 1; i >= 0; i--) {
      const err = Math.abs(smoothedResponseValues[i] - ySS)
      if (err > tol5) {
        settleIndex5 = i
        break
      }
    }
    let settlingTime5: number | null = null
    let settledInSelection5 = true
    if (settleIndex5 === fallbackSamples.length - 1) {
      settledInSelection5 = false
    } else if (settleIndex5 === -1) {
      settlingTime5 = 0
    } else {
      settlingTime5 = Math.max(0, fallbackSamples[settleIndex5].t - responseOrigin)
    }

    // Prefer logarithmic decrement for repeated oscillations, then classical
    // overshoot, and finally a bounded second-order fit for monotonic responses.
    let dampingRatio: number | null = null
    let omegaD: number | null = null
    let omegaN: number | null = null
    let fD: number | null = null
    let fN: number | null = null
    let estimationMethod: DynamicMetrics['estimationMethod'] = null

    const extrema: { t: number; amplitude: number }[] = []
    const minPeakAmplitude = Math.max(Math.abs(stepHeight) * 0.01, baselineNoise * 3, 0.02)
    for (let i = Math.max(1, onsetIndex); i < smoothedResponseValues.length - 1; i++) {
      const prev = smoothedResponseValues[i - 1]
      const curr = smoothedResponseValues[i]
      const next = smoothedResponseValues[i + 1]
      const isSameDirectionPeak = stepHeight >= 0
        ? curr > prev && curr >= next && curr > ySS
        : curr < prev && curr <= next && curr < ySS
      const amplitude = Math.abs(curr - ySS)
      if (isSameDirectionPeak && amplitude >= minPeakAmplitude) {
        extrema.push({ t: fallbackSamples[i].t, amplitude })
      }
    }

    const logDecrements: number[] = []
    const periods: number[] = []
    for (let i = 1; i < extrema.length; i++) {
      if (extrema[i - 1].amplitude > extrema[i].amplitude * 1.01) {
        logDecrements.push(Math.log(extrema[i - 1].amplitude / extrema[i].amplitude))
        periods.push(extrema[i].t - extrema[i - 1].t)
      }
    }

    if (logDecrements.length > 0 && periods.some(period => period > 0)) {
      const delta = median(logDecrements)
      const period = median(periods.filter(value => value > 0))
      dampingRatio = delta / Math.sqrt(4 * Math.PI * Math.PI + delta * delta)
      omegaD = 2 * Math.PI / period
      omegaN = omegaD / Math.sqrt(1 - dampingRatio * dampingRatio)
      fD = omegaD / (2 * Math.PI)
      fN = omegaN / (2 * Math.PI)
      estimationMethod = 'log-decrement'
    } else if (overshootPct > 0.1 && overshootPct < 100 && peakTime > 0) {
      const OS = overshootPct / 100
      const lnOS = Math.log(OS)
      dampingRatio = -lnOS / Math.sqrt(Math.PI * Math.PI + lnOS * lnOS)

      if (dampingRatio < 1) {
        omegaD = Math.PI / peakTime
        fD = omegaD / (2 * Math.PI)
        
        omegaN = omegaD / Math.sqrt(1 - dampingRatio * dampingRatio)
        fN = omegaN / (2 * Math.PI)
        estimationMethod = 'overshoot'
      }
    }

    if (dampingRatio === null || omegaN === null) {
      const fitted = fitSecondOrderResponse(
        fallbackSamples.slice(onsetIndex),
        getVal,
        responseOrigin,
        yStart,
        ySS,
      )
      if (fitted) {
        dampingRatio = fitted.zeta
        omegaN = fitted.omegaN
        fN = omegaN / (2 * Math.PI)
        if (dampingRatio < 1) {
          omegaD = omegaN * Math.sqrt(1 - dampingRatio * dampingRatio)
          fD = omegaD / (2 * Math.PI)
        }
        estimationMethod = 'model-fit'
      }
    }

    const dynProps: DynamicMetrics = {
      stepDetected,
      tStart,
      yStart,
      yTargetBefore,
      yTargetAfter,
      stepSize,
      ySS,
      stepHeight,
      yPeak,
      tPeak,
      peakTime,
      overshootDeg,
      overshootPct,
      riseTime1090,
      riseTime0100,
      settlingTime2,
      settlingTime5,
      settledInSelection2,
      settledInSelection5,
      dampingRatio,
      omegaD,
      omegaN,
      fD,
      fN,
      estimationMethod,
    }

    // Statistical calculations (Robot at Rest)
    const targets = samples.map(getTar)
    const meanAct = actuals.reduce((a, b) => a + b, 0) / actuals.length
    const meanTar = targets.reduce((a, b) => a + b, 0) / targets.length
    const variance = actuals.reduce((acc, val) => acc + Math.pow(val - meanAct, 2), 0) / actuals.length
    const stdDev = Math.sqrt(variance)
    const snrProxy = stdDev > 0.00001 ? Math.abs(meanAct - meanTar) / stdDev : (Math.abs(meanAct - meanTar) > 0.00001 ? 99.9 : 0)
    
    let rating: 'negligible' | 'marginal' | 'significant' = 'negligible'
    if (snrProxy > 3) {
      rating = 'significant'
    } else if (snrProxy >= 1) {
      rating = 'marginal'
    }

    const statProps: StatMetrics = {
      mean: meanAct,
      stdDev,
      p2p,
      target: meanTar,
      snrProxy,
      rating
    }

    setMetrics({
      tMin,
      tMax,
      peaksCount: peaks.length,
      Tu,
      fu,
      p2p,
      rms,
      maxAbs,
      ssErr,
      peaks,
      dynProps,
      statProps,
    })
  }

  // Click-to-apply recommendation handler
  const applyRecommendedGain = async (gainName: 'kp' | 'ki' | 'kd', val: number) => {
    const cleanVal = Math.max(0.0, Math.round(val * 1000) / 1000)
    let cmdPrefix = ''
    if (gainName === 'kp') {
      cmdPrefix = activeJoint === 1 ? 'kp1' : 'kp2'
    } else if (gainName === 'ki') {
      cmdPrefix = 'ki1'
    } else if (gainName === 'kd') {
      cmdPrefix = activeJoint === 1 ? 'kd1' : 'kd2'
    }
    await serial.sendCommand(`${cmdPrefix},${cleanVal.toFixed(3)}`)
    await serial.sendCommand('getgains')
  }

  const seriesList = useMemo(() => {
    return [
      {
        key: activeJoint === 1 ? 't1_raw' : 't2_raw',
        name: t('series.rawAdc'),
        stroke: '#94a3b8',
        strokeWidth: 1,
        strokeOpacity: 0.4,
        yAxisId: 'default'
      },
      {
        key: activeJoint === 1 ? 't1_target' : 't2_target',
        name: t('series.target'),
        stroke: '#06B6D4',
        strokeDasharray: '4 4',
        strokeWidth: 1.5,
        yAxisId: 'default'
      },
      {
        key: activeJoint === 1 ? 't1_actual' : 't2_actual',
        name: t('series.filtered'),
        stroke: '#FF9800',
        strokeWidth: 2,
        yAxisId: 'default'
      },
      {
        key: 'pwm1',
        name: t('series.pwm'),
        stroke: '#4CAF50',
        strokeWidth: 1.5,
        strokeOpacity: 0.4,
        yAxisId: 'pwm'
      }
    ] as ChartSeries[]
  }, [activeJoint, t])

  const secondaryYAxisProps = useMemo(() => {
    return {
      id: 'pwm',
      domain: [-260, 260] as [number, number],
      width: 40,
      tickFormatter: (v: number | string) => `${v}`
    }
  }, [])

  const refLines = useMemo(() => {
    return [
      {
        y: deadband,
        yAxisId: 'pwm',
        stroke: '#EF5350',
        strokeDasharray: '3 3',
        strokeOpacity: 0.5,
        label: { value: `+${deadband}db`, fill: '#EF5350', fontSize: 9, position: 'insideRight' }
      },
      {
        y: -deadband,
        yAxisId: 'pwm',
        stroke: '#EF5350',
        strokeDasharray: '3 3',
        strokeOpacity: 0.5,
        label: { value: `-${deadband}db`, fill: '#EF5350', fontSize: 9, position: 'insideRight' }
      }
    ]
  }, [deadband])

  const refArea = selectStart !== null && selectEnd !== null ? {
    x1: selectedRange ? 0 : Math.min(selectStart, selectEnd),
    x2: selectedRange ? selectedRange.tMax - selectedRange.tMin : Math.max(selectStart, selectEnd),
    fill: "#FFD700",
    fillOpacity: 0.15,
    stroke: "#FFD700",
    strokeOpacity: 0.4,
    yAxisId: "default"
  } : undefined

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] overflow-hidden bg-hmi-bg text-hmi-text font-sans">
      {/* Scrollable Layout Core */}
      <div className="flex-1 min-h-0 flex flex-col p-3 gap-3 overflow-y-auto">
        
        {/* TOP ROW: Live Graph (Dominant) & Gain Controls */}
        <div className="flex flex-col lg:flex-row gap-3 min-h-[420px] h-[55%] shrink-0">
          
          {/* Live Graph wrapper (Left, occupying ~70%) */}
          <div className={cn(
            "flex flex-col border border-hmi-grid bg-hmi-panel p-3 shadow-lg",
            isChartExpanded 
              ? "fixed inset-0 z-[100] m-0 rounded-none p-6 bg-hmi-bg h-full w-full" 
              : "flex-1 rounded-md relative overflow-hidden"
          )}>
            <div className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-hmi-muted">{t('chart.title')}</span>
                <span className="text-xs text-hmi-ideal font-mono">
                  {selectedRange ? t('chart.selectionZoomed') : isFrozen ? t('chart.frozen') : t('chart.streaming')}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className={cn("h-7 text-xs border-hmi-grid hover:bg-hmi-btn", isFrozen && "bg-hmi-btn border-hmi-ideal")}
                  onClick={() => {
                    if (isFrozen) {
                      handleResetCursor()
                    } else {
                      setIsFrozen(true)
                      setFrozenEndTime(chartData[chartData.length - 1]?.t ?? 0)
                    }
                  }}
                >
                  {isFrozen ? t('chart.resume') : t('chart.pause')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-hmi-grid text-hmi-muted hover:text-hmi-text hover:bg-hmi-btn"
                  onClick={handleResetCursor}
                >
                  <RotateCcw className="w-3 h-3 mr-1" /> {t('chart.resetSelection')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-hmi-grid text-hmi-muted hover:text-red-400 hover:bg-hmi-btn hover:border-red-900"
                  onClick={handleClearGraph}
                >
                  <Trash2 className="w-3 h-3 mr-1" /> {t('chart.clear')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border border-hmi-grid text-hmi-text-secondary hover:bg-hmi-btn hover:text-hmi-text"
                  onClick={() => setIsChartExpanded(!isChartExpanded)}
                >
                  {isChartExpanded ? <Minimize2 className="w-3.5 h-3.5 mr-1" /> : <Maximize2 className="w-3.5 h-3.5 mr-1" />}
                  {isChartExpanded ? t('chart.collapse') : t('chart.expand')}
                </Button>
              </div>
            </div>

            <div className="flex-1 min-h-0">
              <UniversalTimeSeriesChart
                data={visibleData}
                xAxisKey="t"
                xDomain={selectedRange ? [0, selectedRange.tMax - selectedRange.tMin] : [chartEndTime - 10, chartEndTime]}
                yAxisTickFormatter={(v) => `${v.toFixed(1)}°`}
                tooltipLabelFormatter={(label) => t('chart.tooltipTime', { time: Number(label).toFixed(3) })}
                tooltipValueFormatter={(v, name) => {
                  if (v == null || isNaN(Number(v))) return String(v)
                  if (String(name).toLowerCase().includes('pwm')) {
                    return `${Number(v).toFixed(1)}`
                  }
                  return `${Number(v).toFixed(4)}°`
                }}
                isEmpty={visibleData.length === 0}
                msg={t('chart.noData')}
                series={seriesList}
                secondaryYAxis={secondaryYAxisProps}
                referenceLines={refLines}
                referenceArea={refArea}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
            </div>
          </div>

          {/* Gain Controls Panel wrapper (Right, occupying ~30%) */}
          <div className="w-full lg:w-[320px] flex flex-col border border-hmi-grid bg-hmi-panel rounded-md p-3 shrink-0 overflow-y-auto">
            <span className="text-xs font-bold text-hmi-muted pb-3">{t('controls.title')}</span>

            {/* Joint Selector Toggle */}
            <div className="flex bg-hmi-bg p-0.5 rounded border border-hmi-grid mb-4">
              <button
                onClick={() => setActiveJoint(1)}
                className={cn(
                  "flex-1 text-xs py-1.5 rounded transition-all font-medium cursor-pointer",
                  activeJoint === 1 ? "bg-hmi-btn text-hmi-text shadow-sm" : "text-hmi-muted hover:text-hmi-text"
                )}
              >
                {t('controls.joint1')}
              </button>
              <button
                onClick={() => setActiveJoint(2)}
                className={cn(
                  "flex-1 text-xs py-1.5 rounded transition-all font-medium cursor-pointer",
                  activeJoint === 2 ? "bg-hmi-btn text-hmi-text shadow-sm" : "text-hmi-muted hover:text-hmi-text"
                )}
              >
                {t('controls.joint2')}
              </button>
            </div>

            {/* Parameter adjusters */}
            <div className="flex flex-col gap-3 flex-1 min-h-0">
              
              {/* Kp Row */}
              <div className="flex items-center justify-between border-b border-hmi-grid/50 pb-2">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-hmi-text font-mono">Kp</span>
                  <span className="text-[10px] text-hmi-muted">{t('controls.proportional')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.001"
                    min={0}
                    className="w-20 text-center text-xs h-7 font-mono p-1 text-hmi-text-success font-bold bg-hmi-bg border-hmi-grid"
                    value={kpInput}
                    onChange={(e) => handleGainChange('kp', e.target.value)}
                    onFocus={() => setKpFocused(true)}
                    onBlur={() => handleGainBlur('kp')}
                    onKeyDown={handleGainKeyDown}
                  />
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => adjustGain('kp', 'up')} className="bg-emerald-700 hover:bg-emerald-600 p-0.5 rounded text-white shrink-0 cursor-pointer"><ChevronUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => adjustGain('kp', 'down')} className="bg-amber-700 hover:bg-amber-600 p-0.5 rounded text-white shrink-0 cursor-pointer"><ChevronDown className="w-3.5 h-3.5" /></button>
                  </div>
                  <Input
                    type="number"
                    step="0.001"
                    className="w-16 text-center text-xs h-7 font-mono p-1"
                    value={kpStepInput}
                    onChange={(e) => {
                      setKpStepInput(e.target.value)
                      const val = parseFloat(e.target.value)
                      if (!isNaN(val)) setKpStep(Math.max(0.0001, val))
                    }}
                    onBlur={() => {
                      const val = parseFloat(kpStepInput)
                      if (isNaN(val) || val <= 0) {
                        setKpStepInput(kpStep.toString())
                      } else {
                        setKpStep(val)
                        setKpStepInput(val.toString())
                      }
                    }}
                  />
                </div>
              </div>

              {/* Ki Row (J1 ONLY) */}
              {activeJoint === 1 && (
                <div className="flex items-center justify-between border-b border-hmi-grid/50 pb-2">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-hmi-text font-mono">Ki</span>
                    <span className="text-[10px] text-hmi-muted">{t('controls.integral')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.001"
                      min={0}
                      className="w-20 text-center text-xs h-7 font-mono p-1 text-hmi-text-success font-bold bg-hmi-bg border-hmi-grid"
                      value={kiInput}
                      onChange={(e) => handleGainChange('ki', e.target.value)}
                      onFocus={() => setKiFocused(true)}
                      onBlur={() => handleGainBlur('ki')}
                      onKeyDown={handleGainKeyDown}
                    />
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => adjustGain('ki', 'up')} className="bg-emerald-700 hover:bg-emerald-600 p-0.5 rounded text-white shrink-0 cursor-pointer"><ChevronUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => adjustGain('ki', 'down')} className="bg-amber-700 hover:bg-amber-600 p-0.5 rounded text-white shrink-0 cursor-pointer"><ChevronDown className="w-3.5 h-3.5" /></button>
                    </div>
                    <Input
                      type="number"
                      step="0.001"
                      className="w-16 text-center text-xs h-7 font-mono p-1"
                      value={kiStepInput}
                      onChange={(e) => {
                        setKiStepInput(e.target.value)
                        const val = parseFloat(e.target.value)
                        if (!isNaN(val)) setKiStep(Math.max(0.0001, val))
                      }}
                      onBlur={() => {
                        const val = parseFloat(kiStepInput)
                        if (isNaN(val) || val <= 0) {
                          setKiStepInput(kiStep.toString())
                        } else {
                          setKiStep(val)
                          setKiStepInput(val.toString())
                        }
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Kd Row */}
              <div className="flex items-center justify-between border-b border-hmi-grid/50 pb-2">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-hmi-text font-mono">Kd</span>
                  <span className="text-[10px] text-hmi-muted">{t('controls.derivative')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.001"
                    min={0}
                    className="w-20 text-center text-xs h-7 font-mono p-1 text-hmi-text-success font-bold bg-hmi-bg border-hmi-grid"
                    value={kdInput}
                    onChange={(e) => handleGainChange('kd', e.target.value)}
                    onFocus={() => setKdFocused(true)}
                    onBlur={() => handleGainBlur('kd')}
                    onKeyDown={handleGainKeyDown}
                  />
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => adjustGain('kd', 'up')} className="bg-emerald-700 hover:bg-emerald-600 p-0.5 rounded text-white shrink-0 cursor-pointer"><ChevronUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => adjustGain('kd', 'down')} className="bg-amber-700 hover:bg-amber-600 p-0.5 rounded text-white shrink-0 cursor-pointer"><ChevronDown className="w-3.5 h-3.5" /></button>
                  </div>
                  <Input
                    type="number"
                    step="0.001"
                    className="w-16 text-center text-xs h-7 font-mono p-1"
                    value={kdStepInput}
                    onChange={(e) => {
                      setKdStepInput(e.target.value)
                      const val = parseFloat(e.target.value)
                      if (!isNaN(val)) setKdStep(Math.max(0.0001, val))
                    }}
                    onBlur={() => {
                      const val = parseFloat(kdStepInput)
                      if (isNaN(val) || val <= 0) {
                        setKdStepInput(kdStep.toString())
                      } else {
                        setKdStep(val)
                        setKdStepInput(val.toString())
                      }
                    }}
                  />
                </div>
              </div>

              {/* PWM Deadband Row */}
              <div className="flex items-center justify-between border-b border-hmi-grid/50 pb-2">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-hmi-text font-mono">Deadband</span>
                  <span className="text-[10px] text-hmi-muted">PWM 0-254</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    max="254"
                    className="w-20 text-center text-xs h-7 font-mono p-1 text-hmi-text-success font-bold bg-hmi-bg border-hmi-grid"
                    value={dbInput}
                    onChange={(e) => {
                      setDbInput(e.target.value)
                      const val = parseInt(e.target.value)
                      if (!isNaN(val)) setDeadband(Math.max(0, Math.min(254, val)))
                    }}
                    onFocus={() => setDbFocused(true)}
                    onBlur={async () => {
                      setDbFocused(false)
                      const val = parseInt(dbInput) || 0
                      const cleanVal = Math.max(0, Math.min(254, val))
                      setDeadband(cleanVal)
                      await serial.sendCommand(`db,${cleanVal}`)
                      await serial.sendCommand('getparams')
                      await serial.sendCommand('getgains')
                    }}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        (e.currentTarget as HTMLInputElement).blur()
                      }
                    }}
                  />
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => adjustGain('db', 'up')} className="bg-hmi-text-success hover:opacity-80 p-0.5 rounded text-white shrink-0 cursor-pointer"><ChevronUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => adjustGain('db', 'down')} className="bg-hmi-text-warning hover:opacity-80 p-0.5 rounded text-white shrink-0 cursor-pointer"><ChevronDown className="w-3.5 h-3.5" /></button>
                  </div>
                  <Input
                    type="number"
                    className="w-16 text-center text-xs h-7 font-mono p-1"
                    value={dbStepInput}
                    onChange={(e) => {
                      setDbStepInput(e.target.value)
                      const val = parseInt(e.target.value)
                      if (!isNaN(val)) setDbStep(Math.max(1, val))
                    }}
                    onBlur={() => {
                      const val = parseInt(dbStepInput)
                      if (isNaN(val) || val <= 0) {
                        setDbStepInput(dbStep.toString())
                      } else {
                        setDbStep(val)
                        setDbStepInput(val.toString())
                      }
                    }}
                  />
                </div>
              </div>

              {/* Target step command input */}
              <div className="flex flex-col gap-1 border-b border-hmi-grid/50 pb-3">
                <span className="text-[10px] font-bold text-hmi-muted">{t('controls.stepTarget')}</span>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    className="h-7 text-xs font-mono"
                    value={stepTarget}
                    onChange={(e) => setStepTarget(e.target.value)}
                  />
                  <Button size="sm" onClick={handleSendStep} className="h-7 px-3 text-xs bg-hmi-btn hover:bg-hmi-btn-hover shrink-0">
                    {t('controls.sendTarget')}
                  </Button>
                </div>
              </div>

              {/* Raw CLI command input */}
              <form onSubmit={handleSendCustom} className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-hmi-muted">{t('controls.rawCommand')}</span>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="e.g. mstep,8"
                    className="h-7 text-xs font-mono placeholder:text-hmi-dimmed font-semibold"
                    value={customCmd}
                    onChange={(e) => setCustomCmd(e.target.value)}
                  />
                  <Button type="submit" size="sm" className="h-7 px-3 text-xs bg-hmi-btn hover:bg-hmi-btn-hover shrink-0">
                    {t('controls.send')}
                  </Button>
                </div>
              </form>

              {/* Emergency Stop Button */}
              {estopped ? (
                <Button
                  variant="resume"
                  className="w-full h-9 font-bold text-sm bg-hmi-ok hover:bg-hmi-ok-hover mt-auto animate-pulse"
                  onClick={() => serial.sendCommand('resume')}
                >
                  🔄 {t('controls.resume')}
                </Button>
              ) : (
                <Button
                  variant="estop"
                  className="w-full h-9 font-bold text-sm bg-hmi-estop hover:bg-hmi-estop-hover mt-auto"
                  onClick={() => serial.sendCommand('estop')}
                >
                  🛑 {t('controls.estop')}
                </Button>
              )}

            </div>
          </div>

        </div>

        {/* BOTTOM ROW: Caliper Analysis & Calibration Hint Panel */}
        <div className="flex flex-col xl:flex-row gap-3 flex-1 min-h-[300px]">
          
          {/* Caliper Analyzer section (Left side) */}
          <div className="flex-1 border border-hmi-grid bg-hmi-panel rounded-md p-3 flex flex-col min-w-0 overflow-y-auto font-sans">
            <div className="flex items-center justify-between border-b border-hmi-grid pb-2 mb-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setAnalyzerTab('zn')}
                  className={cn(
                    "pb-1.5 text-xs font-bold  border-b-2 transition-colors cursor-pointer",
                    analyzerTab === 'zn'
                      ? "border-hmi-ideal text-hmi-text"
                      : "border-transparent text-hmi-muted hover:text-hmi-text"
                  )}
                >
                  {t('tabs.zn')}
                </button>
                <button
                  onClick={() => setAnalyzerTab('dyn')}
                  className={cn(
                    "pb-1.5 text-xs font-bold  border-b-2 transition-colors cursor-pointer",
                    analyzerTab === 'dyn'
                      ? "border-hmi-ideal text-hmi-text"
                      : "border-transparent text-hmi-muted hover:text-hmi-text"
                  )}
                >
                  {t('tabs.dynamic')}
                </button>
                <button
                  onClick={() => setAnalyzerTab('stats')}
                  className={cn(
                    "pb-1.5 text-xs font-bold  border-b-2 transition-colors cursor-pointer",
                    analyzerTab === 'stats'
                      ? "border-hmi-ideal text-hmi-text"
                      : "border-transparent text-hmi-muted hover:text-hmi-text"
                  )}
                >
                  {t('tabs.stats')}
                </button>
              </div>
              <span className="text-[10px] font-mono text-hmi-muted">
                {metrics ? t('selection.duration', { duration: (metrics.tMax - metrics.tMin).toFixed(2) }) : t('selection.none')}
              </span>
            </div>

            {metrics ? (
              analyzerTab === 'zn' ? (
                <div className="flex flex-col gap-4">
                  
                  {/* Visual caliper highlights readout */}
                  <div className="bg-hmi-bg border border-hmi-grid p-2.5 rounded flex items-center justify-between text-xs text-hmi-muted">
                    <span>{t('selection.rangeLabel')}: <strong className="text-hmi-text font-mono">0.00s</strong> {t('selection.to')} <strong className="text-hmi-text font-mono">{(metrics.tMax - metrics.tMin).toFixed(2)}s</strong></span>
                    <span>{t('selection.width')}: <strong className="text-hmi-text font-mono">{(metrics.tMax - metrics.tMin).toFixed(2)}s</strong></span>
                    <span>{t('selection.peaks')}: <strong className="text-hmi-text font-mono">{metrics.peaksCount}</strong></span>
                  </div>

                  {/* Inline warning alert if peaks < 2 */}
                  {metrics.peaksCount < 2 && (
                    <div className="flex items-start gap-2 p-3 bg-hmi-bg border border-hmi-text-error text-hmi-text-error rounded text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <strong>{t('zn.needPeaksTitle')}</strong> {t('zn.needPeaksBody')}
                      </div>
                    </div>
                  )}

                  {/* Grid readout of calculated metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                    <Card className="border-hmi-grid bg-hmi-bg p-2 flex flex-col justify-between h-14">
                      <span className="text-[10px] text-hmi-muted font-semibold tracking-tight">{t('zn.period')}</span>
                      <span className="text-xs font-mono font-bold text-hmi-text text-right">
                        {metrics.Tu ? `${metrics.Tu.toFixed(3)}s` : '—'}
                      </span>
                    </Card>
                    <Card className="border-hmi-grid bg-hmi-bg p-2 flex flex-col justify-between h-14">
                      <span className="text-[10px] text-hmi-muted font-semibold tracking-tight">{t('zn.frequency')}</span>
                      <span className="text-xs font-mono font-bold text-hmi-text text-right">
                        {metrics.fu ? `${metrics.fu.toFixed(2)} Hz` : '—'}
                      </span>
                    </Card>
                    <Card className="border-hmi-grid bg-hmi-bg p-2 flex flex-col justify-between h-14">
                      <span className="text-[10px] text-hmi-muted font-semibold tracking-tight">{t('metrics.peakToPeak')}</span>
                      <span className="text-xs font-mono font-bold text-hmi-text text-right">
                        {metrics.p2p.toFixed(2)}°
                      </span>
                    </Card>
                    <Card className="border-hmi-grid bg-hmi-bg p-2 flex flex-col justify-between h-14">
                      <span className="text-[10px] text-hmi-muted font-semibold tracking-tight">{t('metrics.rmsError')}</span>
                      <span className="text-xs font-mono font-bold text-hmi-text text-right">
                        {metrics.rms.toFixed(3)}°
                      </span>
                    </Card>
                    <Card className="border-hmi-grid bg-hmi-bg p-2 flex flex-col justify-between h-14">
                      <span className="text-[10px] text-hmi-muted font-semibold tracking-tight">{t('metrics.maxError')}</span>
                      <span className="text-xs font-mono font-bold text-hmi-text text-right">
                        {metrics.maxAbs.toFixed(3)}°
                      </span>
                    </Card>
                    <Card className="border-hmi-grid bg-hmi-bg p-2 flex flex-col justify-between h-14">
                      <span className="text-[10px] text-hmi-muted font-semibold tracking-tight">{t('metrics.steadyState')}</span>
                      <span className="text-xs font-mono font-bold text-hmi-text text-right">
                        {metrics.ssErr.toFixed(3)}°
                      </span>
                    </Card>
                  </div>

                  {/* ZN Recommendation Gain Table */}
                  <div className="border border-hmi-grid rounded overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-hmi-bg text-hmi-muted border-b border-hmi-grid font-semibold">
                          <th className="p-2 border-r border-hmi-grid font-sans">{t('zn.rule')}</th>
                          <th className="p-2 border-r border-hmi-grid font-sans">{t('zn.proportional', { ku: Ku.toFixed(2) })}</th>
                          <th className="p-2 border-r border-hmi-grid font-sans">{t('zn.integral')}</th>
                          <th className="p-2 font-sans">{t('zn.derivative')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hmi-grid font-mono">
                        {/* Row P */}
                        <tr>
                          <td className="p-2 border-r border-hmi-grid font-sans font-medium text-hmi-text-secondary">{t('zn.pControl')}</td>
                          <td className="p-2 border-r border-hmi-grid">
                            <button
                              onClick={() => applyRecommendedGain('kp', 0.50 * Ku)}
                              className="bg-hmi-bg border border-hmi-grid hover:border-hmi-ideal px-2 py-0.5 rounded text-[11px] font-mono text-hmi-ideal hover:bg-hmi-btn transition-colors cursor-pointer"
                            >
                              {(0.50 * Ku).toFixed(4)}
                            </button>
                          </td>
                          <td className="p-2 border-r border-hmi-grid text-hmi-muted">—</td>
                          <td className="p-2 text-hmi-muted">—</td>
                        </tr>

                        {/* Row PI */}
                        <tr>
                          <td className="p-2 border-r border-hmi-grid font-sans font-medium text-hmi-text-secondary">{t('zn.piControl')}</td>
                          <td className="p-2 border-r border-hmi-grid">
                            <button
                              onClick={() => applyRecommendedGain('kp', 0.45 * Ku)}
                              className="bg-hmi-bg border border-hmi-grid hover:border-hmi-ideal px-2 py-0.5 rounded text-[11px] font-mono text-hmi-ideal hover:bg-hmi-btn transition-colors cursor-pointer"
                            >
                              {(0.45 * Ku).toFixed(4)}
                            </button>
                          </td>
                          <td className="p-2 border-r border-hmi-grid">
                            {metrics.Tu && activeJoint === 1 ? (
                              <button
                                onClick={() => {
                                  const kp = 0.45 * Ku
                                  applyRecommendedGain('ki', kp / (0.83 * metrics.Tu!))
                                }}
                                className="bg-hmi-bg border border-hmi-grid hover:border-hmi-ideal px-2 py-0.5 rounded text-[11px] font-mono text-hmi-ideal hover:bg-hmi-btn transition-colors cursor-pointer"
                              >
                                {((0.45 * Ku) / (0.83 * metrics.Tu)).toFixed(4)}
                              </button>
                            ) : '—'}
                          </td>
                          <td className="p-2 text-hmi-muted">—</td>
                        </tr>

                        {/* Row PID classic */}
                        <tr>
                          <td className="p-2 border-r border-hmi-grid font-sans font-medium text-hmi-text-secondary">{t('zn.pidClassic')}</td>
                          <td className="p-2 border-r border-hmi-grid">
                            <button
                              onClick={() => applyRecommendedGain('kp', 0.60 * Ku)}
                              className="bg-hmi-bg border border-hmi-grid hover:border-hmi-ideal px-2 py-0.5 rounded text-[11px] font-mono text-hmi-ideal hover:bg-hmi-btn transition-colors cursor-pointer"
                            >
                              {(0.60 * Ku).toFixed(4)}
                            </button>
                          </td>
                          <td className="p-2 border-r border-hmi-grid">
                            {metrics.Tu && activeJoint === 1 ? (
                              <button
                                onClick={() => {
                                  const kp = 0.60 * Ku
                                  applyRecommendedGain('ki', kp / (0.50 * metrics.Tu!))
                                }}
                                className="bg-hmi-bg border border-hmi-grid hover:border-hmi-ideal px-2 py-0.5 rounded text-[11px] font-mono text-hmi-ideal hover:bg-hmi-btn transition-colors cursor-pointer"
                              >
                                {((0.60 * Ku) / (0.50 * metrics.Tu)).toFixed(4)}
                              </button>
                            ) : '—'}
                          </td>
                          <td className="p-2">
                            {metrics.Tu ? (
                              <button
                                onClick={() => {
                                  const kp = 0.60 * Ku
                                  applyRecommendedGain('kd', kp * (metrics.Tu! / 8))
                                }}
                                className="bg-hmi-bg border border-hmi-grid hover:border-hmi-ideal px-2 py-0.5 rounded text-[11px] font-mono text-hmi-ideal hover:bg-hmi-btn transition-colors cursor-pointer"
                              >
                                {((0.60 * Ku) * (metrics.Tu / 8)).toFixed(4)}
                              </button>
                            ) : '—'}
                          </td>
                        </tr>

                        {/* Row PID no-overshoot */}
                        <tr>
                          <td className="p-2 border-r border-hmi-grid font-sans font-medium text-hmi-text-secondary">{t('zn.pidNoOvershoot')}</td>
                          <td className="p-2 border-r border-hmi-grid">
                            <button
                              onClick={() => applyRecommendedGain('kp', 0.20 * Ku)}
                              className="bg-hmi-bg border border-hmi-grid hover:border-hmi-ideal px-2 py-0.5 rounded text-[11px] font-mono text-hmi-ideal hover:bg-hmi-btn transition-colors cursor-pointer"
                            >
                              {(0.20 * Ku).toFixed(4)}
                            </button>
                          </td>
                          <td className="p-2 border-r border-hmi-grid">
                            {metrics.Tu && activeJoint === 1 ? (
                              <button
                                onClick={() => {
                                  const kp = 0.20 * Ku
                                  applyRecommendedGain('ki', kp / (0.50 * metrics.Tu!))
                                }}
                                className="bg-hmi-bg border border-hmi-grid hover:border-hmi-ideal px-2 py-0.5 rounded text-[11px] font-mono text-hmi-ideal hover:bg-hmi-btn transition-colors cursor-pointer"
                              >
                                {((0.20 * Ku) / (0.50 * metrics.Tu)).toFixed(4)}
                              </button>
                            ) : '—'}
                          </td>
                          <td className="p-2">
                            {metrics.Tu ? (
                              <button
                                onClick={() => {
                                  const kp = 0.20 * Ku
                                  applyRecommendedGain('kd', kp * (metrics.Tu! / 3))
                                }}
                                className="bg-hmi-bg border border-hmi-grid hover:border-hmi-ideal px-2 py-0.5 rounded text-[11px] font-mono text-hmi-ideal hover:bg-hmi-btn transition-colors cursor-pointer"
                              >
                                {((0.20 * Ku) * (metrics.Tu / 3)).toFixed(4)}
                              </button>
                            ) : '—'}
                          </td>
                        </tr>

                        {/* Row PID Pessen */}
                        <tr>
                          <td className="p-2 border-r border-hmi-grid font-sans font-medium text-hmi-text-secondary">{t('zn.pidPessen')}</td>
                          <td className="p-2 border-r border-hmi-grid">
                            <button
                              onClick={() => applyRecommendedGain('kp', 0.70 * Ku)}
                              className="bg-hmi-bg border border-hmi-grid hover:border-hmi-ideal px-2 py-0.5 rounded text-[11px] font-mono text-hmi-ideal hover:bg-hmi-btn transition-colors cursor-pointer"
                            >
                              {(0.70 * Ku).toFixed(4)}
                            </button>
                          </td>
                          <td className="p-2 border-r border-hmi-grid">
                            {metrics.Tu && activeJoint === 1 ? (
                              <button
                                onClick={() => {
                                  const kp = 0.70 * Ku
                                  applyRecommendedGain('ki', kp / (0.40 * metrics.Tu!))
                                }}
                                className="bg-hmi-bg border border-hmi-grid hover:border-hmi-ideal px-2 py-0.5 rounded text-[11px] font-mono text-hmi-ideal hover:bg-hmi-btn transition-colors cursor-pointer"
                              >
                                {((0.70 * Ku) / (0.40 * metrics.Tu)).toFixed(4)}
                              </button>
                            ) : '—'}
                          </td>
                          <td className="p-2">
                            {metrics.Tu ? (
                              <button
                                onClick={() => {
                                  const kp = 0.70 * Ku
                                  applyRecommendedGain('kd', kp * (metrics.Tu! / 8))
                                }}
                                className="bg-hmi-bg border border-hmi-grid hover:border-hmi-ideal px-2 py-0.5 rounded text-[11px] font-mono text-hmi-ideal hover:bg-hmi-btn transition-colors cursor-pointer"
                              >
                                {((0.70 * Ku) * (metrics.Tu / 8)).toFixed(4)}
                              </button>
                            ) : '—'}
                          </td>
                        </tr>

                      </tbody>
                    </table>
                  </div>
                </div>
              ) : analyzerTab === 'dyn' ? (
                /* Dynamic Properties UI rendering */
                <div className="flex flex-col gap-4">
                  {/* Target transition information header */}
                  <div className="bg-hmi-bg border border-hmi-grid p-2.5 rounded flex flex-col md:flex-row md:items-center justify-between text-xs text-hmi-muted gap-2">
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-hmi-ideal shrink-0" />
                      <span>
                        {t('dynamic.stepDetection')}:{' '}
                        {metrics.dynProps.stepDetected ? (
                          <strong className="text-hmi-text-success font-bold">{t('dynamic.autoDetected')}</strong>
                        ) : (
                          <strong className="text-hmi-text-warning font-bold">{t('dynamic.manualFallback')}</strong>
                        )}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>{t('dynamic.start')}: <strong className="text-hmi-text font-mono">{metrics.dynProps.yStart.toFixed(2)}°</strong></span>
                      <ArrowRight className="w-3 h-3 text-hmi-muted" />
                      <span>{t('dynamic.target')}: <strong className="text-hmi-text font-mono">{metrics.dynProps.yTargetAfter.toFixed(2)}°</strong></span>
                      <span>{t('dynamic.settled')}: <strong className="text-hmi-text font-mono">{metrics.dynProps.ySS.toFixed(2)}°</strong></span>
                      <span>({t('dynamic.actualSize')}:{' '}
                        <strong className={cn("font-mono", metrics.dynProps.stepHeight >= 0 ? "text-hmi-text-success" : "text-hmi-text-error")}>
                          {metrics.dynProps.stepHeight >= 0 ? '+' : ''}{metrics.dynProps.stepHeight.toFixed(2)}°
                        </strong>
                      )</span>
                    </span>
                  </div>

                  {/* Warning if step size is extremely small */}
                  {Math.abs(metrics.dynProps.stepSize) < 0.2 && (
                    <div className="flex items-start gap-2 p-3 bg-hmi-bg border border-hmi-text-warning text-hmi-text-warning rounded text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <strong>{t('dynamic.smallStepTitle')}</strong> {t('dynamic.smallStepBody', { size: metrics.dynProps.stepSize.toFixed(2) })}
                      </div>
                    </div>
                  )}

                  {/* Dynamic Props Cards Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {/* Rise Time 10-90% */}
                    <Card className="border-hmi-grid bg-hmi-bg p-2.5 flex flex-col justify-between h-16">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-semibold tracking-tight">{t('dynamic.rise1090')}</span>
                        <Clock className="w-3.5 h-3.5 text-hmi-muted" />
                      </div>
                      <span className="text-sm font-mono font-bold text-hmi-text text-right">
                        {metrics.dynProps.riseTime1090 !== null ? `${metrics.dynProps.riseTime1090.toFixed(3)}s` : '—'}
                      </span>
                    </Card>

                    {/* Rise Time 0-100% */}
                    <Card className="border-hmi-grid bg-hmi-bg p-2.5 flex flex-col justify-between h-16">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-semibold tracking-tight">{t('dynamic.rise0100')}</span>
                        <Clock className="w-3.5 h-3.5 text-hmi-muted" />
                      </div>
                      <span className="text-sm font-mono font-bold text-hmi-text text-right">
                        {metrics.dynProps.riseTime0100 !== null ? `${metrics.dynProps.riseTime0100.toFixed(3)}s` : '—'}
                      </span>
                    </Card>

                    {/* Settling Time 2% */}
                    <Card className="border-hmi-grid bg-hmi-bg p-2.5 flex flex-col justify-between h-16">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-semibold tracking-tight">{t('dynamic.settling2')}</span>
                        <Activity className="w-3.5 h-3.5 text-hmi-muted" />
                      </div>
                      <span className={cn("text-sm font-mono font-bold text-right", !metrics.dynProps.settledInSelection2 ? "text-hmi-text-warning text-xs" : "text-hmi-text")}>
                        {metrics.dynProps.settlingTime2 !== null ? (
                          metrics.dynProps.settledInSelection2 ? `${metrics.dynProps.settlingTime2.toFixed(3)}s` : t('dynamic.notSettled')
                        ) : '—'}
                      </span>
                    </Card>

                    {/* Settling Time 5% */}
                    <Card className="border-hmi-grid bg-hmi-bg p-2.5 flex flex-col justify-between h-16">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-semibold tracking-tight">{t('dynamic.settling5')}</span>
                        <Activity className="w-3.5 h-3.5 text-hmi-muted" />
                      </div>
                      <span className={cn("text-sm font-mono font-bold text-right", !metrics.dynProps.settledInSelection5 ? "text-hmi-text-warning text-xs" : "text-hmi-text")}>
                        {metrics.dynProps.settlingTime5 !== null ? (
                          metrics.dynProps.settledInSelection5 ? `${metrics.dynProps.settlingTime5.toFixed(3)}s` : t('dynamic.notSettled')
                        ) : '—'}
                      </span>
                    </Card>

                    {/* Peak Time */}
                    <Card className="border-hmi-grid bg-hmi-bg p-2.5 flex flex-col justify-between h-16">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-semibold tracking-tight">{t('dynamic.peakTime')}</span>
                        <Clock className="w-3.5 h-3.5 text-hmi-muted" />
                      </div>
                      <span className="text-sm font-mono font-bold text-hmi-text text-right">
                        {metrics.dynProps.peakTime > 0 ? `${metrics.dynProps.peakTime.toFixed(3)}s` : '—'}
                      </span>
                    </Card>

                    {/* Max Overshoot */}
                    <Card className="border-hmi-grid bg-hmi-bg p-2.5 flex flex-col justify-between h-16">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-semibold tracking-tight">{t('dynamic.maxOvershoot')}</span>
                        <TrendingUp className="w-3.5 h-3.5 text-hmi-muted" />
                      </div>
                      <div className="flex flex-col items-end">
                        <span className={cn("text-sm font-mono font-bold leading-tight", metrics.dynProps.overshootPct > 0 ? "text-hmi-text-warning" : "text-hmi-text-success")}>
                          {metrics.dynProps.overshootPct.toFixed(1)}%
                        </span>
                        {metrics.dynProps.overshootDeg > 0 && (
                          <span className="text-[9px] text-hmi-muted font-mono leading-none">
                            ({metrics.dynProps.overshootDeg.toFixed(2)}°)
                          </span>
                        )}
                      </div>
                    </Card>

                    {/* Damping Ratio */}
                    <Card className="border-hmi-grid bg-hmi-bg p-2.5 flex flex-col justify-between h-16">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-semibold tracking-tight">{t('dynamic.dampingRatio')}</span>
                        <Gauge className="w-3.5 h-3.5 text-hmi-muted" />
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-mono font-bold text-hmi-text leading-tight">
                          {metrics.dynProps.dampingRatio !== null ? metrics.dynProps.dampingRatio.toFixed(3) : '—'}
                        </span>
                        <span className="text-[9px] text-hmi-muted leading-none">
                          {metrics.dynProps.dampingRatio !== null ? (
                            metrics.dynProps.dampingRatio < 1 ? t('dynamic.underdamped') : t('dynamic.overdamped')
                          ) : (
                            t('dynamic.unavailable')
                          )}
                        </span>
                      </div>
                    </Card>

                    {/* Frequencies (omega_n) */}
                    <Card className="border-hmi-grid bg-hmi-bg p-2.5 flex flex-col justify-between h-16">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-semibold tracking-tight">{t('dynamic.naturalFrequency')}</span>
                        <Gauge className="w-3.5 h-3.5 text-hmi-muted" />
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-xs font-mono font-bold text-hmi-text leading-tight">
                          {metrics.dynProps.omegaN !== null ? `${metrics.dynProps.omegaN.toFixed(2)} rad/s` : '—'}
                        </span>
                        {metrics.dynProps.fN !== null && (
                          <span className="text-[9px] text-hmi-muted font-mono leading-none">
                            {metrics.dynProps.fN.toFixed(2)} Hz
                          </span>
                        )}
                      </div>
                    </Card>
                  </div>

                  {/* Subtle educational text at bottom */}
                  <div className="text-[10px] text-hmi-muted border-t border-hmi-grid/50 pt-2 font-sans italic leading-relaxed">
                    {t('dynamic.estimationNote', { method: metrics.dynProps.estimationMethod ? t(`dynamic.methods.${metrics.dynProps.estimationMethod}`) : t('dynamic.methods.none') })}
                  </div>
                </div>
              ) : (
                /* Statistical Analysis (Robot at Rest) UI rendering */
                <div className="flex flex-col gap-4 animate-fade-in">
                  {/* Target transition information header / Status Banner */}
                  <div className={cn(
                    "border p-3 rounded flex flex-col md:flex-row md:items-center justify-between text-xs transition-all duration-300 gap-2",
                    metrics.statProps.rating === 'negligible' && "bg-hmi-bg border-hmi-text-success text-hmi-text-success",
                    metrics.statProps.rating === 'marginal' && "bg-hmi-bg border-hmi-text-warning text-hmi-text-warning",
                    metrics.statProps.rating === 'significant' && "bg-hmi-bg border-hmi-text-error text-hmi-text-error"
                  )}>
                    <span className="flex items-center gap-2">
                      <Zap className="w-4 h-4 shrink-0" />
                      <span>
                        {t('stats.status')}:{' '}
                        <strong className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold  border",
                          metrics.statProps.rating === 'negligible' && "border-hmi-text-success text-hmi-text-success",
                          metrics.statProps.rating === 'marginal' && "border-hmi-text-warning text-hmi-text-warning",
                          metrics.statProps.rating === 'significant' && "border-hmi-text-error text-hmi-text-error"
                        )}>
                          {t(`stats.ratings.${metrics.statProps.rating}`)}
                        </strong>
                      </span>
                    </span>
                    <span className="text-hmi-muted font-sans md:text-right">
                      {t(`stats.descriptions.${metrics.statProps.rating}`)}
                    </span>
                  </div>

                  {/* 4-Card Grid for Metrics */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Mean position */}
                    <Card className="border-hmi-grid bg-hmi-bg/40 backdrop-blur-sm p-3 flex flex-col justify-between h-20 hover:border-hmi-grid/80 transition-all group">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-bold">{t('stats.meanPosition')}</span>
                        <Target className="w-4 h-4 text-hmi-muted group-hover:text-hmi-text-success transition-colors" />
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] text-hmi-muted font-mono">{t('stats.runningAverage')}</span>
                        <span className="text-base font-mono font-bold text-hmi-text">
                          {metrics.statProps.mean.toFixed(4)}°
                        </span>
                      </div>
                    </Card>

                    {/* Standard deviation */}
                    <Card className="border-hmi-grid bg-hmi-bg/40 backdrop-blur-sm p-3 flex flex-col justify-between h-20 hover:border-hmi-grid/80 transition-all group">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-bold">{t('stats.stdDev')}</span>
                        <Activity className="w-4 h-4 text-hmi-muted group-hover:text-hmi-text-cyan transition-colors" />
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] text-hmi-muted font-mono">{t('stats.runningVariance')}</span>
                        <span className="text-base font-mono font-bold text-hmi-text">
                          {metrics.statProps.stdDev.toFixed(4)}°
                        </span>
                      </div>
                    </Card>

                    {/* Peak-to-peak */}
                    <Card className="border-hmi-grid bg-hmi-bg/40 backdrop-blur-sm p-3 flex flex-col justify-between h-20 hover:border-hmi-grid/80 transition-all group">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-bold">{t('metrics.peakToPeak')}</span>
                        <TrendingUp className="w-4 h-4 text-hmi-muted group-hover:text-hmi-text-warning transition-colors" />
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] text-hmi-muted font-mono">{t('stats.maxMinSelection')}</span>
                        <span className="text-base font-mono font-bold text-hmi-text">
                          {metrics.statProps.p2p.toFixed(4)}°
                        </span>
                      </div>
                    </Card>

                    {/* SNR proxy */}
                    <Card className="border-hmi-grid bg-hmi-bg/40 backdrop-blur-sm p-3 flex flex-col justify-between h-20 hover:border-hmi-grid/80 transition-all group">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-bold">{t('stats.snrProxy')}</span>
                        <ShieldAlert className="w-4 h-4 text-hmi-muted group-hover:text-hmi-text-error transition-colors" />
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] text-hmi-muted font-mono">||μ - θd|| / σ</span>
                        <span className="text-base font-mono font-bold text-hmi-text">
                          {metrics.statProps.snrProxy.toFixed(2)}
                        </span>
                      </div>
                    </Card>
                  </div>

                  {/* Summary comparative table */}
                  <div className="border border-hmi-grid rounded overflow-hidden mt-2">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-hmi-bg text-hmi-muted border-b border-hmi-grid font-semibold">
                          <th className="p-2 border-r border-hmi-grid font-sans w-[15%]">{t('stats.metric')}</th>
                          <th className="p-2 border-r border-hmi-grid font-sans w-[20%]">{t('stats.formula')}</th>
                          <th className="p-2 border-r border-hmi-grid font-sans w-[15%]">{t('stats.value')}</th>
                          <th className="p-2 font-sans w-[50%]">{t('stats.whyUseful')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hmi-grid font-mono text-hmi-text-secondary">
                        {/* Row Mean */}
                        <tr>
                          <td className="p-2 border-r border-hmi-grid font-sans font-medium text-hmi-text">Mean μ</td>
                          <td className="p-2 border-r border-hmi-grid text-hmi-muted">{t('stats.runningAverage')}</td>
                          <td className="p-2 border-r border-hmi-grid text-hmi-text-success font-bold">{metrics.statProps.mean.toFixed(5)}°</td>
                          <td className="p-2 font-sans text-hmi-muted text-[11px]">{t('stats.meanHelp')} <strong className="text-hmi-text font-mono">{metrics.statProps.target.toFixed(2)}°</strong>.</td>
                        </tr>

                        {/* Row Std Dev */}
                        <tr>
                          <td className="p-2 border-r border-hmi-grid font-sans font-medium text-hmi-text">Std dev σ</td>
                          <td className="p-2 border-r border-hmi-grid text-hmi-muted">{t('stats.runningVariance')}</td>
                          <td className="p-2 border-r border-hmi-grid text-hmi-text-cyan font-bold">{metrics.statProps.stdDev.toFixed(5)}°</td>
                          <td className="p-2 font-sans text-hmi-muted text-[11px]">{t('stats.stdHelp')}</td>
                        </tr>

                        {/* Row Peak-to-Peak */}
                        <tr>
                          <td className="p-2 border-r border-hmi-grid font-sans font-medium text-hmi-text">Peak-to-peak</td>
                          <td className="p-2 border-r border-hmi-grid text-hmi-muted">{t('stats.maxMinWindow')}</td>
                          <td className="p-2 border-r border-hmi-grid text-hmi-text-warning font-bold">{metrics.statProps.p2p.toFixed(5)}°</td>
                          <td className="p-2 font-sans text-hmi-muted text-[11px]">{t('stats.p2pHelp')}</td>
                        </tr>

                        {/* Row SNR Proxy */}
                        <tr>
                          <td className="p-2 border-r border-hmi-grid font-sans font-medium text-hmi-text">SNR proxy</td>
                          <td className="p-2 border-r border-hmi-grid text-hmi-muted">||μ − θd|| / σ</td>
                          <td className="p-2 border-r border-hmi-grid text-hmi-text-error font-bold">{metrics.statProps.snrProxy.toFixed(3)}</td>
                          <td className="p-2 font-sans text-hmi-muted text-[11px]">{t('stats.snrHelp')}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Educational note at bottom */}
                  <div className="text-[10px] text-hmi-muted border-t border-hmi-grid/50 pt-2 font-sans italic leading-relaxed">
                    {t('stats.note')}
                  </div>
                </div>
              )
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-hmi-grid p-6 text-center text-xs text-hmi-muted">
                <HelpCircle className="w-8 h-8 text-hmi-dimmed mb-2" />
                <p className="font-semibold text-hmi-text mb-1">{t('empty.title')}</p>
                <p className="max-w-[280px]">
                  {t('empty.body')}
                </p>
              </div>
            )}
          </div>

          {/* ZN Calibration Instruction Panel (Right side) */}
          <div className="w-full xl:w-[320px] shrink-0 border border-hmi-grid bg-hmi-panel rounded-md p-3 flex flex-col h-fit font-sans">
            <button
              onClick={() => setIsHintOpen(!isHintOpen)}
              className="flex items-center justify-between w-full text-xs font-bold text-hmi-muted cursor-pointer"
            >
              <span className="flex items-center gap-1.5"><HelpCircle className="w-3.5 h-3.5" /> {t('help.title')}</span>
              {isHintOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {isHintOpen && (
              <div className="mt-2.5 text-xs leading-relaxed text-hmi-muted border-t border-hmi-grid/50 pt-2.5 flex flex-col gap-2">
                <ol className="list-decimal pl-4 flex flex-col gap-1.5 font-sans">
                  <li>
                    {t('help.step1')}
                  </li>
                  <li>
                    {t('help.step2')}
                  </li>
                  <li>
                    {t('help.step3')}
                  </li>
                  <li>
                    {t('help.step4')}
                  </li>
                  <li>
                    {t('help.step5')}
                  </li>
                  <li>
                    {t('help.step6')}
                  </li>
                  <li>
                    {t('help.step7')}
                  </li>
                </ol>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* BOTTOM STATUS BAR */}
      <footer className="w-full bg-hmi-panel border-t border-hmi-grid px-4 py-2 flex items-center justify-between text-xs font-mono shrink-0 select-none">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="text-hmi-muted">{t('footer.port')}:</span>
            <span className={cn(serialStatus === 'connected' ? 'text-emerald-400 font-bold' : 'text-amber-500')}>
              {serialStatus === 'connected' ? (portName ?? t('footer.connected')) : t('footer.disconnected')}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <span className="text-hmi-muted">{t('footer.samples')}:</span>
            <span className="text-hmi-text">{sampleCount} / {MAX_BUFFER}</span>
          </span>
        </div>

        <div className="flex items-center gap-4 max-w-[60%] truncate">
          <span className="truncate">
            <span className="text-hmi-muted">TX:</span>{' '}
            <span className="text-hmi-text-warning font-mono">{txLine !== '—' ? `"${txLine}"` : '—'}</span>
          </span>
          <span className="truncate">
            <span className="text-hmi-muted">RX:</span>{' '}
            <span className="text-hmi-text-success font-mono">{rxLine !== '—' ? `"${rxLine}"` : '—'}</span>
          </span>
        </div>
      </footer>
    </div>
  )
}


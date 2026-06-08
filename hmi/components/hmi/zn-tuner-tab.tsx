'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useHMISlow } from '@/lib/hmi-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
  Legend,
} from 'recharts'
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

function downsample<T>(arr: T[], max = 500): T[] {
  if (arr.length <= max) return arr
  const step = Math.ceil(arr.length / max)
  return arr.filter((_, i) => i % step === 0)
}

export function ZNTunerTab({ isActive }: { isActive: boolean }) {
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
    if (gains) {
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
    }
  }, [gains, activeJoint, kpFocused, kiFocused, kdFocused])

  useEffect(() => {
    localStorage.setItem('hmi_zn_deadband', deadband.toString())
    if (!dbFocused) {
      setDbInput(deadband.toString())
    }
  }, [deadband, dbFocused])

  // Synchronize deadband local state with global params context if available
  useEffect(() => {
    if (state.params?.pwmDb !== undefined) {
      setDeadband(state.params.pwmDb)
    }
  }, [state.params?.pwmDb])

  // ── High Performance Decoupled Telemetry States ──
  const bufferRef = useRef<ZNSample[]>([])
  const [chartData, setChartData] = useState<ZNSample[]>([])
  const lastRxRef = useRef('—')
  const lastTxRef = useRef('—')
  const [rxLine, setRxLine] = useState('—')
  const [txLine, setTxLine] = useState('—')
  // Tracks ESP32 millis() at first sample after buffer clear — for elapsed-time axis
  const startTsRef = useRef<number | null>(null)

  // Load ZN buffer and start time from localStorage on mount (for page refresh/tab switch tolerance)
  useEffect(() => {
    try {
      const persisted = localStorage.getItem('hmi_zn_buffer')
      if (persisted) {
        const parsed = JSON.parse(persisted)
        if (Array.isArray(parsed)) {
          const sanitized = parsed.map((s: any) => {
            if (!s) return null
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
            }
          }).filter(Boolean) as ZNSample[]
          bufferRef.current = sanitized
          setChartData(sanitized)
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
      if (startTsRef.current === null) {
        startTsRef.current = rawSample.ts_ms
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

  // Throttled UI Render Loop (~16.7 Hz / 60ms)
  useEffect(() => {
    const interval = setInterval(() => {
      const buffer = bufferRef.current
      if (buffer.length > MAX_BUFFER) {
        bufferRef.current = buffer.slice(buffer.length - MAX_BUFFER)
      }
      if (!isFrozen) {
        // Create new array reference to force Recharts state re-evaluation
        setChartData([...bufferRef.current])
      }
      setRxLine(lastRxRef.current)
      setTxLine(lastTxRef.current)
    }, 60)

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

  const handleGainKeyDown = (e: React.KeyboardEvent, gainName: 'kp' | 'ki' | 'kd') => {
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

  const visibleData = useMemo(() => {
    const minT = chartEndTime - 10
    const filtered = chartData.filter((d) => d.t >= minT && d.t <= chartEndTime)
    return downsample(filtered, 500)
  }, [chartData, chartEndTime])

  // Caliper selection events
  const handleMouseDown = (e: any) => {
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

  const handleMouseMove = (e: any) => {
    if (selecting && e && typeof e.activeLabel === 'number') {
      setSelectEnd(e.activeLabel)
    }
  }

  const handleMouseUp = () => {
    if (selecting) {
      setSelecting(false)
      computeMetrics()
    }
  }

  // Calculate ZN metrics & Dynamic Properties
  const computeMetrics = () => {
    if (selectStart === null || selectEnd === null) return
    const tMin = Math.min(selectStart, selectEnd)
    const tMax = Math.max(selectStart, selectEnd)

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
    const finalTarget = getTar(samples[samples.length - 1])
    
    // Find index of the last sample of selection in the full buffer
    const lastSampleInSelection = samples[samples.length - 1]
    const lastIdxInFull = fullBuffer.findIndex((s) => s.t === lastSampleInSelection.t)
    
    // Scan backward to find when target transitioned to finalTarget
    let stepIdx = -1
    if (lastIdxInFull !== -1) {
      for (let i = lastIdxInFull; i > 0; i--) {
        // If we find a target transition point
        if (getTar(fullBuffer[i]) === finalTarget && getTar(fullBuffer[i - 1]) !== finalTarget) {
          stepIdx = i
          break
        }
      }
    }

    let stepDetected = stepIdx !== -1
    let tStart = stepDetected ? fullBuffer[stepIdx].t : tMin
    let yTargetBefore = stepDetected ? getTar(fullBuffer[stepIdx - 1]) : getVal(samples[0])
    let yTargetAfter = finalTarget
    let stepSize = yTargetAfter - yTargetBefore

    // Fallback if step size is too small (e.g. constant target trace with manual step estimation)
    if (Math.abs(stepSize) < 0.1 && samples.length > 0) {
      stepSize = yTargetAfter - getVal(samples[0])
    }

    // Filter samples chronologically starting from the detected/assumed step start
    const responseSamples = fullBuffer.filter((s) => s.t >= tStart && s.t <= tMax)
    const fallbackSamples = responseSamples.length > 0 ? responseSamples : samples
    
    const yStart = getVal(fallbackSamples[0])
    
    // Steady state value calculation for the selected response window (actual settled value)
    const ssActualSamples = fallbackSamples.slice(Math.floor(fallbackSamples.length * 0.85))
    const ySS = ssActualSamples.length > 0
      ? ssActualSamples.reduce((sum, s) => sum + getVal(s), 0) / ssActualSamples.length
      : yTargetAfter

    // Actual change height of the step response
    const actualChange = ySS - yStart
    // Use actual change if significant, otherwise fallback to the command step size
    const stepHeight = Math.abs(actualChange) > 0.1 ? actualChange : stepSize

    // Peak search within step response window
    let peakSample = fallbackSamples[0]
    let yPeak = getVal(peakSample)
    for (const s of fallbackSamples) {
      const val = getVal(s)
      if (stepHeight >= 0) {
        if (val > yPeak) {
          yPeak = val
          peakSample = s
        }
      } else {
        if (val < yPeak) {
          yPeak = val
          peakSample = s
        }
      }
    }
    const tPeak = peakSample.t
    const peakTime = Math.max(0, tPeak - tStart)

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
      const v1 = getVal(fallbackSamples[i])
      const v2 = getVal(fallbackSamples[i + 1])
      const t1 = fallbackSamples[i].t
      const t2 = fallbackSamples[i + 1].t

      if ((stepHeight >= 0 && v1 <= y10 && v2 >= y10) || (stepHeight < 0 && v1 >= y10 && v2 <= y10)) {
        t10 = v2 === v1 ? t1 : t1 + ((y10 - v1) / (v2 - v1)) * (t2 - t1)
        break
      }
    }
    if (t10 === null && fallbackSamples.length > 0) {
      const initialVal = getVal(fallbackSamples[0])
      if ((stepHeight >= 0 && initialVal >= y10) || (stepHeight < 0 && initialVal <= y10)) {
        t10 = tStart
      }
    }

    let t90: number | null = null
    for (let i = 0; i < fallbackSamples.length - 1; i++) {
      const v1 = getVal(fallbackSamples[i])
      const v2 = getVal(fallbackSamples[i + 1])
      const t1 = fallbackSamples[i].t
      const t2 = fallbackSamples[i + 1].t

      if ((stepHeight >= 0 && v1 <= y90 && v2 >= y90) || (stepHeight < 0 && v1 >= y90 && v2 <= y90)) {
        t90 = v2 === v1 ? t1 : t1 + ((y90 - v1) / (v2 - v1)) * (t2 - t1)
        break
      }
    }

    let t100: number | null = null
    for (let i = 0; i < fallbackSamples.length - 1; i++) {
      const v1 = getVal(fallbackSamples[i])
      const v2 = getVal(fallbackSamples[i + 1])
      const t1 = fallbackSamples[i].t
      const t2 = fallbackSamples[i + 1].t

      if ((stepHeight >= 0 && v1 <= y100 && v2 >= y100) || (stepHeight < 0 && v1 >= y100 && v2 <= y100)) {
        t100 = v2 === v1 ? t1 : t1 + ((y100 - v1) / (v2 - v1)) * (t2 - t1)
        break
      }
    }

    const riseTime1090 = (t10 !== null && t90 !== null) ? Math.max(0, t90 - t10) : null
    const riseTime0100 = (t100 !== null) ? Math.max(0, t100 - tStart) : null

    // Settling time calculations (2% and 5%) relative to ySS and stepHeight
    const tol2 = 0.02 * Math.abs(stepHeight)
    const tol5 = 0.05 * Math.abs(stepHeight)

    let settleIndex2 = -1
    for (let i = fallbackSamples.length - 1; i >= 0; i--) {
      const err = Math.abs(getVal(fallbackSamples[i]) - ySS)
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
      settlingTime2 = Math.max(0, fallbackSamples[settleIndex2].t - tStart)
    }

    let settleIndex5 = -1
    for (let i = fallbackSamples.length - 1; i >= 0; i--) {
      const err = Math.abs(getVal(fallbackSamples[i]) - ySS)
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
      settlingTime5 = Math.max(0, fallbackSamples[settleIndex5].t - tStart)
    }

    // Estimate second-order parameters from overshoot (underdamped assumption)
    let dampingRatio: number | null = null
    let omegaD: number | null = null
    let omegaN: number | null = null
    let fD: number | null = null
    let fN: number | null = null

    if (overshootPct > 0.5 && peakTime > 0) {
      const OS = overshootPct / 100
      const lnOS = Math.log(OS)
      dampingRatio = -lnOS / Math.sqrt(Math.PI * Math.PI + lnOS * lnOS)

      if (dampingRatio < 1) {
        omegaD = Math.PI / peakTime
        fD = omegaD / (2 * Math.PI)
        
        omegaN = omegaD / Math.sqrt(1 - dampingRatio * dampingRatio)
        fN = omegaN / (2 * Math.PI)
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
      fN
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
                <span className="text-xs font-bold uppercase tracking-wider text-hmi-muted">Live Caliper Graph</span>
                <span className="text-xs text-hmi-ideal font-mono">
                  {isFrozen ? '⏸ Graph View Frozen' : '⚡ Live Streaming (60 ms Viewport)'}
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
                  {isFrozen ? 'Resume Scrolling' : 'Pause Scrolling'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-hmi-grid text-hmi-muted hover:text-hmi-text hover:bg-hmi-btn"
                  onClick={handleResetCursor}
                >
                  <RotateCcw className="w-3 h-3 mr-1" /> Reset Selection
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-hmi-grid text-hmi-muted hover:text-red-400 hover:bg-hmi-btn hover:border-red-900"
                  onClick={handleClearGraph}
                >
                  <Trash2 className="w-3 h-3 mr-1" /> Clear Graph
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border border-slate-700/60 text-slate-300 hover:bg-slate-800/80 hover:text-white"
                  onClick={() => setIsChartExpanded(!isChartExpanded)}
                >
                  {isChartExpanded ? <Minimize2 className="w-3.5 h-3.5 mr-1" /> : <Maximize2 className="w-3.5 h-3.5 mr-1" />}
                  {isChartExpanded ? 'Collapse' : 'Expand'}
                </Button>
              </div>
            </div>

            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={visibleData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  className="select-none"
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={[chartEndTime - 10, chartEndTime]}
                    tick={{ fill: '#9CA3AF', fontSize: 10, fontFamily: 'monospace' }}
                    axisLine={{ stroke: '#2E2E2E' }}
                    tickLine={false}
                    tickFormatter={(v) => `${v.toFixed(1)}s`}
                  />
                  {/* Primary Y-axis: Joint Angle in Degrees */}
                  <YAxis
                    yAxisId="angle"
                    domain={['auto', 'auto']}
                    tick={{ fill: '#9CA3AF', fontSize: 10, fontFamily: 'monospace' }}
                    axisLine={{ stroke: '#2E2E2E' }}
                    tickLine={false}
                    tickFormatter={(v) => `${v.toFixed(1)}°`}
                    width={45}
                  />
                  {/* Secondary Y-axis: Raw PWM Output (-255 to +255) */}
                  <YAxis
                    yAxisId="pwm"
                    orientation="right"
                    domain={[-260, 260]}
                    tick={{ fill: '#9CA3AF', fontSize: 10, fontFamily: 'monospace' }}
                    axisLine={{ stroke: '#2E2E2E' }}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(28,28,28,0.95)',
                      borderColor: '#2E2E2E',
                      color: '#EAEAEA',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                    }}
                    labelFormatter={(label) => `Time: ${Number(label).toFixed(3)} s`}
                  />
                  <Legend verticalAlign="top" height={24} iconType="plainline" wrapperStyle={{ fontSize: '11px' }} />
                  
                  {/* Draw calipers selection range */}
                  {selectStart !== null && selectEnd !== null && (
                    <ReferenceArea
                      x1={Math.min(selectStart, selectEnd)}
                      x2={Math.max(selectStart, selectEnd)}
                      fill="#FFD700"
                      fillOpacity={0.15}
                      stroke="#FFD700"
                      strokeOpacity={0.4}
                      yAxisId="angle"
                    />
                  )}

                  {/* Draw PWM Deadband bounds reference lines */}
                  <ReferenceLine y={deadband} yAxisId="pwm" stroke="#EF5350" strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: `+${deadband}db`, fill: '#EF5350', fontSize: 9, position: 'insideRight' }} />
                  <ReferenceLine y={-deadband} yAxisId="pwm" stroke="#EF5350" strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: `-${deadband}db`, fill: '#EF5350', fontSize: 9, position: 'insideRight' }} />

                  {/* Telemetry Curves */}
                  {/* Raw ADC signal (before TD filter) — grey noise floor overlay */}
                  <Line
                    yAxisId="angle"
                    type="monotone"
                    dataKey={activeJoint === 1 ? 't1_raw' : 't2_raw'}
                    stroke="#94a3b8"
                    strokeWidth={1}
                    strokeOpacity={0.4}
                    dot={false}
                    name="Raw ADC (°)"
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="angle"
                    type="monotone"
                    dataKey={activeJoint === 1 ? 't1_target' : 't2_target'}
                    stroke="#06B6D4"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    dot={false}
                    name="Target (°)"
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="angle"
                    type="monotone"
                    dataKey={activeJoint === 1 ? 't1_actual' : 't2_actual'}
                    stroke="#FF9800"
                    strokeWidth={2}
                    dot={false}
                    name="TD Filtered (°)"
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="pwm"
                    type="monotone"
                    dataKey="pwm1"
                    stroke="#4CAF50"
                    strokeWidth={1.5}
                    strokeOpacity={0.4}
                    dot={false}
                    name="PWM Output"
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gain Controls Panel wrapper (Right, occupying ~30%) */}
          <div className="w-full lg:w-[320px] flex flex-col border border-hmi-grid bg-hmi-panel rounded-md p-3 shrink-0 overflow-y-auto">
            <span className="text-xs font-bold uppercase tracking-wider text-hmi-muted pb-3">Gain Tuning Controls</span>

            {/* Joint Selector Toggle */}
            <div className="flex bg-hmi-bg p-0.5 rounded border border-hmi-grid mb-4">
              <button
                onClick={() => setActiveJoint(1)}
                className={cn(
                  "flex-1 text-xs py-1.5 rounded transition-all font-medium cursor-pointer",
                  activeJoint === 1 ? "bg-hmi-btn text-hmi-text shadow-sm" : "text-hmi-muted hover:text-hmi-text"
                )}
              >
                Joint 1 (DC Motor)
              </button>
              <button
                onClick={() => setActiveJoint(2)}
                className={cn(
                  "flex-1 text-xs py-1.5 rounded transition-all font-medium cursor-pointer",
                  activeJoint === 2 ? "bg-hmi-btn text-hmi-text shadow-sm" : "text-hmi-muted hover:text-hmi-text"
                )}
              >
                Joint 2 (Stepper)
              </button>
            </div>

            {/* Parameter adjusters */}
            <div className="flex flex-col gap-3 flex-1 min-h-0">
              
              {/* Kp Row */}
              <div className="flex items-center justify-between border-b border-hmi-grid/50 pb-2">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-hmi-text font-mono">Kp</span>
                  <span className="text-[10px] text-hmi-muted">Proportional</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.001"
                    min={0}
                    className="w-20 text-center text-xs h-7 font-mono p-1 text-emerald-400 font-bold bg-hmi-bg border-hmi-grid"
                    value={kpInput}
                    onChange={(e) => handleGainChange('kp', e.target.value)}
                    onFocus={() => setKpFocused(true)}
                    onBlur={() => handleGainBlur('kp')}
                    onKeyDown={(e) => handleGainKeyDown(e, 'kp')}
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
                    <span className="text-[10px] text-hmi-muted">Integral</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.001"
                      min={0}
                      className="w-20 text-center text-xs h-7 font-mono p-1 text-emerald-400 font-bold bg-hmi-bg border-hmi-grid"
                      value={kiInput}
                      onChange={(e) => handleGainChange('ki', e.target.value)}
                      onFocus={() => setKiFocused(true)}
                      onBlur={() => handleGainBlur('ki')}
                      onKeyDown={(e) => handleGainKeyDown(e, 'ki')}
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
                  <span className="text-[10px] text-hmi-muted">Derivative</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.001"
                    min={0}
                    className="w-20 text-center text-xs h-7 font-mono p-1 text-emerald-400 font-bold bg-hmi-bg border-hmi-grid"
                    value={kdInput}
                    onChange={(e) => handleGainChange('kd', e.target.value)}
                    onFocus={() => setKdFocused(true)}
                    onBlur={() => handleGainBlur('kd')}
                    onKeyDown={(e) => handleGainKeyDown(e, 'kd')}
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
                    className="w-20 text-center text-xs h-7 font-mono p-1 text-emerald-400 font-bold bg-hmi-bg border-hmi-grid"
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
                    <button onClick={() => adjustGain('db', 'up')} className="bg-emerald-700 hover:bg-emerald-600 p-0.5 rounded text-white shrink-0 cursor-pointer"><ChevronUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => adjustGain('db', 'down')} className="bg-amber-700 hover:bg-amber-600 p-0.5 rounded text-white shrink-0 cursor-pointer"><ChevronDown className="w-3.5 h-3.5" /></button>
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
                <span className="text-[10px] font-bold text-hmi-muted uppercase">Send Step Target (deg)</span>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    className="h-7 text-xs font-mono"
                    value={stepTarget}
                    onChange={(e) => setStepTarget(e.target.value)}
                  />
                  <Button size="sm" onClick={handleSendStep} className="h-7 px-3 text-xs bg-hmi-btn hover:bg-hmi-btn-hover shrink-0">
                    Send Target
                  </Button>
                </div>
              </div>

              {/* Raw CLI command input */}
              <form onSubmit={handleSendCustom} className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-hmi-muted uppercase">Send Raw ASCII command</span>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="e.g. mstep,8"
                    className="h-7 text-xs font-mono placeholder:text-neutral-600 font-semibold"
                    value={customCmd}
                    onChange={(e) => setCustomCmd(e.target.value)}
                  />
                  <Button type="submit" size="sm" className="h-7 px-3 text-xs bg-hmi-btn hover:bg-hmi-btn-hover shrink-0">
                    Send
                  </Button>
                </div>
              </form>

              {/* Emergency Stop Button */}
              {estopped ? (
                <Button
                  variant="resume"
                  className="w-full h-9 uppercase font-bold text-sm bg-hmi-ok hover:bg-hmi-ok-hover tracking-wide mt-auto animate-pulse"
                  onClick={() => serial.sendCommand('resume')}
                >
                  🔄 RESUME
                </Button>
              ) : (
                <Button
                  variant="estop"
                  className="w-full h-9 uppercase font-bold text-sm bg-hmi-estop hover:bg-hmi-estop-hover tracking-wide mt-auto"
                  onClick={() => serial.sendCommand('estop')}
                >
                  🛑 EMERGENCY STOP
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
                    "pb-1.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors cursor-pointer",
                    analyzerTab === 'zn'
                      ? "border-hmi-ideal text-hmi-text"
                      : "border-transparent text-hmi-muted hover:text-hmi-text"
                  )}
                >
                  ZN Advisor
                </button>
                <button
                  onClick={() => setAnalyzerTab('dyn')}
                  className={cn(
                    "pb-1.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors cursor-pointer",
                    analyzerTab === 'dyn'
                      ? "border-hmi-ideal text-hmi-text"
                      : "border-transparent text-hmi-muted hover:text-hmi-text"
                  )}
                >
                  Dynamic Props
                </button>
                <button
                  onClick={() => setAnalyzerTab('stats')}
                  className={cn(
                    "pb-1.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors cursor-pointer",
                    analyzerTab === 'stats'
                      ? "border-hmi-ideal text-hmi-text"
                      : "border-transparent text-hmi-muted hover:text-hmi-text"
                  )}
                >
                  Stats
                </button>
              </div>
              <span className="text-[10px] font-mono text-hmi-muted">
                {metrics ? `Selection: ${(metrics.tMax - metrics.tMin).toFixed(2)}s` : 'No selection'}
              </span>
            </div>

            {metrics ? (
              analyzerTab === 'zn' ? (
                <div className="flex flex-col gap-4">
                  
                  {/* Visual caliper highlights readout */}
                  <div className="bg-hmi-bg border border-hmi-grid p-2.5 rounded flex items-center justify-between text-xs text-hmi-muted">
                    <span>Selection: <strong className="text-hmi-text font-mono">{metrics.tMin.toFixed(2)}s</strong> to <strong className="text-hmi-text font-mono">{metrics.tMax.toFixed(2)}s</strong></span>
                    <span>Width: <strong className="text-hmi-text font-mono">{(metrics.tMax - metrics.tMin).toFixed(2)}s</strong></span>
                    <span>Peaks: <strong className="text-hmi-text font-mono">{metrics.peaksCount}</strong></span>
                  </div>

                  {/* Inline warning alert if peaks < 2 */}
                  {metrics.peaksCount < 2 && (
                    <div className="flex items-start gap-2 p-3 bg-red-950/40 border border-red-500/30 text-red-200 rounded text-xs">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <strong>Need ≥ 2 peaks.</strong> Raise Kp until sustained oscillation, then select 2–3 full cycles.
                      </div>
                    </div>
                  )}

                  {/* Grid readout of calculated metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                    <Card className="border-hmi-grid bg-hmi-bg p-2 flex flex-col justify-between h-14">
                      <span className="text-[10px] text-hmi-muted font-semibold uppercase tracking-tight">Period Tu</span>
                      <span className="text-xs font-mono font-bold text-hmi-text text-right">
                        {metrics.Tu ? `${metrics.Tu.toFixed(3)}s` : '—'}
                      </span>
                    </Card>
                    <Card className="border-hmi-grid bg-hmi-bg p-2 flex flex-col justify-between h-14">
                      <span className="text-[10px] text-hmi-muted font-semibold uppercase tracking-tight">Freq fu</span>
                      <span className="text-xs font-mono font-bold text-hmi-text text-right">
                        {metrics.fu ? `${metrics.fu.toFixed(2)} Hz` : '—'}
                      </span>
                    </Card>
                    <Card className="border-hmi-grid bg-hmi-bg p-2 flex flex-col justify-between h-14">
                      <span className="text-[10px] text-hmi-muted font-semibold uppercase tracking-tight">Peak-to-Peak</span>
                      <span className="text-xs font-mono font-bold text-hmi-text text-right">
                        {metrics.p2p.toFixed(2)}°
                      </span>
                    </Card>
                    <Card className="border-hmi-grid bg-hmi-bg p-2 flex flex-col justify-between h-14">
                      <span className="text-[10px] text-hmi-muted font-semibold uppercase tracking-tight">RMS Error</span>
                      <span className="text-xs font-mono font-bold text-hmi-text text-right">
                        {metrics.rms.toFixed(3)}°
                      </span>
                    </Card>
                    <Card className="border-hmi-grid bg-hmi-bg p-2 flex flex-col justify-between h-14">
                      <span className="text-[10px] text-hmi-muted font-semibold uppercase tracking-tight">Max Error</span>
                      <span className="text-xs font-mono font-bold text-hmi-text text-right">
                        {metrics.maxAbs.toFixed(3)}°
                      </span>
                    </Card>
                    <Card className="border-hmi-grid bg-hmi-bg p-2 flex flex-col justify-between h-14">
                      <span className="text-[10px] text-hmi-muted font-semibold uppercase tracking-tight">Steady State</span>
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
                          <th className="p-2 border-r border-hmi-grid font-sans">Rule / Target Response</th>
                          <th className="p-2 border-r border-hmi-grid font-sans">Proportional Kp (Ku = {Ku.toFixed(2)})</th>
                          <th className="p-2 border-r border-hmi-grid font-sans">Integral Ki</th>
                          <th className="p-2 font-sans">Derivative Kd</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hmi-grid font-mono">
                        {/* Row P */}
                        <tr>
                          <td className="p-2 border-r border-hmi-grid font-sans font-medium text-neutral-300">P Control</td>
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
                          <td className="p-2 border-r border-hmi-grid font-sans font-medium text-neutral-300">PI Control</td>
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
                          <td className="p-2 border-r border-hmi-grid font-sans font-medium text-neutral-300">PID Classic (¼ Decay)</td>
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
                          <td className="p-2 border-r border-hmi-grid font-sans font-medium text-neutral-300">PID No-Overshoot</td>
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
                          <td className="p-2 border-r border-hmi-grid font-sans font-medium text-neutral-300">PID Pessen Integration</td>
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
                        Step Detection:{' '}
                        {metrics.dynProps.stepDetected ? (
                          <strong className="text-emerald-400 font-bold">Auto-detected</strong>
                        ) : (
                          <strong className="text-amber-500 font-bold">Manual selection fallback</strong>
                        )}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>Start: <strong className="text-hmi-text font-mono">{metrics.dynProps.yStart.toFixed(2)}°</strong></span>
                      <ArrowRight className="w-3 h-3 text-hmi-muted" />
                      <span>Target: <strong className="text-hmi-text font-mono">{metrics.dynProps.yTargetAfter.toFixed(2)}°</strong></span>
                      <span>Settled: <strong className="text-hmi-text font-mono">{metrics.dynProps.ySS.toFixed(2)}°</strong></span>
                      <span>(Actual Size:{' '}
                        <strong className={cn("font-mono", metrics.dynProps.stepHeight >= 0 ? "text-emerald-400" : "text-red-400")}>
                          {metrics.dynProps.stepHeight >= 0 ? '+' : ''}{metrics.dynProps.stepHeight.toFixed(2)}°
                        </strong>
                      )</span>
                    </span>
                  </div>

                  {/* Warning if step size is extremely small */}
                  {Math.abs(metrics.dynProps.stepSize) < 0.2 && (
                    <div className="flex items-start gap-2 p-3 bg-amber-950/40 border border-amber-500/30 text-amber-200 rounded text-xs">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <strong>Small Step Detected.</strong> The detected target step change is very small ({metrics.dynProps.stepSize.toFixed(2)}°). Dynamic properties (rise time, overshoot) may be noisy or inaccurate. Issue a larger step command (e.g. 30°+) for cleaner analysis.
                      </div>
                    </div>
                  )}

                  {/* Dynamic Props Cards Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {/* Rise Time 10-90% */}
                    <Card className="border-hmi-grid bg-hmi-bg p-2.5 flex flex-col justify-between h-16">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-semibold uppercase tracking-tight">Rise Time (10-90%)</span>
                        <Clock className="w-3.5 h-3.5 text-neutral-600" />
                      </div>
                      <span className="text-sm font-mono font-bold text-hmi-text text-right">
                        {metrics.dynProps.riseTime1090 !== null ? `${metrics.dynProps.riseTime1090.toFixed(3)}s` : '—'}
                      </span>
                    </Card>

                    {/* Rise Time 0-100% */}
                    <Card className="border-hmi-grid bg-hmi-bg p-2.5 flex flex-col justify-between h-16">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-semibold uppercase tracking-tight">Rise Time (0-100%)</span>
                        <Clock className="w-3.5 h-3.5 text-neutral-600" />
                      </div>
                      <span className="text-sm font-mono font-bold text-hmi-text text-right">
                        {metrics.dynProps.riseTime0100 !== null ? `${metrics.dynProps.riseTime0100.toFixed(3)}s` : '—'}
                      </span>
                    </Card>

                    {/* Settling Time 2% */}
                    <Card className="border-hmi-grid bg-hmi-bg p-2.5 flex flex-col justify-between h-16">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-semibold uppercase tracking-tight">Settling Time (2%)</span>
                        <Activity className="w-3.5 h-3.5 text-neutral-600" />
                      </div>
                      <span className={cn("text-sm font-mono font-bold text-right", !metrics.dynProps.settledInSelection2 ? "text-amber-400 text-xs" : "text-hmi-text")}>
                        {metrics.dynProps.settlingTime2 !== null ? (
                          metrics.dynProps.settledInSelection2 ? `${metrics.dynProps.settlingTime2.toFixed(3)}s` : 'Not settled'
                        ) : '—'}
                      </span>
                    </Card>

                    {/* Settling Time 5% */}
                    <Card className="border-hmi-grid bg-hmi-bg p-2.5 flex flex-col justify-between h-16">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-semibold uppercase tracking-tight">Settling Time (5%)</span>
                        <Activity className="w-3.5 h-3.5 text-neutral-600" />
                      </div>
                      <span className={cn("text-sm font-mono font-bold text-right", !metrics.dynProps.settledInSelection5 ? "text-amber-400 text-xs" : "text-hmi-text")}>
                        {metrics.dynProps.settlingTime5 !== null ? (
                          metrics.dynProps.settledInSelection5 ? `${metrics.dynProps.settlingTime5.toFixed(3)}s` : 'Not settled'
                        ) : '—'}
                      </span>
                    </Card>

                    {/* Peak Time */}
                    <Card className="border-hmi-grid bg-hmi-bg p-2.5 flex flex-col justify-between h-16">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-semibold uppercase tracking-tight">Peak Time (Tp)</span>
                        <Clock className="w-3.5 h-3.5 text-neutral-600" />
                      </div>
                      <span className="text-sm font-mono font-bold text-hmi-text text-right">
                        {metrics.dynProps.peakTime > 0 ? `${metrics.dynProps.peakTime.toFixed(3)}s` : '—'}
                      </span>
                    </Card>

                    {/* Max Overshoot */}
                    <Card className="border-hmi-grid bg-hmi-bg p-2.5 flex flex-col justify-between h-16">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-semibold uppercase tracking-tight">Max Overshoot</span>
                        <TrendingUp className="w-3.5 h-3.5 text-neutral-600" />
                      </div>
                      <div className="flex flex-col items-end">
                        <span className={cn("text-sm font-mono font-bold leading-tight", metrics.dynProps.overshootPct > 0 ? "text-amber-400" : "text-emerald-400")}>
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
                        <span className="text-[10px] font-semibold uppercase tracking-tight">Damping Ratio (ζ)</span>
                        <Gauge className="w-3.5 h-3.5 text-neutral-600" />
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-mono font-bold text-hmi-text leading-tight">
                          {metrics.dynProps.dampingRatio !== null ? metrics.dynProps.dampingRatio.toFixed(3) : '—'}
                        </span>
                        <span className="text-[9px] text-hmi-muted leading-none">
                          {metrics.dynProps.dampingRatio !== null ? (
                            metrics.dynProps.dampingRatio < 1 ? 'Underdamped' : 'Overdamped'
                          ) : (
                            metrics.dynProps.overshootPct <= 0.5 ? 'Overdamped / None' : '—'
                          )}
                        </span>
                      </div>
                    </Card>

                    {/* Frequencies (omega_n) */}
                    <Card className="border-hmi-grid bg-hmi-bg p-2.5 flex flex-col justify-between h-16">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-semibold uppercase tracking-tight">Natural Freq (ωn)</span>
                        <Gauge className="w-3.5 h-3.5 text-neutral-600" />
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
                    Note: Damping ratio (ζ) and natural frequency (ωn) are calculated using classical second-order underdamped approximations based on measured overshoot and peak time.
                  </div>
                </div>
              ) : (
                /* Statistical Analysis (Robot at Rest) UI rendering */
                <div className="flex flex-col gap-4 animate-fade-in">
                  {/* Target transition information header / Status Banner */}
                  <div className={cn(
                    "border p-3 rounded flex flex-col md:flex-row md:items-center justify-between text-xs transition-all duration-300 gap-2",
                    metrics.statProps.rating === 'negligible' && "bg-cyan-950/20 border-cyan-500/30 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.08)]",
                    metrics.statProps.rating === 'marginal' && "bg-amber-950/20 border-amber-500/30 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.08)]",
                    metrics.statProps.rating === 'significant' && "bg-rose-950/20 border-rose-500/30 text-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.08)]"
                  )}>
                    <span className="flex items-center gap-2">
                      <Zap className="w-4 h-4 shrink-0" />
                      <span>
                        Status Rating:{' '}
                        <strong className={cn(
                          "px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border",
                          metrics.statProps.rating === 'negligible' && "bg-cyan-950/60 border-cyan-500/50 text-cyan-400",
                          metrics.statProps.rating === 'marginal' && "bg-amber-950/60 border-amber-500/50 text-amber-400",
                          metrics.statProps.rating === 'significant' && "bg-rose-950/60 border-rose-500/50 text-rose-400"
                        )}>
                          {metrics.statProps.rating === 'negligible' ? 'Negligible' : metrics.statProps.rating === 'marginal' ? 'Marginal' : 'Significant'}
                        </strong>
                      </span>
                    </span>
                    <span className="text-hmi-muted font-sans md:text-right">
                      {metrics.statProps.rating === 'negligible' && "Steady-state error is negligible compared to the system noise floor (SNR < 1)."}
                      {metrics.statProps.rating === 'marginal' && "Steady-state error is slightly visible but close to the noise floor (1 ≤ SNR ≤ 3)."}
                      {metrics.statProps.rating === 'significant' && "Steady-state error is significant compared to the noise floor (SNR > 3). Suggest Ki adjustment."}
                    </span>
                  </div>

                  {/* 4-Card Grid for Metrics */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Mean position */}
                    <Card className="border-hmi-grid bg-hmi-bg/40 backdrop-blur-sm p-3 flex flex-col justify-between h-20 hover:border-hmi-grid/80 transition-all group">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-bold uppercase tracking-wider">Mean Position (μ)</span>
                        <Target className="w-4 h-4 text-neutral-600 group-hover:text-emerald-400 transition-colors" />
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] text-hmi-muted font-mono">Running Average</span>
                        <span className="text-base font-mono font-bold text-hmi-text">
                          {metrics.statProps.mean.toFixed(4)}°
                        </span>
                      </div>
                    </Card>

                    {/* Standard deviation */}
                    <Card className="border-hmi-grid bg-hmi-bg/40 backdrop-blur-sm p-3 flex flex-col justify-between h-20 hover:border-hmi-grid/80 transition-all group">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-bold uppercase tracking-wider">Std Dev (σ)</span>
                        <Activity className="w-4 h-4 text-neutral-600 group-hover:text-cyan-400 transition-colors" />
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] text-hmi-muted font-mono">Running Variance</span>
                        <span className="text-base font-mono font-bold text-hmi-text">
                          {metrics.statProps.stdDev.toFixed(4)}°
                        </span>
                      </div>
                    </Card>

                    {/* Peak-to-peak */}
                    <Card className="border-hmi-grid bg-hmi-bg/40 backdrop-blur-sm p-3 flex flex-col justify-between h-20 hover:border-hmi-grid/80 transition-all group">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-bold uppercase tracking-wider">Peak-to-Peak</span>
                        <TrendingUp className="w-4 h-4 text-neutral-600 group-hover:text-amber-400 transition-colors" />
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] text-hmi-muted font-mono">Max − Min over selection</span>
                        <span className="text-base font-mono font-bold text-hmi-text">
                          {metrics.statProps.p2p.toFixed(4)}°
                        </span>
                      </div>
                    </Card>

                    {/* SNR proxy */}
                    <Card className="border-hmi-grid bg-hmi-bg/40 backdrop-blur-sm p-3 flex flex-col justify-between h-20 hover:border-hmi-grid/80 transition-all group">
                      <div className="flex items-center justify-between text-hmi-muted">
                        <span className="text-[10px] font-bold uppercase tracking-wider">SNR Proxy</span>
                        <ShieldAlert className="w-4 h-4 text-neutral-600 group-hover:text-rose-400 transition-colors" />
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
                          <th className="p-2 border-r border-hmi-grid font-sans w-[15%]">Metric</th>
                          <th className="p-2 border-r border-hmi-grid font-sans w-[20%]">Formula</th>
                          <th className="p-2 border-r border-hmi-grid font-sans w-[15%]">Value</th>
                          <th className="p-2 font-sans w-[50%]">Why Useful</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hmi-grid font-mono text-neutral-300">
                        {/* Row Mean */}
                        <tr>
                          <td className="p-2 border-r border-hmi-grid font-sans font-medium text-neutral-200">Mean μ</td>
                          <td className="p-2 border-r border-hmi-grid text-neutral-400">running average</td>
                          <td className="p-2 border-r border-hmi-grid text-emerald-400 font-bold">{metrics.statProps.mean.toFixed(5)}°</td>
                          <td className="p-2 font-sans text-hmi-muted text-[11px]">Confirms actual held position. Compare against the desired target of <strong className="text-hmi-text font-mono">{metrics.statProps.target.toFixed(2)}°</strong>.</td>
                        </tr>

                        {/* Row Std Dev */}
                        <tr>
                          <td className="p-2 border-r border-hmi-grid font-sans font-medium text-neutral-200">Std dev σ</td>
                          <td className="p-2 border-r border-hmi-grid text-neutral-400">running variance</td>
                          <td className="p-2 border-r border-hmi-grid text-cyan-400 font-bold">{metrics.statProps.stdDev.toFixed(5)}°</td>
                          <td className="p-2 font-sans text-hmi-muted text-[11px]">Quantifies position noise floor objectively. Lower is better.</td>
                        </tr>

                        {/* Row Peak-to-Peak */}
                        <tr>
                          <td className="p-2 border-r border-hmi-grid font-sans font-medium text-neutral-200">Peak-to-peak</td>
                          <td className="p-2 border-r border-hmi-grid text-neutral-400">max − min over window</td>
                          <td className="p-2 border-r border-hmi-grid text-amber-400 font-bold">{metrics.statProps.p2p.toFixed(5)}°</td>
                          <td className="p-2 font-sans text-hmi-muted text-[11px]">Catches the spike outliers and maximum deviation range.</td>
                        </tr>

                        {/* Row SNR Proxy */}
                        <tr>
                          <td className="p-2 border-r border-hmi-grid font-sans font-medium text-neutral-200">SNR proxy</td>
                          <td className="p-2 border-r border-hmi-grid text-neutral-400">||μ − θd|| / σ</td>
                          <td className="p-2 border-r border-hmi-grid text-rose-400 font-bold">{metrics.statProps.snrProxy.toFixed(3)}</td>
                          <td className="p-2 font-sans text-hmi-muted text-[11px]">Is steady-state error significant vs noise? If SNR &lt; 1, error is negligible. If SNR &gt; 3, error is significant.</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Educational note at bottom */}
                  <div className="text-[10px] text-hmi-muted border-t border-hmi-grid/50 pt-2 font-sans italic leading-relaxed">
                    Note: Statistical metrics analyze the selected range of position samples. Best used when the robot is commanded to a static target angle and has settled, to evaluate the controller&apos;s steady-state holding performance and noise floor.
                  </div>
                </div>
              )
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-hmi-grid p-6 text-center text-xs text-hmi-muted">
                <HelpCircle className="w-8 h-8 text-neutral-600 mb-2" />
                <p className="font-semibold text-hmi-text mb-1">Caliper Area Idle</p>
                <p className="max-w-[280px]">
                  Click and drag horizontally on the live chart to select an oscillation cycle and view ZN tuning recommendations.
                </p>
              </div>
            )}
          </div>

          {/* ZN Calibration Instruction Panel (Right side) */}
          <div className="w-full xl:w-[320px] shrink-0 border border-hmi-grid bg-hmi-panel rounded-md p-3 flex flex-col h-fit font-sans">
            <button
              onClick={() => setIsHintOpen(!isHintOpen)}
              className="flex items-center justify-between w-full text-xs font-bold uppercase tracking-wider text-hmi-muted cursor-pointer"
            >
              <span className="flex items-center gap-1.5"><HelpCircle className="w-3.5 h-3.5" /> How to use ZN Procedure</span>
              {isHintOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {isHintOpen && (
              <div className="mt-2.5 text-xs leading-relaxed text-hmi-muted border-t border-hmi-grid/50 pt-2.5 flex flex-col gap-2">
                <ol className="list-decimal pl-4 flex flex-col gap-1.5 font-sans">
                  <li>
                    Set <strong className="text-hmi-text">Ki = 0.0000</strong> and <strong className="text-hmi-text">Kd = 0.0000</strong> on the controls above.
                  </li>
                  <li>
                    Send a Step Target command (e.g. <strong className="text-hmi-text">t1,45.00</strong>) to trigger a step transition.
                  </li>
                  <li>
                    Slowly raise Kp (using the ▲ buttons) until the output enters a stable, sustained, constant-amplitude oscillation.
                  </li>
                  <li>
                    The Kp value at this state is the Ultimate Gain <strong className="text-hmi-text">Ku</strong>. Note this value.
                  </li>
                  <li>
                    Click and drag your mouse horizontally over <strong className="text-hmi-text">2–3 complete oscillation cycles</strong> on the chart to select them.
                  </li>
                  <li>
                    The advisor will automatically compute the ultimate period <strong className="text-hmi-text">Tu</strong> and display recommended gains.
                  </li>
                  <li>
                    Pick a tuning row (e.g., <strong className="text-hmi-text font-mono text-hmi-ideal">PID no-overshoot</strong>) and click each highlighted blue coefficient cell to apply the gain to the device.
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
            <span className="text-hmi-muted">Port:</span>
            <span className={cn(serialStatus === 'connected' ? 'text-emerald-400 font-bold' : 'text-amber-500')}>
              {serialStatus === 'connected' ? (portName ?? 'Connected') : 'Disconnected'}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <span className="text-hmi-muted">Samples:</span>
            <span className="text-hmi-text">{chartData.length} / {MAX_BUFFER}</span>
          </span>
        </div>

        <div className="flex items-center gap-4 max-w-[60%] truncate">
          <span className="truncate">
            <span className="text-hmi-muted">TX:</span>{' '}
            <span className="text-amber-400 font-mono">{txLine !== '—' ? `"${txLine}"` : '—'}</span>
          </span>
          <span className="truncate">
            <span className="text-hmi-muted">RX:</span>{' '}
            <span className="text-emerald-400 font-mono">{rxLine !== '—' ? `"${rxLine}"` : '—'}</span>
          </span>
        </div>
      </footer>
    </div>
  )
}


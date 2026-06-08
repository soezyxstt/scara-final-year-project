'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useHMISlow } from '@/lib/hmi-context'
import type { ZNSample } from '@/lib/hmi-types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
// Remove next/navigation imports to prevent warnings
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
  AreaChart,
  Area
} from 'recharts'
import {
  Play,
  Pause,
  Download,
  Trash2,
  Activity,
  Target,
  TrendingUp,
  HelpCircle,
  Gauge,
  Sliders,
  Table as TableIcon,
  BarChart2,
  Maximize2,
  Minimize2
} from 'lucide-react'

const MAX_BUFFER = 10000

function downsample<T>(arr: T[], max = 500): T[] {
  if (arr.length <= max) return arr
  const step = Math.ceil(arr.length / max)
  return arr.filter((_, i) => i % step === 0)
}

// Industrial Design Spec Constants (matching chart-panel.tsx)
const GRID = 'rgba(255, 255, 255, 0.05)'
const AT = {
  fill: '#9CA3AF',
  fontSize: 10,
  fontFamily: 'monospace',
  fontWeight: 500,
}
const AL = { stroke: '#1F2937' }
const TS = {
  backgroundColor: 'rgba(17, 24, 39, 0.95)',
  backdropFilter: 'blur(8px)',
  border: '1px solid #1F2937',
  borderRadius: '6px',
  color: '#F3F4F6',
  fontFamily: 'monospace',
  fontSize: '11px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
}

// Radix-2 Cooley-Tukey FFT implementation
function fft(re: number[], im: number[]): { re: number[]; im: number[] } {
  const n = re.length
  if (n <= 1) return { re, im }

  const bits = Math.round(Math.log2(n))
  for (let i = 0; i < n; i++) {
    let j = 0
    for (let b = 0; b < bits; b++) {
      if ((i & (1 << b)) !== 0) {
        j |= 1 << (bits - 1 - b)
      }
    }
    if (j > i) {
      let temp = re[i]; re[i] = re[j]; re[j] = temp
      temp = im[i]; im[i] = im[j]; im[j] = temp
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (2 * Math.PI) / len
    const wlen_re = Math.cos(angle)
    const wlen_im = -Math.sin(angle)
    for (let i = 0; i < n; i += len) {
      let w_re = 1.0
      let w_im = 0.0
      const half = len >> 1
      for (let j = 0; j < half; j++) {
        const u_re = re[i + j]
        const u_im = im[i + j]
        const v_re = re[i + j + half] * w_re - im[i + j + half] * w_im
        const v_im = re[i + j + half] * w_im + im[i + j + half] * w_re
        re[i + j] = u_re + v_re
        im[i + j] = u_im + v_im
        re[i + j + half] = u_re - v_re
        im[i + j + half] = u_im - v_im
        const next_w_re = w_re * wlen_re - w_im * wlen_im
        w_im = w_re * wlen_im + w_im * wlen_re
        w_re = next_w_re
      }
    }
  }
  return { re, im }
}

export function ZNAnalysisTab({ isActive }: { isActive: boolean }) {
  const { state, serial } = useHMISlow()
  const { serialStatus } = state

  // Query parameter persisted active joint
  const [activeJoint, setActiveJointState] = useState<1 | 2>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      return params.get('joint') === '2' ? 2 : 1
    }
    return 1
  })
  
  const setActiveJoint = useCallback((joint: 1 | 2) => {
    setActiveJointState(joint)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      params.set('joint', joint.toString())
      const newUrl = `${window.location.pathname}?${params.toString()}`
      window.history.replaceState(null, '', newUrl)
    }
  }, [])

  // Persisted view mode state ('pos' | 'raw' | 'compare' | 'vel' | 'fft')
  const [viewMode, setViewModeState] = useState<'pos' | 'raw' | 'compare' | 'vel' | 'fft'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      return (params.get('view') as 'pos' | 'raw' | 'compare' | 'vel' | 'fft') || 'pos'
    }
    return 'pos'
  })

  const setViewMode = useCallback((newMode: 'pos' | 'raw' | 'compare' | 'vel' | 'fft') => {
    setViewModeState(newMode)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      params.set('view', newMode)
      const newUrl = `${window.location.pathname}?${params.toString()}`
      window.history.replaceState(null, '', newUrl)
    }
  }, [])

  const [isFrozen, setIsFrozen] = useState(false)
  const [frozenEndTime, setFrozenEndTime] = useState<number | null>(null)
  const [stepTarget, setStepTarget] = useState('0.0')
  const [isChartExpanded, setIsChartExpanded] = useState(false)

  // Run Events bookmarking state
  interface RunEvent {
    id: number
    target: number
    t: number
    timeLabel: string
  }
  const [runEvents, setRunEvents] = useState<RunEvent[]>([])

  // Export CSV Config Pop-up States
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [exportScope, setExportScope] = useState<string>('all')
  const [applyCaliperOnExport, setApplyCaliperOnExport] = useState(true)

  // Line Visibility Toggles
  const [hiddenLines, setHiddenLines] = useState<Record<string, boolean>>({})
  const handleLegendClick = (e: any) => {
    const { dataKey } = e
    setHiddenLines((prev) => ({ ...prev, [dataKey]: !prev[dataKey] }))
  }

  // Drag selection coordinates
  const [selecting, setSelecting] = useState(false)
  const [selectStart, setSelectStart] = useState<number | null>(null)
  const [selectEnd, setSelectEnd] = useState<number | null>(null)

  // Local Buffers
  const bufferRef = useRef<ZNSample[]>([])
  const [chartData, setChartData] = useState<ZNSample[]>([])
  const startTsRef = useRef<number | null>(null)

  const [rxLine, setRxLine] = useState('—')
  const [txLine, setTxLine] = useState('—')
  const lastRxRef = useRef('—')
  const lastTxRef = useRef('—')

  // Restore buffer and start time from local storage on mount (for page refresh/tab switch tolerance)
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

  // Live telemetry listener
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
      if (startTsRef.current === null) {
        startTsRef.current = rawSample.ts_ms
      }

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
        setChartData([...bufferRef.current])
      }
      setRxLine(lastRxRef.current)
      setTxLine(lastTxRef.current)
    }, 60)

    return () => clearInterval(interval)
  }, [isFrozen])

  const handleClearGraph = () => {
    bufferRef.current = []
    startTsRef.current = null
    setChartData([])
    setSelectStart(null)
    setSelectEnd(null)
    setIsFrozen(false)
    setFrozenEndTime(null)
    localStorage.removeItem('hmi_zn_buffer')
    localStorage.removeItem('hmi_zn_start_ts')
  }

  const handleToggleFreeze = () => {
    if (isFrozen) {
      setIsFrozen(false)
      setFrozenEndTime(null)
      setSelectStart(null)
      setSelectEnd(null)
    } else {
      setIsFrozen(true)
      setFrozenEndTime(chartData[chartData.length - 1]?.t ?? 0)
    }
  }

  const handleSendStep = async () => {
    const val = parseFloat(stepTarget)
    if (isNaN(val)) return

    // Bookmark step trigger relative timestamp
    const tNow = chartData[chartData.length - 1]?.t ?? 0
    setRunEvents((prev) => [
      ...prev,
      {
        id: Date.now(),
        target: val,
        t: tNow,
        timeLabel: new Date().toLocaleTimeString()
      }
    ])

    const cmd = activeJoint === 1 ? `t1,${val.toFixed(2)}` : `t2,${val.toFixed(2)}`
    await serial.sendCommand(cmd)
  }

  // --- Real-time Scrolling Timeline Window Calculations ---
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

  // Get active dataset based on selection range or fallback to whole buffer for metrics calculation
  const getActiveSelection = (): ZNSample[] => {
    if (chartData.length === 0) return []
    if (selectStart === null || selectEnd === null) return chartData

    const tMin = Math.min(selectStart, selectEnd)
    const tMax = Math.max(selectStart, selectEnd)
    return chartData.filter((s) => s.t >= tMin && s.t <= tMax)
  }

  const activeSelection = getActiveSelection()

  // --- Calculations & Signal Quality Analysis ---
  const calculateAnalysis = () => {
    if (activeSelection.length === 0) {
      return {
        mean: 0,
        meanRaw: 0,
        target: 0,
        sse: 0,
        rawStd: 0,
        filtStd: 0,
        rawP2P: 0,
        filtP2P: 0,
        dbReduction: 0,
        meanVel: 0,
        rmsVel: 0,
        maxVelSpike: 0
      }
    }

    const isJ1 = activeJoint === 1
    const actuals = activeSelection.map((s) => isJ1 ? s.t1_actual : s.t2_actual)
    const raws = activeSelection.map((s) => isJ1 ? s.t1_raw : s.t2_raw)
    const targets = activeSelection.map((s) => isJ1 ? s.t1_target : s.t2_target)
    const vels = activeSelection.map((s) => isJ1 ? s.v1 : s.v2)

    // Means
    const mean = actuals.reduce((a, b) => a + b, 0) / actuals.length
    const meanRaw = raws.reduce((a, b) => a + b, 0) / raws.length
    const target = targets[targets.length - 1]
    const sse = Math.abs(mean - target)

    // Standard Deviations
    const varianceFilt = actuals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / actuals.length
    const filtStd = Math.sqrt(varianceFilt)

    const varianceRaw = raws.reduce((a, b) => a + Math.pow(b - meanRaw, 2), 0) / raws.length
    const rawStd = Math.sqrt(varianceRaw)

    // Peak-to-Peak
    const filtP2P = Math.max(...actuals) - Math.min(...actuals)
    const rawP2P = Math.max(...raws) - Math.min(...raws)

    // Noise reduction in decibels: 20 * log10(σ_raw / σ_filt)
    let dbReduction = 0
    if (filtStd > 0 && rawStd > 0) {
      dbReduction = 20 * Math.log10(rawStd / filtStd)
    }

    // Velocity Stats
    const meanVel = vels.reduce((a, b) => a + b, 0) / vels.length
    const meanSqVel = vels.reduce((a, b) => a + Math.pow(b, 2), 0) / vels.length
    const rmsVel = Math.sqrt(meanSqVel)
    const maxVelSpike = Math.max(...vels.map(Math.abs))

    return {
      mean,
      meanRaw,
      target,
      sse,
      rawStd,
      filtStd,
      rawP2P,
      filtP2P,
      dbReduction,
      meanVel,
      rmsVel,
      maxVelSpike
    }
  }

  const analysis = useMemo(() => {
    return calculateAnalysis()
  }, [activeSelection, activeJoint])

  // Floating Latest values based on active tab
  const latestSample = chartData[chartData.length - 1]
  const posOverlayStr = latestSample
    ? `Target: ${(activeJoint === 1 ? latestSample.t1_target : latestSample.t2_target).toFixed(1)}° | Actual: ${(activeJoint === 1 ? latestSample.t1_actual : latestSample.t2_actual).toFixed(3)}°`
    : '--'

  const rawOverlayStr = latestSample
    ? `Raw ADC: ${(activeJoint === 1 ? latestSample.t1_raw : latestSample.t2_raw).toFixed(3)}°`
    : '--'

  const velOverlayStr = latestSample
    ? `Velocity: ${(activeJoint === 1 ? latestSample.v1 : latestSample.v2).toFixed(2)}°/s`
    : '--'

  // --- FFT Frequency Spectrum Calculation ---
  const calculateFFT = () => {
    if (activeSelection.length < 8) return []

    const sampleSize = activeSelection.length
    let N = 2
    while (N * 2 <= sampleSize && N < 4096) {
      N *= 2
    }

    const sliced = activeSelection.slice(-N)
    const isJ1 = activeJoint === 1

    const times = sliced.map((s) => s.t)
    const rawSignal = sliced.map((s) => isJ1 ? s.t1_raw : s.t2_raw)
    const filtSignal = sliced.map((s) => isJ1 ? s.t1_actual : s.t2_actual)

    const totalTime = times[times.length - 1] - times[0]
    const Fs = totalTime > 0 ? (N - 1) / totalTime : 60 // fallback to 60Hz

    // Remove DC Offset
    const rawMean = rawSignal.reduce((a, b) => a + b, 0) / N
    const filtMean = filtSignal.reduce((a, b) => a + b, 0) / N

    const rawRe = rawSignal.map((v) => v - rawMean)
    const rawIm = Array(N).fill(0)
    const filtRe = filtSignal.map((v) => v - filtMean)
    const filtIm = Array(N).fill(0)

    const rawResult = fft(rawRe, rawIm)
    const filtResult = fft(filtRe, filtIm)

    const fftData = []
    const halfN = N / 2

    for (let i = 0; i < halfN; i++) {
      const freq = (i * Fs) / N
      const rawMag = (2 * Math.sqrt(rawResult.re[i] * rawResult.re[i] + rawResult.im[i] * rawResult.im[i])) / N
      const filtMag = (2 * Math.sqrt(filtResult.re[i] * filtResult.re[i] + filtResult.im[i] * filtResult.im[i])) / N

      fftData.push({
        freq: parseFloat(freq.toFixed(1)), // Adjusted to 0.1 Hz resolution
        t1_raw: rawMag,
        t1_actual: filtMag
      })
    }

    return fftData
  }

  const fftData = useMemo(() => {
    if (viewMode !== 'fft') return []
    return calculateFFT()
  }, [activeSelection, activeJoint, viewMode])

  const nyquistFreq = useMemo(() => {
    if (fftData.length === 0) return 30
    return fftData[fftData.length - 1].freq
  }, [fftData])

  const dominantFreqRaw = useMemo(() => {
    if (fftData.length === 0) return { freq: 0, amp: 0 }
    let maxIndex = 0
    let maxAmp = 0
    for (let i = 1; i < fftData.length; i++) {
      if (fftData[i].t1_raw > maxAmp) {
        maxAmp = fftData[i].t1_raw
        maxIndex = i
      }
    }
    return { freq: fftData[maxIndex].freq, amp: maxAmp }
  }, [fftData])

  const dominantFreqFiltered = useMemo(() => {
    if (fftData.length === 0) return { freq: 0, amp: 0 }
    let maxIndex = 0
    let maxAmp = 0
    for (let i = 1; i < fftData.length; i++) {
      if (fftData[i].t1_actual > maxAmp) {
        maxAmp = fftData[i].t1_actual
        maxIndex = i
      }
    }
    return { freq: fftData[maxIndex].freq, amp: maxAmp }
  }, [fftData])

  const domFreqStr = dominantFreqRaw.freq > 0
    ? `Raw Peak: ${dominantFreqRaw.freq} Hz (${dominantFreqRaw.amp.toFixed(4)}°) | Filt Peak: ${dominantFreqFiltered.freq} Hz (${dominantFreqFiltered.amp.toFixed(4)}°)`
    : '--'

  const handleMouseDown = (e: any) => {
    if (!e || typeof e.activeLabel !== 'number') return
    setSelecting(true)
    setSelectStart(Number(e.activeLabel))
    setSelectEnd(Number(e.activeLabel))
    if (!isFrozen) {
      setIsFrozen(true)
      setFrozenEndTime(chartData[chartData.length - 1]?.t ?? 0)
    }
  }

  const handleMouseMove = (e: any) => {
    if (selecting && e && e.activeLabel) {
      setSelectEnd(Number(e.activeLabel))
    }
  }

  const handleMouseUp = () => {
    setSelecting(false)
    if (selectStart !== null && selectEnd !== null && Math.abs(selectStart - selectEnd) < 0.05) {
      setSelectStart(null)
      setSelectEnd(null)
      setIsFrozen(false)
      setFrozenEndTime(null)
    }
  }

  const handleExportCSV = () => {
    let exportData: ZNSample[] = []

    if (exportScope === 'all') {
      exportData = chartData
    } else if (exportScope === 'selection') {
      const tMin = selectStart !== null && selectEnd !== null ? Math.min(selectStart, selectEnd) : 0
      const tMax = selectStart !== null && selectEnd !== null ? Math.max(selectStart, selectEnd) : 0
      exportData = chartData.filter((s) => s.t >= tMin && s.t <= tMax)
    } else if (exportScope === '10s') {
      exportData = chartData.filter((s) => s.t >= chartEndTime - 10 && s.t <= chartEndTime)
    } else if (exportScope === '20s') {
      exportData = chartData.filter((s) => s.t >= chartEndTime - 20 && s.t <= chartEndTime)
    } else if (exportScope.startsWith('run-')) {
      const runId = parseInt(exportScope.replace('run-', ''), 10)
      const targetRun = runEvents.find((r) => r.id === runId)
      if (targetRun) {
        exportData = chartData.filter((s) => s.t >= targetRun.t && s.t <= targetRun.t + 20)
        
        // Optionally sync caliper to visual charts
        if (applyCaliperOnExport) {
          setIsFrozen(true)
          setFrozenEndTime(targetRun.t + 20)
          setSelectStart(targetRun.t)
          setSelectEnd(targetRun.t + 20)
        }
      }
    }

    if (exportData.length === 0) return

    const isJ1 = activeJoint === 1
    const headers = [
      'Timestamp (s)',
      'Target Position (deg)',
      'Actual Position (deg)',
      'Raw ADC Position (deg)',
      'Velocity (deg/s)',
      'PWM Output'
    ]

    const csvRows = [
      headers.join(','),
      ...exportData.map((s) => [
        s.t.toFixed(4),
        (isJ1 ? s.t1_target : s.t2_target).toFixed(4),
        (isJ1 ? s.t1_actual : s.t2_actual).toFixed(4),
        (isJ1 ? s.t1_raw : s.t2_raw).toFixed(4),
        (isJ1 ? s.v1 : s.v2).toFixed(4),
        s.pwm1
      ].join(','))
    ]

    const csvContent = csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    link.setAttribute('download', `scara_rest_analysis_joint${activeJoint}_${timestamp}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    setIsExportModalOpen(false)
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-4 bg-hmi-bg text-hmi-text font-sans">
      
      {/* Top controls and Info cards */}
      <div className="flex flex-col lg:flex-row gap-4 shrink-0">
        
        {/* Joint Selection & Static commands */}
        <Card className="flex-1 border-hmi-grid bg-hmi-panel p-4 flex flex-col gap-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-hmi-grid/50 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-sans">
              <Sliders className="w-4 h-4 text-hmi-ideal" /> Controls & Target
            </span>
            <span className="text-[10px] font-mono text-hmi-muted">
              ZN Analysis Mode
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-hmi-muted uppercase block mb-1 font-sans">Joint Selector</label>
              <div className="flex bg-hmi-bg p-0.5 rounded border border-hmi-grid">
                <button
                  onClick={() => setActiveJoint(1)}
                  className={cn(
                    "flex-1 text-xs py-1.5 rounded transition-all font-semibold cursor-pointer",
                    activeJoint === 1 ? "bg-hmi-btn text-hmi-text shadow-sm" : "text-hmi-muted hover:text-hmi-text"
                  )}
                >
                  Joint 1 (DC Motor)
                </button>
                <button
                  onClick={() => setActiveJoint(2)}
                  className={cn(
                    "flex-1 text-xs py-1.5 rounded transition-all font-semibold cursor-pointer",
                    activeJoint === 2 ? "bg-hmi-btn text-hmi-text shadow-sm" : "text-hmi-muted hover:text-hmi-text"
                  )}
                >
                  Joint 2 (Stepper)
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-hmi-muted uppercase block mb-1 font-sans">Send Step Target (deg)</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  className="h-8 text-xs font-mono bg-hmi-bg border-hmi-grid text-emerald-400 font-bold focus:border-hmi-ideal focus:ring-1 focus:ring-hmi-ideal"
                  value={stepTarget}
                  onChange={(e) => setStepTarget(e.target.value)}
                />
                <Button size="sm" onClick={handleSendStep} className="h-8 px-4 text-xs bg-hmi-btn hover:bg-hmi-btn-hover font-semibold shrink-0 cursor-pointer">
                  Send Target
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Streaming control and graph actions */}
        <Card className="border-hmi-grid bg-hmi-panel p-4 flex flex-col justify-between lg:w-[350px] shadow-lg">
          <div className="flex items-center justify-between border-b border-hmi-grid/50 pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-sans">
              <Activity className="w-4 h-4 text-hmi-ideal" /> Buffer Control
            </span>
            <span className="text-[10px] font-mono text-hmi-muted">
              {chartData.length} / {MAX_BUFFER} samples
            </span>
          </div>

          <div className="flex gap-2 mt-4">
            <Button
              size="sm"
              onClick={handleToggleFreeze}
              className={cn("flex-1 text-xs h-9 gap-1.5 font-bold uppercase cursor-pointer transition-colors", isFrozen ? "bg-amber-600 hover:bg-amber-500 text-white" : "bg-cyan-700 hover:bg-cyan-600 text-white")}
            >
              {isFrozen ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              {isFrozen ? 'Resume' : 'Pause'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearGraph}
              className="px-3 border-hmi-grid hover:bg-hmi-btn text-hmi-text h-9 cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-hmi-muted hover:text-hmi-text" />
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setExportScope(selectStart !== null && selectEnd !== null ? 'selection' : 'all')
                setIsExportModalOpen(true)
              }}
              disabled={chartData.length === 0}
              className="flex-1 text-xs h-9 gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white font-bold uppercase cursor-pointer disabled:opacity-40 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </Button>
          </div>
        </Card>
      </div>

      {/* Chart Configuration Select Panel */}
      <Card className="border-hmi-grid bg-hmi-panel p-3.5 shadow-lg flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 font-sans flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-emerald-400" /> Konfigurasi Analisis Grafik
          </span>
          <span className="text-[10px] text-hmi-muted font-sans">
            Pilih parameter atau mode perbandingan untuk dianalisis dalam satu grafik
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-hmi-muted uppercase font-sans">Tampilkan:</span>
          <Select value={viewMode} onValueChange={(val) => setViewMode(val as any)}>
            <SelectTrigger className="w-60 h-7 text-xs bg-hmi-bg border-hmi-grid text-slate-300">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pos">Posisi Filtered (Target vs Aktif)</SelectItem>
              <SelectItem value="raw">Posisi Raw ADC (Tanpa Filter)</SelectItem>
              <SelectItem value="compare">Perbandingan Posisi (Filtered vs Raw)</SelectItem>
              <SelectItem value="vel">Kecepatan</SelectItem>
              <SelectItem value="fft">Frekuensi (FFT Spectrum)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Main Analysis Dashboard Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 shrink-0">
        
        {/* Left Side: Focused Chart (8 Cols) */}
        <div className={cn("flex flex-col", isChartExpanded ? "" : "lg:col-span-8")}>
          <Card className={cn(
            "flex flex-col border border-hmi-grid bg-hmi-panel shadow-lg select-none",
            isChartExpanded 
              ? "fixed inset-0 z-[100] m-0 rounded-none p-6 bg-hmi-bg h-full w-full" 
              : "h-[400px] p-4 relative"
          )}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300 font-sans">
                  {viewMode === 'pos' && 'Filtered Position vs Target'}
                  {viewMode === 'raw' && 'Raw ADC Position (Unfiltered)'}
                  {viewMode === 'compare' && 'Comparison: Filtered vs Raw ADC Jitter'}
                  {viewMode === 'vel' && 'Joint Velocity'}
                  {viewMode === 'fft' && 'Noise Frequency Spectrum'}
                </span>
                <span className="text-[10px] font-mono text-hmi-muted">
                  {selectStart !== null && selectEnd !== null
                    ? `Selection: ${Math.min(selectStart, selectEnd).toFixed(2)}s - ${Math.max(selectStart, selectEnd).toFixed(2)}s`
                    : 'Drag on graph to freeze & compute stats'}
                </span>
              </div>
              <div className="flex items-center gap-2">
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

            {/* Overlays */}
            <div className="absolute top-12 right-4 bg-slate-900/85 backdrop-blur-sm border border-slate-800/80 px-2.5 py-1 rounded text-[10px] font-mono text-slate-300 pointer-events-none select-none z-10 shadow-md">
              <span className="text-slate-500 font-sans mr-1">Latest:</span>
              {viewMode === 'pos' && posOverlayStr}
              {viewMode === 'raw' && rawOverlayStr}
              {viewMode === 'compare' && `${posOverlayStr} | ${rawOverlayStr}`}
              {viewMode === 'vel' && velOverlayStr}
              {viewMode === 'fft' && domFreqStr}
            </div>

            <div className="flex-1 min-h-0">
              {viewMode === 'fft' ? (
                fftData.length === 0 ? (
                  <div className="w-full h-full flex flex-col items-center justify-center border border-dashed border-hmi-grid rounded text-xs text-slate-400 font-sans italic">
                    Select a region containing at least 8 samples on any other graph view to preview spectrum.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={fftData} margin={{ top: 12, right: 12, left: 10, bottom: 8 }}>
                      <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
                      <XAxis
                        dataKey="freq"
                        type="number"
                        domain={[0, nyquistFreq]}
                        tick={AT}
                        axisLine={AL}
                        tickLine={false}
                        tickFormatter={(v) => `${v}Hz`}
                      />
                      <YAxis
                        tick={AT}
                        axisLine={AL}
                        tickLine={false}
                        tickFormatter={(v) => (v != null && !isNaN(Number(v))) ? `${Number(v).toFixed(3)}°` : ''}
                        width={45}
                      />
                      <ChartTooltip
                        contentStyle={TS}
                        labelFormatter={(label) => `Freq: ${label} Hz`}
                      />
                      <Legend 
                        verticalAlign="top" 
                        align="left"
                        height={24} 
                        onClick={handleLegendClick}
                        wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace', fontWeight: 600, cursor: 'pointer', paddingBottom: '8px' }} 
                      />
                      {!hiddenLines.t1_raw && (
                        <Area
                          type="linear"
                          dataKey="t1_raw"
                          stroke="#94a3b8"
                          fill="#94a3b8"
                          fillOpacity={0.15}
                          strokeWidth={1.5}
                          name="Raw ADC FFT Amplitude"
                          isAnimationActive={false}
                        />
                      )}
                      {!hiddenLines.t1_actual && (
                        <Area
                          type="linear"
                          dataKey="t1_actual"
                          stroke="#FF9800"
                          fill="#FF9800"
                          fillOpacity={0.15}
                          strokeWidth={1.5}
                          name="Filtered FFT Amplitude"
                          isAnimationActive={false}
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                )
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={visibleData}
                    margin={{ top: 12, right: 12, left: 10, bottom: 8 }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                  >
                    <CartesianGrid stroke={GRID} strokeDasharray="2 2" />
                    <XAxis
                      dataKey="t"
                      type="number"
                      domain={[chartEndTime - 10, chartEndTime]}
                      tick={AT}
                      axisLine={AL}
                      tickLine={false}
                      tickFormatter={(v) => (v != null && !isNaN(Number(v))) ? `${Number(v).toFixed(1)}s` : ''}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      tick={AT}
                      axisLine={AL}
                      tickLine={false}
                      tickFormatter={(v) => (v != null && !isNaN(Number(v))) ? (viewMode === 'vel' ? `${Number(v).toFixed(0)}°/s` : `${Number(v).toFixed(1)}°`) : ''}
                      width={45}
                    />
                    <ChartTooltip
                      contentStyle={TS}
                      labelFormatter={(label) => `Time: ${label != null && !isNaN(Number(label)) ? Number(label).toFixed(3) : '0'} s`}
                    />
                    <Legend 
                      verticalAlign="top" 
                      align="left"
                      height={24} 
                      iconType="plainline" 
                      onClick={handleLegendClick} 
                      wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace', fontWeight: 600, cursor: 'pointer', paddingBottom: '8px' }} 
                    />
                    
                    {selectStart !== null && selectEnd !== null && (
                      <ReferenceArea
                        x1={Math.min(selectStart, selectEnd)}
                        x2={Math.max(selectStart, selectEnd)}
                        fill="#06B6D4"
                        fillOpacity={0.12}
                        stroke="#06B6D4"
                        strokeOpacity={0.4}
                      />
                    )}

                    {viewMode === 'pos' && (
                      <>
                        {!hiddenLines.t1_target && (
                          <Line
                            type="monotone"
                            dataKey={activeJoint === 1 ? 't1_target' : 't2_target'}
                            stroke="#06B6D4"
                            strokeDasharray="4 4"
                            strokeWidth={1.5}
                            dot={false}
                            name="Target Position (°)"
                            isAnimationActive={false}
                          />
                        )}
                        {!hiddenLines.t1_actual && (
                          <Line
                            type="monotone"
                            dataKey={activeJoint === 1 ? 't1_actual' : 't2_actual'}
                            stroke="#FF9800"
                            strokeWidth={2}
                            dot={false}
                            name="Filtered Position (°)"
                            isAnimationActive={false}
                          />
                        )}
                      </>
                    )}

                    {viewMode === 'raw' && (
                      <>
                        {!hiddenLines.t1_raw && (
                          <Line
                            type="monotone"
                            dataKey={activeJoint === 1 ? 't1_raw' : 't2_raw'}
                            stroke="#94a3b8"
                            strokeWidth={1.75}
                            dot={false}
                            name="Raw ADC Position (°)"
                            isAnimationActive={false}
                          />
                        )}
                      </>
                    )}

                    {viewMode === 'compare' && (
                      <>
                        {!hiddenLines.t1_target && (
                          <Line
                            type="monotone"
                            dataKey={activeJoint === 1 ? 't1_target' : 't2_target'}
                            stroke="#06B6D4"
                            strokeDasharray="4 4"
                            strokeWidth={1.5}
                            dot={false}
                            name="Target Position (°)"
                            isAnimationActive={false}
                          />
                        )}
                        {!hiddenLines.t1_raw && (
                          <Line
                            type="monotone"
                            dataKey={activeJoint === 1 ? 't1_raw' : 't2_raw'}
                            stroke="#64748b"
                            strokeOpacity={0.35}
                            strokeWidth={1}
                            dot={false}
                            name="Raw ADC Position (Dimmed) (°)"
                            isAnimationActive={false}
                          />
                        )}
                        {!hiddenLines.t1_actual && (
                          <Line
                            type="monotone"
                            dataKey={activeJoint === 1 ? 't1_actual' : 't2_actual'}
                            stroke="#FF9800"
                            strokeWidth={2}
                            dot={false}
                            name="Filtered Position (°)"
                            isAnimationActive={false}
                          />
                        )}
                      </>
                    )}

                    {viewMode === 'vel' && (
                      <>
                        {!hiddenLines.v1 && (
                          <Line
                            type="monotone"
                            dataKey={activeJoint === 1 ? 'v1' : 'v2'}
                            stroke="#10B981"
                            strokeWidth={1.75}
                            dot={false}
                            name="Joint Velocity (°/s)"
                            isAnimationActive={false}
                          />
                        )}
                      </>
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>

        {/* Right Side: Specific Metrics Dashboard (4 Cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4 overflow-y-auto max-h-[400px] pr-1.5 scrollbar-thin scrollbar-thumb-slate-800">
          <div className="flex flex-col gap-4">
            
            {/* POS METRICS */}
            {viewMode === 'pos' && (
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-sans block">
                  📊 Position Analysis Metrics
                </span>
                <Card className="border-hmi-grid bg-hmi-panel p-3 flex flex-col justify-between h-20 shadow-md">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Steady-State Error (SSE)</span>
                  <span className="text-xl font-mono font-bold text-hmi-text">
                    {analysis.sse.toFixed(5)}°
                  </span>
                  <span className="text-[9px] text-hmi-muted">|Actual Mean - Target| over selection</span>
                </Card>

                <Card className="border-hmi-grid bg-hmi-panel p-3 flex flex-col justify-between h-20 shadow-md">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Mean Position</span>
                  <span className="text-xl font-mono font-bold text-emerald-400">
                    {analysis.mean.toFixed(4)}°
                  </span>
                  <span className="text-[9px] text-hmi-muted">Target des: {analysis.target.toFixed(1)}°</span>
                </Card>

                <Card className="border-hmi-grid bg-hmi-panel p-3 flex flex-col justify-between h-20 shadow-md">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Filtered Jitter Std Dev (σ)</span>
                  <span className="text-xl font-mono font-bold text-cyan-400">
                    {analysis.filtStd.toFixed(5)}°
                  </span>
                  <span className="text-[9px] text-hmi-muted">Filtered noise level variance</span>
                </Card>

                <Card className="border-hmi-grid bg-hmi-panel p-3 flex flex-col justify-between h-20 shadow-md">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Filtered Peak-to-Peak</span>
                  <span className="text-xl font-mono font-bold text-amber-400">
                    {analysis.filtP2P.toFixed(4)}°
                  </span>
                  <span className="text-[9px] text-hmi-muted">Max swing of filtered position</span>
                </Card>
              </div>
            )}

            {/* RAW METRICS */}
            {viewMode === 'raw' && (
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-sans block">
                  🛡️ Raw ADC Noise Metrics
                </span>
                <Card className="border-hmi-grid bg-hmi-panel p-3 flex flex-col justify-between h-20 shadow-md">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Raw ADC Std Dev (σ)</span>
                  <span className="text-xl font-mono font-bold text-neutral-400">
                    {analysis.rawStd.toFixed(5)}°
                  </span>
                  <span className="text-[9px] text-hmi-muted">Standard deviation (Raw ADC noise floor)</span>
                </Card>

                <Card className="border-hmi-grid bg-hmi-panel p-3 flex flex-col justify-between h-20 shadow-md">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Raw Peak-to-Peak Swing</span>
                  <span className="text-xl font-mono font-bold text-amber-500">
                    {analysis.rawP2P.toFixed(4)}°
                  </span>
                  <span className="text-[9px] text-hmi-muted">Max excursion value (Raw ADC)</span>
                </Card>

                <Card className="border-hmi-grid bg-hmi-panel p-3 flex flex-col justify-between h-20 shadow-md">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Mean Raw Position</span>
                  <span className="text-xl font-mono font-bold text-slate-300">
                    {analysis.meanRaw.toFixed(4)}°
                  </span>
                  <span className="text-[9px] text-hmi-muted">Raw sensor held average</span>
                </Card>
              </div>
            )}

            {/* COMPARE METRICS */}
            {viewMode === 'compare' && (
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-sans block">
                  ⚖️ Jitter & Filter Comparison
                </span>
                
                <div className="border border-emerald-500/35 bg-emerald-950/20 p-3 flex items-center justify-between text-xs font-sans shadow-md rounded">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Noise Attenuation</span>
                    <span className="text-[10px] text-slate-400 leading-tight">
                      TD filter Jitter Reduction:
                    </span>
                  </div>
                  <span className="text-lg font-mono font-black text-emerald-400">
                    +{analysis.dbReduction.toFixed(1)} dB
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Card className="border-hmi-grid bg-hmi-panel p-2.5 flex flex-col justify-between h-16 shadow-sm">
                    <span className="text-[8px] text-slate-400 font-bold uppercase">Raw Jitter (σ)</span>
                    <span className="text-sm font-mono font-bold text-slate-400">
                      {analysis.rawStd.toFixed(4)}°
                    </span>
                  </Card>
                  <Card className="border-hmi-grid bg-hmi-panel p-2.5 flex flex-col justify-between h-16 shadow-sm">
                    <span className="text-[8px] text-slate-400 font-bold uppercase">Filt Jitter (σ)</span>
                    <span className="text-sm font-mono font-bold text-cyan-400">
                      {analysis.filtStd.toFixed(4)}°
                    </span>
                  </Card>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Card className="border-hmi-grid bg-hmi-panel p-2.5 flex flex-col justify-between h-16 shadow-sm">
                    <span className="text-[8px] text-slate-400 font-bold uppercase">Raw Peak-to-Peak</span>
                    <span className="text-sm font-mono font-bold text-amber-500">
                      {analysis.rawP2P.toFixed(3)}°
                    </span>
                  </Card>
                  <Card className="border-hmi-grid bg-hmi-panel p-2.5 flex flex-col justify-between h-16 shadow-sm">
                    <span className="text-[8px] text-slate-400 font-bold uppercase">Filt Peak-to-Peak</span>
                    <span className="text-sm font-mono font-bold text-amber-400">
                      {analysis.filtP2P.toFixed(3)}°
                    </span>
                  </Card>
                </div>

                <Card className="border-hmi-grid bg-hmi-panel p-2.5 flex flex-col justify-between h-16 shadow-sm">
                  <span className="text-[8px] text-slate-400 font-bold uppercase">Steady-State Error (SSE)</span>
                  <span className="text-sm font-mono font-bold text-hmi-text">
                    {analysis.sse.toFixed(4)}°
                  </span>
                </Card>
              </div>
            )}

            {/* VEL METRICS */}
            {viewMode === 'vel' && (
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-sans block">
                  ⚡ Velocity Dynamics Metrics
                </span>
                <Card className="border-hmi-grid bg-hmi-panel p-3 flex flex-col justify-between h-20 shadow-md">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">RMS Velocity</span>
                  <span className="text-xl font-mono font-bold text-emerald-400">
                    {analysis.rmsVel.toFixed(4)}°/s
                  </span>
                  <span className="text-[9px] text-hmi-muted">Root-Mean-Square velocity error/jitter</span>
                </Card>

                <Card className="border-hmi-grid bg-hmi-panel p-3 flex flex-col justify-between h-20 shadow-md">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Max Velocity Spike</span>
                  <span className="text-xl font-mono font-bold text-red-400">
                    {analysis.maxVelSpike.toFixed(4)}°/s
                  </span>
                  <span className="text-[9px] text-hmi-muted">Maximum velocity outlier spike</span>
                </Card>

                <Card className="border-hmi-grid bg-hmi-panel p-3 flex flex-col justify-between h-20 shadow-md">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Mean Velocity</span>
                  <span className="text-xl font-mono font-bold text-slate-300">
                    {analysis.meanVel.toFixed(4)}°/s
                  </span>
                  <span className="text-[9px] text-hmi-muted">Average velocity displacement rate</span>
                </Card>
              </div>
            )}

            {/* FFT METRICS */}
            {viewMode === 'fft' && (
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-sans block">
                  🌌 Noise Frequency Spectrum Metrics
                </span>

                {/* Raw ADC Metrics */}
                <div className="border border-slate-700/50 rounded-lg p-2.5 flex flex-col gap-2 bg-slate-800/10">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">Raw ADC Signal</span>
                  <Card className="border-hmi-grid bg-hmi-panel p-3 flex flex-col justify-between h-20 shadow-md">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Dominant Vibration Freq (Raw)</span>
                    <span className="text-xl font-mono font-bold text-slate-300">
                      {dominantFreqRaw.freq} Hz
                    </span>
                    <span className="text-[9px] text-hmi-muted">Frequency with the largest raw noise amplitude</span>
                  </Card>
                  <Card className="border-hmi-grid bg-hmi-panel p-3 flex flex-col justify-between h-20 shadow-md">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Peak FFT Amplitude (Raw)</span>
                    <span className="text-xl font-mono font-bold text-slate-400">
                      {dominantFreqRaw.amp.toFixed(5)}°
                    </span>
                    <span className="text-[9px] text-hmi-muted">Spectral amplitude at raw dominant frequency</span>
                  </Card>
                </div>

                {/* Filtered Metrics */}
                <div className="border border-slate-700/50 rounded-lg p-2.5 flex flex-col gap-2 bg-slate-800/10">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider px-1 font-sans">Filtered Signal</span>
                  <Card className="border-hmi-grid bg-hmi-panel p-3 flex flex-col justify-between h-20 shadow-md">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Dominant Vibration Freq (Filt)</span>
                    <span className="text-xl font-mono font-bold text-amber-400">
                      {dominantFreqFiltered.freq} Hz
                    </span>
                    <span className="text-[9px] text-hmi-muted">Frequency with the largest filtered noise amplitude</span>
                  </Card>
                  <Card className="border-hmi-grid bg-hmi-panel p-3 flex flex-col justify-between h-20 shadow-md">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Peak FFT Amplitude (Filt)</span>
                    <span className="text-xl font-mono font-bold text-cyan-400">
                      {dominantFreqFiltered.amp.toFixed(5)}°
                    </span>
                    <span className="text-[9px] text-hmi-muted">Spectral amplitude at filtered dominant frequency</span>
                  </Card>
                </div>

                <Card className="border-hmi-grid bg-hmi-panel p-3 flex flex-col justify-between h-20 shadow-md">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Analysis Sample Size</span>
                  <span className="text-xl font-mono font-bold text-slate-300">
                    {fftData.length * 2} pts
                  </span>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable Data Table Preview */}
      <Card className="w-full border-hmi-grid bg-hmi-panel p-3 flex flex-col shadow-lg shrink-0 mt-4">
        <div className="flex items-center justify-between pb-2 border-b border-hmi-grid">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 font-sans">
            <TableIcon className="w-4 h-4 text-slate-400" /> Telemetry Data Table Preview (Active Selection / Buffer)
          </span>
          <span className="text-[10px] font-mono text-hmi-muted">
            Displaying latest {Math.min(100, activeSelection.length)} of {activeSelection.length} samples
          </span>
        </div>

        <div className="overflow-auto mt-2 max-h-[400px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-hmi-bg text-hmi-muted border-b border-hmi-grid sticky top-0 font-semibold z-10">
                <th className="p-1.5 border-r border-hmi-grid font-sans text-[10px] text-slate-400">Time (s)</th>
                <th className="p-1.5 border-r border-hmi-grid font-sans text-[10px] text-slate-400">Target (°)</th>
                <th className="p-1.5 border-r border-hmi-grid font-sans text-[10px] text-slate-400">Actual (°)</th>
                <th className="p-1.5 border-r border-hmi-grid font-sans text-[10px] text-slate-400">Raw ADC (°)</th>
                <th className="p-1.5 border-r border-hmi-grid font-sans text-[10px] text-slate-400">Velocity (°/s)</th>
                <th className="p-1.5 font-sans text-[10px] text-slate-400">PWM Output</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hmi-grid/50 font-mono text-neutral-300">
              {activeSelection.slice(-100).reverse().map((s) => (
                <tr key={s.idx} className="hover:bg-hmi-bg/40">
                  <td className="p-1 border-r border-hmi-grid text-slate-400">{s.t.toFixed(3)}</td>
                  <td className="p-1 border-r border-hmi-grid text-neutral-500">
                    {(activeJoint === 1 ? s.t1_target : s.t2_target).toFixed(2)}
                  </td>
                  <td className="p-1 border-r border-hmi-grid text-amber-500 font-medium">
                    {(activeJoint === 1 ? s.t1_actual : s.t2_actual).toFixed(3)}
                  </td>
                  <td className="p-1 border-r border-hmi-grid text-neutral-500">
                    {(activeJoint === 1 ? s.t1_raw : s.t2_raw).toFixed(3)}
                  </td>
                  <td className="p-1 border-r border-hmi-grid text-emerald-400">
                    {(activeJoint === 1 ? s.v1 : s.v2).toFixed(2)}
                  </td>
                  <td className={cn("p-1 font-semibold", s.pwm1 > 0 ? "text-emerald-400" : s.pwm1 < 0 ? "text-red-400" : "text-neutral-500")}>
                    {s.pwm1}
                  </td>
                </tr>
              ))}
              {activeSelection.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-hmi-muted font-sans italic">
                    No active buffer telemetry. Ensure the serial port is connected.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      
      {/* Bottom status line */}
      <footer className="w-full bg-hmi-panel border border-hmi-grid px-4 py-2 flex items-center justify-between text-xs font-mono shrink-0 rounded select-none shadow-md">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="text-hmi-muted">Port:</span>
            <span className={cn(serialStatus === 'connected' ? 'text-emerald-400 font-bold' : 'text-amber-500')}>
              {serialStatus === 'connected' ? (state.portName ?? 'Connected') : 'Disconnected'}
            </span>
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

      {/* Export CSV Configuration Pop-up Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="bg-slate-900 border border-slate-800 p-6 rounded-lg shadow-2xl max-w-md w-full flex flex-col gap-4 text-hmi-text">
            <div className="flex items-center justify-between border-b border-hmi-grid/50 pb-2">
              <span className="text-sm font-bold uppercase tracking-wider text-slate-200 font-sans flex items-center gap-1.5">
                <Download className="w-4 h-4 text-emerald-400" /> Export CSV Configuration
              </span>
              <button 
                onClick={() => setIsExportModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 font-mono text-sm font-bold p-1 hover:bg-slate-850 rounded cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <span className="text-xs text-slate-400">
                Pilih rentang data telemetry yang ingin diekspor ke file CSV:
              </span>

              {/* Standard Options */}
              <div className="flex flex-col gap-2">
                {/* Full Buffer */}
                <label className={cn(
                  "flex items-center justify-between p-2.5 rounded border text-xs cursor-pointer transition-all hover:bg-slate-850",
                  exportScope === 'all' ? "border-emerald-500 bg-emerald-950/15" : "border-hmi-grid bg-hmi-panel/50"
                )}>
                  <div className="flex items-center gap-2">
                    <input 
                      type="radio" 
                      name="exportScope" 
                      value="all" 
                      checked={exportScope === 'all'} 
                      onChange={() => setExportScope('all')}
                      className="accent-emerald-500"
                    />
                    <div className="flex flex-col">
                      <span className="font-semibold">Seluruh Telemetry Buffer</span>
                      <span className="text-[10px] text-hmi-muted">Semua data tersimpan sejak awal perekaman</span>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                    {chartData.length} pts
                  </span>
                </label>

                {/* Caliper Selection */}
                <label className={cn(
                  "flex items-center justify-between p-2.5 rounded border text-xs transition-all",
                  selectStart === null || selectEnd === null 
                    ? "opacity-40 border-hmi-grid bg-hmi-panel/20 cursor-not-allowed" 
                    : "cursor-pointer hover:bg-slate-850",
                  exportScope === 'selection' ? "border-emerald-500 bg-emerald-950/15" : "border-hmi-grid bg-hmi-panel/50"
                )}>
                  <div className="flex items-center gap-2">
                    <input 
                      type="radio" 
                      name="exportScope" 
                      value="selection" 
                      disabled={selectStart === null || selectEnd === null}
                      checked={exportScope === 'selection'} 
                      onChange={() => setExportScope('selection')}
                      className="accent-emerald-500"
                    />
                    <div className="flex flex-col">
                      <span className="font-semibold">Seleksi Caliper Grafik</span>
                      <span className="text-[10px] text-hmi-muted">
                        {selectStart !== null && selectEnd !== null 
                          ? `Rentang: ${Math.min(selectStart, selectEnd).toFixed(2)}s - ${Math.max(selectStart, selectEnd).toFixed(2)}s`
                          : 'Silakan drag caliper di grafik terlebih dahulu'}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                    {activeSelection.length} pts
                  </span>
                </label>

                {/* Last 10s */}
                <label className={cn(
                  "flex items-center justify-between p-2.5 rounded border text-xs cursor-pointer transition-all hover:bg-slate-850",
                  exportScope === '10s' ? "border-emerald-500 bg-emerald-950/15" : "border-hmi-grid bg-hmi-panel/50"
                )}>
                  <div className="flex items-center gap-2">
                    <input 
                      type="radio" 
                      name="exportScope" 
                      value="10s" 
                      checked={exportScope === '10s'} 
                      onChange={() => setExportScope('10s')}
                      className="accent-emerald-500"
                    />
                    <div className="flex flex-col">
                      <span className="font-semibold">10 Detik Terakhir (Jendela Grafik)</span>
                      <span className="text-[10px] text-hmi-muted">Sesuai rentang yang tampil di grafik berjalan</span>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                    {chartData.filter(s => s.t >= chartEndTime - 10 && s.t <= chartEndTime).length} pts
                  </span>
                </label>

                {/* Last 20s */}
                <label className={cn(
                  "flex items-center justify-between p-2.5 rounded border text-xs cursor-pointer transition-all hover:bg-slate-850",
                  exportScope === '20s' ? "border-emerald-500 bg-emerald-950/15" : "border-hmi-grid bg-hmi-panel/50"
                )}>
                  <div className="flex items-center gap-2">
                    <input 
                      type="radio" 
                      name="exportScope" 
                      value="20s" 
                      checked={exportScope === '20s'} 
                      onChange={() => setExportScope('20s')}
                      className="accent-emerald-500"
                    />
                    <div className="flex flex-col">
                      <span className="font-semibold">20 Detik Terakhir</span>
                      <span className="text-[10px] text-hmi-muted">Mengambil data respon terbaru dari buffer</span>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                    {chartData.filter(s => s.t >= chartEndTime - 20 && s.t <= chartEndTime).length} pts
                  </span>
                </label>
              </div>

              {/* Dynamic Run Bookmark Options */}
              {runEvents.length > 0 && (
                <div className="flex flex-col gap-2 mt-1">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider font-sans">
                    📌 Run Trigger Bookmarks (Respon Langkah)
                  </span>
                  <div className="flex flex-col gap-2 max-h-[120px] overflow-y-auto pr-1 border border-hmi-grid/45 rounded p-1.5 bg-slate-950/20">
                    {runEvents.map((event, idx) => {
                      const optVal = `run-${event.id}`
                      const count = chartData.filter(s => s.t >= event.t && s.t <= event.t + 20).length
                      return (
                        <label key={event.id} className={cn(
                          "flex items-center justify-between p-2 rounded border text-xs cursor-pointer transition-all hover:bg-slate-850",
                          exportScope === optVal ? "border-emerald-500 bg-emerald-950/15" : "border-hmi-grid bg-hmi-panel/50"
                        )}>
                          <div className="flex items-center gap-2">
                            <input 
                              type="radio" 
                              name="exportScope" 
                              value={optVal} 
                              checked={exportScope === optVal} 
                              onChange={() => setExportScope(optVal)}
                              className="accent-emerald-500"
                            />
                            <div className="flex flex-col">
                              <span className="font-semibold">Run {idx + 1}: Target {event.target.toFixed(1)}°</span>
                              <span className="text-[9px] text-hmi-muted">Fired: {event.timeLabel} ({event.t.toFixed(1)}s s.d {(event.t + 20).toFixed(1)}s)</span>
                            </div>
                          </div>
                          <span className="font-mono text-[10px] bg-slate-800 px-1 py-0.5 rounded text-slate-300">
                            {count} pts
                          </span>
                        </label>
                      )
                    })}
                  </div>
                  
                  {exportScope.startsWith('run-') && (
                    <label className="flex items-center gap-2 text-[10px] text-slate-300 font-sans cursor-pointer mt-1 bg-slate-950/30 p-1.5 rounded border border-hmi-grid/35">
                      <input 
                        type="checkbox" 
                        checked={applyCaliperOnExport}
                        onChange={(e) => setApplyCaliperOnExport(e.target.checked)}
                        className="accent-emerald-500 h-3 w-3"
                      />
                      <span>Terapkan caliper visual pada grafik setelah download</span>
                    </label>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end mt-2 pt-2 border-t border-hmi-grid/50">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setIsExportModalOpen(false)}
                className="text-xs h-8 border-hmi-grid hover:bg-slate-850 text-slate-300 hover:text-slate-100 cursor-pointer"
              >
                Batal
              </Button>
              <Button 
                size="sm"
                onClick={handleExportCSV}
                className="text-xs h-8 bg-emerald-700 hover:bg-emerald-600 text-white font-bold cursor-pointer"
              >
                Unduh CSV
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}


'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'
import type {
  DSample,
  ESPMode,
  FSample,
  ESample,
  AdvParams,
  Gains,
  HMIAction,
  HMIState,
  MoveInfo,
  SerialController,
  TPoint,
  ZNSample,
} from './hmi-types'
import { parseDSample, parseGains, parseAdvParams } from './telemetry-types'
import { computeCTEList, computeMCTE, computeATEList } from './cte-utils'

const MAX_BUFFER = 2000
const MAX_LOG_LINES = 100

export const defaultParams: AdvParams = {
  vmax: 0.1,
  amax: 0.5,
  cfreq: 200,
  u1max: 255,
  fzt: 0.1,
  pwmDb: 0,
  fztKickPct: 0.1,
  kickstartEnabled: true,
  dbMovingEnabled: true,
  dbEngageScale: 0.75,
  td1r: 50.0,    // TD bandwidth J1 (rad/s) — Rev 15-TD
  td2r: 50.0,    // TD bandwidth J2 (rad/s)
  tdH: 0.015,   // TD step size h=3×DT @ 200Hz (read-only)
  ddth: 10.0,
  dben: 0.01,
  dbrel: 0.02,
  dbvel: 0.05,
  hskp: 1.0,
  hskd: 1.0,
  idecay: 0.99,
  taunom: 1.0,
  m22ref: 1.0,
  alphaTiltDeg: 0.0,
  tdEnabled: true,
  trapEnabled: true,
  ki2GateRad: 0.02,
  db2en: 0.008,
  db2rel: 0.005,
  errDz: 0.005,
  integralFreezeThresh: 0.015,
  kvVel: 0.0,
  vffMaxFrac: 0.3,
  vffDvMax: 0.1,
}

// ─── localStorage persistence ────────────────────────────────────────────────
const LS_KEY = 'hmi_state_v1'

type PersistedState = Pick<
  HMIState,
  | 'frozenD'
  | 'frozenT'
  | 'frozenF'
  | 'frozenE'
  | 'stats'
  | 'gains'
  | 'params'
  | 'hasSyncedParams'
  | 'queueStatus'
  | 'logLines'
  | 'moveCount'
  | 'recordingState'
  | 'currentMove'
  | 'showGhost'
>

function loadPersistedState(): Partial<PersistedState> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Partial<PersistedState>
  } catch {
    return {}
  }
}

function saveState(state: HMIState) {
  try {
    const toSave: PersistedState = {
      frozenD: state.frozenD,
      frozenT: state.frozenT,
      frozenF: state.frozenF,
      frozenE: state.frozenE,
      stats: state.stats,
      gains: state.gains,
      params: state.params,
      hasSyncedParams: state.hasSyncedParams,
      queueStatus: state.queueStatus,
      logLines: state.logLines,
      moveCount: state.moveCount,
      recordingState: state.recordingState === 'REC' ? 'IDLE' : state.recordingState,
      currentMove: state.currentMove,
      showGhost: state.showGhost,
    }
    localStorage.setItem(LS_KEY, JSON.stringify(toSave))
  } catch { /* quota exceeded or SSR */ }
}

function clearPersistedState() {
  try {
    localStorage.removeItem(LS_KEY)
  } catch { /* ignore */ }
}

function computeStats(tBuf: TPoint[], dBuf: DSample[]) {
  if (tBuf.length === 0) return null
  const ctes = computeCTEList(tBuf)
  const validIndices = []
  for (let i = 0; i < tBuf.length; i++) {
    const p = tBuf[i]
    const e = Math.sqrt((p.xi - p.xa) ** 2 + (p.yi - p.ya) ** 2)
    if (e <= 170) {
      validIndices.push(i)
    }
  }
  if (validIndices.length === 0) return null

  const filteredT = validIndices.map((i) => tBuf[i])
  const filteredCtes = validIndices.map((i) => ctes[i])

  const max_err = Math.max(...filteredCtes)
  const mean_err = computeMCTE(filteredT, filteredCtes)
  const final_err = filteredCtes[filteredCtes.length - 1]

  // Compute longitudinal and lateral error components for filtered points
  const eLats = filteredCtes // CTE is the lateral error
  const eLongs = computeATEList(filteredT)

  // Integrate over distance to get average longitudinal and lateral errors
  let areaLong = 0
  let areaLat = 0
  let totalDist = 0
  for (let j = 0; j < filteredT.length - 1; j++) {
    const dx = filteredT[j + 1].xa - filteredT[j].xa
    const dy = filteredT[j + 1].ya - filteredT[j].ya
    const ds = Math.sqrt(dx * dx + dy * dy)
    
    const longAvg = (eLongs[j] + eLongs[j + 1]) / 2
    const latAvg = (eLats[j] + eLats[j + 1]) / 2
    
    areaLong += longAvg * ds
    areaLat += latAvg * ds
    totalDist += ds
  }

  let MATE = 0
  let MCTE = 0
  if (totalDist > 0) {
    MATE = areaLong / totalDist
    MCTE = areaLat / totalDist
  } else {
    // Fallback: simple arithmetic averages
    MATE = eLongs.reduce((a, b) => a + b, 0) / eLongs.length
    MCTE = eLats.reduce((a, b) => a + b, 0) / eLats.length
  }

  let sumSqLong = 0
  for (let i = 0; i < eLongs.length; i++) {
    sumSqLong += eLongs[i] ** 2
  }
  const RMS_ATE = Math.sqrt(sumSqLong / eLongs.length)

  const absMATE = Math.abs(MATE)
  const error_ratio = (absMATE + MCTE) > 0 
    ? absMATE / (absMATE + MCTE) 
    : 0.5

  const accuracy_idx = totalDist > 0 ? 1 - mean_err / totalDist : 1.0
  const elapsed_time = dBuf.length >= 2 
    ? (dBuf[dBuf.length - 1].t - dBuf[0].t) / 1000 
    : 0

  return {
    n: validIndices.length,
    max_err,
    mean_err,
    final_err,
    pwm_max: Math.max(...dBuf.map((d) => Math.abs(d.pwm1)), 0),
    accuracy_idx,
    MATE,
    MCTE,
    RMS_ATE,
    error_ratio,
    elapsed_time,
  }
}

function push<T>(arr: T[], item: T): T[] {
  const next = arr.length >= MAX_BUFFER ? arr.slice(1) : arr
  return [...next, item]
}

function pushBatch<T>(arr: T[], items: T[]): T[] {
  const combined = [...arr, ...items]
  if (combined.length >= MAX_BUFFER) {
    return combined.slice(combined.length - MAX_BUFFER)
  }
  return combined
}

function buildInitialState(): HMIState {
  const persisted = loadPersistedState()
  let gains: Gains | null = null
  if (persisted.gains) {
    gains = {
      ...persisted.gains,
      ffInertia: persisted.gains.ffInertia ?? 0,
      ffCoriolis: persisted.gains.ffCoriolis ?? 0,
      ffGravity: persisted.gains.ffGravity ?? 0,
    }
  }
  return {
    serialStatus: 'disconnected',
    portName: null,
    online: true,
    currentMode: null,
    recordingState: persisted.recordingState ?? 'WAITING',
    moveCount: persisted.moveCount ?? 0,
    currentMove: persisted.currentMove ?? null,
    dBuffer: [],
    tBuffer: [],
    fBuffer: [],
    eBuffer: [],
    prevTBuffer: [],
    showGhost: persisted.showGhost ?? true,
    frozenD: persisted.frozenD ?? [],
    frozenT: persisted.frozenT ?? [],
    frozenF: persisted.frozenF ?? [],
    frozenE: persisted.frozenE ?? [],
    stats: persisted.stats ?? null,
    gains,
    params: persisted.params ? { ...defaultParams, ...persisted.params } : defaultParams,
    hasSyncedParams: persisted.hasSyncedParams ?? false,
    queueStatus: persisted.queueStatus ?? null,
    logLines: persisted.logLines ?? [],
    previewTarget: null,
    bootPose: null,
    pickedTarget: null,
    estopped: false,
    targetInputX: null,
    targetInputY: null,
    pendingSave: null,
    lastSavedRunId: null,
  }
}

const initialState: HMIState = buildInitialState()

function reducer(state: HMIState, action: HMIAction): HMIState {
  switch (action.type) {
    case 'SERIAL_STATUS':
      return {
        ...state,
        serialStatus: action.status,
        portName: action.portName ?? state.portName,
        currentMode: action.status !== 'connected' ? null : state.currentMode,
        recordingState:
          action.status === 'disconnected' ? 'WAITING' : state.recordingState,
        bootPose: action.status === 'disconnected' ? null : state.bootPose,
        currentMove: action.status === 'disconnected' ? null : state.currentMove,
        hasSyncedParams: action.status === 'disconnected' ? false : state.hasSyncedParams,
        estopped: action.status === 'disconnected' ? false : state.estopped,
      }
    case 'ONLINE_STATUS':
      return { ...state, online: action.online }
    case 'MODE_CHANGE': {
      const modeStr = action.payload as ESPMode
      if (state.currentMode === modeStr) return state
      return { ...state, currentMode: modeStr }
    }
    case 'MOVE_START': {
      const info: MoveInfo = action.info
      return {
        ...state,
        recordingState: 'REC',
        currentMove: info,
        moveCount: state.moveCount + 1,
        prevTBuffer: state.tBuffer,
        tBuffer: [],
        dBuffer: [],
        fBuffer: [],
        eBuffer: [],
        stats: null,
        previewTarget: null,
        lastSavedRunId: null,
      }
    }
    case 'MOVE_END': {
      const stats = computeStats(state.tBuffer, state.dBuffer)
      return {
        ...state,
        recordingState: 'IDLE',
        frozenT: state.tBuffer,
        frozenD: state.dBuffer,
        frozenF: state.fBuffer,
        frozenE: state.eBuffer,
        stats,
      }
    }
    case 'T_SAMPLE':
      if (state.recordingState !== 'REC') return state
      return { ...state, tBuffer: push(state.tBuffer, action.point) }
    case 'D_SAMPLE': {
      if (state.recordingState !== 'REC') return state
      const prevSample = state.dBuffer[state.dBuffer.length - 1]
      let correctedSample = action.sample
      if (prevSample && correctedSample.t <= prevSample.t) {
        let delta = prevSample.t > 10 ? 10 : 0.01
        for (let i = state.dBuffer.length - 1; i > 0; i--) {
          const diff = state.dBuffer[i].t - state.dBuffer[i - 1].t
          if (diff > 0) {
            delta = diff
            break
          }
        }
        correctedSample = {
          ...correctedSample,
          t: prevSample.t + delta,
        }
      }
      return { ...state, dBuffer: push(state.dBuffer, correctedSample) }
    }
    case 'F_SAMPLE': {
      if (state.recordingState !== 'REC') return state
      return { ...state, fBuffer: push(state.fBuffer, action.sample) }
    }
    case 'E_SAMPLE': {
      if (state.recordingState !== 'REC') return state
      return { ...state, eBuffer: push(state.eBuffer, action.sample) }
    }
    case 'BATCH_SAMPLES': {
      if (state.recordingState !== 'REC') return state
      const { tPoints, dSamples, fSamples, eSamples } = action
      let nextT = state.tBuffer
      let nextD = state.dBuffer
      let nextF = state.fBuffer
      let nextE = state.eBuffer

      if (tPoints && tPoints.length > 0) {
        nextT = pushBatch(nextT, tPoints)
      }
      if (dSamples && dSamples.length > 0) {
        const correctedDSamples = []
        let lastSample = nextD[nextD.length - 1]
        let delta = 5
        if (nextD.length >= 2) {
          for (let i = nextD.length - 1; i > 0; i--) {
            const diff = nextD[i].t - nextD[i - 1].t
            if (diff > 0) {
              delta = diff
              break
            }
          }
        }
        for (const sample of dSamples) {
          let corrected = sample
          if (lastSample && corrected.t <= lastSample.t) {
            corrected = {
              ...corrected,
              t: lastSample.t + delta,
            }
          } else if (lastSample && corrected.t - lastSample.t > 0) {
            delta = corrected.t - lastSample.t
          }
          correctedDSamples.push(corrected)
          lastSample = corrected
        }
        nextD = pushBatch(nextD, correctedDSamples)
      }
      if (fSamples && fSamples.length > 0) {
        nextF = pushBatch(nextF, fSamples)
      }
      if (eSamples && eSamples.length > 0) {
        nextE = pushBatch(nextE, eSamples)
      }

      return {
        ...state,
        tBuffer: nextT,
        dBuffer: nextD,
        fBuffer: nextF,
        eBuffer: nextE,
      }
    }
    case 'PARAMS':
      return { ...state, params: action.params, hasSyncedParams: true }
    case 'QUEUE_STATUS':
      return { ...state, queueStatus: action.status }
    case 'GAINS':
      return { ...state, gains: action.gains }
    case 'LOG_LINE': {
      const lines = [...state.logLines, action.line]
      return {
        ...state,
        logLines:
          lines.length > MAX_LOG_LINES
            ? lines.slice(lines.length - MAX_LOG_LINES)
            : lines,
      }
    }
    case 'FLUSH_BUFFERS': {
      clearPersistedState()
      return {
        ...state,
        dBuffer: [],
        tBuffer: [],
        fBuffer: [],
        eBuffer: [],
        frozenD: [],
        frozenT: [],
        frozenF: [],
        frozenE: [],
        stats: null,
        moveCount: 0,
        recordingState: 'WAITING',
        params: defaultParams,
        hasSyncedParams: false,
      }
    }
    case 'CLEAR_LOGS': {
      clearPersistedState()
      return {
        ...state,
        logLines: [],
      }
    }
    case 'TOGGLE_GHOST':
      return { ...state, showGhost: !state.showGhost }
    case 'SET_PREVIEW_TARGET':
      return { ...state, previewTarget: action.target }
    case 'BOOT_POSE':
      return { ...state, bootPose: action.pose, currentMove: null }
    case 'PICK_TARGET':
      return {
        ...state,
        previewTarget: action.target,
        pickedTarget: action.target,
      }
    case 'CLEAR_PICKED_TARGET':
      return {
        ...state,
        pickedTarget: null,
      }
    case 'SET_ESTOP':
      return {
        ...state,
        estopped: action.payload,
      }
    case 'SET_TARGET_INPUT':
      return {
        ...state,
        targetInputX: action.x,
        targetInputY: action.y,
      }
    case 'SET_PENDING_SAVE':
      return {
        ...state,
        pendingSave: { name: action.name, startedAt: action.startedAt },
      }
    case 'CLEAR_PENDING_SAVE':
      return {
        ...state,
        pendingSave: null,
      }
    case 'SET_LAST_SAVED_RUN_ID':
      return {
        ...state,
        lastSavedRunId: action.runId,
      }
    default:
      return state
  }
}

interface HMIContextValue {
  state: HMIState
  dispatch: Dispatch<HMIAction>
  serial: SerialController
}

const HMIContext = createContext<HMIContextValue | null>(null)

export function useHMI() {
  const ctx = useContext(HMIContext)
  if (!ctx) throw new Error('useHMI must be used within HMIProvider')
  return ctx
}

// ── Slow (non-buffer) context ──────────────────────────────────────────────
// Only updates when non-telemetry state changes. Components subscribing here
// will NOT re-render on every BATCH_SAMPLES dispatch (10 Hz). Use this for
// control panels, headers, logs, keybindings — anything that doesn't need
// the live dBuffer/tBuffer/fBuffer/eBuffer arrays.
export type HMISlowState = Omit<HMIState, 'dBuffer' | 'tBuffer' | 'fBuffer' | 'eBuffer'>

interface HMISlowContextValue {
  state: HMISlowState
  dispatch: Dispatch<HMIAction>
  serial: SerialController
}

const HMISlowContext = createContext<HMISlowContextValue | null>(null)

export function useHMISlow() {
  const ctx = useContext(HMISlowContext)
  if (!ctx) throw new Error('useHMISlow must be used within HMIProvider')
  return ctx
}

const recentToasts = new Map<string, number>()

function useSerial(dispatch: Dispatch<HMIAction>): SerialController {
  const portRef = useRef<SerialPort | null>(null)
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null)
  const activeRef = useRef(false)
  const reconnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sampleIdxRef = useRef(0)
  const startReconnPollRef = useRef<() => void>(() => {})

  // High performance telemetry queues
  const tQueueRef = useRef<TPoint[]>([])
  const dQueueRef = useRef<DSample[]>([])
  const fQueueRef = useRef<FSample[]>([])
  const eQueueRef = useRef<ESample[]>([])

  const flushQueues = useCallback(() => {
    const tPoints = tQueueRef.current
    const dSamples = dQueueRef.current
    const fSamples = fQueueRef.current
    const eSamples = eQueueRef.current

    if (
      tPoints.length === 0 &&
      dSamples.length === 0 &&
      fSamples.length === 0 &&
      eSamples.length === 0
    ) {
      return
    }

    tQueueRef.current = []
    dQueueRef.current = []
    fQueueRef.current = []
    eQueueRef.current = []

    dispatch({
      type: 'BATCH_SAMPLES',
      tPoints,
      dSamples,
      fSamples,
      eSamples,
    })
  }, [dispatch])

  const parseLine = useCallback(
    (raw: string) => {
      const line = raw.trim()
      if (!line) return
      
      // Dispatch custom window event for logging raw line RX
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('hmi_rx', { detail: line }))
      }

      const parts = line.split(',')
      const tag = parts[0]

      if (tag !== 'T' && tag !== 'D' && tag !== 'F' && tag !== 'E' && tag !== 'ESTOP') {
        dispatch({ type: 'LOG_LINE', line })

        // Check for toast signals from serial (Rev 14 prefixes first)
        const startsWithWarn = line.startsWith('WARN: ')
        const startsWithErr = line.startsWith('ERR: ')

        if (startsWithWarn || startsWithErr) {
          const prefixMsg = startsWithErr ? line.substring(5) : line.substring(6)
          const now = Date.now()
          const lastShown = recentToasts.get(prefixMsg) || 0
          if (now - lastShown > 2000) {
            recentToasts.set(prefixMsg, now)
            if (startsWithErr) {
              toast.error(prefixMsg)
            } else if (startsWithWarn) {
              toast.warning(prefixMsg)
            }
          }
        } else {
          // Fallback to old regex format
          const isWarn = /(\[WARN\]|WARN:|WARNING:|^WARN\b|^WARNING\b)/i.test(line)
          const isError = /(\[ERR(OR)?\]|ERR(OR)?:|^ERR\b|^ERROR\b)/i.test(line)
          const isSuccess = /(\[SUCCESS\]|SUCCESS:|^SUCCESS\b)/i.test(line)

          if (isWarn || isError || isSuccess) {
            const cleanMsg = line.replace(/^(\[?(WARN(ING)?|ERR(OR)?|SUCCESS)\]?:?\s*)/i, '')
            const now = Date.now()
            const lastShown = recentToasts.get(cleanMsg) || 0
            if (now - lastShown > 2000) {
              recentToasts.set(cleanMsg, now)
              if (isError) {
                toast.error('Serial Error', { description: cleanMsg })
              } else if (isWarn) {
                toast.warning('Serial Warning', { description: cleanMsg })
              } else if (isSuccess) {
                toast.success('Serial Success', { description: cleanMsg })
              }
            }
          }
        }

        // Clean up recentToasts Map to avoid memory leak if it gets too large
        const now = Date.now()
        if (recentToasts.size > 100) {
          for (const [k, v] of recentToasts.entries()) {
            if (now - v > 5000) {
              recentToasts.delete(k)
            }
          }
        }
      }

      switch (tag) {
        case 'M': {
          flushQueues()
          sampleIdxRef.current = 0
          const [, x0, y0, xf, yf] = parts.map(Number)
          const info: MoveInfo = { x0, y0, xf, yf }
          dispatch({ type: 'MOVE_START', info })
          break
        }
        case 'S': {
          flushQueues()
          dispatch({ type: 'MOVE_END' })
          break
        }
        case 'T': {
          // Use raw 10 Hz T packets directly from ESP32
          const [, xi, yi, xa, ya] = parts.map(Number)
          tQueueRef.current.push({ xi, yi, xa, ya })
          break
        }
        case 'D': {
          const partsNum = parts.map(Number)
          const t = partsNum[1] || 0
          const th1 = Number.isFinite(partsNum[2]) ? partsNum[2] : 0
          const th2 = Number.isFinite(partsNum[3]) ? partsNum[3] : 0
          const th1d = Number.isFinite(partsNum[4]) ? partsNum[4] : th1
          const th2d = Number.isFinite(partsNum[5]) ? partsNum[5] : th2
          const dth1 = Number.isFinite(partsNum[6]) ? partsNum[6] : 0
          const dth2 = Number.isFinite(partsNum[7]) ? partsNum[7] : 0
          const dth1d = Number.isFinite(partsNum[8]) ? partsNum[8] : 0
          const dth2d = Number.isFinite(partsNum[9]) ? partsNum[9] : 0
          const pwm1 = Number.isFinite(partsNum[10]) ? partsNum[10] : 0
          const vff1 = Number.isFinite(partsNum[11]) ? partsNum[11] : 0
          const th1raw = Number.isFinite(partsNum[12]) ? partsNum[12] : th1
          const th2raw = Number.isFinite(partsNum[13]) ? partsNum[13] : th2
          const u1Total = Number.isFinite(partsNum[14]) ? partsNum[14] : 0

          const RAD2DEG = 180 / Math.PI

          const e1 = th1d - th1
          const e2 = th2d - th2

          // ── ZN tuner event (all modes — ignored when ZN tab is not mounted) ──
          if (typeof window !== 'undefined' && (window.location.pathname.includes('/zn') || window.location.pathname.includes('/test'))) {
            window.dispatchEvent(new CustomEvent('zn_sample', {
              detail: {
                ts_ms:     t,
                t1_actual: th1 * RAD2DEG,   // θ1  rad → deg
                t2_actual: th2 * RAD2DEG,   // θ2  rad → deg
                t1_target: th1d * RAD2DEG,  // θ1d rad → deg
                t2_target: th2d * RAD2DEG,  // θ2d rad → deg
                pwm1:       pwm1,
                t1_raw:    th1raw * RAD2DEG,
                t2_raw:    th2raw * RAD2DEG,
                // Velocities (rad/s → deg/s)
                v1:        dth1 * RAD2DEG,
                v2:        dth2 * RAD2DEG,
              }
            }))
          }

          // ── SCARA HMI charts (recorded into dQueueRef for batch flush) ──
          // Downsample 500 Hz telemetry D to 50 Hz (1 sample every 10) for main HMI charts.
          // T/F/E are sent by ESP32 at 50 Hz natively — D is aligned to match.
          // The ZN tuner still gets every sample via the zn_sample window event above.
          if (sampleIdxRef.current % 10 === 0) {
            const sample: DSample = {
              t,
              th1,
              th2,
              th1d,
              th2d,
              dth1,
              dth2,
              dth1d,
              dth2d,
              pwm1,
              th1raw,
              th2raw,
              vff1,
              u1Total,
              idx:      sampleIdxRef.current,
              e1,
              e2,
            }
            dQueueRef.current.push(sample)
          }
          sampleIdxRef.current++
          break
        }

        case 'F': {
          const [, time_ms, inertia1, coriolis1, gravity1, inertia2, coriolis2, gravity2, ff1_contrib, u1_total, integral1, delta_omega_ff, omega2_raw, integral2] = parts.map(Number)
          const sample: FSample = {
            t: time_ms,
            inertia1: inertia1 ?? 0,
            coriolis1: coriolis1 ?? 0,
            gravity1: gravity1 ?? 0,
            inertia2: inertia2 ?? 0,
            coriolis2: coriolis2 ?? 0,
            gravity2: gravity2 ?? 0,
            ff1Contrib: ff1_contrib ?? 0,
            u1Total: u1_total ?? 0,
            integral1: integral1 ?? 0,
            deltaOmegaFf: delta_omega_ff ?? 0,
            omega2Raw: omega2_raw ?? 0,
            integral2: integral2 ?? 0,
          }
          fQueueRef.current.push(sample)
          break
        }
        case 'E': {
          const [, time_ms, p1_out, i1_out, d1_out, loop_duration_us] = parts.map(Number)
          const sample: ESample = {
            t: time_ms,
            p1_out: p1_out ?? 0,
            i1_out: i1_out ?? 0,
            d1_out: d1_out ?? 0,
            loop_duration_us: loop_duration_us ?? 0,
          }
          eQueueRef.current.push(sample)
          break
        }
        case 'G': {
          const [, kp1, ki1, kd1, kp2, ki2, kd2, mstep, ff_inertia, ff_coriolis, ff_gravity] = parts.map(Number)
          const gains: Gains = {
            kp1: kp1 ?? 0,
            ki1: ki1 ?? 0,
            kd1: kd1 ?? 0,
            kp2: kp2 ?? 0,
            ki2: ki2 ?? 0,
            kd2: kd2 ?? 0,
            mstep: mstep ?? 1,
            ffInertia: ff_inertia ?? 0,
            ffCoriolis: ff_coriolis ?? 0,
            ffGravity: ff_gravity ?? 0,
          }
          dispatch({ type: 'GAINS', gains })
          break
        }
        case 'K': {
          const [, vmax, amax, cfreq, u1max, fzt, fztk, kspen, pwm_db, dbmen, dbens, td1r, td2r, td_h, ddth, dben, dbrel, dbvel, hskp, hskd, idecay, taunom, m22ref, alpha_tilt_deg, td_enabled, trap_enabled, ki2_gate_rad, db2en, db2rel, err_dz, integral_freeze_thresh, kv_vel, vff_max_frac, vff_dv_max] = parts.map(Number)
          const params: AdvParams = {
            vmax: vmax ?? 0,
            amax: amax ?? 0,
            cfreq: cfreq ?? 200,
            u1max: u1max ?? 255,
            fzt: fzt ?? 0,
            fztKickPct: fztk ?? 0.1,
            kickstartEnabled: (kspen === 1),
            pwmDb: pwm_db ?? 0,
            dbMovingEnabled: (dbmen === 1),
            dbEngageScale: dbens ?? 0.75,
            td1r: td1r ?? 50,
            td2r: td2r ?? 50,
            tdH: td_h ?? 0.015,
            ddth: ddth ?? 10,
            dben: dben ?? 0.01,
            dbrel: dbrel ?? 0.02,
            dbvel: dbvel ?? 0.05,
            hskp: hskp ?? 1,
            hskd: hskd ?? 1,
            idecay: idecay ?? 0.99,
            taunom: taunom ?? 1,
            m22ref: m22ref ?? 1,
            alphaTiltDeg: alpha_tilt_deg ?? 0,
            tdEnabled: td_enabled === 1,
            trapEnabled: trap_enabled === 1,
            ki2GateRad: ki2_gate_rad ?? 0.02,
            db2en: db2en ?? 0.008,
            db2rel: db2rel ?? 0.005,
            errDz: err_dz ?? 0.005,
            integralFreezeThresh: integral_freeze_thresh ?? 0.015,
            kvVel: Number(kv_vel ?? 0),
            vffMaxFrac: Number(vff_max_frac ?? 0),
            vffDvMax: Number(vff_dv_max ?? 0),
          }
          dispatch({ type: 'PARAMS', params })
          break
        }
        case 'Q': {
          const [, pending_status, pending_x, pending_y] = parts.map(Number)
          dispatch({
            type: 'QUEUE_STATUS',
            status: {
              pendingStatus: pending_status ?? 0,
              pendingX: pending_x ?? 0,
              pendingY: pending_y ?? 0,
            }
          })
          break
        }
        case 'P': {
          const [, x, y, th1, th2] = parts.map(Number)
          dispatch({ type: 'BOOT_POSE', pose: { x, y, th1, th2 } })
          break
        }
        case 'ESTOP': {
          const isEstopped = parts[1] === '1'
          dispatch({ type: 'SET_ESTOP', payload: isEstopped })
          break
        }
        case 'X': {
          // Mode change packet: X,IDLE | X,SCARA | X,ZN | X,TEST
          const modeStr = parts[1]?.trim().toUpperCase() as ESPMode | undefined
          if (modeStr === 'IDLE' || modeStr === 'SCARA' || modeStr === 'ZN' || modeStr === 'TEST') {
            dispatch({ type: 'MODE_CHANGE', payload: modeStr })
          }
          break
        }
      }
    },
    [dispatch]
  )

  const readLoop = useCallback(
    async (port: SerialPort) => {
      const decoder = new TextDecoder()
      const reader = port.readable!.getReader() as ReadableStreamDefaultReader<Uint8Array>
      readerRef.current = reader
      let buf = ''
      try {
        while (activeRef.current) {
          const { value, done } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const ln of lines) parseLine(ln)
        }
      } catch {
        // connection dropped
      } finally {
        try { reader.releaseLock() } catch { /* ignore */ }
      }
    },
    [parseLine]
  )

  const openPort = useCallback(
    async (port: SerialPort) => {
      await port.open({ baudRate: 921600 })
      portRef.current = port
      const writer = port.writable!.getWriter() as WritableStreamDefaultWriter<Uint8Array>
      writerRef.current = writer

      const storedPort = localStorage.getItem('hmi_lastPort')
      const ports = await navigator.serial.getPorts()
      const idx = ports.findIndex(p => {
        const info = p.getInfo()
        const portInfo = port.getInfo()
        return info.usbVendorId === portInfo.usbVendorId && info.usbProductId === portInfo.usbProductId
      })
      const portNum = idx !== -1 ? idx + 1 : 1
      const friendlyName = storedPort || `COM${portNum}`

      localStorage.setItem('hmi_lastPort', friendlyName)
      dispatch({ type: 'SERIAL_STATUS', status: 'connected', portName: friendlyName })

      sampleIdxRef.current = 0
      const enc = new TextEncoder()
      await writer.write(enc.encode('ping\n'))
      await writer.write(enc.encode('getgains\n'))
      await writer.write(enc.encode('getparams\n'))
      // plot,1/plot,0 dikirim oleh effect pathname di HMIProvider setelah serialStatus menjadi 'connected'

      activeRef.current = true
      readLoop(port).then(() => {
        dispatch({ type: 'SERIAL_STATUS', status: 'reconnecting' })
        startReconnPollRef.current()
      })
    },
    [dispatch, readLoop]
  )

  const startReconnPoll = useCallback(() => {
    if (reconnTimerRef.current) return
    reconnTimerRef.current = setInterval(async () => {
      if (!portRef.current) return
      try {
        const ports = await navigator.serial.getPorts()
        if (ports.includes(portRef.current)) {
          clearInterval(reconnTimerRef.current!)
          reconnTimerRef.current = null
          await openPort(portRef.current)
        }
      } catch { /* ignore */ }
    }, 2000)
  }, [openPort])

  useEffect(() => {
    startReconnPollRef.current = startReconnPoll
  }, [startReconnPoll])

  const connect = useCallback(async () => {
    if (!('serial' in navigator)) {
      alert('Web Serial API is not supported in this browser. Use Chrome or Edge.')
      return
    }
    try {
      const port = await navigator.serial.requestPort()
      await openPort(port)
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'NotFoundError') console.error(e)
    }
  }, [openPort])

  // Used by HMIProvider for auto-connect to an already-granted port
  const connectToPort = useCallback(async (port: SerialPort) => {
    try {
      await openPort(port)
    } catch (e: unknown) {
      if (e instanceof Error) console.error('Auto-connect failed:', e.message)
      throw e
    }
  }, [openPort])

  const disconnect = useCallback(async () => {
    activeRef.current = false
    tQueueRef.current = []
    dQueueRef.current = []
    fQueueRef.current = []
    eQueueRef.current = []
    if (reconnTimerRef.current) {
      clearInterval(reconnTimerRef.current)
      reconnTimerRef.current = null
    }
    try {
      if (writerRef.current) {
        const enc = new TextEncoder()
        await writerRef.current.write(enc.encode('plot,0\n'))
      }
    } catch { /* ignore */ }
    try { await readerRef.current?.cancel() } catch { /* ignore */ }
    try { writerRef.current?.releaseLock() } catch { /* ignore */ }
    try { await portRef.current?.close() } catch { /* ignore */ }
    portRef.current = null
    writerRef.current = null
    readerRef.current = null
    dispatch({ type: 'SERIAL_STATUS', status: 'disconnected' })
  }, [dispatch])

  const sendCommand = useCallback(async (cmd: string) => {
    try {
      // diagnostic: log writer presence
      // eslint-disable-next-line no-console
      console.debug('sendCommand', { cmd, writerPresent: !!writerRef.current })
      if (!writerRef.current) throw new Error('serial not connected')
      const enc = new TextEncoder()
      try {
        await writerRef.current.write(enc.encode(cmd + '\n'))
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('sendCommand write failed', e)
        throw e
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('hmi_tx', { detail: cmd }))
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('sendCommand error', e)
      throw e
    }
  }, [])

  const reconnect = useCallback(async () => {
    if (typeof window === 'undefined' || !('serial' in navigator)) return
    try {
      const ports = await navigator.serial.getPorts()
      if (ports.length > 0) {
        dispatch({ type: 'SERIAL_STATUS', status: 'reconnecting' })
        await connectToPort(ports[0])
      } else {
        await connect()
      }
    } catch {
      dispatch({ type: 'SERIAL_STATUS', status: 'disconnected' })
    }
  }, [connect, connectToPort, dispatch])

  // Telemetry Flush Loop: data accumulates in refs at full rate (50 Hz D, 500 Hz ZN).
  // React state is updated at 10 Hz (100ms):
  //   - XY trace canvas redraws at 10 Hz (needs fresh stateRef)
  //   - ChartPanel throttles Recharts to 5 Hz internally — unaffected by this rate
  //   - ZN tab reads from window events, not React state — unaffected
  useEffect(() => {
    const timer = setInterval(() => {
      if (activeRef.current) {
        flushQueues()
      }
    }, 100) // 10 Hz React state update

    return () => clearInterval(timer)
  }, [flushQueues])

  return useMemo(
    () => ({ connect, connectToPort, disconnect, sendCommand, reconnect }),
    [connect, connectToPort, disconnect, sendCommand, reconnect]
  )
}

export function HMIProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, buildInitialState)
  const serial = useSerial(dispatch)
  const pathname = usePathname()

  // ── Persist state to localStorage on every meaningful change ────────────
  useEffect(() => {
    // Only save state when not actively recording to prevent UI lag from synchronous localStorage writes.
    // The final telemetry buffers are automatically persisted once the run completes and recordingState becomes 'IDLE'.
    if (state.recordingState !== 'REC') {
      saveState(state)
    }
  }, [
    state.dBuffer,
    state.tBuffer,
    state.prevTBuffer,
    state.frozenD,
    state.frozenT,
    state.frozenF,
    state.frozenE,
    state.stats,
    state.gains,
    state.params,
    state.hasSyncedParams,
    state.queueStatus,
    state.logLines,
    state.moveCount,
    state.recordingState,
    state.currentMove,
    state.showGhost,
  ])

  // ── Auto-connect to the previously used port on startup ─────────────────
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serial' in navigator)) return

    let cancelled = false
    navigator.serial.getPorts().then(async (ports) => {
      if (cancelled || ports.length === 0) return
      // Use the first already-granted port (no user gesture needed)
      const port = ports[0]
      dispatch({ type: 'SERIAL_STATUS', status: 'reconnecting' })
      try {
        await serial.connectToPort(port)
      } catch {
        dispatch({ type: 'SERIAL_STATUS', status: 'disconnected' })
      }
    }).catch(() => { /* Web Serial not supported */ })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run once on mount

  // ── Network online/offline ───────────────────────────────────────────────
  useEffect(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      dispatch({ type: 'ONLINE_STATUS', online: false })
    }

    const onOnline = () => dispatch({ type: 'ONLINE_STATUS', online: true })
    const onOffline = () => dispatch({ type: 'ONLINE_STATUS', online: false })
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // ── Mode change toast ────────────────────────────────────────────────────
  // Dipisah dari reducer agar tidak terkena double-invocation React StrictMode.
  useEffect(() => {
    if (!state.currentMode) return
    const modeNames: Record<ESPMode, string> = {
      IDLE: 'Idle',
      SCARA: 'SCARA',
      ZN: 'Ziegler-Nichols (ZN)',
      TEST: 'Test',
    }
    const modeName = modeNames[state.currentMode] || state.currentMode
    toast.success(`Mode ${modeName} Active`, {
      description: state.currentMode === 'IDLE'
        ? 'All motor outputs disabled.'
        : `System successfully switched to Mode ${modeName}.`
    })
  }, [state.currentMode])

  // ── Sync plot_enabled with current page ─────────────────────────────────
  // Fires on initial connect AND whenever the user navigates between pages.
  useEffect(() => {
    if (state.serialStatus !== 'connected') return
    const isPlotPage = pathname.includes('/zn') || pathname.includes('/test')
    serial.sendCommand(isPlotPage ? 'plot,1' : 'plot,0').catch(() => {})
  }, [pathname, state.serialStatus, serial])

  // ── Heartbeat "ping" to serial ───────────────────────────────────────────
  useEffect(() => {
    if (state.serialStatus !== 'connected') return

    const timer = setInterval(() => {
      serial.sendCommand('ping').catch(() => { /* ignore */ })
    }, 2000)

    return () => clearInterval(timer)
  }, [state.serialStatus, serial])

  // ── Slow-state context ───────────────────────────────────────────────────
  // Recomputed only when non-buffer fields change, NOT on BATCH_SAMPLES (10 Hz).
  // This stops control panels, headers, and other UI from re-rendering at 10 Hz.
   
  const slowState = useMemo((): HMISlowState => {
    const { dBuffer, tBuffer, fBuffer, eBuffer, ...rest } = state
    return rest
  }, [
    state.serialStatus, state.portName, state.online, state.currentMode,
    state.recordingState, state.moveCount, state.currentMove,
    state.frozenD, state.frozenT, state.frozenF, state.frozenE,
    state.prevTBuffer, state.showGhost, state.stats,
    state.gains, state.params, state.hasSyncedParams,
    state.queueStatus, state.logLines, state.previewTarget,
    state.bootPose, state.pickedTarget, state.estopped,
  ])

  const slowContextValue = useMemo((): HMISlowContextValue => ({
    state: slowState, dispatch, serial,
  }), [slowState, dispatch, serial])

  return (
    <HMISlowContext.Provider value={slowContextValue}>
      <HMIContext.Provider value={{ state, dispatch, serial }}>
        {children}
      </HMIContext.Provider>
    </HMISlowContext.Provider>
  )
}

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useHMISlow } from '@/lib/hmi-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { saveRun } from '@/app/actions/experiment'
import { Play, Square, ArrowRight, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CommandPaletteTrigger } from '@/components/hmi/command-palette'
import { ThemeToggle } from '@/components/hmi/theme-toggle'

type State =
  | 'idle'
  | 'preflight'
  | 'waiting_for_ready'
  | 'positioning'
  | 'hold'
  | 'running'
  | 'settling'
  | 'saving'
  | 'cooldown'
  | 'complete'

type CapturePhase = 'off' | 'hold' | 'move' | 'settle'

interface RunResultCard {
  attemptNumber: number
  successIndex: number
  direction: 'forward' | 'return'
  mate: number
  mcte: number
  moveDuration: number
  sigmaHold: number | null
  eSs: number | null
  status: 'ok' | 'retrying' | 'failed'
}

interface PreflightCheck {
  label: string
  ok: boolean | null // null = pending
}

const EXPERIMENTS = [
  { id: 'EXP-1', name: 'TD Filter', desc: 'Evaluate Tracking Differentiator filter performance for J1 & J2' },
  { id: 'EXP-2', name: 'Inertia Comp', desc: 'Test inertia compensation contribution in dynamic model feedforward' },
  { id: 'EXP-3', name: 'Coriolis Comp', desc: 'Test Coriolis & Centrifugal force compensation contribution' },
  { id: 'EXP-4', name: 'Gravity Comp', desc: 'Test gravity force compensation at various tilt angles' },
  { id: 'EXP-5', name: 'Trap Profile', desc: 'Evaluate trapezoidal trajectory profile vs raw' },
  { id: 'EXP-6', name: 'PID Variation', desc: 'Test performance with varying proportional, integral, and derivative gains' },
] as const

// ─── Standard test path (Rancangan Eksperimen) ─────────────────────────────
const P0 = { x: 140, y: 45 }   // mm
const PF = { x: 60, y: 155 }   // mm
const PATH_D = Math.hypot(PF.x - P0.x, PF.y - P0.y) // 136.0 mm

// ─── Workspace limits (mirror of firmware cmd_parser.cpp check) ────────────
const WS_R_MIN = 70.7   // mm
const WS_R_MAX = 170.0  // mm
// Valid sector: phi >= -30° OR phi <= -150° (i.e. -30°…210°)
function isInWorkspace(xMm: number, yMm: number): boolean {
  const r = Math.hypot(xMm, yMm)
  if (r < WS_R_MIN || r > WS_R_MAX) return false
  const phi = Math.atan2(yMm, xMm)
  return phi >= -0.5235988 || phi <= -2.6179939
}

// ─── Timing budgets ─────────────────────────────────────────────────────────
const HOLD_DURATION_MS = 3000      // pre-move hold (σ_θ1 from last 2 s)
const HOLD_SIGMA_WINDOW_MS = 2000
const SETTLE_CAPTURE_MS = 2000     // post-S-packet capture for e_ss
const COOLDOWN_S = 5
const WD_SETUP_MS = 5000           // setup command batch
const WD_POSITIONING_MS = 20000    // positioning move → S-packet
const WD_M_PACKET_MS = 5000        // trajectory move sent → M-packet
const WD_RUNNING_MS = 15000        // M-packet → S-packet (traj ≈ 3.4 s + margin)
const TELEMETRY_STALL_MS = 1500    // max gap between D-packets while moving
const ALIGN_MAX_GAP_MS = 100       // max timestamp gap when aligning T/F/E to D
const POSITION_SKIP_TOL_MM = 2.0   // skip positioning move if already this close
const MAX_RUN_RETRIES = 3          // per-slot retries before aborting sequence

// ─── Shared Direction Helper ────────────────────────────────────────────────
// successCount is 1-based (the upcoming run's target success index)
// For EXP-4: 3 runs per condition (6 total), so indexInCond cycles 1-3 then 1-3
// For EXP-6: single condition of 10 runs (sub/level fixed by UI)
// For standard: 10 runs per condition (20 total), cycle 1-10 then 1-10
function computeIndexInCond(successCount: number, tab: string): number {
  const condSize = tab === 'EXP-4' ? 3 : (tab === 'EXP-6' ? 10 : 10)
  return ((successCount - 1) % condSize) + 1
}

// odd indexInCond → forward, even → return
function computeIsForward(successCount: number, tab: string): boolean {
  return computeIndexInCond(successCount, tab) % 2 === 1
}

function computeIsConditionA(successCount: number, tab: string): boolean {
  if (tab === 'EXP-4') return successCount <= 3
  if (tab === 'EXP-6') return true // EXP-6 conditions are set by user UI, not by run count
  return successCount <= 10
}

function computeTotalRuns(tab: string): number {
  return tab === 'EXP-4' ? 6 : (tab === 'EXP-6' ? 10 : 20)
}

// ─── OFAT baseline-lock commands per experiment ─────────────────────────────
// One factor varies per experiment; all others are locked at the values
// specified in the Rancangan Eksperimen document.
function buildConditionCommands(
  tab: string,
  isConditionA: boolean,
  alpha: string,
  sub6: '6A' | '6B' | '6C',
  level6: string,
  baseGains: { kp1: number; ki1: number; kd1: number },
): string[] {
  const cmds: string[] = []
  if (tab === 'EXP-1') {
    // Isolate velocity-estimation effect: all feedforward off
    cmds.push('trapen,1', 'ffi,0.0', 'ffc,0.0', 'ffg,0.0')
    cmds.push(isConditionA ? 'tden,1' : 'tden,0')
  } else if (tab === 'EXP-2') {
    cmds.push('tden,1', 'trapen,1', 'ffc,0.0', 'ffg,0.0')
    cmds.push(isConditionA ? 'ffi,1.0' : 'ffi,0.0')
  } else if (tab === 'EXP-3') {
    cmds.push('tden,1', 'trapen,1', 'ffi,1.0', 'ffg,0.0')
    cmds.push(isConditionA ? 'ffc,1.0' : 'ffc,0.0')
  } else if (tab === 'EXP-4') {
    cmds.push('tden,1', 'trapen,1', 'ffi,1.0', 'ffc,1.0')
    if (isConditionA) {
      cmds.push(`atilt,${alpha}`)
      cmds.push('ffg,1.0')
    } else {
      cmds.push('ffg,0.0')
    }
  } else if (tab === 'EXP-5') {
    cmds.push('tden,1', 'ffi,1.0', 'ffc,1.0', 'ffg,1.0')
    cmds.push(isConditionA ? 'trapen,1' : 'trapen,0')
  } else if (tab === 'EXP-6') {
    cmds.push('tden,1', 'trapen,1', 'ffi,1.0', 'ffc,1.0', 'ffg,1.0')
    const scale = parseFloat(level6)
    if (sub6 === '6A') cmds.push(`kp1,${(baseGains.kp1 * scale).toFixed(3)}`)
    else if (sub6 === '6B') cmds.push(`ki1,${(baseGains.ki1 * scale).toFixed(3)}`)
    else cmds.push(`kd1,${(baseGains.kd1 * scale).toFixed(3)}`)
  }
  return cmds
}

export function ExperimentClient() {
  const { state: hmiState, serial } = useHMISlow()
  const { serialStatus, gains, online, estopped } = hmiState

  // UI Selection State
  const [activeTab, setActiveTab] = useState<'EXP-1' | 'EXP-2' | 'EXP-3' | 'EXP-4' | 'EXP-5' | 'EXP-6'>('EXP-1')

  // EXP-4 specific state
  const [exp4Alpha, setExp4Alpha] = useState<'0' | '15' | '30' | '45'>('0')

  // EXP-6 specific state
  const [exp6Sub, setExp6Sub] = useState<'6A' | '6B' | '6C'>('6A')
  const [exp6Level, setExp6Level] = useState<'0.5' | '1.0' | '1.5'>('0.5')

  // Automation State Machine
  const [state, setState] = useState<State>('idle')

  // successCount = number of runs successfully saved to DB so far this sequence
  const [successCount, setSuccessCount] = useState(0)
  // totalAttempts = total run attempts fired (including retries and failures)
  const [totalAttempts, setTotalAttempts] = useState(0)

  const [direction, setDirection] = useState<'forward' | 'return'>('forward')
  const [cooldownTime, setCooldownTime] = useState(0)
  const [logs, setLogs] = useState<{ time: string; text: string }[]>([])
  const [results, setResults] = useState<RunResultCard[]>([])
  const [preflightChecks, setPreflightChecks] = useState<PreflightCheck[]>([])
  const [abortReason, setAbortReason] = useState<string | null>(null)

  // Stats summary
  const [summary, setSummary] = useState<{ meanMate: number; stdMate: number; meanMcte: number; stdMcte: number } | null>(null)

  const [mounted, setMounted] = useState(false)
  // Baseline gains snapshot — re-captured at every sequence start (preflight)
  const [baseGains, setBaseGains] = useState<{ kp1: number; ki1: number; kd1: number } | null>(null)

  useEffect(() => { setMounted(true) }, [])

  // Helper to add timestamped status logs
  const addLog = useCallback((text: string) => {
    const time = new Date().toLocaleTimeString('id-ID', { hour12: false })
    setLogs(prev => [...prev, { time, text }])
  }, [])

  const setCheck = useCallback((label: string, ok: boolean | null) => {
    setPreflightChecks(prev => {
      const idx = prev.findIndex(c => c.label === label)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { label, ok }
        return next
      }
      return [...prev, { label, ok }]
    })
  }, [])

  // In-memory offline queue state
  const [offlineQueue, setOfflineQueue] = useState<any[]>([])
  const offlineQueueRef = useRef<any[]>([])

  useEffect(() => { offlineQueueRef.current = offlineQueue }, [offlineQueue])

  // Sync offline queued runs to Turso when online
  useEffect(() => {
    const handleOnline = async () => {
      const queue = [...offlineQueueRef.current]
      if (queue.length === 0) return
      addLog(`🔌 Online connection detected! Syncing ${queue.length} pending runs to database...`)
      toast.info(`Syncing ${queue.length} offline runs to Turso...`)

      const failedQueue: any[] = []
      for (const item of queue) {
        addLog(`Syncing run ${item.run.id}...`)
        const res = await saveRun(item.run, item.metrics, item.samples, false)
        if (res.ok) {
          addLog(`✓ Run ${item.run.id} successfully synced.`)
        } else {
          addLog(`❌ Failed to sync run ${item.run.id}.`)
          failedQueue.push(item)
        }
      }
      setOfflineQueue(failedQueue)
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [addLog])

  // ─── Refs for tracking mutable state across async handlers ───────────────
  const stateRef = useRef<State>('idle')
  const successCountRef = useRef(0)        // mirrors successCount state
  const totalAttemptsRef = useRef(0)       // mirrors totalAttempts state
  const runRetryCountRef = useRef(0)
  const runNeedRetryRef = useRef(false)
  const runFailureLatchRef = useRef(false) // guards double failure handling per attempt
  const isProcessingRef = useRef(false)    // guard: prevents double processAndSaveRun
  const activeTabRef = useRef(activeTab)
  const exp4AlphaRef = useRef(exp4Alpha)
  const exp6SubRef = useRef(exp6Sub)
  const exp6LevelRef = useRef(exp6Level)
  const baseGainsRef = useRef<{ kp1: number; ki1: number; kd1: number } | null>(null)
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Live firmware state mirrored into refs (async handlers need fresh values)
  const currentModeRef = useRef(hmiState.currentMode)
  const estoppedRef = useRef(estopped)
  const gainsRef = useRef(gains)

  // Telemetry buffer refs
  const accumulatedDRef = useRef<any[]>([])
  const accumulatedFRef = useRef<any[]>([])
  const accumulatedERef = useRef<any[]>([])
  const accumulatedTRef = useRef<any[]>([])
  const lastSeenDTimeRef = useRef<number>(0)     // firmware ms of last D-line
  const lastDWallClockRef = useRef<number>(0)    // Date.now() of last D-line (stall detection)
  const lastActualPosRef = useRef<{ x: number; y: number } | null>(null)

  const capturePhaseRef = useRef<CapturePhase>('off')
  const awaitingMRef = useRef(false)
  const mPacketReceivedRef = useRef(false)
  const sigmaHoldRef = useRef<number | null>(null)

  // Timers / watchdogs
  const watchdogRef = useRef<NodeJS.Timeout | null>(null)
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null)
  const settleTimerRef = useRef<NodeJS.Timeout | null>(null)
  const stallIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Sync state values to refs
  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { successCountRef.current = successCount }, [successCount])
  useEffect(() => { totalAttemptsRef.current = totalAttempts }, [totalAttempts])
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
  useEffect(() => { exp4AlphaRef.current = exp4Alpha }, [exp4Alpha])
  useEffect(() => { exp6SubRef.current = exp6Sub }, [exp6Sub])
  useEffect(() => { exp6LevelRef.current = exp6Level }, [exp6Level])
  useEffect(() => { currentModeRef.current = hmiState.currentMode }, [hmiState.currentMode])
  useEffect(() => { estoppedRef.current = estopped }, [estopped])
  useEffect(() => { gainsRef.current = gains }, [gains])

  // Scroll status logs to bottom
  const logsEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // ─── Timer helpers ─────────────────────────────────────────────────────────
  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null }
  }, [])

  const clearAllTimers = useCallback(() => {
    clearWatchdog()
    if (cooldownTimerRef.current) { clearInterval(cooldownTimerRef.current); cooldownTimerRef.current = null }
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null }
    if (settleTimerRef.current) { clearTimeout(settleTimerRef.current); settleTimerRef.current = null }
    if (stallIntervalRef.current) { clearInterval(stallIntervalRef.current); stallIntervalRef.current = null }
  }, [clearWatchdog])

  const transition = useCallback((next: State) => {
    clearWatchdog()
    stateRef.current = next
    setState(next)
  }, [clearWatchdog])

  // Poll a ref-backed condition until true or timeout
  const waitFor = (cond: () => boolean, timeoutMs: number, intervalMs = 100): Promise<boolean> =>
    new Promise(resolve => {
      if (cond()) { resolve(true); return }
      const start = Date.now()
      const iv = setInterval(() => {
        if (cond()) { clearInterval(iv); resolve(true) }
        else if (Date.now() - start > timeoutMs) { clearInterval(iv); resolve(false) }
      }, intervalMs)
    })

  // Custom function to find closest sample by timestamp (returns null if gap too large)
  const findClosest = (arr: any[], targetT: number) => {
    if (!arr || arr.length === 0) return null
    let closest = arr[0]
    let minDiff = Math.abs(arr[0].t - targetT)
    for (let i = 1; i < arr.length; i++) {
      const diff = Math.abs(arr[i].t - targetT)
      if (diff < minDiff) {
        minDiff = diff
        closest = arr[i]
      } else if (arr[i].t > targetT + minDiff) {
        break
      }
    }
    return minDiff <= ALIGN_MAX_GAP_MS ? closest : null
  }

  // Custom function to find closest T-packet sample by timestamp
  const findClosestT = (arr: any[], targetT: number) => {
    if (!arr || arr.length === 0) return null
    let closest = arr[0]
    let minDiff = Math.abs(arr[0].t_ms - targetT)
    for (let i = 1; i < arr.length; i++) {
      const diff = Math.abs(arr[i].t_ms - targetT)
      if (diff < minDiff) {
        minDiff = diff
        closest = arr[i]
      }
    }
    return minDiff <= ALIGN_MAX_GAP_MS ? closest : null
  }

  // Restore the baseline kp1/ki1/kd1 snapshot after an EXP-6 sequence
  const restoreBaselineGains = useCallback(() => {
    if (activeTabRef.current !== 'EXP-6') return
    const bg = baseGainsRef.current
    if (!bg) return
    addLog(`Restoring baseline gains: kp1=${bg.kp1.toFixed(3)}, ki1=${bg.ki1.toFixed(3)}, kd1=${bg.kd1.toFixed(3)}`)
    serial.sendCommand(`kp1,${bg.kp1.toFixed(3)}`).catch(() => {})
    serial.sendCommand(`ki1,${bg.ki1.toFixed(3)}`).catch(() => {})
    serial.sendCommand(`kd1,${bg.kd1.toFixed(3)}`).catch(() => {})
  }, [serial, addLog])

  // Stop sequence and reset
  const stopSequence = useCallback((reason = 'Sequence stopped by user', sendEstop = true) => {
    clearAllTimers()

    capturePhaseRef.current = 'off'
    awaitingMRef.current = false
    mPacketReceivedRef.current = false
    isProcessingRef.current = false
    runRetryCountRef.current = 0
    runNeedRetryRef.current = false
    runFailureLatchRef.current = false
    if (sendEstop) serial.sendCommand('estop').catch(() => {})
    restoreBaselineGains()
    stateRef.current = 'idle'
    setState('idle')
    addLog(`⚠️ ${reason}`)
    toast.warning(reason)
  }, [serial, addLog, clearAllTimers, restoreBaselineGains])

  // Abort = unrecoverable stop with a visible reason banner
  const abortSequence = useCallback((reason: string) => {
    setAbortReason(reason)
    stopSequence(`Sequence ABORTED: ${reason}`)
    toast.error(`Sequence aborted: ${reason}`)
  }, [stopSequence])

  // Watch serial status changes
  useEffect(() => {
    if (serialStatus === 'disconnected' && stateRef.current !== 'idle' && stateRef.current !== 'complete') {
      stopSequence('Serial disconnected! Sequence aborted.', false)
    }
  }, [serialStatus, stopSequence])

  // Safety: abort if E-STOP engages mid-sequence (hardware button / other tab)
  useEffect(() => {
    if (estopped && stateRef.current !== 'idle' && stateRef.current !== 'complete') {
      stopSequence('E-STOP detected! Sequence aborted.', false)
    }
  }, [estopped, stopSequence])

  // Validated move sender — defense in depth alongside the firmware check
  const sendMove = useCallback(async (xMm: number, yMm: number) => {
    if (!isInWorkspace(xMm, yMm)) {
      throw new Error(`Target (${xMm}, ${yMm}) outside workspace (r ${WS_R_MIN}–${WS_R_MAX} mm, -30°–210°)`)
    }
    await serial.sendCommand(`move,${xMm},${yMm}`)
  }, [serial])

  // Forward declaration pattern: startCooldown/executeRunStep are mutually
  // recursive across async boundaries, so we route through a ref.
  const executeRunStepRef = useRef<() => void>(() => {})

  // Trigger next run step or finish sequence
  const startCooldown = useCallback(() => {
    transition('cooldown')
    setCooldownTime(COOLDOWN_S)
    addLog(`Entering ${COOLDOWN_S}s cooldown phase to let motors rest...`)

    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current)
    cooldownTimerRef.current = setInterval(() => {
      setCooldownTime(prev => {
        if (prev <= 1) {
          clearInterval(cooldownTimerRef.current!)
          cooldownTimerRef.current = null
          const tab = activeTabRef.current
          const totalRuns = computeTotalRuns(tab)

          if (runNeedRetryRef.current) {
            // Retry: direction stays the same (successCount unchanged), just re-attempt
            runNeedRetryRef.current = false
            addLog(`Retrying run after cooldown (successCount still ${successCountRef.current})...`)
            executeRunStepRef.current()
          } else {
            // Check if sequence is complete based on successCount
            if (successCountRef.current >= totalRuns) {
              transition('complete')
              addLog('🎉 Experiment sequence completed successfully!')
              restoreBaselineGains()

              setResults(currentResults => {
                const valid = currentResults.filter(r => r.status === 'ok' || r.status === 'retrying')
                if (valid.length > 0) {
                  const mates = valid.map(v => v.mate)
                  const mctes = valid.map(v => v.mcte)
                  const meanMate = mates.reduce((a, b) => a + b, 0) / mates.length
                  const meanMcte = mctes.reduce((a, b) => a + b, 0) / mctes.length
                  const varMate = mates.reduce((a, b) => a + (b - meanMate) ** 2, 0) / mates.length
                  const varMcte = mctes.reduce((a, b) => a + (b - meanMcte) ** 2, 0) / mctes.length
                  setSummary({
                    meanMate,
                    stdMate: Math.sqrt(varMate),
                    meanMcte,
                    stdMcte: Math.sqrt(varMcte),
                  })
                }
                return currentResults
              })
            } else {
              // Continue to next run slot
              executeRunStepRef.current()
            }
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [addLog, transition, restoreBaselineGains])

  // Handle run failure (telemetry loss, timeout, firmware ERR, DB failure).
  // Retries the same slot up to MAX_RUN_RETRIES, then aborts the sequence —
  // a slot is never silently skipped (data integrity).
  const handleRunFailure = useCallback((reason: string) => {
    if (runFailureLatchRef.current) return  // already handling this attempt
    runFailureLatchRef.current = true

    clearAllTimers()
    capturePhaseRef.current = 'off'
    awaitingMRef.current = false
    mPacketReceivedRef.current = false
    isProcessingRef.current = false
    addLog(`❌ Run failed: ${reason}`)

    if (runRetryCountRef.current < MAX_RUN_RETRIES) {
      runRetryCountRef.current += 1
      runNeedRetryRef.current = true
      addLog(`⚠️ Retry attempt ${runRetryCountRef.current}/${MAX_RUN_RETRIES} after cooldown...`)
      toast.warning(`Run failed. Retrying (Attempt ${runRetryCountRef.current}/${MAX_RUN_RETRIES})...`)
      startCooldown()
    } else {
      // Record failed card, then abort the whole sequence
      const cardResult: RunResultCard = {
        attemptNumber: totalAttemptsRef.current,
        successIndex: successCountRef.current,
        direction: direction,
        mate: 0,
        mcte: 0,
        moveDuration: 0,
        sigmaHold: null,
        eSs: null,
        status: 'failed',
      }
      setResults(prev => [...prev, cardResult])
      abortSequence(`Run slot #${successCountRef.current + 1} failed ${MAX_RUN_RETRIES} times (${reason})`)
    }
  }, [direction, startCooldown, addLog, clearAllTimers, abortSequence])

  const armWatchdog = useCallback((ms: number, reason: string) => {
    clearWatchdog()
    watchdogRef.current = setTimeout(() => {
      watchdogRef.current = null
      handleRunFailure(`Watchdog timeout: ${reason} (${(ms / 1000).toFixed(0)}s)`)
    }, ms)
  }, [clearWatchdog, handleRunFailure])

  // ─── Hold phase: dwell 3 s at start point, capture σ_θ1, then fire move ───
  const enterHold = useCallback((isForward: boolean) => {
    transition('hold')
    capturePhaseRef.current = 'hold'
    addLog(`Holding at start position for ${HOLD_DURATION_MS / 1000}s (capturing noise floor)...`)

    if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null
      if (stateRef.current !== 'hold') return

      // σ_θ1 over the last HOLD_SIGMA_WINDOW_MS of hold-phase D samples
      const holdD = accumulatedDRef.current.filter(s => s.phase === 'hold')
      if (holdD.length > 1) {
        const tEnd = holdD[holdD.length - 1].t
        const win = holdD.filter(s => s.t >= tEnd - HOLD_SIGMA_WINDOW_MS)
        const mean = win.reduce((a, s) => a + s.th1, 0) / win.length
        const variance = win.reduce((a, s) => a + (s.th1 - mean) ** 2, 0) / win.length
        sigmaHoldRef.current = Math.sqrt(variance)
        addLog(`σ_θ1 (hold, ${win.length} samples) = ${(sigmaHoldRef.current * 1000).toFixed(4)} mrad`)
      } else {
        sigmaHoldRef.current = null
        addLog('⚠️ No hold-phase D samples captured (plot,1 not active?). σ_θ1 unavailable.')
      }

      // Fire the trajectory move
      const targetX = isForward ? PF.x : P0.x
      const targetY = isForward ? PF.y : P0.y
      transition('running')
      awaitingMRef.current = true
      mPacketReceivedRef.current = false
      armWatchdog(WD_M_PACKET_MS, 'no M-packet after trajectory move command')
      addLog(`Executing trajectory: move,${targetX},${targetY}`)
      sendMove(targetX, targetY).catch(err => {
        handleRunFailure(`Trajectory command failed: ${err}`)
      })
    }, HOLD_DURATION_MS)
  }, [transition, addLog, armWatchdog, sendMove, handleRunFailure])

  // Sequence state steps executor — uses successCountRef to determine direction
  const executeRunStep = useCallback(async () => {
    const nextSuccessSlot = successCountRef.current + 1  // 1-based index of the run we want to capture
    const tab = activeTabRef.current
    const alpha = exp4AlphaRef.current
    const sub6 = exp6SubRef.current
    const level6 = exp6LevelRef.current

    const totalRuns = computeTotalRuns(tab)

    const isForward = computeIsForward(nextSuccessSlot, tab)
    const isConditionA = computeIsConditionA(nextSuccessSlot, tab)
    const runDir = isForward ? 'forward' : 'return'
    setDirection(runDir)

    // Increment attempt counter
    setTotalAttempts(prev => {
      totalAttemptsRef.current = prev + 1
      return prev + 1
    })

    // Clear telemetry buffers and per-attempt flags
    accumulatedDRef.current = []
    accumulatedFRef.current = []
    accumulatedERef.current = []
    accumulatedTRef.current = []
    capturePhaseRef.current = 'off'
    awaitingMRef.current = false
    mPacketReceivedRef.current = false
    sigmaHoldRef.current = null
    isProcessingRef.current = false
    runFailureLatchRef.current = false

    addLog(`-------------------- RUN slot #${nextSuccessSlot}/${totalRuns} (saved ${successCountRef.current}, attempt ${totalAttemptsRef.current}) --------------------`)
    addLog(`Direction: ${runDir.toUpperCase()} | Condition: ${isConditionA ? 'A' : 'B'}`)

    const proceedToPositioning = (fwd: boolean) => {
      if (stateRef.current === 'idle') return
      transition('positioning')
      // Forward run starts at p0 (140, 45). Return run starts at pf (60, 155).
      const posX = fwd ? P0.x : PF.x
      const posY = fwd ? P0.y : PF.y

      // Skip the positioning move if the EEF is already at the start point —
      // firmware emits NO M/S packets for moves < 1 mm, which would hang us here.
      const cur = lastActualPosRef.current
      if (cur && Math.hypot(cur.x - posX, cur.y - posY) < POSITION_SKIP_TOL_MM) {
        addLog(`Already at start position (${posX}, ${posY}) — skipping positioning move.`)
        enterHold(fwd)
        return
      }

      armWatchdog(WD_POSITIONING_MS, 'no S-packet during positioning')
      addLog(`Moving to start position (${posX}, ${posY}) for positioning...`)
      sendMove(posX, posY).catch(err => {
        handleRunFailure(`Position command failed: ${err}`)
      })
    }

    // 1. Setup commands — full OFAT baseline lock + variable, sent once per condition block
    const indexInCond = computeIndexInCond(nextSuccessSlot, tab)
    const isFirstRunOfCondition = indexInCond === 1

    if (isFirstRunOfCondition) {
      const bg = baseGainsRef.current ?? gainsRef.current ?? { kp1: 0.60, ki1: 0.05, kd1: 0.07 }
      const commands = buildConditionCommands(tab, isConditionA, alpha, sub6, level6, {
        kp1: bg.kp1, ki1: bg.ki1, kd1: bg.kd1,
      })
      try {
        transition('waiting_for_ready')
        armWatchdog(WD_SETUP_MS, 'setup command batch')
        for (const cmd of commands) {
          addLog(`Sending setup command: ${cmd}`)
          await serial.sendCommand(cmd)
          await new Promise(r => setTimeout(r, 60))
        }
        // Brief settle window — any ERR reply arriving here fails the run
        await new Promise(r => setTimeout(r, 500))
        if (stateRef.current !== 'waiting_for_ready') return  // failed or stopped meanwhile
        clearWatchdog()
        proceedToPositioning(isForward)
      } catch (err) {
        addLog(`❌ Failed to send setup commands: ${err}`)
        stopSequence('Serial communication failure.')
      }
    } else {
      proceedToPositioning(isForward)
    }
  }, [serial, addLog, stopSequence, transition, armWatchdog, clearWatchdog, sendMove, enterHold, handleRunFailure])

  useEffect(() => { executeRunStepRef.current = executeRunStep }, [executeRunStep])

  // Save current recorded run
  const processAndSaveRun = useCallback(async () => {
    // Guard against double-invocation (race condition)
    if (isProcessingRef.current) {
      addLog('⚠️ processAndSaveRun called while already processing, skipping duplicate.')
      return
    }
    isProcessingRef.current = true
    capturePhaseRef.current = 'off'
    transition('saving')
    addLog('Processing telemetry samples...')

    const dSamples = accumulatedDRef.current
    const fSamples = accumulatedFRef.current
    const eSamples = accumulatedERef.current
    const tSamples = accumulatedTRef.current

    const moveD = dSamples.filter(s => s.phase === 'move')
    if (moveD.length === 0) {
      addLog('❌ Error: No telemetry samples captured during the trajectory!')
      handleRunFailure('No telemetry samples')
      return
    }

    addLog(`Captured ${dSamples.length} samples (${moveD.length} move-phase). Aligning datasets...`)

    // Align samples by matching timestamps (all phases saved; metrics use 'move')
    const alignedSamples = dSamples.map(d => {
      const f = findClosest(fSamples, d.t)
      const e = findClosest(eSamples, d.t)
      const tPt = findClosestT(tSamples, d.t)

      return {
        tMs: d.t,
        phase: d.phase as string,
        theta1: d.th1 ?? null,
        theta2: d.th2 ?? null,
        theta1D: d.th1d ?? null,
        theta2D: d.th2d ?? null,
        dtheta1: d.dth1 ?? null,
        dtheta2: d.dth2 ?? null,
        dtheta1D: d.dth1d ?? null,
        dtheta2D: d.dth2d ?? null,
        pwm1: d.pwm1 ?? null,
        theta1Raw: d.th1raw ?? null,
        theta2Raw: d.th2raw ?? null,
        xActual: tPt ? tPt.xa : null,
        yActual: tPt ? tPt.ya : null,
        xDesired: tPt ? tPt.xi : null,
        yDesired: tPt ? tPt.yi : null,
        u1Total: d.u1Total ?? (f ? f.u1Total : null),
        ff1Contrib: f ? f.ff1Contrib : null,
        p1Out: e ? e.p1_out : null,
        i1Out: e ? e.i1_out : null,
        d1Out: e ? e.d1_out : null,
        ctcInertia1: f ? f.inertia1 : null,
        ctcCoriolis1: f ? f.coriolis1 : null,
        ctcGravity1: f ? f.gravity1 : null,
        ctcInertia2: f ? f.inertia2 : null,
        ctcCoriolis2: f ? f.coriolis2 : null,
        ctcGravity2: f ? f.gravity2 : null,
        omega2Raw: f ? f.omega2Raw : null,
        deltaOmegaFf: f ? f.deltaOmegaFf : null,
      }
    })

    // The success slot this run will fill
    const tab = activeTabRef.current
    const alpha = exp4AlphaRef.current
    const sub6 = exp6SubRef.current
    const level6 = exp6LevelRef.current
    const nextSuccessSlot = successCountRef.current + 1
    const isForward = computeIsForward(nextSuccessSlot, tab)
    const isConditionA = computeIsConditionA(nextSuccessSlot, tab)

    // ─── Metrics — per-run direction unit vector û = (target − start)/D ─────
    // Forward: p0→pf. Return: pf→p0 (û flips, so MATE keeps its lag semantics).
    const dxPath = (isForward ? PF.x - P0.x : P0.x - PF.x)
    const dyPath = (isForward ? PF.y - P0.y : P0.y - PF.y)
    const ux = dxPath / PATH_D
    const uy = dyPath / PATH_D
    const upx = -uy  // û rotated +90° (cross-track); MCTE is absolute, sign irrelevant
    const upy = ux

    const movePhase = alignedSamples.filter(s => s.phase === 'move')
    let skipped = 0
    let N = 0
    let sumAte = 0, sumSqAte = 0, maxAteAbs = 0
    let sumCte = 0, sumSqCte = 0, maxCte = 0
    let sumEef = 0, sumSqEef = 0, maxEef = 0
    let sumSqJ1 = 0, maxJ1 = -Infinity, minJ1 = Infinity
    let sumSqJ2 = 0, maxJ2 = -Infinity, minJ2 = Infinity
    let lastEef: number | null = null

    for (const s of movePhase) {
      if (s.xActual == null || s.xDesired == null || s.yActual == null || s.yDesired == null) {
        skipped++
        continue
      }
      const dx = s.xActual - s.xDesired
      const dy = s.yActual - s.yDesired

      const ate = dx * ux + dy * uy
      const cte = Math.abs(dx * upx + dy * upy)
      const eef = Math.sqrt(dx * dx + dy * dy)

      const ej1 = Math.abs((s.theta1 ?? 0) - (s.theta1D ?? 0))
      const ej2 = Math.abs((s.theta2 ?? 0) - (s.theta2D ?? 0))

      N++
      sumAte += ate; sumSqAte += ate * ate
      if (Math.abs(ate) > maxAteAbs) maxAteAbs = Math.abs(ate)
      sumCte += cte; sumSqCte += cte * cte
      if (cte > maxCte) maxCte = cte
      sumEef += eef; sumSqEef += eef * eef
      if (eef > maxEef) maxEef = eef
      sumSqJ1 += ej1 * ej1
      if (ej1 > maxJ1) maxJ1 = ej1
      if (ej1 < minJ1) minJ1 = ej1
      sumSqJ2 += ej2 * ej2
      if (ej2 > maxJ2) maxJ2 = ej2
      if (ej2 < minJ2) minJ2 = ej2
      lastEef = eef
    }

    if (skipped > 0) addLog(`⚠️ ${skipped} move-phase samples lacked Cartesian data and were skipped in metrics.`)
    if (N === 0) {
      addLog('❌ Error: No move-phase samples with Cartesian (T-packet) data!')
      handleRunFailure('No Cartesian tracking samples')
      return
    }

    const mate_mean = sumAte / N
    const mate_rms = Math.sqrt(sumSqAte / N)
    const mate_max = maxAteAbs
    const mcte_mean = sumCte / N
    const mcte_rms = Math.sqrt(sumSqCte / N)
    const mcte_max = maxCte
    const eef_error_mean = sumEef / N
    const eef_error_rms = Math.sqrt(sumSqEef / N)
    const eef_error_max = maxEef
    const joint1_error_rms = Math.sqrt(sumSqJ1 / N)
    const joint2_error_rms = Math.sqrt(sumSqJ2 / N)

    // Move duration from firmware clock (M→S window of D samples)
    const move_duration_ms = moveD[moveD.length - 1].t - moveD[0].t
    const final_eef_error = lastEef ?? 0

    // e_ss: mean EEF error over the post-settle capture window
    const settlePhase = alignedSamples.filter(s =>
      s.phase === 'settle' && s.xActual != null && s.xDesired != null)
    const e_ss = settlePhase.length > 0
      ? settlePhase.reduce((a, s) =>
          a + Math.hypot(s.xActual! - s.xDesired!, s.yActual! - s.yDesired!), 0) / settlePhase.length
      : null
    if (e_ss != null) addLog(`e_ss (${settlePhase.length} settle samples) = ${e_ss.toFixed(4)} mm`)

    // Build database payloads
    const runId = generateRunId()

    let expId: string = tab
    let expName: string = EXPERIMENTS.find(e => e.id === tab)?.name ?? tab
    if (tab === 'EXP-4') {
      expId = `EXP-4-alpha${alpha}`
      expName = `EXP-4 (Gravity Comp Tilt ${alpha}°)`
    } else if (tab === 'EXP-6') {
      expId = `EXP-${sub6}-${level6}x`
      expName = `EXP-${sub6} (${sub6 === '6A' ? 'Kp1' : sub6 === '6B' ? 'Ki1' : 'Kd1'} ${level6}x)`
    }

    // Flags reflect the OFAT baseline locks actually commanded for this run
    let ffg = 0, ffi = 0, ffc = 0, tden = 1, trap = 1
    if (tab === 'EXP-1') { tden = isConditionA ? 1 : 0; ffi = 0; ffc = 0; ffg = 0 }
    else if (tab === 'EXP-2') { ffi = isConditionA ? 1 : 0; ffc = 0; ffg = 0 }
    else if (tab === 'EXP-3') { ffc = isConditionA ? 1 : 0; ffi = 1; ffg = 0 }
    else if (tab === 'EXP-4') { ffg = isConditionA ? 1 : 0; ffi = 1; ffc = 1 }
    else if (tab === 'EXP-5') { trap = isConditionA ? 1 : 0; ffi = 1; ffc = 1; ffg = 1 }
    else if (tab === 'EXP-6') { ffi = 1; ffc = 1; ffg = 1 }

    const bg = baseGainsRef.current ?? { kp1: gains?.kp1 ?? 0.60, ki1: gains?.ki1 ?? 0.05, kd1: gains?.kd1 ?? 0.07 }

    const runPayload = {
      id: runId,
      experimentId: expId,
      experimentName: expName,
      runNumber: nextSuccessSlot,  // run number = success index (1-based)
      direction: isForward ? ('forward' as const) : ('return' as const),
      alphaDeg: tab === 'EXP-4' ? parseFloat(alpha) : 0.0,
      ffgEnabled: ffg,
      ffiEnabled: ffi,
      ffcEnabled: ffc,
      tdEnabled: tden,
      trapEnabled: trap,
      kp1: tab === 'EXP-6' && sub6 === '6A' ? bg.kp1 * parseFloat(level6) : bg.kp1,
      ki1: tab === 'EXP-6' && sub6 === '6B' ? bg.ki1 * parseFloat(level6) : bg.ki1,
      kd1: tab === 'EXP-6' && sub6 === '6C' ? bg.kd1 * parseFloat(level6) : bg.kd1,
      kp2: gains?.kp2 ?? 1.0,
      ki2: gains?.ki2 ?? 0.0,
      kd2: gains?.kd2 ?? 0.0,
      p0X: P0.x,
      p0Y: P0.y,
      pfX: PF.x,
      pfY: PF.y,
      createdAt: Date.now(),
      status: 'ok' as 'ok' | 'retrying' | 'failed',
    }

    const metricsPayload = {
      mateMean: mate_mean,
      mateMax: mate_max,
      mateRms: mate_rms,
      mcteMean: mcte_mean,
      mcteMax: mcte_max,
      mcteRms: mcte_rms,
      eefErrorMean: eef_error_mean,
      eefErrorMax: eef_error_max,
      eefErrorRms: eef_error_rms,
      joint1ErrorMax: maxJ1,
      joint1ErrorRms: joint1_error_rms,
      joint1ErrorMin: minJ1,
      joint2ErrorMax: maxJ2,
      joint2ErrorRms: joint2_error_rms,
      joint2ErrorMin: minJ2,
      settleTimeMs: move_duration_ms,
      finalEefError: final_eef_error,
      sigmaTheta1Hold: sigmaHoldRef.current,
      eSs: e_ss,
      moveDurationMs: move_duration_ms,
    }

    // ─── Offline Fallback ───────────────────────────────────────────────────
    if (!navigator.onLine) {
      addLog('⚠ Offline — saved locally only')
      await saveRun(runPayload, metricsPayload, alignedSamples, true)
      setOfflineQueue(prev => [...prev, { run: runPayload, metrics: metricsPayload, samples: alignedSamples }])

      // Offline counts as success (queued for sync)
      const cardResult: RunResultCard = {
        attemptNumber: totalAttemptsRef.current,
        successIndex: nextSuccessSlot,
        direction: runPayload.direction,
        mate: mate_mean,
        mcte: mcte_mean,
        moveDuration: move_duration_ms,
        sigmaHold: sigmaHoldRef.current,
        eSs: e_ss,
        status: 'ok',
      }
      setResults(prev => [...prev, cardResult])
      toast.warning(`Offline: Run #${nextSuccessSlot} saved locally and queued.`)

      // Increment success count
      setSuccessCount(prev => {
        successCountRef.current = prev + 1
        return prev + 1
      })
      runRetryCountRef.current = 0
      runNeedRetryRef.current = false
      isProcessingRef.current = false
      startCooldown()
      return
    }

    // ─── Online Database Save with Retry ────────────────────────────────────
    addLog('Saving run to Turso Database and local backup...')
    let saveRes = await saveRun(runPayload, metricsPayload, alignedSamples, false)
    let finalStatus: 'ok' | 'retrying' | 'failed' = 'ok'

    if (!saveRes.ok) {
      addLog('⚠️ Database save failed. Retrying in 2 seconds... (Attempt 1/2)')
      await new Promise(r => setTimeout(r, 2000))
      runPayload.status = 'retrying'
      saveRes = await saveRun(runPayload, metricsPayload, alignedSamples, false)
      finalStatus = 'retrying'

      if (!saveRes.ok) {
        addLog('⚠️ Database save failed. Retrying in 2 seconds... (Attempt 2/2)')
        await new Promise(r => setTimeout(r, 2000))
        saveRes = await saveRun(runPayload, metricsPayload, alignedSamples, false)

        if (!saveRes.ok) {
          addLog('❌ Database save failed after all retries. Backing up locally.')
          finalStatus = 'failed'
          runPayload.status = 'failed'
          await saveRun(runPayload, metricsPayload, alignedSamples, true)
        }
      }
    }

    if (finalStatus !== 'failed') {
      addLog(`✅ Saved successfully. Run ID: ${runId} (success #${nextSuccessSlot})`)
      toast.success(`Run #${nextSuccessSlot} saved successfully!`)
    } else {
      toast.error(`Run #${nextSuccessSlot} failed to save to database.`)
    }

    const cardResult: RunResultCard = {
      attemptNumber: totalAttemptsRef.current,
      successIndex: finalStatus !== 'failed' ? nextSuccessSlot : successCountRef.current,
      direction: runPayload.direction,
      mate: mate_mean,
      mcte: mcte_mean,
      moveDuration: move_duration_ms,
      sigmaHold: sigmaHoldRef.current,
      eSs: e_ss,
      status: finalStatus,
    }
    setResults(prev => [...prev, cardResult])

    if (finalStatus !== 'failed') {
      // Increment success count only if actually saved
      setSuccessCount(prev => {
        successCountRef.current = prev + 1
        return prev + 1
      })
      runRetryCountRef.current = 0
      runNeedRetryRef.current = false
    } else {
      // Failed save: trigger run failure handler (retries the same slot, aborts after cap)
      isProcessingRef.current = false
      handleRunFailure('Database save failed after all retries')
      return
    }

    isProcessingRef.current = false
    startCooldown()

  }, [gains, addLog, startCooldown, handleRunFailure, transition])

  // Local helper to generate alphanumeric run IDs
  const generateRunId = () => {
    const chars = 'useand-1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    let res = ''
    for (let i = 0; i < 15; i++) {
      res += chars[Math.floor(Math.random() * chars.length)]
    }
    return 'RUN-' + res
  }

  // Handle incoming serial lines
  const onLineReceived = useCallback((line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return

    const parts = trimmed.split(',')
    const tag = parts[0]
    const st = stateRef.current
    const sequenceActive = st !== 'idle' && st !== 'complete'

    // 0. Surface firmware errors — a rejected command would otherwise be invisible
    if (trimmed.startsWith('ERR') && sequenceActive) {
      addLog(`🔴 Firmware: ${trimmed}`)
      if (st === 'waiting_for_ready' || st === 'positioning' || st === 'running') {
        handleRunFailure(`Firmware rejected command: ${trimmed}`)
        return
      }
    }

    // 1. Capture M-packet (trajectory move accepted and started)
    if (tag === 'M') {
      if (st === 'running' && awaitingMRef.current) {
        awaitingMRef.current = false
        mPacketReceivedRef.current = true
        capturePhaseRef.current = 'move'
        lastDWallClockRef.current = Date.now()
        armWatchdog(WD_RUNNING_MS, 'no S-packet during trajectory')

        // Telemetry stall detection while moving
        if (stallIntervalRef.current) clearInterval(stallIntervalRef.current)
        stallIntervalRef.current = setInterval(() => {
          if (stateRef.current !== 'running' || !mPacketReceivedRef.current) {
            clearInterval(stallIntervalRef.current!)
            stallIntervalRef.current = null
            return
          }
          if (Date.now() - lastDWallClockRef.current > TELEMETRY_STALL_MS) {
            clearInterval(stallIntervalRef.current!)
            stallIntervalRef.current = null
            handleRunFailure(`Telemetry stalled (no D-packet for >${TELEMETRY_STALL_MS} ms)`)
          }
        }, 500)

        addLog('✓ M-packet received. Recording trajectory telemetry...')
      }
    }

    // 1b. MC-packet: L-shape intermediate reached, second leg starting
    if (tag === 'MC') {
      if (st === 'running' && mPacketReceivedRef.current) {
        // Re-arm watchdog for the second leg; keep capture phase as 'move'
        armWatchdog(WD_RUNNING_MS, 'no S-packet during L-shape second leg')
        addLog('↪ L-shape intermediate reached — continuing to final target...')
      }
    }

    // 2. Capture S-packet (trajectory settled)
    if (tag === 'S') {
      if (st === 'positioning') {
        clearWatchdog()
        addLog('✓ S-packet received. Robot settled at start position.')
        const nextSuccessSlot = successCountRef.current + 1
        const fwd = computeIsForward(nextSuccessSlot, activeTabRef.current)
        setTimeout(() => {
          if (stateRef.current === 'positioning') enterHold(fwd)
        }, 300)
      } else if (st === 'running') {
        if (mPacketReceivedRef.current) {
          clearWatchdog()
          if (stallIntervalRef.current) { clearInterval(stallIntervalRef.current); stallIntervalRef.current = null }
          addLog(`✓ S-packet received. Capturing ${SETTLE_CAPTURE_MS / 1000}s post-settle window (e_ss)...`)
          mPacketReceivedRef.current = false
          capturePhaseRef.current = 'settle'
          transition('settling')
          if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
          settleTimerRef.current = setTimeout(() => {
            settleTimerRef.current = null
            if (stateRef.current !== 'settling') return
            capturePhaseRef.current = 'off'
            processAndSaveRun()
          }, SETTLE_CAPTURE_MS)
        } else {
          addLog('⚠️ S-packet received, but M-packet was never seen. Discarding.')
          handleRunFailure('M-packet missing')
        }
      }
    }

    // 3. Capture Telemetry Samples (D, T, F, E)
    if (tag === 'T') {
      const [, xi, yi, xa, ya] = parts.map(Number)
      // Always track latest actual position (used for positioning-skip check)
      if (Number.isFinite(xa) && Number.isFinite(ya)) {
        lastActualPosRef.current = { x: xa, y: ya }
      }
      if (capturePhaseRef.current !== 'off') {
        accumulatedTRef.current.push({
          t_ms: lastSeenDTimeRef.current,
          xi: xi ?? 0, yi: yi ?? 0, xa: xa ?? 0, ya: ya ?? 0,
        })
      }
    } else if (capturePhaseRef.current !== 'off') {
      const phase = capturePhaseRef.current
      if (tag === 'D') {
        const partsNum = parts.map(Number)
        const t = partsNum[1] || 0
        lastSeenDTimeRef.current = t
        lastDWallClockRef.current = Date.now()
        accumulatedDRef.current.push({
          t,
          phase,
          th1: partsNum[2] ?? 0, th2: partsNum[3] ?? 0,
          th1d: partsNum[4] ?? 0, th2d: partsNum[5] ?? 0,
          dth1: partsNum[6] ?? 0, dth2: partsNum[7] ?? 0,
          dth1d: partsNum[8] ?? 0, dth2d: partsNum[9] ?? 0,
          pwm1: partsNum[10] ?? 0, vff1: partsNum[11] ?? 0,
          th1raw: partsNum[12] ?? 0, th2raw: partsNum[13] ?? 0,
          u1Total: partsNum[14] ?? 0,
        })
      } else if (tag === 'F') {
        const [, time_ms, inertia1, coriolis1, gravity1, inertia2, coriolis2, gravity2, ff1_contrib, u1_total, integral1, delta_omega_ff, omega2_raw, integral2] = parts.map(Number)
        accumulatedFRef.current.push({
          t: time_ms ?? 0, inertia1: inertia1 ?? 0, coriolis1: coriolis1 ?? 0,
          gravity1: gravity1 ?? 0, inertia2: inertia2 ?? 0, coriolis2: coriolis2 ?? 0,
          gravity2: gravity2 ?? 0, ff1Contrib: ff1_contrib ?? 0, u1Total: u1_total ?? 0,
          integral1: integral1 ?? 0, deltaOmegaFf: delta_omega_ff ?? 0,
          omega2Raw: omega2_raw ?? 0, integral2: integral2 ?? 0,
        })
      } else if (tag === 'E') {
        const [, time_ms, p1_out, i1_out, d1_out, loop_duration_us] = parts.map(Number)
        accumulatedERef.current.push({
          t: time_ms ?? 0, p1_out: p1_out ?? 0, i1_out: i1_out ?? 0,
          d1_out: d1_out ?? 0, loop_duration_us: loop_duration_us ?? 0,
        })
      }
    }
  }, [handleRunFailure, processAndSaveRun, enterHold, transition, armWatchdog, clearWatchdog, addLog])

  // Attach serial log listener
  useEffect(() => {
    const handleRx = (e: Event) => {
      const line = (e as CustomEvent<string>).detail
      onLineReceived(line)
    }
    window.addEventListener('hmi_rx', handleRx)
    return () => window.removeEventListener('hmi_rx', handleRx)
  }, [onLineReceived])

  // ─── Start sequence: preflight checks, then the run loop ──────────────────
  const startSequence = useCallback(async () => {
    if (serialStatus !== 'connected') {
      toast.error('Connect serial port before running experiments!')
      return
    }
    // Reset sequence state
    setResults([])
    setSummary(null)
    setLogs([])
    setAbortReason(null)
    setPreflightChecks([])
    setSuccessCount(0)
    setTotalAttempts(0)
    successCountRef.current = 0
    totalAttemptsRef.current = 0
    runRetryCountRef.current = 0
    runNeedRetryRef.current = false
    runFailureLatchRef.current = false
    isProcessingRef.current = false
    capturePhaseRef.current = 'off'

    transition('preflight')
    addLog(`🚀 Starting automated sequence for ${activeTabRef.current}. Running preflight checks...`)

    const fail = (label: string, msg: string) => {
      setCheck(label, false)
      addLog(`❌ Preflight failed: ${msg}`)
      toast.error(`Preflight failed: ${msg}`)
      transition('idle')
    }
    const aborted = () => stateRef.current !== 'preflight'

    try {
      // 1. E-STOP: auto-resume if engaged (e.g. left over from a previous stop)
      setCheck('E-STOP clear', null)
      if (estoppedRef.current) {
        addLog('E-STOP is active — sending resume...')
        await serial.sendCommand('resume')
        const cleared = await waitFor(() => !estoppedRef.current, 2000)
        if (aborted()) return
        if (!cleared) return fail('E-STOP clear', 'E-STOP still active after resume command.')
      }
      setCheck('E-STOP clear', true)

      // 2. Mode: tden/trapen/atilt/td1r are MODE_TEST-only; move is rejected in IDLE
      setCheck('Mode TEST', null)
      if (currentModeRef.current !== 'TEST') {
        addLog(`Firmware mode is ${currentModeRef.current ?? 'unknown'} — sending mode,test...`)
        await serial.sendCommand('mode,test')
        const ok = await waitFor(() => currentModeRef.current === 'TEST', 3000)
        if (aborted()) return
        if (!ok) return fail('Mode TEST', 'Firmware did not switch to MODE_TEST.')
      }
      setCheck('Mode TEST', true)

      // 3. Plot stream: D-lines are only emitted when plot_enabled or moving —
      //    required for the pre-move hold capture (σ_θ1)
      setCheck('Plot stream', null)
      await serial.sendCommand('plot,1')
      setCheck('Plot stream', true)

      // 4. Gains snapshot (fresh baseline for EXP-6 scaling + restore-on-exit)
      setCheck('Gains snapshot', null)
      await serial.sendCommand('getgains')
      // Give the fresh G-packet time to arrive (gainsRef may hold a stale snapshot)
      await new Promise(r => setTimeout(r, 400))
      await waitFor(() => !!gainsRef.current, 2000)
      if (aborted()) return
      const g = gainsRef.current
      if (g) {
        const snap = { kp1: g.kp1, ki1: g.ki1, kd1: g.kd1 }
        baseGainsRef.current = snap
        setBaseGains(snap)
        addLog(`Baseline gains: Kp1=${snap.kp1.toFixed(3)}, Ki1=${snap.ki1.toFixed(3)}, Kd1=${snap.kd1.toFixed(3)}`)
        setCheck('Gains snapshot', true)
      } else if (activeTabRef.current === 'EXP-6') {
        return fail('Gains snapshot', 'No G-packet received — EXP-6 needs a gains baseline.')
      } else {
        addLog('⚠️ No gains received yet; using firmware defaults for logging.')
        setCheck('Gains snapshot', true)
      }

      // 5. Workspace validation of the standard test path
      setCheck('Workspace', null)
      if (!isInWorkspace(P0.x, P0.y) || !isInWorkspace(PF.x, PF.y)) {
        return fail('Workspace', `Test path endpoints outside workspace (r ${WS_R_MIN}–${WS_R_MAX} mm).`)
      }
      setCheck('Workspace', true)
    } catch (err) {
      return fail('Serial', `Serial write failed: ${err}`)
    }

    if (aborted()) return
    addLog('✅ Preflight checks passed.')
    executeRunStepRef.current()
  }, [serialStatus, serial, addLog, setCheck, transition])

  // Calculate parameters description string for displays
  const getParamDescription = () => {
    const tab = activeTab

    let desc = ''
    let cmds = ''

    const baseKp = baseGains?.kp1 ?? gains?.kp1 ?? 0.60
    const baseKi = baseGains?.ki1 ?? gains?.ki1 ?? 0.05
    const baseKd = baseGains?.kd1 ?? gains?.kd1 ?? 0.07
    let activeGains = `Kp1=${baseKp.toFixed(2)}, Ki1=${baseKi.toFixed(3)}, Kd1=${baseKd.toFixed(3)}`

    if (tab === 'EXP-1') {
      desc = 'Evaluate the effect of the Tracking Differentiator (TD) filter in the feedback loop. All feedforward locked OFF (ffi=ffc=ffg=0) to isolate velocity estimation.'
      cmds = 'tden,1 (Runs 1-10, Cond A) | tden,0 (Runs 11-20, Cond B) + lock: ffi,0 ffc,0 ffg,0'
    } else if (tab === 'EXP-2') {
      desc = 'Evaluate the inertia moment compensation in the dynamic model. Locks: tden=1, trapen=1, ffc=0, ffg=0.'
      cmds = 'ffi,1.0 (Runs 1-10) | ffi,0.0 (Runs 11-20)'
    } else if (tab === 'EXP-3') {
      desc = 'Evaluate the contribution of the Coriolis & Centrifugal force compensation feedforward. Locks: tden=1, trapen=1, ffi=1.0, ffg=0.'
      cmds = 'ffc,1.0 (Runs 1-10) | ffc,0.0 (Runs 11-20)'
    } else if (tab === 'EXP-4') {
      desc = `Evaluate the model gravity compensation at tilt angle α = ${exp4Alpha}°. Locks: tden=1, trapen=1, ffi=1.0, ffc=1.0.`
      cmds = `atilt,${exp4Alpha} & ffg,1.0 (Runs 1-3) | ffg,0.0 (Runs 4-6)`
    } else if (tab === 'EXP-5') {
      desc = 'Test the input trajectory filter. Compare Trapezoidal profile (Runs 1-10) vs Raw Step input (Runs 11-20). Locks: tden=1, all FF on.'
      cmds = 'trapen,1 (Runs 1-10) | trapen,0 (Runs 11-20)'
    } else if (tab === 'EXP-6') {
      const scale = parseFloat(exp6Level)
      const subLabel = exp6Sub === '6A' ? 'Kp1' : exp6Sub === '6B' ? 'Ki1' : 'Kd1'
      desc = `Analyze the variation of gain ${subLabel} by ${exp6Level}x baseline. Baseline gains are re-captured at sequence start and restored afterwards. Locks: tden=1, trapen=1, all FF on.`
      cmds = `${subLabel.toLowerCase()},${(subLabel === 'Kp1' ? baseKp * scale : subLabel === 'Ki1' ? baseKi * scale : baseKd * scale).toFixed(3)}`
      activeGains = `Kp1=${(exp6Sub === '6A' ? baseKp * scale : baseKp).toFixed(3)}, Ki1=${(exp6Sub === '6B' ? baseKi * scale : baseKi).toFixed(3)}, Kd1=${(exp6Sub === '6C' ? baseKd * scale : baseKd).toFixed(3)}`
    }

    return { desc, cmds, activeGains }
  }

  const { desc: paramDesc, cmds: paramCmds, activeGains: paramGains } = getParamDescription()
  const currentExp = EXPERIMENTS.find(e => e.id === activeTab)
  const totalRuns = computeTotalRuns(activeTab)
  const sequenceActive = state !== 'idle' && state !== 'complete'

  return (
    <div className="flex h-screen bg-hmi-bg text-hmi-text overflow-hidden">
      {/* Sidebar navigation */}
      <aside className="w-64 shrink-0 border-r border-hmi-grid bg-hmi-panel flex flex-col justify-between">
        <div>
          <div className="px-4 py-4 border-b border-hmi-grid flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-hmi-bg border border-hmi-grid flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                <path d="M12 3L3 8.5V15.5L12 21L21 15.5V8.5L12 3Z" stroke="#2196F3" strokeWidth={1.5} strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-hmi-text">SCARA Robot</p>
              <p className="text-[10px] text-hmi-muted uppercase tracking-wider font-semibold">Experiment Automation</p>
            </div>
          </div>

          <nav className="p-2 space-y-1">
            {EXPERIMENTS.map(e => (
              <button
                key={e.id}
                disabled={sequenceActive}
                onClick={() => {
                  setActiveTab(e.id)
                  setResults([])
                  setSummary(null)
                }}
                className={cn(
                  'w-full text-left px-3 py-2 rounded text-xs font-medium transition-colors flex items-center justify-between',
                  activeTab === e.id
                    ? 'bg-hmi-tab-active text-hmi-text border-l-2 border-hmi-ideal'
                    : 'text-hmi-muted hover:bg-hmi-grid/30 hover:text-hmi-text',
                  sequenceActive && 'opacity-50 cursor-not-allowed'
                )}
              >
                <span>{e.id}: {e.name}</span>
                {e.id === activeTab && <span className="w-1.5 h-1.5 rounded-full bg-hmi-ideal" />}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-3 border-t border-hmi-grid flex flex-col gap-2">
          <a
            href="/"
            className={cn(
              "w-full text-center text-xs py-1.5 rounded border border-hmi-grid text-hmi-muted hover:text-hmi-text hover:border-hmi-grid/80 transition-colors",
              state !== 'idle' && 'opacity-50 cursor-not-allowed pointer-events-none'
            )}
          >
            ← Back to HMI
          </a>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-hmi-panel border-b border-hmi-grid px-6 h-12 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold uppercase tracking-wider text-hmi-text">{currentExp?.name} Automation</span>
            <span className="text-xs text-hmi-muted">({currentExp?.id})</span>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <CommandPaletteTrigger />
            <Badge className={`${online ? 'bg-hmi-ok text-white' : 'bg-hmi-off text-hmi-muted'} text-[10px] px-1.5 py-0 font-normal`}>
              {online ? '● Online' : '○ Offline'}
            </Badge>

            <Badge className={cn(
              'text-[10px] px-1.5 py-0 font-normal uppercase',
              serialStatus === 'connected' ? 'bg-hmi-ok/20 text-hmi-ok border border-hmi-ok/30' : 'bg-hmi-off text-hmi-muted border border-hmi-grid'
            )}>
              {serialStatus === 'connected' ? `Connected: ${hmiState.portName || 'Serial'}` : `Disconnected`}
            </Badge>

            {serialStatus === 'connected' ? (
              <Button variant="outline" size="sm" className="h-6 px-2.5 text-[11px] font-semibold" onClick={() => serial.disconnect()}>
                Disconnect
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="h-6 px-2.5 text-[11px] font-semibold" onClick={() => serial.connect()}>
                Connect
              </Button>
            )}

            <div className="flex items-center pl-3 border-l border-hmi-grid/60 shrink-0">
              {estopped ? (
                <Button
                  variant="resume"
                  size="sm"
                  className="h-7 px-3 text-xs font-bold tracking-wide animate-pulse"
                  onClick={() => serial.sendCommand('resume')}
                >
                  🔄 RESUME
                </Button>
              ) : (
                <Button
                  variant="estop"
                  size="sm"
                  className="h-7 px-3 text-xs font-bold tracking-wide"
                  onClick={() => serial.sendCommand('estop')}
                >
                  🛑 E-STOP
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Content panel */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Abort reason banner */}
          {abortReason && (
            <div className="bg-hmi-rec-on/10 border border-hmi-rec-on/40 rounded-lg p-3 flex items-center gap-3">
              <span className="text-base">🛑</span>
              <div>
                <p className="text-xs font-bold text-hmi-rec-on uppercase tracking-wider">Sequence Aborted</p>
                <p className="text-[11px] text-hmi-text">{abortReason}</p>
              </div>
            </div>
          )}

          {/* Sub-tabs specific configurations */}
          {activeTab === 'EXP-4' && (
            <div className="bg-hmi-panel border border-hmi-grid rounded-lg p-3 flex items-center justify-between">
              <span className="text-xs font-bold text-hmi-muted uppercase">Sudut Kemiringan (Tilt Alpha Deg):</span>
              <div className="flex gap-2">
                {(['0', '15', '30', '45'] as const).map(a => (
                  <Button
                    key={a}
                    size="sm"
                    variant={exp4Alpha === a ? 'default' : 'outline'}
                    disabled={sequenceActive}
                    onClick={() => { setExp4Alpha(a); setResults([]); setSummary(null); }}
                    className="h-7 text-xs font-semibold px-4"
                  >
                    α = {a}°
                  </Button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'EXP-6' && (
            <div className="bg-hmi-panel border border-hmi-grid rounded-lg p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-hmi-muted uppercase">Sub-Eksperimen PID:</span>
                <div className="flex gap-2">
                  {(['6A', '6B', '6C'] as const).map(sub => (
                    <Button
                      key={sub}
                      size="sm"
                      variant={exp6Sub === sub ? 'default' : 'outline'}
                      disabled={sequenceActive}
                      onClick={() => { setExp6Sub(sub); setResults([]); setSummary(null); }}
                      className="h-7 text-xs font-semibold px-4"
                    >
                      {sub === '6A' ? '6A: Kp1 (Proportional)' : sub === '6B' ? '6B: Ki1 (Integral)' : '6C: Kd1 (Derivative)'}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-hmi-grid/50 pt-3">
                <span className="text-xs font-bold text-hmi-muted uppercase">Level Scaling Gain J1:</span>
                <div className="flex gap-2">
                  {(['0.5', '1.0', '1.5'] as const).map(lvl => (
                    <Button
                      key={lvl}
                      size="sm"
                      variant={exp6Level === lvl ? 'default' : 'outline'}
                      disabled={sequenceActive}
                      onClick={() => { setExp6Level(lvl); setResults([]); setSummary(null); }}
                      className="h-7 text-xs font-semibold px-4"
                    >
                      {lvl}x Baseline
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Description & Parameter Display */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-hmi-panel border-hmi-grid col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-hmi-ideal">Parameters & Execution Plan</CardTitle>
                <CardDescription className="text-xs text-hmi-muted">
                  {mounted ? paramDesc : 'Evaluate Tracking Differentiator filter performance for J1 & J2'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between border-b border-hmi-grid pb-1">
                  <span className="text-hmi-muted">Serial Commands:</span>
                  <span className="font-mono text-hmi-text font-bold">
                    {mounted ? paramCmds : 'tden,1'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-hmi-muted">Applied Gains:</span>
                  <span className="font-mono text-hmi-text font-bold">
                    {mounted ? paramGains : 'Kp1=0.60, Ki1=0.05, Kd1=0.07'}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-hmi-panel border-hmi-grid flex flex-col justify-between">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-hmi-text">Start Sequence</CardTitle>
                <CardDescription className="text-xs text-hmi-muted">Run automated trajectory loop.</CardDescription>
              </CardHeader>
              <CardContent className="pb-4 flex flex-col gap-3">
                {state === 'idle' || state === 'complete' ? (
                  <Button
                    onClick={startSequence}
                    disabled={serialStatus !== 'connected'}
                    className="w-full bg-hmi-ok hover:bg-hmi-ok-hover text-white font-bold text-xs"
                  >
                    <Play className="w-3.5 h-3.5 mr-2" />
                    ▶ Start Experiment
                  </Button>
                ) : (
                  <Button
                    onClick={() => stopSequence()}
                    className="w-full bg-hmi-estop hover:bg-hmi-estop-hover text-white font-bold text-xs animate-pulse"
                  >
                    <Square className="w-3.5 h-3.5 mr-2" />
                    ⏹ Stop Experiment
                  </Button>
                )}

                {/* Cooldown Timer countdown */}
                {state === 'cooldown' && (
                  <div className="flex items-center justify-center gap-3 bg-hmi-rec-off/40 border border-hmi-grid rounded-lg p-3 mt-1">
                    <div className="relative flex items-center justify-center w-12 h-12 shrink-0">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="24" cy="24" r="20" className="stroke-hmi-grid fill-transparent" strokeWidth="2.5" />
                        <circle
                          cx="24" cy="24" r="20"
                          className="stroke-hmi-warn fill-transparent transition-all duration-1005 ease-linear"
                          strokeWidth="2.5"
                          strokeDasharray={125.6}
                          strokeDashoffset={125.6 - (cooldownTime / COOLDOWN_S) * 125.6}
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="absolute text-[10px] font-bold text-hmi-warn">{cooldownTime}s</span>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-[11px] font-bold text-hmi-warn uppercase tracking-wider animate-pulse">Motor Cooldown</p>
                      <p className="text-[9px] text-hmi-muted leading-tight">Waiting for motor to rest briefly</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Preflight checklist */}
          {preflightChecks.length > 0 && state !== 'idle' && (
            <div className="bg-hmi-panel border border-hmi-grid rounded-lg px-4 py-2.5 flex items-center gap-4 flex-wrap">
              <span className="text-[10px] font-bold text-hmi-muted uppercase tracking-wider">Preflight:</span>
              {preflightChecks.map(c => (
                <span key={c.label} className={cn(
                  'text-[10px] font-mono px-2 py-0.5 rounded border',
                  c.ok === true ? 'text-hmi-ok border-hmi-ok/30 bg-hmi-ok/10' :
                  c.ok === false ? 'text-hmi-rec-on border-hmi-rec-on/30 bg-hmi-rec-on/10' :
                  'text-hmi-muted border-hmi-grid bg-hmi-bg/40'
                )}>
                  {c.ok === true ? '✓' : c.ok === false ? '✗' : '…'} {c.label}
                </span>
              ))}
            </div>
          )}

          {/* Progress Indicator — based on successCount */}
          {state !== 'idle' && (
            <Card className="bg-hmi-panel border-hmi-grid">
              <CardContent className="py-4 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold uppercase text-hmi-muted">
                    Progress: <span className="text-hmi-ok">{successCount}</span> / {totalRuns} runs saved
                  </span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-hmi-muted">Direction:</span>
                    <span className={cn('font-bold capitalize flex items-center gap-1.5', direction === 'forward' ? 'text-hmi-ideal' : 'text-hmi-warn')}>
                      {direction === 'forward' ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                      {direction}
                    </span>
                  </div>
                  <span className="font-mono text-hmi-muted capitalize">
                    State: <span className="text-hmi-text font-bold">{state.replace(/_/g, ' ')}</span>
                  </span>
                  <span className="font-mono text-hmi-muted text-[10px]">
                    Total attempts: <span className="text-hmi-text">{totalAttempts}</span>
                  </span>
                </div>

                {/* Progress bar based on successCount */}
                <div className="w-full h-2 bg-hmi-bg border border-hmi-grid rounded-full overflow-hidden">
                  <div
                    className="h-full bg-hmi-ok transition-all duration-500"
                    style={{ width: `${(successCount / totalRuns) * 100}%` }}
                  />
                </div>

                {/* Secondary attempt bar */}
                <div className="w-full h-1 bg-hmi-bg border border-hmi-grid/50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-hmi-warn/60 transition-all duration-300"
                    style={{ width: `${Math.min((totalAttempts / totalRuns) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-[9px] text-hmi-muted">
                  <span className="inline-block w-2 h-1 bg-hmi-ok rounded mr-1" />successfully saved
                  <span className="inline-block w-2 h-1 bg-hmi-warn/60 rounded ml-3 mr-1" />total attempts
                </p>
              </CardContent>
            </Card>
          )}

          {/* Results Summary and Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Status log terminal */}
            <Card className="bg-hmi-panel border-hmi-grid flex flex-col h-80 overflow-hidden">
              <CardHeader className="py-3 border-b border-hmi-grid">
                <CardTitle className="text-xs font-bold uppercase text-hmi-muted tracking-wider">Live Status Log</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto font-mono text-[11px] p-4 bg-hmi-bg/50 space-y-1">
                {logs.length === 0 ? (
                  <div className="text-hmi-muted italic">Experiment status logs will appear here...</div>
                ) : (
                  logs.map((log, idx) => (
                    <div key={idx} className="flex gap-3 leading-relaxed">
                      <span className="text-hmi-muted shrink-0 select-none">[{log.time}]</span>
                      <span className="text-hmi-text break-all">{log.text}</span>
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </CardContent>
            </Card>

            {/* Run results cards */}
            <Card className="bg-hmi-panel border-hmi-grid flex flex-col h-80 overflow-hidden">
              <CardHeader className="py-3 border-b border-hmi-grid justify-between flex flex-row items-center">
                <CardTitle className="text-xs font-bold uppercase text-hmi-muted tracking-wider">
                  Run Results ({results.filter(r => r.status !== 'failed').length} ok / {results.length} total)
                </CardTitle>
                {state === 'complete' && summary && (
                  <div className="text-[10px] text-hmi-muted bg-hmi-bg border border-hmi-grid px-2 py-0.5 rounded font-mono">
                    MATE: {summary.meanMate.toFixed(2)}±{summary.stdMate.toFixed(2)} | MCTE: {summary.meanMcte.toFixed(2)}±{summary.stdMcte.toFixed(2)}
                  </div>
                )}
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-4 space-y-2 bg-hmi-bg/20">
                {results.length === 0 ? (
                  <div className="text-hmi-muted italic text-xs text-center py-12">No run results recorded yet.</div>
                ) : (
                  results.map((res, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'border rounded-lg p-2.5 flex items-center justify-between text-xs transition-all duration-300',
                        res.status === 'ok' ? 'bg-hmi-panel border-hmi-grid' :
                        res.status === 'retrying' ? 'bg-hmi-panel border-hmi-warn/30' :
                        'bg-hmi-panel border-hmi-rec-on/30'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px]',
                          res.status === 'ok' ? 'bg-hmi-ok/10 text-hmi-ok border border-hmi-ok/30' :
                          res.status === 'retrying' ? 'bg-hmi-warn/10 text-hmi-warn border border-hmi-warn/30' :
                          'bg-hmi-rec-on/10 text-hmi-rec-on border border-hmi-rec-on/30'
                        )}>
                          {res.status !== 'failed' ? `#${res.successIndex}` : '✗'}
                        </div>
                        <div className="flex flex-col">
                          <span className="capitalize font-medium text-hmi-text">{res.direction}</span>
                          <span className="text-[9px] text-hmi-muted">attempt #{res.attemptNumber}</span>
                        </div>
                      </div>

                      {res.status !== 'failed' ? (
                        <div className="flex gap-3 font-mono text-[10px] flex-wrap justify-end">
                          <div>
                            <span className="text-hmi-muted">MATE:</span>{' '}
                            <span className="font-bold text-hmi-ideal">{res.mate.toFixed(3)} mm</span>
                          </div>
                          <div>
                            <span className="text-hmi-muted">MCTE:</span>{' '}
                            <span className="font-bold text-hmi-ideal">{res.mcte.toFixed(3)} mm</span>
                          </div>
                          <div>
                            <span className="text-hmi-muted">Move:</span>{' '}
                            <span className="font-bold text-hmi-text">{Math.round(res.moveDuration)} ms</span>
                          </div>
                          {res.sigmaHold != null && (
                            <div>
                              <span className="text-hmi-muted">σθ1:</span>{' '}
                              <span className="font-bold text-hmi-text">{(res.sigmaHold * 1000).toFixed(3)} mrad</span>
                            </div>
                          )}
                          {res.eSs != null && (
                            <div>
                              <span className="text-hmi-muted">e_ss:</span>{' '}
                              <span className="font-bold text-hmi-text">{res.eSs.toFixed(3)} mm</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="font-bold text-hmi-rec-on uppercase font-mono text-[10px]">FAILED</span>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

          </div>

        </div>
      </main>
    </div>
  )
}

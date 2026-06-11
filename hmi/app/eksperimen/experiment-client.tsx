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

type State = 'idle' | 'waiting_for_ready' | 'positioning' | 'running' | 'cooldown' | 'complete'

interface RunResultCard {
  attemptNumber: number
  successIndex: number
  direction: 'forward' | 'return'
  mate: number
  mcte: number
  settleTime: number
  status: 'ok' | 'retrying' | 'failed'
}

const EXPERIMENTS = [
  { id: 'EXP-1', name: 'TD Filter', desc: 'Evaluasi performa filter Tracking Differentiator J1 & J2' },
  { id: 'EXP-2', name: 'Inertia Comp', desc: 'Uji kontribusi kompensasi inersia dynamic model feedforward' },
  { id: 'EXP-3', name: 'Coriolis Comp', desc: 'Uji kontribusi kompensasi gaya Coriolis & Centrifugal' },
  { id: 'EXP-4', name: 'Gravity Comp', desc: 'Uji kompensasi gaya gravitasi pada berbagai sudut kemiringan (tilt)' },
  { id: 'EXP-5', name: 'Trap Profile', desc: 'Evaluasi profil trapesium (Trapezoidal trajectory profile) vs raw' },
  { id: 'EXP-6', name: 'PID Variation', desc: 'Uji performa dengan variasi gain proporsional, integral, dan derivatif' },
] as const

// ─── Shared Direction Helper ────────────────────────────────────────────────
// successCount is 1-based (the upcoming run's target success index)
// For EXP-4: 3 runs per condition (6 total), so indexInCond cycles 1-3 then 1-3
// For EXP-6: 5 runs per condition (10 total), cycle 1-5 then 1-5 then 1-5 (x3 subs×3 levels = actually 10 per sub-exp)
// For standard: 10 runs per condition (20 total), cycle 1-10 then 1-10
function computeIndexInCond(successCount: number, tab: string): number {
  // successCount is 1-based index of the next success slot we are filling
  if (tab === 'EXP-4') {
    const condSize = 3
    return ((successCount - 1) % condSize) + 1
  } else if (tab === 'EXP-6') {
    const condSize = 5
    return ((successCount - 1) % condSize) + 1
  } else {
    const condSize = 10
    return ((successCount - 1) % condSize) + 1
  }
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
  
  // Stats summary
  const [summary, setSummary] = useState<{ meanMate: number; stdMate: number; meanMcte: number; stdMcte: number } | null>(null)

  const [mounted, setMounted] = useState(false)
  // Capture baseline gains from context on mount or when gains are first received
  const [baseGains, setBaseGains] = useState<{ kp1: number; ki1: number; kd1: number } | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (gains && !baseGains) {
      setBaseGains({ kp1: gains.kp1, ki1: gains.ki1, kd1: gains.kd1 })
    }
  }, [gains, baseGains])

  // Helper to add timestamped status logs
  const addLog = useCallback((text: string) => {
    const time = new Date().toLocaleTimeString('id-ID', { hour12: false })
    setLogs(prev => [...prev, { time, text }])
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
      addLog(`🔌 Koneksi online terdeteksi! Mensinkronisasikan ${queue.length} run yang tertunda ke database...`)
      toast.info(`Syncing ${queue.length} offline runs to Turso...`)

      const failedQueue: any[] = []
      for (const item of queue) {
        addLog(`Sinkronisasi run ${item.run.id}...`)
        const res = await saveRun(item.run, item.metrics, item.samples, false)
        if (res.ok) {
          addLog(`✓ Run ${item.run.id} berhasil sinkron.`)
        } else {
          addLog(`❌ Gagal sinkron run ${item.run.id}.`)
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
  const isTrajectoryRunningRef = useRef(false)
  const isProcessingRef = useRef(false)    // guard: prevents double processAndSaveRun
  const activeTabRef = useRef(activeTab)
  const exp4AlphaRef = useRef(exp4Alpha)
  const exp6SubRef = useRef(exp6Sub)
  const exp6LevelRef = useRef(exp6Level)
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null)
  
  // Telemetry buffer refs
  const accumulatedDRef = useRef<any[]>([])
  const accumulatedFRef = useRef<any[]>([])
  const accumulatedERef = useRef<any[]>([])
  const accumulatedTRef = useRef<any[]>([])
  const lastSeenDTimeRef = useRef<number>(0)
  
  const mPacketReceivedRef = useRef(false)
  const mPacketTimeRef = useRef<number>(0)
  
  const echoCommandRef = useRef<string | null>(null)
  const echoTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Sync state values to refs
  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { successCountRef.current = successCount }, [successCount])
  useEffect(() => { totalAttemptsRef.current = totalAttempts }, [totalAttempts])
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
  useEffect(() => { exp4AlphaRef.current = exp4Alpha }, [exp4Alpha])
  useEffect(() => { exp6SubRef.current = exp6Sub }, [exp6Sub])
  useEffect(() => { exp6LevelRef.current = exp6Level }, [exp6Level])

  // Scroll status logs to bottom
  const logsEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Custom function to find closest sample by timestamp
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
    return closest
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
    return closest
  }

  // Stop sequence and reset
  const stopSequence = useCallback((reason = 'Sequence stopped by user') => {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current)
    if (echoTimeoutRef.current) clearTimeout(echoTimeoutRef.current)
    
    isTrajectoryRunningRef.current = false
    isProcessingRef.current = false
    runRetryCountRef.current = 0
    runNeedRetryRef.current = false
    serial.sendCommand('estop').catch(() => {})
    setState(prev => {
      stateRef.current = 'idle'
      return 'idle'
    })
    addLog(`⚠️ ${reason}`)
    toast.warning(reason)
  }, [serial, addLog])

  // Watch serial status changes
  useEffect(() => {
    if (serialStatus === 'disconnected' && stateRef.current !== 'idle' && stateRef.current !== 'complete') {
      stopSequence('Serial disconnected! Sequence aborted.')
    }
  }, [serialStatus, stopSequence])

  // Sequence state steps executor — uses successCountRef to determine direction
  const executeRunStep = useCallback(async () => {
    const nextSuccessSlot = successCountRef.current + 1  // 1-based index of the run we want to capture
    const tab = activeTabRef.current
    const alpha = exp4AlphaRef.current
    const sub6 = exp6SubRef.current
    const level6 = exp6LevelRef.current

    const totalRuns = tab === 'EXP-4' ? 6 : (tab === 'EXP-6' ? 10 : 20)

    const isForward = computeIsForward(nextSuccessSlot, tab)
    const isConditionA = computeIsConditionA(nextSuccessSlot, tab)
    const runDir = isForward ? 'forward' : 'return'
    setDirection(runDir)

    // Increment attempt counter
    setTotalAttempts(prev => {
      totalAttemptsRef.current = prev + 1
      return prev + 1
    })

    // Clear telemetry buffers
    accumulatedDRef.current = []
    accumulatedFRef.current = []
    accumulatedERef.current = []
    accumulatedTRef.current = []
    mPacketReceivedRef.current = false
    isProcessingRef.current = false

    addLog(`-------------------- RUN (success ${successCountRef.current}/${totalRuns - 1}, attempt ${totalAttemptsRef.current}) --------------------`)
    addLog(`Direction: ${runDir.toUpperCase()} | Slot success berikutnya: #${nextSuccessSlot}`)

    // 1. Determine setup commands based on condition
    const commands: string[] = []
    if (tab === 'EXP-1') {
      commands.push(isConditionA ? 'tden,1' : 'tden,0')
    } else if (tab === 'EXP-2') {
      commands.push(isConditionA ? 'ffi,1.0' : 'ffi,0.0')
    } else if (tab === 'EXP-3') {
      commands.push(isConditionA ? 'ffc,1.0' : 'ffc,0.0')
    } else if (tab === 'EXP-4') {
      if (isConditionA) {
        commands.push(`atilt,${alpha}`)
        commands.push('ffg,1.0')
      } else {
        commands.push('ffg,0.0')
      }
    } else if (tab === 'EXP-5') {
      commands.push(isConditionA ? 'trapen,1' : 'trapen,0')
    } else if (tab === 'EXP-6') {
      const scale = parseFloat(level6)
      const baseKp = baseGains?.kp1 ?? gains?.kp1 ?? 0.60
      const baseKi = baseGains?.ki1 ?? gains?.ki1 ?? 0.05
      const baseKd = baseGains?.kd1 ?? gains?.kd1 ?? 0.07
      
      if (sub6 === '6A') {
        commands.push(`kp1,${(baseKp * scale).toFixed(3)}`)
      } else if (sub6 === '6B') {
        commands.push(`ki1,${(baseKi * scale).toFixed(3)}`)
      } else if (sub6 === '6C') {
        commands.push(`kd1,${(baseKd * scale).toFixed(3)}`)
      }
    }

    // Send setup commands ONLY ONCE before the first run of the condition block
    const indexInCond = computeIndexInCond(nextSuccessSlot, tab)
    const isFirstRunOfCondition = indexInCond === 1

    if (isFirstRunOfCondition && commands.length > 0) {
      try {
        setState('waiting_for_ready')
        stateRef.current = 'waiting_for_ready'
        for (const cmd of commands) {
          addLog(`Sending setup command: ${cmd}`)
          await serial.sendCommand(cmd)
        }
        
        echoCommandRef.current = commands[commands.length - 1]

        if (echoTimeoutRef.current) clearTimeout(echoTimeoutRef.current)
        echoTimeoutRef.current = setTimeout(() => {
          addLog('⚠️ Command echo timeout (3s). Proceeding anyway...')
          proceedToPositioning(isForward)
        }, 3000)

      } catch (err) {
        addLog(`❌ Failed to send setup commands: ${err}`)
        stopSequence('Serial communication failure.')
      }
    } else {
      proceedToPositioning(isForward)
    }

    function proceedToPositioning(fwd: boolean) {
      if (echoTimeoutRef.current) clearTimeout(echoTimeoutRef.current)
      if (stateRef.current === 'idle') return

      setState('positioning')
      stateRef.current = 'positioning'
      // Forward run starts at p0 (140, 45). Return run starts at pf (60, 155).
      const posX = fwd ? 140 : 60
      const posY = fwd ? 45 : 155
      addLog(`Moving to start position (${posX}, ${posY}) for positioning...`)
      serial.sendCommand(`move,${posX},${posY}`).catch(err => {
        addLog(`❌ Position command failed: ${err}`)
        stopSequence('Serial communication failure.')
      })
    }

  }, [serial, addLog, stopSequence, baseGains, gains])

  // Trigger next run step or finish sequence
  const startCooldown = useCallback(() => {
    setState('cooldown')
    setCooldownTime(5)
    addLog('Entering 5s cooldown phase to let motors rest...')

    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current)
    cooldownTimerRef.current = setInterval(() => {
      setCooldownTime(prev => {
        if (prev <= 1) {
          clearInterval(cooldownTimerRef.current!)
          const tab = activeTabRef.current
          const totalRuns = tab === 'EXP-4' ? 6 : (tab === 'EXP-6' ? 10 : 20)
          
          if (runNeedRetryRef.current) {
            // Retry: direction stays the same (successCount unchanged), just re-attempt
            runNeedRetryRef.current = false
            addLog(`Retrying run after cooldown (successCount still ${successCountRef.current})...`)
            executeRunStep()
          } else {
            // Check if sequence is complete based on successCount
            if (successCountRef.current >= totalRuns) {
              setState('complete')
              stateRef.current = 'complete'
              addLog('🎉 Experiment sequence completed successfully!')

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
              executeRunStep()
            }
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [addLog, executeRunStep])

  // Handle run save/recording failure
  const handleSaveFailure = useCallback((reason: string) => {
    isTrajectoryRunningRef.current = false
    isProcessingRef.current = false
    addLog(`❌ Run failed: ${reason}`)
    
    if (runRetryCountRef.current < 3) {
      runRetryCountRef.current += 1
      runNeedRetryRef.current = true
      addLog(`⚠️ Run gagal. Retry attempt ${runRetryCountRef.current}/3 setelah cooldown...`)
      toast.warning(`Run failed. Retrying (Attempt ${runRetryCountRef.current}/3)...`)
    } else {
      addLog(`❌ Run gagal setelah 3 percobaan. Pindah ke run berikutnya (sukses slot tidak berubah).`)
      toast.error(`Run failed after 3 attempts. Moving on without incrementing success count.`)
      runRetryCountRef.current = 0
      runNeedRetryRef.current = false
      
      // Record failed card (success slot stays at current successCount, not incremented)
      const cardResult: RunResultCard = {
        attemptNumber: totalAttemptsRef.current,
        successIndex: successCountRef.current,
        direction: direction,
        mate: 0,
        mcte: 0,
        settleTime: 0,
        status: 'failed',
      }
      setResults(prev => [...prev, cardResult])
      // NOTE: We do NOT increment successCount here because run failed.
      // The next executeRunStep will retry the same success slot.
    }
    
    startCooldown()
  }, [direction, startCooldown, addLog])

  // Save current recorded run
  const processAndSaveRun = useCallback(async () => {
    // Guard against double-invocation (race condition)
    if (isProcessingRef.current) {
      addLog('⚠️ processAndSaveRun called while already processing, skipping duplicate.')
      return
    }
    isProcessingRef.current = true
    isTrajectoryRunningRef.current = false
    setState('running')
    addLog('Processing telemetry samples...')

    const dSamples = accumulatedDRef.current
    const fSamples = accumulatedFRef.current
    const eSamples = accumulatedERef.current
    const tSamples = accumulatedTRef.current

    if (dSamples.length === 0) {
      addLog('❌ Error: No telemetry samples captured during the trajectory!')
      handleSaveFailure('No telemetry samples')
      return
    }

    addLog(`Captured ${dSamples.length} samples. Aligning datasets...`)

    // Align samples by matching timestamps
    const alignedSamples = dSamples.map(d => {
      const f = findClosest(fSamples, d.t)
      const e = findClosest(eSamples, d.t)
      const tPt = findClosestT(tSamples, d.t)

      return {
        tMs: d.t,
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

    // Calculate metrics
    const N = alignedSamples.length
    const ux = -80 / 136
    const uy = 110 / 136
    const uperp_x = 110 / 136
    const uperp_y = 80 / 136

    let sumAte = 0, sumSqAte = 0
    let sumCte = 0, sumSqCte = 0, maxCte = 0
    let sumEef = 0, sumSqEef = 0, maxEef = 0
    let sumJ1 = 0, sumSqJ1 = 0, maxJ1 = -Infinity, minJ1 = Infinity
    let sumJ2 = 0, sumSqJ2 = 0, maxJ2 = -Infinity, minJ2 = Infinity

    for (const s of alignedSamples) {
      const dx = (s.xActual ?? 0) - (s.xDesired ?? 0)
      const dy = (s.yActual ?? 0) - (s.yDesired ?? 0)

      const ate = dx * ux + dy * uy
      const cte = Math.abs(dx * uperp_x + dy * uperp_y)
      const eef = Math.sqrt(dx * dx + dy * dy)

      const ej1 = Math.abs((s.theta1 ?? 0) - (s.theta1D ?? 0))
      const ej2 = Math.abs((s.theta2 ?? 0) - (s.theta2D ?? 0))

      sumAte += ate; sumSqAte += ate * ate
      sumCte += cte; sumSqCte += cte * cte
      if (cte > maxCte) maxCte = cte
      sumEef += eef; sumSqEef += eef * eef
      if (eef > maxEef) maxEef = eef
      sumJ1 += ej1; sumSqJ1 += ej1 * ej1
      if (ej1 > maxJ1) maxJ1 = ej1
      if (ej1 < minJ1) minJ1 = ej1
      sumJ2 += ej2; sumSqJ2 += ej2 * ej2
      if (ej2 > maxJ2) maxJ2 = ej2
      if (ej2 < minJ2) minJ2 = ej2
    }

    const mate_mean = sumAte / N
    const mate_rms = Math.sqrt(sumSqAte / N)
    const mate_max = Math.max(...alignedSamples.map(s => {
      const dx = (s.xActual ?? 0) - (s.xDesired ?? 0)
      const dy = (s.yActual ?? 0) - (s.yDesired ?? 0)
      return Math.abs(dx * ux + dy * uy)
    }))
    const mcte_mean = sumCte / N
    const mcte_rms = Math.sqrt(sumSqCte / N)
    const mcte_max = maxCte
    const eef_error_mean = sumEef / N
    const eef_error_rms = Math.sqrt(sumSqEef / N)
    const eef_error_max = maxEef
    const joint1_error_rms = Math.sqrt(sumSqJ1 / N)
    const joint2_error_rms = Math.sqrt(sumSqJ2 / N)
    const settle_time_ms = Date.now() - mPacketTimeRef.current
    const final_eef_error = (() => {
      const last = alignedSamples[alignedSamples.length - 1]
      const dx = (last.xActual ?? 0) - (last.xDesired ?? 0)
      const dy = (last.yActual ?? 0) - (last.yDesired ?? 0)
      return Math.sqrt(dx * dx + dy * dy)
    })()

    // Build database payloads
    const runId = generateRunId()

    const tab = activeTabRef.current
    const alpha = exp4AlphaRef.current
    const sub6 = exp6SubRef.current
    const level6 = exp6LevelRef.current

    // The success slot this run will fill
    const nextSuccessSlot = successCountRef.current + 1
    const isForward = computeIsForward(nextSuccessSlot, tab)
    const isConditionA = computeIsConditionA(nextSuccessSlot, tab)

    let expId: string = tab
    let expName: string = EXPERIMENTS.find(e => e.id === tab)?.name ?? tab
    if (tab === 'EXP-4') {
      expId = `EXP-4-alpha${alpha}`
      expName = `EXP-4 (Gravity Comp Tilt ${alpha}°)`
    } else if (tab === 'EXP-6') {
      expId = `EXP-${sub6}-${level6}x`
      expName = `EXP-${sub6} (${sub6 === '6A' ? 'Kp1' : sub6 === '6B' ? 'Ki1' : 'Kd1'} ${level6}x)`
    }

    let ffg = gains?.ffGravity ? 1 : 0
    let ffi = gains?.ffInertia ? 1 : 0
    let ffc = gains?.ffCoriolis ? 1 : 0
    let tden = hmiState.params?.tdEnabled ? 1 : 0
    let trap = hmiState.params?.trapEnabled ? 1 : 0

    if (tab === 'EXP-1') { tden = isConditionA ? 1 : 0 }
    else if (tab === 'EXP-2') { ffi = isConditionA ? 1 : 0 }
    else if (tab === 'EXP-3') { ffc = isConditionA ? 1 : 0 }
    else if (tab === 'EXP-4') { ffg = isConditionA ? 1 : 0 }
    else if (tab === 'EXP-5') { trap = isConditionA ? 1 : 0 }

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
      kp1: (() => {
        const baseKp = baseGains?.kp1 ?? gains?.kp1 ?? 0.60
        if (tab === 'EXP-6' && sub6 === '6A') return baseKp * parseFloat(level6)
        return baseKp
      })(),
      ki1: (() => {
        const baseKi = baseGains?.ki1 ?? gains?.ki1 ?? 0.05
        if (tab === 'EXP-6' && sub6 === '6B') return baseKi * parseFloat(level6)
        return baseKi
      })(),
      kd1: (() => {
        const baseKd = baseGains?.kd1 ?? gains?.kd1 ?? 0.07
        if (tab === 'EXP-6' && sub6 === '6C') return baseKd * parseFloat(level6)
        return baseKd
      })(),
      kp2: gains?.kp2 ?? 1.0,
      ki2: gains?.ki2 ?? 0.0,
      kd2: gains?.kd2 ?? 0.0,
      p0X: 140.0,
      p0Y: 45.0,
      pfX: 60.0,
      pfY: 155.0,
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
      settleTimeMs: settle_time_ms,
      finalEefError: final_eef_error,
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
        settleTime: settle_time_ms,
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
          addLog('❌ Database save failed after all retries. Continuing sequence.')
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
      settleTime: settle_time_ms,
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
      // Failed save: trigger save failure handler (which will retry the same slot)
      isProcessingRef.current = false
      handleSaveFailure('Database save failed after all retries')
      return
    }

    isProcessingRef.current = false
    startCooldown()

  }, [gains, hmiState.params, direction, addLog, startCooldown, handleSaveFailure])

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

    // 1. Verify Command Echo (in waiting_for_ready state)
    if (stateRef.current === 'waiting_for_ready' && echoCommandRef.current) {
      const isCmdEcho = trimmed.includes(echoCommandRef.current.split(',')[0])
      if (isCmdEcho) {
        addLog(`✓ Received echo confirmation: ${trimmed}`)
        if (echoTimeoutRef.current) clearTimeout(echoTimeoutRef.current)
        
        setTimeout(() => {
          if (stateRef.current === 'waiting_for_ready') {
            setState('positioning')
            stateRef.current = 'positioning'
            // Use successCountRef to derive direction — consistent with executeRunStep
            const nextSuccessSlot = successCountRef.current + 1
            const tab = activeTabRef.current
            const fwd = computeIsForward(nextSuccessSlot, tab)
            const posX = fwd ? 140 : 60
            const posY = fwd ? 45 : 155
            addLog(`Moving to start position (${posX}, ${posY}) for positioning...`)
            serial.sendCommand(`move,${posX},${posY}`).catch(err => {
              addLog(`❌ Position command failed: ${err}`)
              stopSequence('Serial communication failure.')
            })
          }
        }, 150)
      }
    }

    // 2. Capture M-packet (starts trajectory execution)
    if (tag === 'M') {
      if (isTrajectoryRunningRef.current) {
        mPacketReceivedRef.current = true
        mPacketTimeRef.current = Date.now()
        accumulatedDRef.current = []
        accumulatedFRef.current = []
        accumulatedERef.current = []
        accumulatedTRef.current = []
        addLog('✓ M-packet received. Recording telemetry...')
      }
    }

    // 3. Capture S-packet (trajectory settled)
    if (tag === 'S') {
      if (stateRef.current === 'positioning') {
        addLog('✓ S-packet received. Robot settled at start position.')
        
        setTimeout(() => {
          if (stateRef.current === 'positioning') {
            isTrajectoryRunningRef.current = true
            setState('running')
            stateRef.current = 'running'
            // Use successCountRef + computeIsForward for consistent direction
            const nextSuccessSlot = successCountRef.current + 1
            const tab = activeTabRef.current
            const fwd = computeIsForward(nextSuccessSlot, tab)
            const targetX = fwd ? 60 : 140
            const targetY = fwd ? 155 : 45
            addLog(`Executing trajectory: move,${targetX},${targetY}`)
            serial.sendCommand(`move,${targetX},${targetY}`).catch(err => {
              addLog(`❌ Trajectory command failed: ${err}`)
              stopSequence('Serial communication failure.')
            })
          }
        }, 300)
      } else if (isTrajectoryRunningRef.current) {
        if (mPacketReceivedRef.current) {
          addLog('✓ S-packet received. Trajectory run finished.')
          isTrajectoryRunningRef.current = false
          processAndSaveRun()
        } else {
          addLog('⚠️ S-packet received, but M-packet was never seen. Discarding.')
          handleSaveFailure('M-packet missing')
        }
      }
    }

    // 4. Capture Telemetry Samples (D, T, F, E)
    if (isTrajectoryRunningRef.current && mPacketReceivedRef.current) {
      if (tag === 'D') {
        const partsNum = parts.map(Number)
        const t = partsNum[1] || 0
        lastSeenDTimeRef.current = t
        accumulatedDRef.current.push({
          t,
          th1: partsNum[2] ?? 0, th2: partsNum[3] ?? 0,
          th1d: partsNum[4] ?? 0, th2d: partsNum[5] ?? 0,
          dth1: partsNum[6] ?? 0, dth2: partsNum[7] ?? 0,
          dth1d: partsNum[8] ?? 0, dth2d: partsNum[9] ?? 0,
          pwm1: partsNum[10] ?? 0, vff1: partsNum[11] ?? 0,
          th1raw: partsNum[12] ?? 0, th2raw: partsNum[13] ?? 0,
          u1Total: partsNum[14] ?? 0,
        })
      } else if (tag === 'T') {
        const [, xi, yi, xa, ya] = parts.map(Number)
        accumulatedTRef.current.push({
          t_ms: lastSeenDTimeRef.current,
          xi: xi ?? 0, yi: yi ?? 0, xa: xa ?? 0, ya: ya ?? 0,
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
  }, [handleSaveFailure, processAndSaveRun, serial, stopSequence, addLog])

  // Attach serial log listener
  useEffect(() => {
    const handleRx = (e: Event) => {
      const line = (e as CustomEvent<string>).detail
      onLineReceived(line)
    }
    window.addEventListener('hmi_rx', handleRx)
    return () => window.removeEventListener('hmi_rx', handleRx)
  }, [onLineReceived])

  // Start sequence trigger
  const startSequence = () => {
    if (serialStatus !== 'connected') {
      toast.error('Connect serial port before running experiments!')
      return
    }
    setResults([])
    setSummary(null)
    setLogs([])
    setSuccessCount(0)
    setTotalAttempts(0)
    successCountRef.current = 0
    totalAttemptsRef.current = 0
    runRetryCountRef.current = 0
    isProcessingRef.current = false
    
    addLog(`🚀 Starting automated sequence for ${activeTab}...`)
    executeRunStep()
  }

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
      desc = 'Mengevaluasi efek filter Tracking Differentiator (TD) pada feedback loop. J1/J2 TD Bandwidth diletakkan pada parameter td1r/td2r.'
      cmds = 'tden,1 (Runs 1-10, Cond A) | tden,0 (Runs 11-20, Cond B)'
    } else if (tab === 'EXP-2') {
      desc = 'Mengevaluasi kompensasi momen inersia dynamic model. Membandingkan performa inersia feedforward aktif vs non-aktif.'
      cmds = 'ffi,1.0 (Runs 1-10) | ffi,0.0 (Runs 11-20)'
    } else if (tab === 'EXP-3') {
      desc = 'Mengevaluasi kontribusi feedforward kompensasi gaya Coriolis & Centrifugal pada kecepatan tinggi.'
      cmds = 'ffc,1.0 (Runs 1-10) | ffc,0.0 (Runs 11-20)'
    } else if (tab === 'EXP-4') {
      desc = `Mengevaluasi kompensasi gravitasi model pada kemiringan tilt α = ${exp4Alpha}°. Membandingkan ffg aktif (runs 1-3) vs non-aktif (runs 4-6).`
      cmds = `atilt,${exp4Alpha} & ffg,1.0 (Runs 1-3) | ffg,0.0 (Runs 4-6)`
    } else if (tab === 'EXP-5') {
      desc = 'Menguji filter lintasan masukan. Membandingkan Trapezoidal profile (Runs 1-10) vs Raw Step input (Runs 11-20).'
      cmds = 'trapen,1 (Runs 1-10) | trapen,0 (Runs 11-20)'
    } else if (tab === 'EXP-6') {
      const scale = parseFloat(exp6Level)
      const subLabel = exp6Sub === '6A' ? 'Kp1' : exp6Sub === '6B' ? 'Ki1' : 'Kd1'
      desc = `Menganalisis variasi gain ${subLabel} sebesar ${exp6Level}x baseline. Baseline: Kp1=${baseKp.toFixed(2)}, Ki1=${baseKi.toFixed(3)}, Kd1=${baseKd.toFixed(3)}.`
      cmds = `${subLabel.toLowerCase()},${(subLabel === 'Kp1' ? baseKp * scale : subLabel === 'Ki1' ? baseKi * scale : baseKd * scale).toFixed(3)}`
      activeGains = `Kp1=${(exp6Sub === '6A' ? baseKp * scale : baseKp).toFixed(3)}, Ki1=${(exp6Sub === '6B' ? baseKi * scale : baseKi).toFixed(3)}, Kd1=${(exp6Sub === '6C' ? baseKd * scale : baseKd).toFixed(3)}`
    }

    return { desc, cmds, activeGains }
  }

  const { desc: paramDesc, cmds: paramCmds, activeGains: paramGains } = getParamDescription()
  const currentExp = EXPERIMENTS.find(e => e.id === activeTab)
  const totalRuns = activeTab === 'EXP-4' ? 6 : (activeTab === 'EXP-6' ? 10 : 20)

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
              <p className="text-[10px] text-hmi-muted uppercase tracking-wider font-semibold">Otomasi Eksperimen</p>
            </div>
          </div>

          <nav className="p-2 space-y-1">
            {EXPERIMENTS.map(e => (
              <button
                key={e.id}
                disabled={state !== 'idle' && state !== 'complete'}
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
                  (state !== 'idle' && state !== 'complete') && 'opacity-50 cursor-not-allowed'
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
            ← Kembali ke HMI
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
                    disabled={state !== 'idle' && state !== 'complete'}
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
                      disabled={state !== 'idle' && state !== 'complete'}
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
                      disabled={state !== 'idle' && state !== 'complete'}
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
                <CardTitle className="text-sm font-bold text-hmi-ideal">Parameter & Rencana Eksekusi</CardTitle>
                <CardDescription className="text-xs text-hmi-muted">
                  {mounted ? paramDesc : 'Evaluasi performa filter Tracking Differentiator J1 & J2'}
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
                  <span className="text-hmi-muted">Gains Diterapkan:</span>
                  <span className="font-mono text-hmi-text font-bold">
                    {mounted ? paramGains : 'Kp1=0.60, Ki1=0.05, Kd1=0.07'}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-hmi-panel border-hmi-grid flex flex-col justify-between">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-hmi-text">Mulai Sequence</CardTitle>
                <CardDescription className="text-xs text-hmi-muted">Jalankan trajectory loop otomatis.</CardDescription>
              </CardHeader>
              <CardContent className="pb-4 flex flex-col gap-3">
                {state === 'idle' || state === 'complete' ? (
                  <Button
                    onClick={startSequence}
                    disabled={serialStatus !== 'connected'}
                    className="w-full bg-hmi-ok hover:bg-hmi-ok-hover text-white font-bold text-xs"
                  >
                    <Play className="w-3.5 h-3.5 mr-2" />
                    ▶ Mulai Eksperimen
                  </Button>
                ) : (
                  <Button
                    onClick={() => stopSequence()}
                    className="w-full bg-hmi-estop hover:bg-hmi-estop-hover text-white font-bold text-xs animate-pulse"
                  >
                    <Square className="w-3.5 h-3.5 mr-2" />
                    ⏹ Stop Eksperimen
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
                          strokeDashoffset={125.6 - (cooldownTime / 5) * 125.6}
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="absolute text-[10px] font-bold text-hmi-warn">{cooldownTime}s</span>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-[11px] font-bold text-hmi-warn uppercase tracking-wider animate-pulse">Penyejukan Motor</p>
                      <p className="text-[9px] text-hmi-muted leading-tight">Menunggu motor beristirahat sejenak</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Progress Indicator — based on successCount */}
          {state !== 'idle' && (
            <Card className="bg-hmi-panel border-hmi-grid">
              <CardContent className="py-4 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold uppercase text-hmi-muted">
                    Progress: <span className="text-hmi-ok">{successCount}</span> / {totalRuns} run tersimpan
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
                  <span className="inline-block w-2 h-1 bg-hmi-ok rounded mr-1" />sukses tersimpan
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
                  <div className="text-hmi-muted italic">Log status eksperimen akan muncul di sini...</div>
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
                  <div className="text-hmi-muted italic text-xs text-center py-12">Belum ada hasil run yang terekam.</div>
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
                        <div className="flex gap-4 font-mono text-[10px]">
                          <div>
                            <span className="text-hmi-muted">MATE:</span>{' '}
                            <span className="font-bold text-hmi-ideal">{res.mate.toFixed(3)} mm</span>
                          </div>
                          <div>
                            <span className="text-hmi-muted">MCTE:</span>{' '}
                            <span className="font-bold text-hmi-ideal">{res.mcte.toFixed(3)} mm</span>
                          </div>
                          <div>
                            <span className="text-hmi-muted">Settle:</span>{' '}
                            <span className="font-bold text-hmi-text">{res.settleTime} ms</span>
                          </div>
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

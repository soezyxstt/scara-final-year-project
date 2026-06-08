'use client'

import { useState, useEffect, useRef } from 'react'
import { useHMISlow } from '@/lib/hmi-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { checkStraightLineTrajectory, getCurrentPosition } from '@/lib/trajectory-safety'
import { usePathname } from 'next/navigation'

function StatusLED({ status }: { status: 'clean' | 'dirty' | 'waiting' | 'timeout' }) {
  let ledClass = ''
  let statusTooltipText = ''

  switch (status) {
    case 'clean':
      ledClass = 'bg-emerald-500 shadow-[0_0_6px_#10B981]'
      statusTooltipText = 'Synced with hardware'
      break
    case 'dirty':
      ledClass = 'bg-amber-500 shadow-[0_0_6px_#F59E0B]'
      statusTooltipText = 'Modified: unsaved changes'
      break
    case 'waiting':
      ledClass = 'bg-blue-500 animate-pulse shadow-[0_0_6px_#3B82F6]'
      statusTooltipText = 'Applying changes to hardware...'
      break
    case 'timeout':
      ledClass = 'bg-red-500 shadow-[0_0_6px_#EF4444]'
      statusTooltipText = 'No response / Timeout'
      break
  }

  return (
    <Tooltip content={statusTooltipText}>
      <span className={cn("w-1.5 h-1.5 rounded-full transition-all duration-300 shrink-0", ledClass)} />
    </Tooltip>
  )
}

function GainField({
  label,
  name,
  hwValue,
  tooltip,
  isSubmitting,
  disabled,
}: {
  label: string
  name: string
  hwValue: number | undefined
  tooltip: string
  isSubmitting: boolean
  disabled?: boolean
}) {
  const [localValue, setLocalValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [status, setStatus] = useState<'clean' | 'dirty' | 'waiting' | 'timeout'>('clean')
  
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevIsSubmitting = useRef(isSubmitting)

  // Helper to round to 3 decimal places and return string
  const formatValue = (val: number) => {
    return (Math.round(val * 1000) / 1000).toString()
  }

  // 1. Sync from hardware value when clean and not focused
  useEffect(() => {
    if (hwValue !== undefined) {
      const positiveHwValue = Math.max(0, hwValue)
      const formatted = formatValue(positiveHwValue)
      if (status === 'clean' && !isFocused) {
        setLocalValue(formatted)
      } else if (status === 'waiting') {
        const parsed = parseFloat(localValue)
        if (!isNaN(parsed) && Math.abs(parseFloat(formatted) - parsed) < 0.0001) {
          setStatus('clean')
          if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
          }
        }
      }
    }
  }, [hwValue, status, isFocused, localValue])

  // Also sync on initial mount or when clean and focus changes
  useEffect(() => {
    if (!isFocused && status === 'clean' && hwValue !== undefined) {
      setLocalValue(formatValue(Math.max(0, hwValue)))
    }
  }, [isFocused, status, hwValue])

  // 2. Handle when user types
  const handleChange = (val: string) => {
    const cleanedVal = val.replace(/-/g, '')
    // Split at decimal point and limit to 2 decimal places
    const parts = cleanedVal.split('.')
    let limitedVal = cleanedVal
    if (parts.length > 1) {
      limitedVal = parts[0] + '.' + parts[1].substring(0, 3)
    }
    setLocalValue(limitedVal)
    
    const parsed = parseFloat(limitedVal)
    if (isNaN(parsed)) {
      setStatus('dirty')
      return
    }
    
    const positiveHwValue = Math.max(0, hwValue ?? 0)
    const formattedHw = Math.round(positiveHwValue * 1000) / 1000
    if (hwValue !== undefined && Math.abs(formattedHw - parsed) < 0.0001) {
      setStatus('clean')
    } else {
      setStatus('dirty')
    }
    
    // Clear any pending timeout if they start typing again
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  // 3. Handle Form Submission Trigger
  useEffect(() => {
    if (isSubmitting && !prevIsSubmitting.current) {
      if (status === 'dirty') {
        setStatus('waiting')
        
        // Start 1500ms timeout
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
          setStatus('timeout')
          timerRef.current = null
        }, 1500)
      }
    }
    prevIsSubmitting.current = isSubmitting
  }, [isSubmitting, status])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleBlur = () => {
    setIsFocused(false)
    if (status === 'clean' && hwValue !== undefined) {
      setLocalValue(formatValue(Math.max(0, hwValue)))
    }
  }

  const borderClass =
    status === 'timeout'
      ? 'border-red-500 focus-visible:border-red-500 focus-visible:ring-1 focus-visible:ring-red-500'
      : status === 'dirty'
        ? 'border-amber-500 focus-visible:border-amber-500 focus-visible:ring-1 focus-visible:ring-amber-500'
        : status === 'waiting'
          ? 'border-blue-500 focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500'
          : 'border-hmi-grid'

  const glowClass =
    status === 'timeout'
      ? 'shadow-[0_0_5px_rgba(239,68,68,0.25)]'
      : status === 'dirty'
        ? 'shadow-[0_0_5px_rgba(245,158,11,0.25)]'
        : status === 'waiting'
          ? 'shadow-[0_0_5px_rgba(59,130,246,0.3)]'
          : ''

  const textClass = 
    status === 'dirty'
      ? 'text-amber-400 font-semibold'
      : status === 'waiting'
        ? 'text-blue-400 font-semibold animate-pulse'
        : ''

  return (
    <div className="flex flex-col gap-0.5 min-w-[64px]">
      <div className="flex items-center justify-between gap-1">
        <Tooltip content={tooltip}>
          <label className="text-[10px] font-semibold text-hmi-muted cursor-help border-b border-dotted border-hmi-muted/30">
            {label}
          </label>
        </Tooltip>
        {!disabled && <StatusLED status={status} />}
      </div>
      <Input
        type="number"
        step="0.001"
        min={0}
        name={name}
        value={localValue}
        disabled={disabled}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        className={cn(
          "w-16 h-7 text-xs transition-all duration-200 bg-hmi-bg",
          borderClass,
          glowClass,
          textClass,
          disabled && "opacity-50 cursor-not-allowed"
        )}
      />
    </div>
  )
}

export function ControlPanel() {
  const { state, serial, dispatch } = useHMISlow()
  const pathname = usePathname()
  const { currentMove, bootPose, gains } = state
  const activeX = currentMove?.xf ?? bootPose?.x
  const activeY = currentMove?.yf ?? bootPose?.y

  const sendBtnRef = useRef<HTMLButtonElement>(null)

  const [xf, setXf] = useState('')
  const [yf, setYf] = useState('')

  const [xfStatus, setXfStatus] = useState<'clean' | 'dirty' | 'waiting' | 'timeout'>('clean')
  const [yfStatus, setYfStatus] = useState<'clean' | 'dirty' | 'waiting' | 'timeout'>('clean')

  const [isXFocused, setIsXFocused] = useState(false)
  const [isYFocused, setIsYFocused] = useState(false)

  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 1. Sync from active value when clean and not focused
  useEffect(() => {
    if (activeX !== undefined) {
      if (xfStatus === 'clean' && !isXFocused) {
        setXf(activeX.toString())
      } else if (xfStatus === 'waiting') {
        const parsed = parseFloat(xf)
        if (!isNaN(parsed) && Math.abs(activeX - parsed) < 0.0001) {
          setXfStatus('clean')
        }
      }
    }
  }, [activeX, xfStatus, isXFocused, xf])

  useEffect(() => {
    if (activeY !== undefined) {
      if (yfStatus === 'clean' && !isYFocused) {
        setYf(activeY.toString())
      } else if (yfStatus === 'waiting') {
        const parsed = parseFloat(yf)
        if (!isNaN(parsed) && Math.abs(activeY - parsed) < 0.0001) {
          setYfStatus('clean')
        }
      }
    }
  }, [activeY, yfStatus, isYFocused, yf])

  // Sync on focus change
  useEffect(() => {
    if (!isXFocused && xfStatus === 'clean' && activeX !== undefined) {
      setXf(activeX.toString())
    }
  }, [isXFocused, xfStatus, activeX])

  useEffect(() => {
    if (!isYFocused && yfStatus === 'clean' && activeY !== undefined) {
      setYf(activeY.toString())
    }
  }, [isYFocused, yfStatus, activeY])

  // Clear timers when activeX/activeY matches local values
  useEffect(() => {
    if (activeX !== undefined && activeY !== undefined) {
      const parsedX = parseFloat(xf)
      const parsedY = parseFloat(yf)
      const xMatch = !isNaN(parsedX) && Math.abs(activeX - parsedX) < 0.0001
      const yMatch = !isNaN(parsedY) && Math.abs(activeY - parsedY) < 0.0001
      
      if (xMatch && yMatch && moveTimerRef.current) {
        clearTimeout(moveTimerRef.current)
        moveTimerRef.current = null
      }
    }
  }, [activeX, activeY, xf, yf])

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
    }
  }, [])

  // Controlled states for Feedforward
  const [ffInertia, setFfInertia] = useState('0')
  const [ffCoriolis, setFfCoriolis] = useState('0')
  const [ffGravity, setFfGravity] = useState('0')

  const [ffInertiaStatus, setFfInertiaStatus] = useState<'clean' | 'dirty' | 'waiting' | 'timeout'>('clean')
  const [ffCoriolisStatus, setFfCoriolisStatus] = useState<'clean' | 'dirty' | 'waiting' | 'timeout'>('clean')
  const [ffGravityStatus, setFfGravityStatus] = useState<'clean' | 'dirty' | 'waiting' | 'timeout'>('clean')
  const ffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync sliders from hardware (only when clean)
  useEffect(() => {
    if (gains) {
      if (ffInertiaStatus === 'clean') {
        setFfInertia(gains.ffInertia !== undefined ? gains.ffInertia.toString() : '0')
      } else if (ffInertiaStatus === 'waiting') {
        const parsed = parseFloat(ffInertia)
        if (!isNaN(parsed) && Math.abs(gains.ffInertia - parsed) < 0.0001) {
          setFfInertiaStatus('clean')
        }
      }
    }
  }, [gains, ffInertiaStatus, ffInertia])

  useEffect(() => {
    if (gains) {
      if (ffCoriolisStatus === 'clean') {
        setFfCoriolis(gains.ffCoriolis !== undefined ? gains.ffCoriolis.toString() : '0')
      } else if (ffCoriolisStatus === 'waiting') {
        const parsed = parseFloat(ffCoriolis)
        if (!isNaN(parsed) && Math.abs(gains.ffCoriolis - parsed) < 0.0001) {
          setFfCoriolisStatus('clean')
        }
      }
    }
  }, [gains, ffCoriolisStatus, ffCoriolis])

  useEffect(() => {
    if (gains) {
      if (ffGravityStatus === 'clean') {
        setFfGravity(gains.ffGravity !== undefined ? gains.ffGravity.toString() : '0')
      } else if (ffGravityStatus === 'waiting') {
        const parsed = parseFloat(ffGravity)
        if (!isNaN(parsed) && Math.abs(gains.ffGravity - parsed) < 0.0001) {
          setFfGravityStatus('clean')
        }
      }
    }
  }, [gains, ffGravityStatus, ffGravity])

  // Clear timer when all are clean (or not in waiting)
  useEffect(() => {
    if (ffInertiaStatus !== 'waiting' && ffCoriolisStatus !== 'waiting' && ffGravityStatus !== 'waiting' && ffTimerRef.current) {
      clearTimeout(ffTimerRef.current)
      ffTimerRef.current = null
    }
  }, [ffInertiaStatus, ffCoriolisStatus, ffGravityStatus])

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (ffTimerRef.current) clearTimeout(ffTimerRef.current)
    }
  }, [])

  const [localMstep, setLocalMstep] = useState('1')
  const [mstepStatus, setMstepStatus] = useState<'clean' | 'dirty' | 'waiting' | 'timeout'>('clean')
  const mstepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync microstepping from hardware
  useEffect(() => {
    if (gains?.mstep !== undefined) {
      const hwMstepStr = gains.mstep.toString()
      if (mstepStatus === 'clean') {
        setLocalMstep(hwMstepStr)
      } else if (mstepStatus === 'waiting') {
        if (hwMstepStr === localMstep) {
          setMstepStatus('clean')
          if (mstepTimerRef.current) {
            clearTimeout(mstepTimerRef.current)
            mstepTimerRef.current = null
          }
        }
      }
    }
  }, [gains?.mstep, mstepStatus, localMstep])

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (mstepTimerRef.current) clearTimeout(mstepTimerRef.current)
    }
  }, [])

  // Status indicators for forms
  const [moveStatus, setMoveStatus] = useState<'idle' | 'sending' | 'success'>('idle')
  const [j1Status, setJ1Status] = useState<'idle' | 'sending' | 'success'>('idle')
  const [j2Status, setJ2Status] = useState<'idle' | 'sending' | 'success'>('idle')
  const [ffStatus, setFfStatus] = useState<'idle' | 'sending' | 'success'>('idle')

  // Clear preview target on unmount
  useEffect(() => {
    return () => {
      dispatch({ type: 'SET_PREVIEW_TARGET', target: null })
    }
  }, [dispatch])

  // Listen for canvas pick target coordinates
  useEffect(() => {
    if (state.pickedTarget) {
      const { x, y } = state.pickedTarget
      
      // Update inputs (rounded to 1 decimal place)
      setXf(x.toFixed(1))
      setYf(y.toFixed(1))
      
      // Set statuses to dirty
      setXfStatus('dirty')
      setYfStatus('dirty')
      
      // Focus on the Send button so the user can hit Enter immediately
      setTimeout(() => {
        sendBtnRef.current?.focus()
      }, 50)
      
      // Clear picked target from global state so it's not applied repeatedly
      dispatch({ type: 'CLEAR_PICKED_TARGET' })
    }
  }, [state.pickedTarget, dispatch])

  const updatePreview = (xStr: string, yStr: string) => {
    const x = parseFloat(xStr)
    const y = parseFloat(yStr)
    if (!isNaN(x) && !isNaN(y)) {
      dispatch({ type: 'SET_PREVIEW_TARGET', target: { x, y } })
    } else {
      dispatch({ type: 'SET_PREVIEW_TARGET', target: null })
    }
  }

  function send(cmd: string) { return serial.sendCommand(cmd) }

  const handleXChange = (val: string) => {
    setXf(val)
    updatePreview(val, yf)
    const parsed = parseFloat(val)
    if (isNaN(parsed)) {
      setXfStatus('dirty')
      return
    }
    if (activeX !== undefined && Math.abs(activeX - parsed) < 0.0001) {
      setXfStatus('clean')
    } else {
      setXfStatus('dirty')
    }
    if (moveTimerRef.current) {
      clearTimeout(moveTimerRef.current)
      moveTimerRef.current = null
    }
  }

  const handleYChange = (val: string) => {
    setYf(val)
    updatePreview(xf, val)
    const parsed = parseFloat(val)
    if (isNaN(parsed)) {
      setYfStatus('dirty')
      return
    }
    if (activeY !== undefined && Math.abs(activeY - parsed) < 0.0001) {
      setYfStatus('clean')
    } else {
      setYfStatus('dirty')
    }
    if (moveTimerRef.current) {
      clearTimeout(moveTimerRef.current)
      moveTimerRef.current = null
    }
  }

  async function handleMove() {
    const x = parseFloat(xf), y = parseFloat(yf)
    if (!isNaN(x) && !isNaN(y)) {
      const r2 = x * x + y * y
      if (r2 < 45 * 45 || r2 > 170 * 170 || y < 0) {
        alert(`Move Target Rejected: Target (${x}, ${y}) is outside the reachable workspace (45 to 170 mm, Y >= 0).`)
        return
      }

      const currentPos = getCurrentPosition(state)
      const safety = checkStraightLineTrajectory(currentPos, { x, y }, 45, 170)
      if (!safety.isValid) {
        if (safety.reason === 'inner_violation') {
          const minD = safety.minDistance ? safety.minDistance.toFixed(1) : 'unknown'
          alert(`Move Target Rejected: The straight-line path passes through the inner dead zone (passes at ${minD} mm, minimum is 45.0 mm).`)
        } else {
          alert(`Move Target Rejected: Trajectory path is unsafe or goes out of bounds.`)
        }
        return
      }

      setMoveStatus('sending')
      if (xfStatus === 'dirty') setXfStatus('waiting')
      if (yfStatus === 'dirty') setYfStatus('waiting')

      // Start 1500ms timeout
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
      moveTimerRef.current = setTimeout(() => {
        setXfStatus(prev => prev === 'waiting' ? 'timeout' : prev)
        setYfStatus(prev => prev === 'waiting' ? 'timeout' : prev)
        moveTimerRef.current = null
      }, 1500)

      // Clear preview target on successful send
      dispatch({ type: 'SET_PREVIEW_TARGET', target: null })
      await send(`move,${x},${y}`)
      setMoveStatus('success')
      setTimeout(() => setMoveStatus('idle'), 1500)
    }
  }

  async function submitJ1(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const kp = (formData.get('kp1') as string) || (gains?.kp1?.toString() ?? '0')
    const ki = (formData.get('ki1') as string) || (gains?.ki1?.toString() ?? '0')
    const kd = (formData.get('kd1') as string) || (gains?.kd1?.toString() ?? '0')

    setJ1Status('sending')
    await send(`kp1,${kp}`)
    await send(`ki1,${ki}`)
    await send(`kd1,${kd}`)
    await send('getgains')
    setJ1Status('success')
    setTimeout(() => setJ1Status('idle'), 1500)
  }

  async function submitJ2(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const kp = (formData.get('kp2') as string) || (gains?.kp2?.toString() ?? '0')
    const ki = (gains?.ki2?.toString() ?? '0') // ki2 is disabled and won't be in formData, so we fall back to hardware value or '0'
    const kd = (formData.get('kd2') as string) || (gains?.kd2?.toString() ?? '0')

    setJ2Status('sending')
    await send(`kp2,${kp}`)
    await send(`ki2,${ki}`)
    await send(`kd2,${kd}`)
    await send('getgains')
    setJ2Status('success')
    setTimeout(() => setJ2Status('idle'), 1500)
  }

  const handleFfInertiaChange = (val: string) => {
    setFfInertia(val)
    const parsed = parseFloat(val)
    if (isNaN(parsed)) {
      setFfInertiaStatus('dirty')
      return
    }
    if (gains && gains.ffInertia !== undefined && Math.abs(gains.ffInertia - parsed) < 0.0001) {
      setFfInertiaStatus('clean')
    } else {
      setFfInertiaStatus('dirty')
    }
    if (ffTimerRef.current) {
      clearTimeout(ffTimerRef.current)
      ffTimerRef.current = null
    }
  }

  const handleFfCoriolisChange = (val: string) => {
    setFfCoriolis(val)
    const parsed = parseFloat(val)
    if (isNaN(parsed)) {
      setFfCoriolisStatus('dirty')
      return
    }
    if (gains && gains.ffCoriolis !== undefined && Math.abs(gains.ffCoriolis - parsed) < 0.0001) {
      setFfCoriolisStatus('clean')
    } else {
      setFfCoriolisStatus('dirty')
    }
    if (ffTimerRef.current) {
      clearTimeout(ffTimerRef.current)
      ffTimerRef.current = null
    }
  }

  const handleFfGravityChange = (val: string) => {
    setFfGravity(val)
    const parsed = parseFloat(val)
    if (isNaN(parsed)) {
      setFfGravityStatus('dirty')
      return
    }
    if (gains && gains.ffGravity !== undefined && Math.abs(gains.ffGravity - parsed) < 0.0001) {
      setFfGravityStatus('clean')
    } else {
      setFfGravityStatus('dirty')
    }
    if (ffTimerRef.current) {
      clearTimeout(ffTimerRef.current)
      ffTimerRef.current = null
    }
  }

  async function submitFF() {
    setFfStatus('sending')
    if (ffInertiaStatus === 'dirty') setFfInertiaStatus('waiting')
    if (ffCoriolisStatus === 'dirty') setFfCoriolisStatus('waiting')
    if (ffGravityStatus === 'dirty') setFfGravityStatus('waiting')

    // Start 1500ms timeout
    if (ffTimerRef.current) clearTimeout(ffTimerRef.current)
    ffTimerRef.current = setTimeout(() => {
      setFfInertiaStatus(prev => prev === 'waiting' ? 'timeout' : prev)
      setFfCoriolisStatus(prev => prev === 'waiting' ? 'timeout' : prev)
      setFfGravityStatus(prev => prev === 'waiting' ? 'timeout' : prev)
      ffTimerRef.current = null
    }, 1500)

    await send(`ffi,${ffInertia}`)
    await send(`ffc,${ffCoriolis}`)
    await send(`ffg,${ffGravity}`)
    await send('getgains')
    setFfStatus('success')
    setTimeout(() => setFfStatus('idle'), 1500)
  }

  const handleMstepChange = async (v: string) => {
    const hwMstepStr = gains?.mstep?.toString() ?? '1'
    if (v === hwMstepStr) {
      setLocalMstep(v)
      setMstepStatus('clean')
      if (mstepTimerRef.current) {
        clearTimeout(mstepTimerRef.current)
        mstepTimerRef.current = null
      }
      return
    }

    setLocalMstep(v)
    setMstepStatus('waiting')
    
    // Start 1500ms timeout
    if (mstepTimerRef.current) clearTimeout(mstepTimerRef.current)
    mstepTimerRef.current = setTimeout(() => {
      setMstepStatus('timeout')
      mstepTimerRef.current = null
    }, 1500)

    await send(`mstep,${v}`)
    await send('getgains')
  }

  const handleXBlur = () => {
    setIsXFocused(false)
    if (xfStatus === 'clean' && activeX !== undefined) {
      setXf(activeX.toString())
    }
  }

  const handleYBlur = () => {
    setIsYFocused(false)
    if (yfStatus === 'clean' && activeY !== undefined) {
      setYf(activeY.toString())
    }
  }

  const xBorderClass =
    xfStatus === 'timeout'
      ? 'border-red-500 focus-visible:border-red-500 focus-visible:ring-1 focus-visible:ring-red-500'
      : xfStatus === 'dirty'
        ? 'border-amber-500 focus-visible:border-amber-500 focus-visible:ring-1 focus-visible:ring-amber-500'
        : xfStatus === 'waiting'
          ? 'border-blue-500 focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500'
          : 'border-hmi-grid'

  const xGlowClass =
    xfStatus === 'timeout'
      ? 'shadow-[0_0_5px_rgba(239,68,68,0.25)]'
      : xfStatus === 'dirty'
        ? 'shadow-[0_0_5px_rgba(245,158,11,0.25)]'
        : xfStatus === 'waiting'
          ? 'shadow-[0_0_5px_rgba(59,130,246,0.3)]'
          : ''

  const xTextClass = 
    xfStatus === 'dirty'
      ? 'text-amber-400 font-semibold'
      : xfStatus === 'waiting'
        ? 'text-blue-400 font-semibold animate-pulse'
        : ''

  const yBorderClass =
    yfStatus === 'timeout'
      ? 'border-red-500 focus-visible:border-red-500 focus-visible:ring-1 focus-visible:ring-red-500'
      : yfStatus === 'dirty'
        ? 'border-amber-500 focus-visible:border-amber-500 focus-visible:ring-1 focus-visible:ring-amber-500'
        : yfStatus === 'waiting'
          ? 'border-blue-500 focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500'
          : 'border-hmi-grid'

  const yGlowClass =
    yfStatus === 'timeout'
      ? 'shadow-[0_0_5px_rgba(239,68,68,0.25)]'
      : yfStatus === 'dirty'
        ? 'shadow-[0_0_5px_rgba(245,158,11,0.25)]'
        : yfStatus === 'waiting'
          ? 'shadow-[0_0_5px_rgba(59,130,246,0.3)]'
          : ''

  const yTextClass = 
    yfStatus === 'dirty'
      ? 'text-amber-400 font-semibold'
      : yfStatus === 'waiting'
        ? 'text-blue-400 font-semibold animate-pulse'
        : ''

  const ffInertiaContainerClass = cn(
    "flex flex-col gap-0.5 w-24 p-1 rounded-md transition-all duration-200 border",
    ffInertiaStatus === 'dirty'
      ? 'border-amber-500/30 bg-amber-500/[0.02] shadow-[0_0_5px_rgba(245,158,11,0.15)]'
      : ffInertiaStatus === 'waiting'
        ? 'border-blue-500/30 bg-blue-500/[0.02] shadow-[0_0_5px_rgba(59,130,246,0.2)] animate-pulse'
        : ffInertiaStatus === 'timeout'
          ? 'border-red-500/30 bg-red-500/[0.02] shadow-[0_0_5px_rgba(239,68,68,0.15)]'
          : 'border-transparent'
  )

  const ffInertiaAccentClass =
    ffInertiaStatus === 'dirty'
      ? 'accent-amber-500'
      : ffInertiaStatus === 'waiting'
        ? 'accent-blue-500 animate-pulse'
        : ffInertiaStatus === 'timeout'
          ? 'accent-red-500'
          : 'accent-purple-500'

  const ffCoriolisContainerClass = cn(
    "flex flex-col gap-0.5 w-24 p-1 rounded-md transition-all duration-200 border",
    ffCoriolisStatus === 'dirty'
      ? 'border-amber-500/30 bg-amber-500/[0.02] shadow-[0_0_5px_rgba(245,158,11,0.15)]'
      : ffCoriolisStatus === 'waiting'
        ? 'border-blue-500/30 bg-blue-500/[0.02] shadow-[0_0_5px_rgba(59,130,246,0.2)] animate-pulse'
        : ffCoriolisStatus === 'timeout'
          ? 'border-red-500/30 bg-red-500/[0.02] shadow-[0_0_5px_rgba(239,68,68,0.15)]'
          : 'border-transparent'
  )

  const ffCoriolisAccentClass =
    ffCoriolisStatus === 'dirty'
      ? 'accent-amber-500'
      : ffCoriolisStatus === 'waiting'
        ? 'accent-blue-500 animate-pulse'
        : ffCoriolisStatus === 'timeout'
          ? 'accent-red-500'
          : 'accent-purple-500'

  const ffGravityContainerClass = cn(
    "flex flex-col gap-0.5 w-24 p-1 rounded-md transition-all duration-200 border",
    ffGravityStatus === 'dirty'
      ? 'border-amber-500/30 bg-amber-500/[0.02] shadow-[0_0_5px_rgba(245,158,11,0.15)]'
      : ffGravityStatus === 'waiting'
        ? 'border-blue-500/30 bg-blue-500/[0.02] shadow-[0_0_5px_rgba(59,130,246,0.2)] animate-pulse'
        : ffGravityStatus === 'timeout'
          ? 'border-red-500/30 bg-red-500/[0.02] shadow-[0_0_5px_rgba(239,68,68,0.15)]'
          : 'border-transparent'
  )

  const ffGravityAccentClass =
    ffGravityStatus === 'dirty'
      ? 'accent-amber-500'
      : ffGravityStatus === 'waiting'
        ? 'accent-blue-500 animate-pulse'
        : ffGravityStatus === 'timeout'
          ? 'accent-red-500'
          : 'accent-purple-500'

  const mstepBorderClass =
    mstepStatus === 'timeout'
      ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500'
      : mstepStatus === 'dirty'
        ? 'border-amber-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500'
        : mstepStatus === 'waiting'
          ? 'border-blue-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 animate-pulse'
          : 'border-hmi-grid'

  const mstepGlowClass =
    mstepStatus === 'timeout'
      ? 'shadow-[0_0_5px_rgba(239,68,68,0.25)]'
      : mstepStatus === 'dirty'
        ? 'shadow-[0_0_5px_rgba(245,158,11,0.25)]'
        : mstepStatus === 'waiting'
          ? 'shadow-[0_0_5px_rgba(59,130,246,0.3)]'
          : ''

  const mstepTextClass = 
    mstepStatus === 'dirty'
      ? 'text-amber-400 font-semibold'
      : mstepStatus === 'waiting'
        ? 'text-blue-400 font-semibold animate-pulse'
        : ''

  const kpTooltip = "Proportional Gain: Determines responsiveness to current position error. Higher values speed up response but can cause overshoot."
  const kiTooltip = "Integral Gain: Accumulates positioning error over time to eliminate steady-state offset and keep accuracy high."
  const ki2Tooltip = "Stepper J2 only requires P+D control to correct the residual CTC trajectory tracking error. Integral gain is disabled to prevent stepper saturation/integration windup."
  const kdTooltip = "Derivative Gain: Predicts future error by reacting to rate of change, damping oscillations and stabilizing motion."
  const ffInertiaTooltip = "FF Inertia Blend: Coefficient for Computed Torque Control Inertia feedforward term (0.0 to 1.0)."
  const ffCoriolisTooltip = "FF Coriolis Blend: Coefficient for Computed Torque Control Coriolis/Centrifugal feedforward term (0.0 to 1.0)."
  const ffGravityTooltip = "FF Gravity Blend: Coefficient for Computed Torque Control Gravity feedforward term (0.0 to 1.0)."

  return (
    <div className="border-t border-hmi-grid bg-hmi-panel px-3 py-1.5 flex flex-nowrap items-end gap-2 shrink-0 overflow-x-auto">
      {/* Move target Form */}
      <form onSubmit={e => { e.preventDefault(); handleMove(); }}>
        <fieldset className="flex items-end gap-1.5 border-l-2 border-r-2 border-hmi-grid/40 px-2 py-1 rounded-md">
          <legend className="text-[10px] font-bold text-hmi-muted px-1.5">Move target</legend>
          
          <div className="flex flex-col gap-0.5 min-w-[64px]">
            <div className="flex items-center justify-between gap-1">
              <Tooltip content="Target X coordinate of the end-effector (mm)">
                <label className="text-[10px] font-semibold text-hmi-muted cursor-help border-b border-dotted border-hmi-muted/30">
                  Xf
                </label>
              </Tooltip>
              <StatusLED status={xfStatus} />
            </div>
            <Input
              id="input-xf"
              type="number"
              value={xf}
              onChange={e => handleXChange(e.target.value)}
              onFocus={() => setIsXFocused(true)}
              onBlur={handleXBlur}
              className={cn(
                "w-16 h-7 text-xs transition-all duration-200 bg-hmi-bg",
                xBorderClass,
                xGlowClass,
                xTextClass
              )}
            />
          </div>

          <div className="flex flex-col gap-0.5 min-w-[64px]">
            <div className="flex items-center justify-between gap-1">
              <Tooltip content="Target Y coordinate of the end-effector (mm)">
                <label className="text-[10px] font-semibold text-hmi-muted cursor-help border-b border-dotted border-hmi-muted/30">
                  Yf
                </label>
              </Tooltip>
              <StatusLED status={yfStatus} />
            </div>
            <Input
              id="input-yf"
              type="number"
              value={yf}
              onChange={e => handleYChange(e.target.value)}
              onFocus={() => setIsYFocused(true)}
              onBlur={handleYBlur}
              className={cn(
                "w-16 h-7 text-xs transition-all duration-200 bg-hmi-bg",
                yBorderClass,
                yGlowClass,
                yTextClass
              )}
            />
          </div>

          <Button 
            ref={sendBtnRef}
            type="submit" 
            size="sm" 
            className={cn(
              "h-7 text-xs transition-colors min-w-[70px]", 
              moveStatus === 'success' ? "bg-hmi-ok hover:bg-hmi-ok text-white" : ""
            )}
          >
            {moveStatus === 'sending' ? 'Sending...' : moveStatus === 'success' ? 'Sent ✓' : 'Send'}
          </Button>
        </fieldset>
      </form>

      {/* J1 gains Form */}
      <form onSubmit={submitJ1}>
        <fieldset className="flex items-end gap-1.5 border-l-2 border-r-2 border-hmi-j1/30 px-2 py-1 rounded-md bg-hmi-j1/[0.02]">
          <legend className="text-[10px] font-bold text-hmi-j1 px-1.5">J1 — DC PID (Blue)</legend>
          <GainField label="Kp1" name="kp1" hwValue={gains?.kp1} tooltip={kpTooltip} isSubmitting={j1Status === 'sending'} />
          <GainField label="Ki1" name="ki1" hwValue={gains?.ki1} tooltip={kiTooltip} isSubmitting={j1Status === 'sending'} />
          <GainField label="Kd1" name="kd1" hwValue={gains?.kd1} tooltip={kdTooltip} isSubmitting={j1Status === 'sending'} />
          <Button 
            type="submit" 
            size="sm" 
            className={cn(
              "h-7 text-xs transition-colors min-w-[50px]", 
              j1Status === 'success' ? "bg-hmi-ok hover:bg-hmi-ok text-white" : ""
            )}
          >
            {j1Status === 'sending' ? 'Send...' : j1Status === 'success' ? 'Sent ✓' : 'Apply'}
          </Button>
        </fieldset>
      </form>

      {/* J2 gains Form */}
      <form onSubmit={submitJ2}>
        <fieldset className="flex items-end gap-1.5 border-l-2 border-r-2 border-hmi-j2/30 px-2 py-1 rounded-md bg-hmi-j2/[0.02]">
          <legend className="text-[10px] font-bold text-hmi-j2 px-1.5">J2 — Stepper PID (Orange)</legend>
          <GainField label="Kp2" name="kp2" hwValue={gains?.kp2} tooltip={kpTooltip} isSubmitting={j2Status === 'sending'} />
          <GainField label="Ki2" name="ki2" hwValue={gains?.ki2} tooltip={ki2Tooltip} isSubmitting={j2Status === 'sending'} disabled={true} />
          <GainField label="Kd2" name="kd2" hwValue={gains?.kd2} tooltip={kdTooltip} isSubmitting={j2Status === 'sending'} />
          <Button 
            type="submit" 
            size="sm" 
            className={cn(
              "h-7 text-xs transition-colors min-w-[50px]", 
              j2Status === 'success' ? "bg-hmi-ok hover:bg-hmi-ok text-white" : ""
            )}
          >
            {j2Status === 'sending' ? 'Send...' : j2Status === 'success' ? 'Sent ✓' : 'Apply'}
          </Button>
        </fieldset>
      </form>

      {/* CTC Feedforward Blend Form */}
      <form onSubmit={e => { e.preventDefault(); submitFF(); }}>
        <fieldset className="flex items-end gap-1.5 border-l-2 border-r-2 border-purple-500/30 px-2.5 py-1 rounded-md bg-purple-500/[0.02]">
          <legend className="text-[10px] font-bold text-purple-400 px-1.5">CTC Blend</legend>
          
          <div className={ffInertiaContainerClass}>
            <div className="flex items-center justify-between gap-1 w-full border-b border-dotted border-hmi-muted/30">
              <Tooltip content={ffInertiaTooltip}>
                <div className="flex justify-between items-center text-[10px] font-semibold text-hmi-muted cursor-help flex-1">
                  <span className="whitespace-nowrap">FF Inertia</span>
                  <span className={cn(
                    "font-mono font-bold ml-1 transition-colors",
                    ffInertiaStatus === 'dirty' ? 'text-amber-400' : ffInertiaStatus === 'waiting' ? 'text-blue-400 animate-pulse' : 'text-purple-400'
                  )}>{parseFloat(ffInertia).toFixed(3)}</span>
                </div>
              </Tooltip>
              <StatusLED status={ffInertiaStatus} />
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.001"
              value={ffInertia}
              onChange={e => handleFfInertiaChange(e.target.value)}
              className={cn("h-7 cursor-pointer w-full transition-all duration-250", ffInertiaAccentClass)}
            />
          </div>

          <div className={ffCoriolisContainerClass}>
            <div className="flex items-center justify-between gap-1 w-full border-b border-dotted border-hmi-muted/30">
              <Tooltip content={ffCoriolisTooltip}>
                <div className="flex justify-between items-center text-[10px] font-semibold text-hmi-muted cursor-help flex-1">
                  <span className="whitespace-nowrap">FF Coriolis</span>
                  <span className={cn(
                    "font-mono font-bold ml-1 transition-colors",
                    ffCoriolisStatus === 'dirty' ? 'text-amber-400' : ffCoriolisStatus === 'waiting' ? 'text-blue-400 animate-pulse' : 'text-purple-400'
                  )}>{parseFloat(ffCoriolis).toFixed(3)}</span>
                </div>
              </Tooltip>
              <StatusLED status={ffCoriolisStatus} />
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.001"
              value={ffCoriolis}
              onChange={e => handleFfCoriolisChange(e.target.value)}
              className={cn("h-7 cursor-pointer w-full transition-all duration-250", ffCoriolisAccentClass)}
            />
          </div>

          <div className={ffGravityContainerClass}>
            <div className="flex items-center justify-between gap-1 w-full border-b border-dotted border-hmi-muted/30">
              <Tooltip content={ffGravityTooltip}>
                <div className="flex justify-between items-center text-[10px] font-semibold text-hmi-muted cursor-help flex-1">
                  <span className="whitespace-nowrap">FF Gravity</span>
                  <span className={cn(
                    "font-mono font-bold ml-1 transition-colors",
                    ffGravityStatus === 'dirty' ? 'text-amber-400' : ffGravityStatus === 'waiting' ? 'text-blue-400 animate-pulse' : 'text-purple-400'
                  )}>{parseFloat(ffGravity).toFixed(3)}</span>
                </div>
              </Tooltip>
              <StatusLED status={ffGravityStatus} />
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.001"
              value={ffGravity}
              onChange={e => handleFfGravityChange(e.target.value)}
              className={cn("h-7 cursor-pointer w-full transition-all duration-250", ffGravityAccentClass)}
            />
          </div>

          <Button 
            type="submit" 
            size="sm" 
            className={cn(
              "h-7 text-xs transition-colors min-w-[50px]", 
              ffStatus === 'success' ? "bg-hmi-ok hover:bg-hmi-ok text-white" : ""
            )}
          >
            {ffStatus === 'sending' ? 'Send...' : ffStatus === 'success' ? 'Sent ✓' : 'Apply'}
          </Button>
        </fieldset>
      </form>

      {/* Microstepping */}
      {pathname !== '/' && (
        <div className="flex flex-col gap-0.5 border-l-2 border-r-2 border-hmi-grid/40 px-2.5 py-1 rounded-md h-[46px] justify-end min-w-[106px]">
          <div className="flex items-center justify-between gap-1 w-full">
            <Tooltip content="Microstep: Subdivides motor steps into smaller increments for smoother movements, lower noise, and higher precision.">
              <label className="text-[10px] font-semibold text-hmi-muted cursor-help border-b border-dotted border-hmi-muted/30">
                Microstep
              </label>
            </Tooltip>
            <StatusLED status={mstepStatus} />
          </div>
          <Select
            value={localMstep}
            onValueChange={handleMstepChange}
          >
            <SelectTrigger className={cn("w-24 h-7 text-xs transition-all duration-200 bg-hmi-bg", mstepBorderClass, mstepGlowClass, mstepTextClass)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Full (1)</SelectItem>
              <SelectItem value="2">Half (2)</SelectItem>
              <SelectItem value="4">Quarter (4)</SelectItem>
              <SelectItem value="8">1/8 (8)</SelectItem>
              <SelectItem value="16">1/16 (16)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Maximize2, Minimize2, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Sample, TrajectoryPoint } from '@/lib/db/schema'
import { SCARA3DCanvas } from '@/components/hmi/scara-arm-3d'



export const L_OUTER = 170   // mm
export const L_INNER = 70.7  // mm

// Canvas margins
const LM = 55, RM = 10, TM = 30, BM = 42
const YMIN = -105, YMAX = 205
const TICK = 50

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

export function DashboardXYTrace({ runs }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [showArm, setShowArm] = useState(true)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [resetCounter, setResetCounter] = useState(0)

  // Retrieves coordinates and angles for the 3D overlay posed models
  const getCurrentAngles = useCallback(() => {
    const primaryRun = runs[0]
    if (!primaryRun || primaryRun.trajectoryPoints.length === 0) {
      return { th1: 0, th2: 0, th1d: null, th2d: null }
    }

    const points = primaryRun.trajectoryPoints
    const latestPoint = points[points.length - 1]
    const samples = primaryRun.samples
    const latestSample = samples.length > 0 ? samples[samples.length - 1] : null

    let th1 = 0
    let th2 = 0
    let th1d: number | null = null
    let th2d: number | null = null

    const l1 = 100
    if (latestSample && latestSample.th1 !== null && latestSample.th2 !== null) {
      th1 = latestSample.th1
      th2 = latestSample.th2
      th1d = latestSample.th1d ?? latestSample.th1
      th2d = latestSample.th2d ?? latestSample.th2
    } else if (latestPoint) {
      // Fallback using analytical SCARA IK
      const l2 = 70
      const getIK = (x: number, y: number) => {
        const r2 = x * x + y * y
        const r = Math.sqrt(r2)
        if (r === 0) return { t1: 0, t2: 0 }
        const cosAlpha = Math.max(-1, Math.min(1, (l1 * l1 + r2 - l2 * l2) / (2 * l1 * r)))
        const alpha = Math.acos(cosAlpha)
        const beta = Math.atan2(y, x)
        const t1 = beta - alpha
        const t2 = Math.atan2(y - l1 * Math.sin(t1), x - l1 * Math.cos(t1)) - t1
        return { t1, t2 }
      }

      const act = getIK(latestPoint.xa ?? 0, latestPoint.ya ?? 0)
      th1 = act.t1
      th2 = act.t2

      const idl = getIK(latestPoint.xi ?? 0, latestPoint.yi ?? 0)
      th1d = idl.t1
      th2d = idl.t2
    }

    return { th1, th2, th1d, th2d }
  }, [runs])

  // Observe resize to adjust backing store size
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const handleResize = () => {
      setContainerSize({ width: wrapper.clientWidth, height: wrapper.clientHeight })
    }

    const ro = new ResizeObserver(handleResize)
    ro.observe(wrapper)
    handleResize()

    return () => ro.disconnect()
  }, [])

  const primaryRun = runs[0]
  const lastPoint = primaryRun?.trajectoryPoints[primaryRun?.trajectoryPoints.length - 1]
  const errMm = lastPoint ? Math.sqrt((lastPoint.xi! - lastPoint.xa!) ** 2 + (lastPoint.yi! - lastPoint.ya!) ** 2) : null

  return (
    <div
      className={cn(
        "bg-hmi-panel border rounded-lg overflow-hidden flex flex-col transition-all duration-300 relative border-hmi-grid shadow-lg",
        isFocused ? "fixed inset-0 z-[100] m-0 rounded-none p-6 bg-hmi-bg" : "h-[320px] w-full"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-hmi-grid shrink-0 bg-hmi-panel">
        <div className="flex items-center gap-1.5">
          <span className="w-1 h-3.5 rounded-full bg-hmi-ideal" />
          <span className="text-xs font-semibold text-hmi-text">Workspace XY Trace</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowArm(prev => !prev)}
            className={cn(
              "h-5 px-1.5 text-[10px] border-hmi-grid/60 text-hmi-text-secondary bg-hmi-btn/40 hover:bg-hmi-btn-hover hover:text-hmi-text",
              showArm && "bg-hmi-actual/10 text-hmi-actual border-hmi-actual/30 hover:bg-hmi-actual/15"
            )}
          >
            Arms {showArm ? 'on' : 'off'}
          </Button>

          <div className="flex items-center gap-1 border-l border-hmi-grid/60 pl-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResetCounter(prev => prev + 1)}
              className="h-5 px-1.5 text-[10px] border-hmi-grid/60 text-hmi-text-secondary bg-hmi-btn/40 hover:bg-hmi-btn-hover hover:text-hmi-text"
            >
              <RefreshCw className="h-2.5 w-2.5 mr-1" />
              Reset
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFocused(!isFocused)}
            className="h-5 px-1.5 text-[10px] border-hmi-grid/60 text-hmi-text-secondary bg-hmi-btn/40 hover:bg-hmi-btn-hover hover:text-hmi-text"
          >
            {isFocused ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {/* Canvas view */}
      <div ref={wrapperRef} className="relative flex-1 min-h-0 w-full">
        <SCARA3DCanvas
          width={containerSize.width}
          height={containerSize.height}
          showArm={showArm}
          points={[]}
          runs={runs}
          getCurrentAngles={getCurrentAngles}
          resetTrigger={resetCounter}
        />


        {/* Legend */}
        <div className="absolute top-2 right-2 bg-hmi-panel/85 backdrop-blur-md border border-hmi-grid p-1.5 rounded-lg shadow-lg flex flex-col gap-0.5 pointer-events-none select-none z-10">
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="w-2.5 h-0.5 border-t border-dashed border-hmi-ideal" />
            <span className="text-hmi-text-secondary">Ideal Path</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="w-2.5 h-0.5 bg-hmi-actual" />
            <span className="text-hmi-text-secondary">Actual Path</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="w-2.5 h-2.5 rounded-full border border-hmi-start flex items-center justify-center bg-transparent scale-75" />
            <span className="text-hmi-text-secondary">Start Point</span>
          </div>
        </div>

        {/* Telemetry data overlay */}
        {lastPoint && (
          <div className="absolute bottom-2 left-2 bg-hmi-panel/90 border border-hmi-grid/80 backdrop-blur-md px-2.5 py-1 rounded-md shadow-md flex flex-col gap-0.5 pointer-events-none select-none z-10">
            <div className="grid grid-cols-2 gap-x-2 text-[10px] font-mono">
              <span className="text-hmi-muted font-sans">Ideal Endpoint:</span>
              <span className="text-hmi-ideal text-right">{(lastPoint.xi ?? 0).toFixed(1)}, {(lastPoint.yi ?? 0).toFixed(1)}</span>
              <span className="text-hmi-muted font-sans">Actual Endpoint:</span>
              <span className="text-hmi-pwm-pos text-right">{(lastPoint.xa ?? 0).toFixed(1)}, {(lastPoint.ya ?? 0).toFixed(1)}</span>
              <span className="text-hmi-muted font-sans">End Error:</span>
              <span className="text-hmi-error text-right font-semibold">{errMm ? `${errMm.toFixed(2)} mm` : '--'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

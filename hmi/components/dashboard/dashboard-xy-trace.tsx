'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Maximize2, Minimize2, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Sample, TrajectoryPoint } from '@/lib/db/schema'

export const L_OUTER = 170   // mm
export const L_INNER = 45    // mm

// Canvas margins
const LM = 55, RM = 10, TM = 30, BM = 42
const YMIN = -55, YMAX = 205
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

function getRobotCoords(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  zoom = 1,
  centerX = 0,
  centerY = 75
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  const px = clientX - rect.left
  const py = clientY - rect.top

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const W = canvas.width / dpr
  const H = canvas.height / dpr

  const plotW = W - LM - RM
  const plotH = H - TM - BM

  const scaleY = plotH / (YMAX - YMIN)
  const scaleX = plotW / (2 * (L_OUTER + 25))
  const baseScale = Math.min(scaleY, scaleX)
  const scale = baseScale * zoom

  const rx = centerX + (px - (LM + plotW / 2)) / scale
  const ry = centerY - (py - (TM + plotH / 2)) / scale

  return { x: rx, y: ry }
}

export function DashboardXYTrace({ runs }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [showArm, setShowArm] = useState(true)

  // Zoom & Pan
  const [zoom, setZoom] = useState(1.0)
  const [centerX, setCenterX] = useState(0)
  const [centerY, setCenterY] = useState(75)

  const zoomRef = useRef(1.0)
  const centerXRef = useRef(0)
  const centerYRef = useRef(75)

  useEffect(() => {
    zoomRef.current = zoom
    centerXRef.current = centerX
    centerYRef.current = centerY
  }, [zoom, centerX, centerY])

  // Drag Panning
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number; centerX: number; centerY: number } | null>(null)

  // Draw trace
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const W = canvas.width / dpr
    const H = canvas.height / dpr

    const plotW = W - LM - RM
    const plotH = H - TM - BM
    if (plotW < 10 || plotH < 10) return

    ctx.save()
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.scale(dpr, dpr)

    const scaleY = plotH / (YMAX - YMIN)
    const scaleX = plotW / (2 * (L_OUTER + 25))
    const baseScale = Math.min(scaleY, scaleX)
    const scale = baseScale * zoom

    const originPx = LM + plotW / 2 - centerX * scale
    const originPy = TM + plotH / 2 + centerY * scale

    const XHALF = plotW / 2 / scale
    const YHALF = plotH / 2 / scale

    function toPx(rx: number, ry: number): [number, number] {
      return [originPx + rx * scale, originPy - ry * scale]
    }

    // Background
    ctx.fillStyle = '#121212'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#1C1C1C'
    ctx.fillRect(LM, TM, plotW, plotH)

    // Dynamic grid spacing
    let activeTick = TICK
    if (zoom >= 4.0) activeTick = 10
    else if (zoom >= 2.0) activeTick = 25
    else if (zoom <= 0.5) activeTick = 100

    // Dotted Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 2])

    const xStart = Math.ceil((centerX - XHALF) / activeTick) * activeTick
    const xEnd   = Math.floor((centerX + XHALF) / activeTick) * activeTick
    const yStart = Math.ceil((centerY - YHALF) / activeTick) * activeTick
    const yEnd   = Math.floor((centerY + YHALF) / activeTick) * activeTick

    for (let x = xStart; x <= xEnd; x += activeTick) {
      const px = toPx(x, 0)[0]
      if (px < LM - 1 || px > W - RM + 1) continue
      ctx.beginPath(); ctx.moveTo(px, TM); ctx.lineTo(px, H - BM); ctx.stroke()
    }
    for (let y = yStart; y <= yEnd; y += activeTick) {
      const py = toPx(0, y)[1]
      if (py < TM - 1 || py > H - BM + 1) continue
      ctx.beginPath(); ctx.moveTo(LM, py); ctx.lineTo(W - RM, py); ctx.stroke()
    }

    // Axis Zero Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([])
    if (originPx >= LM && originPx <= W - RM) {
      ctx.beginPath(); ctx.moveTo(originPx, TM); ctx.lineTo(originPx, H - BM); ctx.stroke()
    }
    const yZeroPy = toPx(0, 0)[1]
    if (yZeroPy >= TM && yZeroPy <= H - BM) {
      ctx.beginPath(); ctx.moveTo(LM, yZeroPy); ctx.lineTo(W - RM, yZeroPy); ctx.stroke()
    }

    // Border Frame
    ctx.strokeStyle = '#3A3A3A'
    ctx.lineWidth = 1.5
    ctx.strokeRect(LM, TM, plotW, plotH)

    // Tick Marks & Labels
    ctx.fillStyle = '#9A9A9A'
    ctx.font = '500 11px Geist, "Geist Sans", sans-serif'

    // Y-axis labels
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let y = yStart; y <= yEnd; y += activeTick) {
      const py = toPx(0, y)[1]
      if (py < TM - 4 || py > H - BM + 4) continue
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(LM - 4, py); ctx.lineTo(LM, py); ctx.stroke()
      ctx.fillText(String(y), LM - 6, py)
    }

    // X-axis labels
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (let x = xStart; x <= xEnd; x += activeTick) {
      if (x === 0) continue
      const px = toPx(x, 0)[0]
      if (px < LM - 4 || px > W - RM + 4) continue
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(px, H - BM); ctx.lineTo(px, H - BM + 4); ctx.stroke()
      ctx.fillText(String(x), px, H - BM + 5)
    }

    // Axis Titles
    ctx.fillText('X (mm)', LM + plotW / 2, H - 4)
    ctx.save()
    ctx.translate(16, TM + plotH / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('Y (mm)', 0, 0)
    ctx.restore()

    // Workspace: Annular Sector
    const outerR = L_OUTER * scale
    const innerR = L_INNER * scale

    ctx.save()
    ctx.beginPath()
    ctx.rect(LM, TM, plotW, plotH)
    ctx.clip()

    // OOB Zone tint
    ctx.fillStyle = 'rgba(239, 83, 80, 0.04)'
    ctx.fillRect(LM, TM, plotW, plotH)

    // Reachable Workspace fill
    ctx.fillStyle = 'rgba(28, 28, 28, 0.55)'
    ctx.beginPath()
    ctx.arc(originPx, originPy, outerR, 0, Math.PI, true)
    ctx.arc(originPx, originPy, innerR, Math.PI, 0, false)
    ctx.closePath()
    ctx.fill()

    // Outer & Inner arcs
    ctx.setLineDash([5, 4])
    ctx.strokeStyle = 'rgba(100, 210, 220, 0.35)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(originPx, originPy, outerR, 0, Math.PI, true); ctx.stroke()
    ctx.beginPath(); ctx.arc(originPx, originPy, innerR, 0, Math.PI, true); ctx.stroke()

    // Radial boundaries
    ctx.beginPath()
    ctx.moveTo(originPx + innerR, originPy); ctx.lineTo(originPx + outerR, originPy)
    ctx.moveTo(originPx - innerR, originPy); ctx.lineTo(originPx - outerR, originPy)
    ctx.stroke()

    ctx.setLineDash([])
    ctx.restore() // end workspace clip

    // OriginMarker Crosshair
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(originPx - 7, originPy); ctx.lineTo(originPx + 7, originPy)
    ctx.moveTo(originPx, originPy - 7); ctx.lineTo(originPx, originPy + 7)
    ctx.stroke()

    // Draw paths for all loaded runs
    runs.forEach((r) => {
      const points = r.trajectoryPoints
      if (points.length < 2) return

      // Ideal path (dashed, run color at lower opacity or cyan)
      ctx.save()
      ctx.strokeStyle = '#2196F3'
      ctx.lineWidth = 1.2
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      points.forEach((p, idx) => {
        const [px, py] = toPx(p.xi ?? 0, p.yi ?? 0)
        if (idx === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.stroke()
      ctx.restore()

      // Actual path (solid, run-specific color)
      ctx.save()
      ctx.strokeStyle = r.color || '#EF5350'
      ctx.lineWidth = 2.0
      ctx.beginPath()
      points.forEach((p, idx) => {
        const [px, py] = toPx(p.xa ?? 0, p.ya ?? 0)
        if (idx === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.stroke()

      // Start circle
      const [sx, sy] = toPx(points[0].xi ?? 0, points[0].yi ?? 0)
      ctx.strokeStyle = '#4CAF50'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(sx, sy, 4.5, 0, Math.PI * 2); ctx.stroke()

      // End target flag
      const lastPoint = points[points.length - 1]
      if (lastPoint) {
        const [tx, ty] = toPx(lastPoint.xi ?? 0, lastPoint.yi ?? 0)
        ctx.fillStyle = '#FF9800'; ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(tx, ty)
        ctx.lineTo(tx, ty - 12)
        ctx.lineTo(tx + 8, ty - 9)
        ctx.lineTo(tx, ty - 6)
        ctx.closePath(); ctx.fill()
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty - 12); ctx.stroke()
      }
      ctx.restore()
    })

    // Draw SCARA links for the primary run (first selected)
    const primaryRun = runs[0]
    if (showArm && primaryRun && primaryRun.trajectoryPoints.length > 0) {
      const points = primaryRun.trajectoryPoints
      const latestPoint = points[points.length - 1]
      const samples = primaryRun.samples
      const latestSample = samples.length > 0 ? samples[samples.length - 1] : null

      let actualElbow: [number, number] | null = null
      let idealElbow: [number, number] | null = null
      let actualTip: [number, number] | null = [latestPoint.xa ?? 0, latestPoint.ya ?? 0]
      let idealTip: [number, number] | null = [latestPoint.xi ?? 0, latestPoint.yi ?? 0]

      const l1 = 100
      if (latestSample && latestSample.th1 !== null && latestSample.th2 !== null) {
        actualElbow = [
          l1 * Math.cos(latestSample.th1),
          l1 * Math.sin(latestSample.th1)
        ]
        idealElbow = [
          l1 * Math.cos(latestSample.th1d ?? latestSample.th1),
          l1 * Math.sin(latestSample.th1d ?? latestSample.th1)
        ]
      } else {
        // Fallback using analytical SCARA IK
        const l2 = 70
        const getIKElbow = (x: number, y: number): [number, number] => {
          const r2 = x * x + y * y
          const r = Math.sqrt(r2)
          if (r === 0) return [0, 0]
          const cosAlpha = Math.max(-1, Math.min(1, (l1 * l1 + r2 - l2 * l2) / (2 * l1 * r)))
          const alpha = Math.acos(cosAlpha)
          const beta = Math.atan2(y, x)
          return [l1 * Math.cos(beta - alpha), l1 * Math.sin(beta - alpha)]
        }
        actualElbow = getIKElbow(actualTip[0], actualTip[1])
        idealElbow = getIKElbow(idealTip[0], idealTip[1])
      }

      // Draw Ideal Arm dashed skeleton
      if (idealElbow && idealTip) {
        const bPx = toPx(0, 0)
        const iePx = toPx(idealElbow[0], idealElbow[1])
        const itPx = toPx(idealTip[0], idealTip[1])

        ctx.save()
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 3])
        ctx.strokeStyle = 'rgba(33, 150, 243, 0.45)'
        ctx.beginPath(); ctx.moveTo(bPx[0], bPx[1]); ctx.lineTo(iePx[0], iePx[1]); ctx.stroke()
        ctx.strokeStyle = 'rgba(255, 152, 0, 0.45)'
        ctx.beginPath(); ctx.moveTo(iePx[0], iePx[1]); ctx.lineTo(itPx[0], itPx[1]); ctx.stroke()
        ctx.restore()
      }

      // Draw Actual Arm physical capsule bars
      if (actualElbow && actualTip) {
        const bPx = toPx(0, 0)
        const aePx = toPx(actualElbow[0], actualElbow[1])
        const atPx = toPx(actualTip[0], actualTip[1])

        const drawCapsule = (
          p1: [number, number],
          p2: [number, number],
          width: number,
          bodyCol: string,
          borderCol: string,
          coreCol?: string,
          coreWidth?: number
        ) => {
          ctx.save()
          const dx = p2[0] - p1[0]
          const dy = p2[1] - p1[1]
          const len = Math.sqrt(dx * dx + dy * dy)
          if (len > 0) {
            const angle = Math.atan2(dy, dx)
            ctx.beginPath()
            ctx.arc(p1[0], p1[1], width / 2, angle + Math.PI / 2, angle - Math.PI / 2)
            ctx.arc(p2[0], p2[1], width / 2, angle - Math.PI / 2, angle + Math.PI / 2)
            ctx.closePath()

            ctx.fillStyle = bodyCol
            ctx.fill()
            ctx.strokeStyle = borderCol
            ctx.lineWidth = 1.2
            ctx.stroke()

            if (coreCol && coreWidth) {
              ctx.beginPath()
              ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1])
              ctx.strokeStyle = coreCol
              ctx.lineWidth = coreWidth
              ctx.lineCap = 'round'
              ctx.stroke()
            }
          }
          ctx.restore()
        }

        // Link 1 (inner arm, J1)
        drawCapsule(bPx, aePx, 12, 'rgba(30, 30, 30, 0.75)', 'rgba(33, 150, 243, 0.3)', 'rgba(33, 150, 243, 0.85)', 2.5)
        // Link 2 (outer arm, J2)
        drawCapsule(aePx, atPx, 9, 'rgba(30, 30, 30, 0.75)', 'rgba(255, 152, 0, 0.3)', 'rgba(255, 152, 0, 0.85)', 1.8)

        // Joint pivots
        const drawJoint = (p: [number, number], r: number, color: string) => {
          ctx.save()
          ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fillStyle = '#1C1C1C'; ctx.fill()
          ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke()
          ctx.beginPath(); ctx.arc(p[0], p[1], r * 0.4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
          ctx.restore()
        }
        drawJoint(bPx, 6, '#2196F3')
        drawJoint(aePx, 4.5, '#FF9800')
      }
    }

    ctx.restore()
  }, [runs, showArm, zoom, centerX, centerY])

  // Resize Listener
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(canvas.clientWidth * dpr)
      canvas.height = Math.floor(canvas.clientHeight * dpr)
      draw()
    }

    const ro = new ResizeObserver(handleResize)
    ro.observe(canvas)
    handleResize()

    return () => ro.disconnect()
  }, [draw])

  useEffect(() => {
    draw()
  }, [runs, showArm, zoom, centerX, centerY, draw])

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    setIsDragging(true)
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      centerX: centerXRef.current,
      centerY: centerYRef.current
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || !isDragging || !dragStartRef.current) return

    const dpr = window.devicePixelRatio || 1
    const scaleY = (canvas.height / dpr - TM - BM) / (YMAX - YMIN)
    const scaleX = (canvas.width / dpr - LM - RM) / (2 * (L_OUTER + 25))
    const scale = Math.min(scaleY, scaleX) * zoomRef.current

    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y

    setCenterX(dragStartRef.current.centerX - dx / scale)
    setCenterY(dragStartRef.current.centerY + dy / scale)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      setIsDragging(false)
      dragStartRef.current = null
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return

    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    const nextZoom = Math.max(0.5, Math.min(15.0, zoomRef.current * zoomFactor))

    if (nextZoom === zoomRef.current) return

    const coords = getRobotCoords(canvas, e.clientX, e.clientY, zoomRef.current, centerXRef.current, centerYRef.current)
    const scaleRatio = zoomRef.current / nextZoom
    const newCenterX = coords.x - (coords.x - centerXRef.current) * scaleRatio
    const newCenterY = coords.y - (coords.y - centerYRef.current) * scaleRatio

    setZoom(nextZoom)
    setCenterX(newCenterX)
    setCenterY(newCenterY)
  }

  const handleDoubleClick = () => {
    setZoom(1.0)
    setCenterX(0)
    setCenterY(75)
  }

  const primaryRun = runs[0]
  const lastPoint = primaryRun?.trajectoryPoints[primaryRun?.trajectoryPoints.length - 1]
  const errMm = lastPoint ? Math.sqrt((lastPoint.xi! - lastPoint.xa!) ** 2 + (lastPoint.yi! - lastPoint.ya!) ** 2) : null

  return (
    <div
      className={cn(
        "bg-hmi-panel border rounded-lg overflow-hidden flex flex-col transition-all duration-300 relative border-slate-700/60 shadow-[0_2px_12px_rgba(0,0,0,0.4)]",
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
              "h-5 px-1.5 text-[10px] border-slate-700/60 text-slate-300 bg-slate-900/60 hover:bg-slate-800/80",
              showArm && "bg-slate-800 text-hmi-actual border-hmi-actual/30 hover:bg-slate-800/90"
            )}
          >
            Arms {showArm ? 'on' : 'off'}
          </Button>

          <div className="flex items-center gap-1 border-l border-slate-700/6 pl-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoom(z => Math.min(15.0, z * 1.25))}
              className="h-5 w-5 p-0 border-slate-700/60 text-slate-300 bg-slate-900/60"
            >
              <ZoomIn className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoom(z => Math.max(0.5, z / 1.25))}
              className="h-5 w-5 p-0 border-slate-700/60 text-slate-300 bg-slate-900/60"
            >
              <ZoomOut className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDoubleClick}
              className="h-5 px-1.5 text-[10px] border-slate-700/60 text-slate-300 bg-slate-900/60"
            >
              <RefreshCw className="h-2.5 w-2.5 mr-1" />
              Reset
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFocused(!isFocused)}
            className="h-5 px-1.5 text-[10px] border-slate-700/60 text-slate-300 bg-slate-900/60"
          >
            {isFocused ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {/* Canvas view */}
      <div className="relative flex-1 min-h-0 w-full">
        {zoom !== 1.0 && (
          <div className="absolute top-2 left-2 bg-slate-900/80 backdrop-blur-md border border-slate-800/80 px-2 py-0.5 rounded text-[9px] font-mono text-amber-400 z-10">
            {Math.round(zoom * 100)}%
          </div>
        )}

        <canvas
          ref={canvasRef}
          className={cn(
            "absolute inset-0 w-full h-full select-none touch-none",
            isDragging ? "cursor-grabbing" : "cursor-grab"
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
        />

        {/* Legend */}
        <div className="absolute top-2 right-2 bg-slate-900/80 backdrop-blur-md border border-slate-800/85 p-1.5 rounded-lg shadow-lg flex flex-col gap-0.5 pointer-events-none select-none z-10">
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="w-2.5 h-0.5 border-t border-dashed border-hmi-ideal" />
            <span className="text-slate-300">Ideal Path</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="w-2.5 h-0.5 bg-hmi-actual" />
            <span className="text-slate-300">Actual Path</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="w-2.5 h-2.5 rounded-full border border-hmi-start flex items-center justify-center bg-transparent scale-75" />
            <span className="text-slate-300">Start Point</span>
          </div>
        </div>

        {/* Telemetry data overlay */}
        {lastPoint && (
          <div className="absolute bottom-2 left-2 bg-slate-900/90 border border-slate-800/80 backdrop-blur-md px-2.5 py-1 rounded-md shadow-md flex flex-col gap-0.5 pointer-events-none select-none z-10">
            <div className="grid grid-cols-2 gap-x-2 text-[10px] font-mono">
              <span className="text-slate-500 font-sans">Ideal Endpoint:</span>
              <span className="text-hmi-ideal text-right">{(lastPoint.xi ?? 0).toFixed(1)}, {(lastPoint.yi ?? 0).toFixed(1)}</span>
              <span className="text-slate-500 font-sans">Actual Endpoint:</span>
              <span className="text-hmi-pwm-pos text-right">{(lastPoint.xa ?? 0).toFixed(1)}, {(lastPoint.ya ?? 0).toFixed(1)}</span>
              <span className="text-slate-500 font-sans">End Error:</span>
              <span className="text-hmi-error text-right font-semibold">{errMm ? `${errMm.toFixed(2)} mm` : '--'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

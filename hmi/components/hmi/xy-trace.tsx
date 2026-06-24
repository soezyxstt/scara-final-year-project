'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useHMI, useHMILiveRefs } from '@/lib/hmi-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Maximize2, Minimize2, Crosshair, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/tooltip'
import type { TPoint, HMIState } from '@/lib/hmi-types'
import { checkStraightLineTrajectory, getCurrentPosition, isAngleValid, calculateIntermediatePoint } from '@/lib/trajectory-safety'
import { toast } from 'sonner'
import { downloadSingleGraph } from '@/lib/capture-utils'
import { useTheme } from '@/components/hmi/theme-provider'
import { SCARA3DCanvas } from './scara-arm-3d'



export const L_OUTER = 170   // mm — outer workspace radius
export const L_INNER = 70.7  // mm — inner workspace radius (dead zone)
const WS_THETA_START = 0          // rad — workspace start angle
const WS_THETA_END   = Math.PI    // rad — workspace end angle (180°)

// Canvas margins (px)
const LM = 55, RM = 10, TM = 30, BM = 42

// Robot-space Y extent shown
const YMIN = -105, YMAX = 205  // mm
const TICK = 50                // mm per grid division

// Colors are dynamically set per theme inside drawTrace

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

export function drawTrace(
  canvas: HTMLCanvasElement,
  state: HMIState,
  showArm: boolean,
  hoverPoint?: { x: number; y: number } | null,
  zoom = 1,
  centerX = 0,
  centerY = 75
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  const currentPos = getCurrentPosition(state)

  const isLight = typeof document !== 'undefined' && document.documentElement.classList.contains('light')

  const getCSSColor = (varName: string, fallback: string): string => {
    if (typeof window === 'undefined') return fallback
    const val = window.getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
    return val || fallback
  }

  const hexToRgba = (colorStr: string, alpha: number): string => {
    if (colorStr.startsWith('rgba') || colorStr.startsWith('rgb')) {
      const match = colorStr.match(/\d+/g)
      if (match && match.length >= 3) {
        return `rgba(${match[0]}, ${match[1]}, ${match[2]}, ${alpha})`
      }
    }
    const cleanHex = colorStr.replace('#', '')
    let r = 0, g = 0, b = 0
    if (cleanHex.length === 3) {
      r = parseInt(cleanHex[0] + cleanHex[0], 16)
      g = parseInt(cleanHex[1] + cleanHex[1], 16)
      b = parseInt(cleanHex[2] + cleanHex[2], 16)
    } else if (cleanHex.length === 6) {
      r = parseInt(cleanHex.substring(0, 2), 16)
      g = parseInt(cleanHex.substring(2, 4), 16)
      b = parseInt(cleanHex.substring(4, 6), 16)
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  const COLORS = {
    bg: getCSSColor('--hmi-bg', isLight ? '#FAFAFA' : '#141517'),
    panel: getCSSColor('--hmi-panel', isLight ? '#FFFFFF' : '#1F2023'),
    grid: getCSSColor('--hmi-grid', isLight ? '#E4E4E7' : '#323439'),
    textSecondary: getCSSColor('--hmi-text-secondary', isLight ? '#52525B' : '#9F9F9F'),
    j1: getCSSColor('--hmi-j1', isLight ? '#2563EB' : '#60A5FA'),
    j1Des: getCSSColor('--hmi-j1-des', isLight ? '#3B82F6' : '#93C5FD'),
    j2: getCSSColor('--hmi-j2', isLight ? '#EA580C' : '#FB923C'),
    j2Des: getCSSColor('--hmi-j2-des', isLight ? '#F97316' : '#FDBA74'),
    actual: getCSSColor('--hmi-actual', isLight ? '#DC2626' : '#F87171'),
    ok: getCSSColor('--hmi-ok', isLight ? '#16A34A' : '#22C55E'),
    warn: getCSSColor('--hmi-warn', isLight ? '#D97706' : '#F59E0B'),
    error: getCSSColor('--hmi-error', isLight ? '#D97706' : '#FBBF24'),
  }
  
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const W = canvas.width / dpr
  const H = canvas.height / dpr
  
  const plotW = W - LM - RM
  const plotH = H - TM - BM
  if (plotW < 10 || plotH < 10) return

  ctx.save()
  // Clean canvas and prepare scaled drawing
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.scale(dpr, dpr)

  // Scale: limited by Y height OR by needing L_OUTER+25mm to fit horizontally
  const scaleY = plotH / (YMAX - YMIN)
  const scaleX = plotW / (2 * (L_OUTER + 25))
  const baseScale = Math.min(scaleY, scaleX)
  const scale = baseScale * zoom

  // Pixel coordinate of robot origin (x=0, y=0)
  const originPx = LM + plotW / 2 - centerX * scale
  const originPy = TM + plotH / 2 + centerY * scale

  // Derived visible X and Y ranges
  const XHALF = plotW / 2 / scale
  const YHALF = plotH / 2 / scale

  function toPx(rx: number, ry: number): [number, number] {
    return [originPx + rx * scale, originPy - ry * scale]
  }

  // ── Background ──────────────────────────────────────────────────────────
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = COLORS.panel
  ctx.fillRect(LM, TM, plotW, plotH)

  // ── Workspace: Annular Sector (r: 70.7–170mm, θ: -30–210°) ─────────────────
  // Visual priority: boundary is background context. Fills are solid/distinct.
  const outerR = L_OUTER * scale
  const innerR = L_INNER * scale

  ctx.save()
  ctx.beginPath()
  ctx.rect(LM, TM, plotW, plotH)
  ctx.clip()

  // Layer 1 — out-of-bounds zone (outside outer arc): soft warning red-tinted grey
  ctx.fillStyle = isLight ? '#FAF0F0' : '#251919'
  ctx.fillRect(LM, TM, plotW, plotH)

  // Canvas angles corresponding to robot -30 deg to 210 deg (mirrored Y axis)
  const startAng = 5 * Math.PI / 6  // 150 deg (robot 210 deg)
  const endAng   = Math.PI / 6      // 30 deg (robot -30 deg)

  // Layer 2 — reachable annular sector: clean white or dark panel
  ctx.fillStyle = COLORS.panel
  ctx.beginPath()
  ctx.arc(originPx, originPy, outerR, startAng, endAng, false)
  ctx.arc(originPx, originPy, innerR, endAng, startAng, true)
  ctx.closePath()
  ctx.fill()

  // Layer 3 — boundary arcs: thin dashed muted cyan
  ctx.setLineDash([5, 4])
  ctx.strokeStyle = isLight ? 'rgba(6, 182, 212, 0.45)' : 'rgba(100, 210, 220, 0.35)'
  ctx.lineWidth = 1

  // Outer arc
  ctx.beginPath()
  ctx.arc(originPx, originPy, outerR, startAng, endAng, false)
  ctx.stroke()

  // Inner arc
  ctx.beginPath()
  ctx.arc(originPx, originPy, innerR, startAng, endAng, false)
  ctx.stroke()

  // Radial edges
  const cos30 = Math.cos(Math.PI / 6)
  const sin30 = Math.sin(Math.PI / 6)

  ctx.beginPath()
  // Radial edge at -30 deg (canvas angle 30 deg)
  ctx.moveTo(originPx + innerR * cos30, originPy + innerR * sin30)
  ctx.lineTo(originPx + outerR * cos30, originPy + outerR * sin30)
  // Radial edge at 210 deg (canvas angle 150 deg)
  ctx.moveTo(originPx - innerR * cos30, originPy + innerR * sin30)
  ctx.lineTo(originPx - outerR * cos30, originPy + outerR * sin30)
  ctx.stroke()

  ctx.setLineDash([])
  ctx.restore() // end workspace clip

  // ── Dynamic Grid Spacing & Ticks ────────────────────────────────────────
  let activeTick = TICK
  if (zoom >= 4.0) {
    activeTick = 10
  } else if (zoom >= 2.0) {
    activeTick = 25
  } else if (zoom <= 0.5) {
    activeTick = 100
  }

  // ── Fine Dotted Grid ────────────────────────────────────────────────────
  ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.08)'
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

  // ── Axis Zero Lines (Brighter, more prominent) ──────────────────────────
  ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.22)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([])
  if (originPx >= LM && originPx <= W - RM) {
    ctx.beginPath(); ctx.moveTo(originPx, TM); ctx.lineTo(originPx, H - BM); ctx.stroke()
  }
  const yZeroPy = toPx(0, 0)[1]
  if (yZeroPy >= TM && yZeroPy <= H - BM) {
    ctx.beginPath(); ctx.moveTo(LM, yZeroPy); ctx.lineTo(W - RM, yZeroPy); ctx.stroke()
  }

  // ── Plot Area Border Frame ──────────────────────────────────────────────
  ctx.strokeStyle = COLORS.grid
  ctx.lineWidth = 1.5
  ctx.strokeRect(LM, TM, plotW, plotH)

  // ── Tick Marks & Proportional Labels ────────────────────────────────────
  ctx.fillStyle = COLORS.textSecondary
  ctx.font = '500 11px Geist, "Geist Sans", -apple-system, sans-serif'

  // Y-axis: right-aligned labels
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let y = yStart; y <= yEnd; y += activeTick) {
    const py = toPx(0, y)[1]
    if (py < TM - 4 || py > H - BM + 4) continue
    ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.15)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(LM - 4, py); ctx.lineTo(LM, py); ctx.stroke()
    ctx.fillStyle = COLORS.textSecondary
    ctx.fillText(String(y), LM - 6, py)
  }

  // X-axis: center-aligned labels — within bounds to avoid edge clutter
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let x = xStart; x <= xEnd; x += activeTick) {
    if (x === 0) continue
    const px = toPx(x, 0)[0]
    if (px < LM - 4 || px > W - RM + 4) continue
    ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.15)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(px, H - BM); ctx.lineTo(px, H - BM + 4); ctx.stroke()
    ctx.fillStyle = COLORS.textSecondary
    ctx.fillText(String(x), px, H - BM + 5)
  }

  // Axis Titles
  ctx.fillStyle = COLORS.textSecondary
  ctx.font = '600 12px Geist, "Geist Sans", -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('X (mm)', LM + plotW / 2, H - 4)

  ctx.save()
  ctx.translate(16, TM + plotH / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('Y (mm)', 0, 0)
  ctx.restore()

  // Workspace drawing relocated before grid lines

  // ── Origin Marker Crosshair ───────────────────────────────────────────────
  ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.15)'
  ctx.lineWidth = 1
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(originPx - 7, originPy); ctx.lineTo(originPx + 7, originPy)
  ctx.moveTo(originPx, originPy - 7); ctx.lineTo(originPx, originPy + 7)
  ctx.stroke()

  // ── Trajectory Paths & SCARA Arm Links ───────────────────────────────────
  const activeBuf: TPoint[] = state.recordingState === 'REC' ? state.tBuffer : state.frozenT
  const activeDSamples = state.recordingState === 'REC' ? state.dBuffer : state.frozenD
  
  const latestPoint = activeBuf.length > 0 ? activeBuf[activeBuf.length - 1] : null
  const latestDSample = activeDSamples.length > 0 ? activeDSamples[activeDSamples.length - 1] : null

  // 2D Arm Capsule drawing disabled to use 3D GLB model overlay instead


  function drawPath(buf: TPoint[], ideal: boolean, alpha = 1) {
    if (buf.length < 2) return
    ctx!.globalAlpha = alpha
    ctx!.beginPath()
    for (let i = 0; i < buf.length; i++) {
      const p = buf[i]
      const [px, py] = toPx(ideal ? p.xi : p.xa, ideal ? p.yi : p.ya)
      if (i === 0) {
        ctx!.moveTo(px, py)
      } else {
        ctx!.lineTo(px, py)
      }
    }
    ctx!.stroke()
    ctx!.globalAlpha = 1
  }

  // Ghost (previous move, low opacity)
  if (state.showGhost && state.prevTBuffer.length > 0) {
    let ghostOpacity = 0.2
    if (typeof window !== 'undefined') {
      const val = localStorage.getItem('hmi_ghost_opacity')
      if (val !== null) {
        ghostOpacity = parseFloat(val)
      }
    }
    ctx.strokeStyle = COLORS.j1; ctx.lineWidth = 1; ctx.setLineDash([5, 3])
    drawPath(state.prevTBuffer, true, ghostOpacity)
    ctx.strokeStyle = COLORS.actual; ctx.lineWidth = 1.5; ctx.setLineDash([])
    drawPath(state.prevTBuffer, false, ghostOpacity)
  }

  if (activeBuf.length >= 2) {
    // Ideal path — dashed blue
    ctx.strokeStyle = COLORS.j1; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3])
    drawPath(activeBuf, true)

    // Actual path — solid red
    ctx.strokeStyle = COLORS.actual; ctx.lineWidth = 2; ctx.setLineDash([])
    drawPath(activeBuf, false)

    // Start marker — hollow green circle
    const [sx, sy] = toPx(activeBuf[0].xi, activeBuf[0].yi)
    ctx.strokeStyle = COLORS.ok; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.stroke()

    // Live tip dots (REC only)
    if (state.recordingState === 'REC') {
      const last = activeBuf[activeBuf.length - 1]
      const [ix, iy] = toPx(last.xi, last.yi)
      const [ax, ay] = toPx(last.xa, last.ya)
      ctx.fillStyle = COLORS.j1; ctx.beginPath(); ctx.arc(ix, iy, 4, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = COLORS.actual;  ctx.beginPath(); ctx.arc(ax, ay, 4, 0, Math.PI * 2); ctx.fill()
    }
  }

  // Target marker — orange flag (pole + triangular flag)
  const targetX = state.currentMove?.xf ?? state.bootPose?.x
  const targetY = state.currentMove?.yf ?? state.bootPose?.y
  if (targetX !== undefined && targetY !== undefined) {
    const [tx, ty] = toPx(targetX, targetY)
    ctx.setLineDash([])
    ctx.fillStyle = COLORS.j2; ctx.strokeStyle = COLORS.j2; ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(tx, ty)
    ctx.lineTo(tx, ty - 14)
    ctx.lineTo(tx + 9, ty - 10)
    ctx.lineTo(tx, ty - 6)
    ctx.closePath(); ctx.fill()
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty - 14); ctx.stroke()
  }

  // ── Trajectory Safety Path Preview ───────────────────────────────────────
  const activeTarget = hoverPoint || state.previewTarget
  if (activeTarget && currentPos) {
    const safety = checkStraightLineTrajectory(currentPos, activeTarget, L_INNER, L_OUTER)
    const isPathSafe = safety.isValid
    const isInnerViolation = !safety.isValid && safety.reason === 'inner_violation'
    
    const [cpx, cpy] = toPx(currentPos.x, currentPos.y)
    const [tpx, tpy] = toPx(activeTarget.x, activeTarget.y)
    
    ctx.save()
    ctx.setLineDash([4, 4])
    ctx.lineWidth = 1.8
    ctx.strokeStyle = (isPathSafe || isInnerViolation)
      ? (isLight ? 'rgba(22, 163, 74, 0.65)' : 'rgba(34, 197, 94, 0.65)') 
      : (isLight ? 'rgba(220, 38, 38, 0.85)' : 'rgba(248, 113, 113, 0.85)')
    
    if (isInnerViolation) {
      const pInt = calculateIntermediatePoint(currentPos, activeTarget, L_INNER, L_OUTER)
      const [ipx, ipy] = toPx(pInt.x, pInt.y)
      
      // Draw split segments: current -> intermediate -> target
      ctx.beginPath()
      ctx.moveTo(cpx, cpy)
      ctx.lineTo(ipx, ipy)
      ctx.lineTo(tpx, tpy)
      ctx.stroke()
      
      // Draw intermediate waypoint node
      ctx.beginPath()
      ctx.arc(ipx, ipy, 5, 0, Math.PI * 2)
      ctx.fillStyle = isLight ? '#16A34A' : '#22C55E'
      ctx.fill()
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 1.0
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.moveTo(cpx, cpy)
      ctx.lineTo(tpx, tpy)
      ctx.stroke()
    }
    
    ctx.restore()
  }

  // Live Preview Dot (while typing)
  if (state.previewTarget) {
    const { x, y } = state.previewTarget
    const [px, py] = toPx(x, y)
    
    // Check reachability
    const r2 = x * x + y * y
    const safety = checkStraightLineTrajectory(currentPos, state.previewTarget, L_INNER, L_OUTER)
    const isAutoRoute = !safety.isValid && safety.reason === 'inner_violation'
    const isReachable = r2 >= L_INNER * L_INNER && r2 <= L_OUTER * L_OUTER && isAngleValid(x, y) && (safety.isValid || isAutoRoute)
    const dotColor = isReachable ? COLORS.ok : COLORS.actual
    
    ctx.save()
    ctx.setLineDash([])
    
    // Outer glow ring
    ctx.beginPath()
    ctx.arc(px, py, 8, 0, Math.PI * 2)
    ctx.strokeStyle = dotColor
    ctx.lineWidth = 1.5
    ctx.globalAlpha = 0.4
    ctx.stroke()
    
    // Inner solid dot
    ctx.beginPath()
    ctx.arc(px, py, 4, 0, Math.PI * 2)
    ctx.fillStyle = dotColor
    ctx.globalAlpha = 0.9
    ctx.fill()
    
    // Small white core for contrast
    ctx.beginPath()
    ctx.arc(px, py, 1.5, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.globalAlpha = 1.0
    ctx.fill()
    
    ctx.restore()
  }

  // Draw Pick Point Mode Hover Projections
  if (hoverPoint) {
    const { x, y } = hoverPoint
    const [px, py] = toPx(x, y)
    
    // Check reachability and path safety
    const r2 = x * x + y * y
    const safety = checkStraightLineTrajectory(currentPos, hoverPoint, L_INNER, L_OUTER)
    const isAutoRoute = !safety.isValid && safety.reason === 'inner_violation'
    const isPathSafe = r2 >= L_INNER * L_INNER && r2 <= L_OUTER * L_OUTER && isAngleValid(x, y) && (safety.isValid || isAutoRoute)
    const color = isPathSafe 
      ? (isLight ? 'rgba(22, 163, 74, 0.6)' : 'rgba(34, 197, 94, 0.7)') 
      : (isLight ? 'rgba(220, 38, 38, 0.6)' : 'rgba(248, 113, 113, 0.7)')
    const textColor = isPathSafe ? COLORS.ok : COLORS.actual
    
    ctx.save()
    ctx.setLineDash([3, 3])
    ctx.lineWidth = 1.2
    ctx.strokeStyle = color
    
    // Projections
    // Vertical line to x-axis (y = 0 line)
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(px, originPy)
    ctx.stroke()
    
    // Horizontal line to y-axis (x = 0 line)
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(originPx, py)
    ctx.stroke()
    
    // Draw text labels near the axis lines
    ctx.setLineDash([])
    ctx.font = 'bold 9px monospace'
    ctx.fillStyle = textColor
    
    // Label on Y-axis
    ctx.textAlign = x >= 0 ? 'right' : 'left'
    ctx.fillText(`${y.toFixed(1)}`, originPx + (x >= 0 ? -6 : 6), py + 3)
    
    // Label on X-axis
    ctx.textAlign = 'center'
    ctx.fillText(`${x.toFixed(1)}`, px, originPy + (y >= 0 ? 12 : -5))
    
    // Draw preview marker at hoverPoint
    ctx.beginPath()
    ctx.arc(px, py, 6, 0, Math.PI * 2)
    ctx.strokeStyle = textColor
    ctx.lineWidth = 1.5
    ctx.stroke()
    
    ctx.beginPath()
    ctx.arc(px, py, 2, 0, Math.PI * 2)
    ctx.fillStyle = textColor
    ctx.fill()
    
    ctx.restore()
  }

  ctx.restore()
}

export function XYTrace() {
  const { state, dispatch } = useHMI()
  const liveRefs = useHMILiveRefs()
  const { theme } = useTheme()
  const [isFocused, setIsFocused] = useState(false)
  const [showArm, setShowArm] = useState(true)
  const [ghostOpacity, setGhostOpacity] = useState(0.2)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [resetCounter, setResetCounter] = useState(0)
  const [isPicking, setIsPicking] = useState(false)
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const handleConfigChange = () => {
      const val = localStorage.getItem('hmi_ghost_opacity')
      if (val !== null) {
        setGhostOpacity(parseFloat(val))
      }
    }
    handleConfigChange()
    window.addEventListener('hmi_config_updated', handleConfigChange)
    return () => window.removeEventListener('hmi_config_updated', handleConfigChange)
  }, [])

  // Merges committed React state with the still-pending serial queue so the
  // canvas always draws the freshest data without waiting for the 100ms flush.
  const getCanvasState = useCallback((): HMIState => {
    const s = stateRef.current
    if (s.recordingState !== 'REC') return s
    const pendingT = liveRefs.tQueueRef.current
    const pendingD = liveRefs.dQueueRef.current
    if (pendingT.length === 0 && pendingD.length === 0) return s
    return {
      ...s,
      tBuffer: pendingT.length > 0 ? [...s.tBuffer, ...pendingT] : s.tBuffer,
      dBuffer: pendingD.length > 0 ? [...s.dBuffer, ...pendingD] : s.dBuffer,
    }
  }, [liveRefs])

  // Retrieves coordinates and angles for the 3D overlay posed models
  const getCurrentAngles = useCallback(() => {
    const s = getCanvasState()
    const activeBuf = s.recordingState === 'REC' ? s.tBuffer : s.frozenT
    const activeDSamples = s.recordingState === 'REC' ? s.dBuffer : s.frozenD

    const latestPoint = activeBuf.length > 0 ? activeBuf[activeBuf.length - 1] : null
    const latestDSample = activeDSamples.length > 0 ? activeDSamples[activeDSamples.length - 1] : null

    let th1 = 0
    let th2 = 0
    let th1d: number | null = null
    let th2d: number | null = null

    if (latestPoint) {
      if (latestDSample && latestDSample.th1 !== null && latestDSample.th2 !== null) {
        th1 = latestDSample.th1
        th2 = latestDSample.th2
        th1d = latestDSample.th1d ?? latestDSample.th1
        th2d = latestDSample.th2d ?? latestDSample.th2
      } else {
        // Fallback: Reconstruct using IK
        const l1 = 100
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

        const act = getIK(latestPoint.xa, latestPoint.ya)
        th1 = act.t1
        th2 = act.t2

        const idl = getIK(latestPoint.xi, latestPoint.yi)
        th1d = idl.t1
        th2d = idl.t2
      }
    } else if (s.bootPose) {
      th1 = s.bootPose.th1
      th2 = s.bootPose.th2
    }

    return { th1, th2, th1d, th2d }
  }, [getCanvasState])

  // Listen for custom window event to toggle pick point mode
  useEffect(() => {
    const handleTogglePick = () => {
      setIsPicking(prev => {
        const next = !prev
        if (!next) setHoverPoint(null)
        return next
      })
    }
    window.addEventListener('hmi_toggle_pick_point', handleTogglePick)
    return () => window.removeEventListener('hmi_toggle_pick_point', handleTogglePick)
  }, [])

  // Listen for custom window event to toggle arm links visualization
  useEffect(() => {
    const handleToggleArm = () => {
      setShowArm(prev => !prev)
    }
    window.addEventListener('hmi_toggle_arm_links', handleToggleArm)
    return () => window.removeEventListener('hmi_toggle_arm_links', handleToggleArm)
  }, [])

  // Listen for Escape key to close focus or cancel pick point mode
  useEffect(() => {
    if (!isFocused && !isPicking) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isPicking) {
          setIsPicking(false)
          setHoverPoint(null)
        } else if (isFocused) {
          setIsFocused(false)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFocused, isPicking])

  // Listen for graph download event
  useEffect(() => {
    const handleDownload = (e: Event) => {
      if (isFocused) {
        e.preventDefault()
        toast.promise(
          downloadSingleGraph('xy', 'XY Workspace Trace', getCanvasState()),
          {
            loading: 'Exporting XY Workspace Trace...',
            success: 'Workspace trace downloaded successfully!',
            error: (err) => `Export failed: ${err.message || err}`,
          }
        )
      }
    }
    window.addEventListener('hmi_download_graph', handleDownload)
    return () => window.removeEventListener('hmi_download_graph', handleDownload)
  }, [isFocused, getCanvasState])

  // Observe resize to set container size
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const handleResize = () => {
      setContainerSize({ width: wrapper.clientWidth, height: wrapper.clientHeight })
    }

    const ro = new ResizeObserver(handleResize)
    ro.observe(wrapper)
    
    // Initial size setup
    handleResize()

    return () => ro.disconnect()
  }, [])

  const activeBuf = state.recordingState === 'REC' ? state.tBuffer : state.frozenT
  const last = activeBuf[activeBuf.length - 1]
  const errMm = last ? Math.sqrt((last.xi - last.xa) ** 2 + (last.yi - last.ya) ** 2) : null
  const currentPos = getCurrentPosition(state)

  const recColor = 
    state.recordingState === 'REC'
      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.2)]'
      : state.recordingState === 'IDLE'
        ? 'bg-emerald-600 text-white border border-emerald-500 font-bold shadow-[0_0_8px_rgba(16,185,129,0.2)]'
        : 'bg-hmi-btn/50 text-hmi-muted border border-hmi-grid'
  const recLabel =
    state.recordingState === 'REC'    ? '⏺ REC'
    : state.recordingState === 'IDLE' ? '⏹ IDLE'
    : '⏸ WAITING'

  const isLive = state.recordingState === 'REC'

  return (
    <div 
      id="hmi-xy-trace"
      className={cn(
        "bg-hmi-panel border rounded-lg overflow-hidden flex-1 min-h-0 flex flex-col transition-all duration-300 group/graph",
        "border-hmi-grid",
        isLive
          ? "shadow-[0_0_0_1px_rgba(245,158,11,0.25),0_0_18px_4px_rgba(245,158,11,0.12),0_4px_20px_rgba(0,0,0,0.5)]"
          : "shadow-[0_2px_12px_rgba(0,0,0,0.4)] hover:shadow-[0_0_0_1px_rgba(33,150,243,0.2),0_4px_20px_rgba(0,0,0,0.5)]",
        isFocused 
          ? "fixed inset-0 z-[100] m-0 rounded-none p-6 bg-hmi-bg border-0 shadow-none" 
          : "relative"
      )}
    >
      <div className={cn(
        "flex items-center justify-between border-b shrink-0 bg-hmi-panel",
        isLive ? "border-amber-500/30" : "border-hmi-grid/50",
        isFocused ? "mb-4 pb-3 px-2 pt-1" : "px-4 py-2.5"
      )}>
        <div className="flex items-center gap-2.5">
          {isFocused ? (
            <>
              <h2 className="text-lg font-bold text-hmi-text">XY Trace</h2>
              <span className="text-xs text-hmi-muted font-normal">(Press ESC to exit focus)</span>
            </>
          ) : (
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "w-1 h-4 rounded-full transition-colors duration-500",
                  isLive ? "bg-amber-500 animate-pulse" : "bg-hmi-ideal/60"
                )}
              />
              <p className="text-sm font-semibold text-hmi-text tracking-wide">XY Trace</p>
            </div>
          )}
          <Tooltip 
            content={
              state.recordingState === 'REC'
                ? "Recording: Telemetry capture is active and drawing live trajectory path."
                : state.recordingState === 'IDLE'
                  ? "Idle: Telemetry recording is completed. Displaying last move."
                  : "Waiting: Standing by for a move command."
            }
            align="left"
          >
            <Badge
              className={cn(
                `${recColor} font-semibold px-1.5 py-0 shadow-sm text-[9px] cursor-help`,
                isLive && "ring-1 ring-amber-500/40"
              )}
            >{recLabel}</Badge>
          </Tooltip>
        </div>

        <div className="flex items-center gap-1.5">
          <Tooltip content={isPicking ? "Cancel: Exit target coordinate selection mode." : "Pick Point: Click a point on the workspace graph to set it as target coordinates."} align="center">
            <Button 
              id="hmi-pick-point-button"
              variant="outline" 
              size="sm" 
              onClick={(e) => { e.stopPropagation(); setIsPicking(prev => !prev); if (isPicking) setHoverPoint(null); }} 
              className={cn(
                "h-5 px-1.5 text-[10px] border-hmi-grid/60 text-hmi-text-secondary bg-hmi-btn/40 hover:bg-hmi-btn-hover hover:text-hmi-text", 
                isPicking && "bg-amber-500 text-slate-950 font-bold border-amber-400 hover:bg-amber-400 hover:text-slate-950 shadow-[0_0_8px_rgba(245,158,11,0.3)]"
              )}
            >
              <Crosshair className="h-3 w-3 mr-1" />
              Pick Point {isPicking ? 'active' : ''}
            </Button>
          </Tooltip>
          <Tooltip content="Ghost Mode: Toggle overlay of the previous trajectory paths." align="center">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={(e) => { e.stopPropagation(); dispatch({ type: 'TOGGLE_GHOST' }); }} 
              className={cn(
                "h-5 px-1.5 text-[10px] border-hmi-grid/60 text-hmi-text-secondary bg-hmi-btn/40 hover:bg-hmi-btn-hover hover:text-hmi-text", 
                state.showGhost && "bg-hmi-btn-hover text-hmi-ideal border-hmi-ideal/30 hover:bg-hmi-btn-hover/90"
              )}
            >
              Ghost {state.showGhost ? 'on' : 'off'}
            </Button>
          </Tooltip>
          <Tooltip content="Arm Links: Toggle physical SCARA arm link visualization." align="center">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={(e) => { e.stopPropagation(); setShowArm(prev => !prev); }} 
              className={cn(
                "h-5 px-1.5 text-[10px] border-hmi-grid/60 text-hmi-text-secondary bg-hmi-btn/40 hover:bg-hmi-btn-hover hover:text-hmi-text", 
                showArm && "bg-hmi-btn-hover text-hmi-actual border-hmi-actual/30 hover:bg-hmi-btn-hover/90"
              )}
            >
              Arms {showArm ? 'on' : 'off'}
            </Button>
          </Tooltip>

          {/* Reset Control */}
          <div className="flex items-center gap-1 border-l border-hmi-grid/60 pl-1.5 mr-0.5">
            <Tooltip content="Reset Zoom & Pan" align="center">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={(e) => { 
                  e.stopPropagation()
                  setResetCounter(prev => prev + 1)
                }} 
                className="h-5 px-1 text-[10px] border-hmi-grid/60 text-hmi-text-secondary bg-hmi-btn/40 hover:bg-hmi-btn-hover hover:text-hmi-text"
              >
                <RefreshCw className="h-2.5 w-2.5 mr-1" />
                Reset
              </Button>
            </Tooltip>
          </div>


          <Tooltip content={isFocused ? "Collapse: Restores the panel to normal size." : "Expand: Maximizes the workspace trace."} align="center">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); setIsFocused(!isFocused); }}
              className="h-5 px-1.5 text-[10px] border-hmi-grid/60 text-hmi-text-secondary bg-hmi-btn/40 hover:bg-hmi-btn-hover hover:text-hmi-text"
            >
              {isFocused ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Graph Area Wrapper */}
      <div ref={wrapperRef} className="relative flex-1 min-h-0 w-full">
        <SCARA3DCanvas
          width={containerSize.width}
          height={containerSize.height}
          showArm={showArm}
          recordingState={state.recordingState}
          bootPose={state.bootPose}
          targetX={state.currentMove?.xf ?? state.bootPose?.x}
          targetY={state.currentMove?.yf ?? state.bootPose?.y}
          points={activeBuf}
          prevPoints={state.prevTBuffer}
          showGhost={state.showGhost}
          ghostOpacity={ghostOpacity}
          getCurrentAngles={getCurrentAngles}
          isPicking={isPicking}
          onPickPoint={(coords) => {
            dispatch({ type: 'PICK_TARGET', target: { x: coords.x, y: coords.y } })
            setIsPicking(false)
            setHoverPoint(null)
          }}
          hoverPoint={hoverPoint}
          setHoverPoint={setHoverPoint}
          previewTarget={state.previewTarget}
          currentPos={currentPos}
          resetTrigger={resetCounter}
        />



        {/* Pick Point Mode active banner */}
        {isPicking && (
          <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-amber-500 text-slate-950 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-[0_0_15px_rgba(245,158,11,0.45)] z-20 border border-amber-400 select-none animate-bounce">
            <Crosshair className="h-3.5 w-3.5 animate-spin" style={{ animationDuration: '3s' }} />
            <span>Click workspace to set target point (Esc to exit)</span>
          </div>
        )}

        {/* Vector HTML Legend Overlay */}
        <div className="absolute top-2 right-2 bg-hmi-panel/75 hover:bg-hmi-panel/90 backdrop-blur-md border border-hmi-grid/80 p-2 rounded-lg shadow-lg flex flex-col gap-1 min-w-[105px] pointer-events-auto select-none z-10 opacity-70 hover:opacity-100 transition-all duration-300">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-3.5 h-0.5 border-t-2 border-dashed border-hmi-ideal" />
            <span className="text-hmi-text font-medium text-[11px]">Ideal Path</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-3.5 h-0.5 bg-hmi-actual" />
            <span className="text-hmi-text font-medium text-[11px]">Actual Path</span>
          </div>
          {showArm && (
            <div className="flex items-center gap-2 text-xs">
              <div className="flex items-center gap-0.5">
                <span className="w-2.5 h-1.5 rounded-sm bg-blue-500/20 border border-blue-500/40 relative flex items-center">
                  <span className="absolute inset-x-0 h-0.5 bg-blue-500" />
                </span>
                <span className="w-1 h-1 rounded-full bg-orange-500 shrink-0" />
                <span className="w-2 h-1.2 rounded-sm bg-orange-500/20 border border-orange-500/40 relative flex items-center">
                  <span className="absolute inset-x-0 h-0.5 bg-orange-500" />
                </span>
              </div>
              <span className="text-hmi-text font-medium text-[11px]">Arm Links</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-hmi-start flex items-center justify-center bg-transparent scale-75" />
            <span className="text-hmi-text font-medium text-[11px]">Start Point</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <svg className="w-3 h-4 text-hmi-target" viewBox="0 0 9 14" fill="none">
              <line x1="1" y1="0" x2="1" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M1 0 L9 3.5 L1 7 Z" fill="currentColor" />
            </svg>
            <span className="text-hmi-text font-medium text-[11px]">Target</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-3.5 h-0.5 border-t-2 border-dashed border-cyan-400" />
            <span className="text-hmi-text font-medium text-[11px]">Work Envelope</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-3.5 h-3.5 rounded bg-red-500/10 border border-red-500/25 scale-75" />
            <span className="text-hmi-text font-medium text-[11px]">Dead Zone</span>
          </div>
        </div>

        {/* Glassmorphic Stats telemetry overlay — bottom-left */}
        <div className={cn(
          "absolute bottom-3 left-3 font-sans text-xs text-hmi-text backdrop-blur-md px-3 py-2 rounded-lg shadow-lg flex flex-col gap-1.5 min-w-[190px] z-10 transition-all duration-500",
          isLive
            ? "bg-hmi-panel/90 border border-amber-500/30 shadow-[0_0_12px_2px_rgba(245,158,11,0.08)]"
            : "bg-hmi-panel/85 border border-hmi-grid/80"
        )}>
          <div className="flex justify-between items-center border-b border-hmi-grid/55 pb-1 mb-0.5">
            <div className="flex items-center gap-1.5">
              <span className={cn(
                "w-1.5 h-1.5 rounded-full shrink-0",
                isLive ? "bg-amber-500 animate-pulse" : "bg-hmi-muted"
              )} />
              <span className="font-bold text-hmi-text text-[11px] uppercase tracking-wider">Telemetry</span>
            </div>
            <span className="text-[10px] bg-hmi-elevated px-1.5 py-0.5 rounded text-hmi-text-secondary font-normal">Move {state.moveCount}</span>
          </div>
          {last ? (
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[11px]">
              <span className="text-hmi-muted font-sans text-left">Ideal X/Y:</span>
              <span className="text-hmi-ideal text-right font-medium">{last.xi.toFixed(1)}, {last.yi.toFixed(1)}</span>
              <span className="text-hmi-muted font-sans text-left">Actual X/Y:</span>
              <span className="text-hmi-pwm-pos text-right font-medium">{last.xa.toFixed(1)}, {last.ya.toFixed(1)}</span>
              <span className="text-hmi-muted font-sans text-left">Deviation:</span>
              <span className="text-hmi-error font-bold text-right">{errMm ? `${errMm.toFixed(2)} mm` : '--'}</span>
            </div>
          ) : state.bootPose ? (
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[11px]">
              <span className="text-hmi-muted font-sans text-left">Ideal X/Y:</span>
              <span className="text-hmi-ideal text-right font-medium">{state.bootPose.x.toFixed(1)}, {state.bootPose.y.toFixed(1)}</span>
              <span className="text-hmi-muted font-sans text-left">Actual X/Y:</span>
              <span className="text-hmi-pwm-pos text-right font-medium">{state.bootPose.x.toFixed(1)}, {state.bootPose.y.toFixed(1)}</span>
              <span className="text-hmi-muted font-sans text-left">Deviation:</span>
              <span className="text-hmi-error font-bold text-right">0.00 mm</span>
            </div>
          ) : (
            <div className="text-hmi-muted text-[11px] py-0.5 text-center font-sans">No active trajectory</div>
          )}
        </div>
      </div>
    </div>
  )
}

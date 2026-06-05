'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useHMI } from '@/lib/hmi-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Maximize2, Minimize2, Crosshair } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/tooltip'
import type { TPoint, HMIState } from '@/lib/hmi-types'
import { checkStraightLineTrajectory, getCurrentPosition } from '@/lib/trajectory-safety'
import { toast } from 'sonner'
import { downloadSingleGraph } from '@/lib/capture-utils'

export const L_OUTER = 170   // mm — outer workspace radius
export const L_INNER = 45    // mm — inner workspace radius (dead zone)
const WS_THETA_START = 0          // rad — workspace start angle
const WS_THETA_END   = Math.PI    // rad — workspace end angle (180°)

// Canvas margins (px)
const LM = 55, RM = 10, TM = 30, BM = 42

// Robot-space Y extent shown
const YMIN = -55, YMAX = 205  // mm
const TICK = 50                // mm per grid division

function getRobotCoords(
  canvas: HTMLCanvasElement, 
  clientX: number, 
  clientY: number
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
  const scale = Math.min(scaleY, scaleX)
  
  const originPy = H - BM + YMIN * scale
  const originPx = LM + plotW / 2
  
  const rx = (px - originPx) / scale
  const ry = (originPy - py) / scale
  
  return { x: rx, y: ry }
}

export function drawTrace(
  canvas: HTMLCanvasElement,
  state: HMIState,
  showArm: boolean,
  hoverPoint?: { x: number; y: number } | null
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  
  const currentPos = getCurrentPosition(state)
  
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
  const scale = Math.min(scaleY, scaleX)

  // Pixel coordinate of robot origin (x=0, y=0)
  const originPy = H - BM + YMIN * scale
  const originPx = LM + plotW / 2

  // Derived visible X range
  const XHALF = plotW / 2 / scale

  function toPx(rx: number, ry: number): [number, number] {
    return [originPx + rx * scale, originPy - ry * scale]
  }

  // ── Background ──────────────────────────────────────────────────────────
  ctx.fillStyle = '#121212' // Charcoal black matching --color-hmi-bg
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#1C1C1C' // Dark gray matching --color-hmi-panel
  ctx.fillRect(LM, TM, plotW, plotH)

  // ── Fine Dotted Grid ────────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.lineWidth = 1
  ctx.setLineDash([2, 2])

  const xStart = Math.ceil(-XHALF / TICK) * TICK
  const xEnd   = Math.floor(XHALF  / TICK) * TICK
  const yStart = Math.ceil(YMIN    / TICK) * TICK
  const yEnd   = Math.floor(YMAX   / TICK) * TICK

  for (let x = xStart; x <= xEnd; x += TICK) {
    const px = toPx(x, 0)[0]
    if (px < LM - 1 || px > W - RM + 1) continue
    ctx.beginPath(); ctx.moveTo(px, TM); ctx.lineTo(px, H - BM); ctx.stroke()
  }
  for (let y = yStart; y <= yEnd; y += TICK) {
    const py = toPx(0, y)[1]
    if (py < TM - 1 || py > H - BM + 1) continue
    ctx.beginPath(); ctx.moveTo(LM, py); ctx.lineTo(W - RM, py); ctx.stroke()
  }

  // ── Axis Zero Lines (Brighter, more prominent) ──────────────────────────
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([])
  ctx.beginPath(); ctx.moveTo(originPx, TM); ctx.lineTo(originPx, H - BM); ctx.stroke()
  const yZeroPy = toPx(0, 0)[1]
  if (yZeroPy >= TM && yZeroPy <= H - BM) {
    ctx.beginPath(); ctx.moveTo(LM, yZeroPy); ctx.lineTo(W - RM, yZeroPy); ctx.stroke()
  }

  // ── Plot Area Border Frame ──────────────────────────────────────────────
  ctx.strokeStyle = '#3A3A3A' // Slightly brighter than --color-hmi-grid
  ctx.lineWidth = 1.5
  ctx.strokeRect(LM, TM, plotW, plotH)

  // ── Tick Marks & Proportional Labels ────────────────────────────────────
  ctx.fillStyle = '#9A9A9A' // Slate/Muted labels
  ctx.font = '500 11px Geist, "Geist Sans", -apple-system, sans-serif'

  // Y-axis: right-aligned labels
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let y = yStart; y <= yEnd; y += TICK) {
    const py = toPx(0, y)[1]
    if (py < TM - 4 || py > H - BM + 4) continue
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(LM - 4, py); ctx.lineTo(LM, py); ctx.stroke()
    ctx.fillStyle = '#9A9A9A'
    ctx.fillText(String(y), LM - 6, py)
  }

  // X-axis: center-aligned labels — within bounds to avoid edge clutter
  const X_LABEL_MAX = 200
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let x = xStart; x <= xEnd; x += TICK) {
    if (x === 0 || Math.abs(x) > X_LABEL_MAX) continue
    const px = toPx(x, 0)[0]
    if (px < LM - 4 || px > W - RM + 4) continue
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(px, H - BM); ctx.lineTo(px, H - BM + 4); ctx.stroke()
    ctx.fillStyle = '#9A9A9A'
    ctx.fillText(String(x), px, H - BM + 5)
  }

  // Axis Titles
  ctx.fillStyle = '#9A9A9A'
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

  // ── Workspace: Annular Sector (r: 45–170mm, θ: 0–180°) ─────────────────
  // Visual priority: boundary is background context — it should be the LAST
  // thing the eye notices. Fills are near-invisible; arcs are thin + dashed.
  const outerR = L_OUTER * scale
  const innerR = L_INNER * scale

  ctx.save()
  ctx.beginPath()
  ctx.rect(LM, TM, plotW, plotH)
  ctx.clip()

  // Layer 1 — out-of-bounds zone (outside outer arc): barely-there warm tint
  ctx.fillStyle = 'rgba(239, 83, 80, 0.04)'
  ctx.fillRect(LM, TM, plotW, plotH)

  // Layer 2 — reachable annular sector: "clear" the flood fill from within
  ctx.fillStyle = 'rgba(28, 28, 28, 0.55)'
  ctx.beginPath()
  ctx.arc(originPx, originPy, outerR, 0, Math.PI, true)
  ctx.arc(originPx, originPy, innerR, Math.PI, 0, false)
  ctx.closePath()
  ctx.fill()

  // Layer 3 — boundary arcs: thin dashed muted cyan — recedes behind data
  ctx.setLineDash([5, 4])
  ctx.strokeStyle = 'rgba(100, 210, 220, 0.35)'
  ctx.lineWidth = 1

  // Outer arc
  ctx.beginPath()
  ctx.arc(originPx, originPy, outerR, 0, Math.PI, true)
  ctx.stroke()

  // Inner arc
  ctx.beginPath()
  ctx.arc(originPx, originPy, innerR, 0, Math.PI, true)
  ctx.stroke()

  // Radial edges at θ=0° and θ=180°
  ctx.beginPath()
  ctx.moveTo(originPx + innerR, originPy)
  ctx.lineTo(originPx + outerR, originPy)
  ctx.moveTo(originPx - innerR, originPy)
  ctx.lineTo(originPx - outerR, originPy)
  ctx.stroke()

  ctx.setLineDash([])
  ctx.restore() // end workspace clip

  // ── Origin Marker Crosshair ───────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
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

  // Draw SCARA links underneath the paths but on top of the grid
  if (showArm && (latestPoint || state.bootPose)) {
    let actualElbow: [number, number] | null = null
    let idealElbow: [number, number] | null = null
    let actualTip: [number, number] | null = null
    let idealTip: [number, number] | null = null

    if (latestPoint) {
      actualTip = [latestPoint.xa, latestPoint.ya]
      idealTip = [latestPoint.xi, latestPoint.yi]
      if (latestDSample) {
        const l1 = 100
        actualElbow = [
          l1 * Math.cos(latestDSample.th1),
          l1 * Math.sin(latestDSample.th1)
        ]
        idealElbow = [
          l1 * Math.cos(latestDSample.th1d),
          l1 * Math.sin(latestDSample.th1d)
        ]
      } else {
        // Fallback: If we don't have DSample, reconstruct using Inverse Kinematics.
        const l1 = 100
        const l2 = 70
        
        const getIKElbow = (x: number, y: number): [number, number] => {
          const r2 = x * x + y * y
          const r = Math.sqrt(r2)
          if (r === 0) return [0, 0]
          const cosAlpha = Math.max(-1, Math.min(1, (l1 * l1 + r2 - l2 * l2) / (2 * l1 * r)))
          const alpha = Math.acos(cosAlpha)
          const beta = Math.atan2(y, x)
          // Default to right-handed configuration
          const theta1 = beta - alpha
          return [l1 * Math.cos(theta1), l1 * Math.sin(theta1)]
        }

        actualElbow = getIKElbow(latestPoint.xa, latestPoint.ya)
        idealElbow = getIKElbow(latestPoint.xi, latestPoint.yi)
      }
    } else if (state.bootPose) {
      const l1 = 100
      actualTip = [state.bootPose.x, state.bootPose.y]
      actualElbow = [
        l1 * Math.cos(state.bootPose.th1),
        l1 * Math.sin(state.bootPose.th1)
      ]
    }

    // 1. Draw Ideal Arm (Dashed skeletal lines: J1 blue, J2 orange)
    if (idealElbow && idealTip) {
      const bPx = toPx(0, 0)
      const iePx = toPx(idealElbow[0], idealElbow[1])
      const itPx = toPx(idealTip[0], idealTip[1])

      ctx.save()
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      
      // Link 1 (Ideal J1) - Blue
      ctx.strokeStyle = 'rgba(33, 150, 243, 0.45)'
      ctx.beginPath()
      ctx.moveTo(bPx[0], bPx[1])
      ctx.lineTo(iePx[0], iePx[1])
      ctx.stroke()

      // Link 2 (Ideal J2) - Orange
      ctx.strokeStyle = 'rgba(255, 152, 0, 0.45)'
      ctx.beginPath()
      ctx.moveTo(iePx[0], iePx[1])
      ctx.lineTo(itPx[0], itPx[1])
      ctx.stroke()
      
      ctx.restore()
    }

    // 2. Draw Actual Arm (Modern glowing semi-transparent capsule bars: J1 blue, J2 orange)
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
          const ux = dx / len
          const uy = dy / len
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
            ctx.moveTo(p1[0], p1[1])
            ctx.lineTo(p2[0], p2[1])
            ctx.strokeStyle = coreCol
            ctx.lineWidth = coreWidth
            ctx.lineCap = 'round'
            ctx.stroke()
          }
        }
        ctx.restore()
      }

      // Link 1 (inner arm, J1): l1 = 100mm, colored blue
      drawCapsule(
        bPx,
        aePx,
        12, // width
        'rgba(30, 30, 30, 0.75)', // body
        'rgba(33, 150, 243, 0.3)', // border
        'rgba(33, 150, 243, 0.85)', // core
        2.5 // coreWidth
      )

      // Link 2 (outer arm, J2): l2 = 70mm, colored orange
      drawCapsule(
        aePx,
        atPx,
        9, // width
        'rgba(30, 30, 30, 0.75)', // body
        'rgba(255, 152, 0, 0.3)', // border
        'rgba(255, 152, 0, 0.85)', // core
        1.8 // coreWidth
      )

      // Joint pivots
      const drawJoint = (p: [number, number], r: number, color: string) => {
        ctx.save()
        ctx.beginPath()
        ctx.arc(p[0], p[1], r, 0, Math.PI * 2)
        ctx.fillStyle = '#1C1C1C'
        ctx.fill()
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.stroke()
        
        ctx.beginPath()
        ctx.arc(p[0], p[1], r * 0.4, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.restore()
      }

      // Base joint (J1) - Blue
      drawJoint(bPx, 6, '#2196F3')
      // Elbow joint (J2) - Orange
      drawJoint(aePx, 4.5, '#FF9800')
    }
  }

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
    ctx.strokeStyle = '#2196F3'; ctx.lineWidth = 1; ctx.setLineDash([5, 3])
    drawPath(state.prevTBuffer, true, ghostOpacity)
    ctx.strokeStyle = '#EF5350'; ctx.lineWidth = 1.5; ctx.setLineDash([])
    drawPath(state.prevTBuffer, false, ghostOpacity)
  }

  if (activeBuf.length >= 2) {
    // Ideal path — dashed blue
    ctx.strokeStyle = '#2196F3'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3])
    drawPath(activeBuf, true)

    // Actual path — solid red
    ctx.strokeStyle = '#EF5350'; ctx.lineWidth = 2; ctx.setLineDash([])
    drawPath(activeBuf, false)

    // Start marker — hollow green circle
    const [sx, sy] = toPx(activeBuf[0].xi, activeBuf[0].yi)
    ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.stroke()

    // Live tip dots (REC only)
    if (state.recordingState === 'REC') {
      const last = activeBuf[activeBuf.length - 1]
      const [ix, iy] = toPx(last.xi, last.yi)
      const [ax, ay] = toPx(last.xa, last.ya)
      ctx.fillStyle = '#2196F3'; ctx.beginPath(); ctx.arc(ix, iy, 4, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#EF5350';  ctx.beginPath(); ctx.arc(ax, ay, 4, 0, Math.PI * 2); ctx.fill()
    }
  }

  // Target marker — orange flag (pole + triangular flag)
  const targetX = state.currentMove?.xf ?? state.bootPose?.x
  const targetY = state.currentMove?.yf ?? state.bootPose?.y
  if (targetX !== undefined && targetY !== undefined) {
    const [tx, ty] = toPx(targetX, targetY)
    ctx.setLineDash([])
    ctx.fillStyle = '#FF9800'; ctx.strokeStyle = '#FF9800'; ctx.lineWidth = 1.5
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
    
    const [cpx, cpy] = toPx(currentPos.x, currentPos.y)
    const [tpx, tpy] = toPx(activeTarget.x, activeTarget.y)
    
    ctx.save()
    ctx.setLineDash([4, 4])
    ctx.lineWidth = 1.8
    ctx.strokeStyle = isPathSafe ? 'rgba(76, 175, 80, 0.65)' : 'rgba(239, 83, 80, 0.85)'
    
    ctx.beginPath()
    ctx.moveTo(cpx, cpy)
    ctx.lineTo(tpx, tpy)
    ctx.stroke()
    
    // If the path crosses the inner dead zone, mark the intersection/vertex point
    if (!isPathSafe && safety.reason === 'inner_violation') {
      const dx = activeTarget.x - currentPos.x
      const dy = activeTarget.y - currentPos.y
      const a = dx * dx + dy * dy
      if (a > 0) {
        const b = 2 * (currentPos.x * dx + currentPos.y * dy)
        const tVertex = Math.max(0, Math.min(1, -b / (2 * a)))
        const vx = currentPos.x + tVertex * dx
        const vy = currentPos.y + tVertex * dy
        const [vpx, vpy] = toPx(vx, vy)
        
        // Draw red warning node at the closest point to origin
        ctx.beginPath()
        ctx.arc(vpx, vpy, 6, 0, Math.PI * 2)
        ctx.fillStyle = '#EF5350'
        ctx.fill()
        ctx.strokeStyle = '#FFFFFF'
        ctx.lineWidth = 1.2
        ctx.stroke()
        
        // Exclamation point
        ctx.fillStyle = '#FFFFFF'
        ctx.font = 'bold 9px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('!', vpx, vpy)
      }
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
    const isReachable = r2 >= 45 * 45 && r2 <= 170 * 170 && y >= 0 && safety.isValid
    const dotColor = isReachable ? '#4CAF50' : '#EF5350'
    
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
    const isPathSafe = r2 >= 45 * 45 && r2 <= 170 * 170 && y >= 0 && safety.isValid
    const color = isPathSafe ? 'rgba(74, 175, 80, 0.7)' : 'rgba(239, 83, 80, 0.7)'
    const textColor = isPathSafe ? '#4CAF50' : '#EF5350'
    
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
  const [isFocused, setIsFocused] = useState(false)
  const [showArm, setShowArm] = useState(true)
  const [ghostOpacity, setGhostOpacity] = useState(0.2)

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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef(state)
  const showArmRef = useRef(showArm)
  const [isPicking, setIsPicking] = useState(false)
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null)

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
          downloadSingleGraph('xy', 'XY Workspace Trace', stateRef.current),
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
  }, [isFocused])

  // Sync stateRef to keep redraws using the latest data
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // Keep showArmRef synced for the resize observer closure
  useEffect(() => {
    showArmRef.current = showArm
  }, [showArm])

  // Draw helper
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (canvas) {
      drawTrace(canvas, stateRef.current, showArm, hoverPoint)
    }
  }, [showArm, hoverPoint])

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPicking) return
    const canvas = canvasRef.current
    if (!canvas) return
    const coords = getRobotCoords(canvas, e.clientX, e.clientY)
    setHoverPoint(coords)
  }

  const handleMouseLeave = () => {
    setHoverPoint(null)
  }

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPicking) return
    const canvas = canvasRef.current
    if (!canvas) return
    const coords = getRobotCoords(canvas, e.clientX, e.clientY)
    
    // Check reachability and trajectory safety
    const r2 = coords.x * coords.x + coords.y * coords.y
    const isReachable = r2 >= 45 * 45 && r2 <= 170 * 170 && coords.y >= 0
    
    if (!isReachable) {
      alert(`Invalid Point: Coordinate (${coords.x.toFixed(1)}, ${coords.y.toFixed(1)}) is outside the reachable workspace (45 - 170 mm).`)
      return
    }
    
    const currentPos = getCurrentPosition(stateRef.current)
    const safety = checkStraightLineTrajectory(currentPos, coords, L_INNER, L_OUTER)
    if (!safety.isValid) {
      if (safety.reason === 'inner_violation') {
        const minD = safety.minDistance ? safety.minDistance.toFixed(1) : 'unknown'
        alert(`Invalid Trajectory: The straight-line path passes through the inner dead zone (passes at ${minD} mm, minimum is 45.0 mm).`)
      } else {
        alert('Invalid Trajectory: Path is outside the reachable workspace.')
      }
      return
    }
    
    dispatch({ type: 'PICK_TARGET', target: { x: coords.x, y: coords.y } })
    setIsPicking(false)
    setHoverPoint(null)
  }

  // Observe resize to adjust backing store size
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width  = Math.floor(canvas.clientWidth * dpr)
      canvas.height = Math.floor(canvas.clientHeight * dpr)
      drawTrace(canvas, stateRef.current, showArmRef.current)
    }

    const ro = new ResizeObserver(handleResize)
    ro.observe(canvas)
    
    // Initial size setup & draw
    handleResize()

    return () => ro.disconnect()
  }, []) // Empty dependencies ensure this runs once on mount

  // ── Throttled canvas redraw (10 Hz) ──────────────────────────────────
  // Instead of re-drawing on every context update (16.7 Hz BATCH_SAMPLES),
  // we pull the latest state from stateRef and schedule exactly one rAF
  // per interval tick. The canvas still shows the most-recent data because
  // stateRef is always kept in sync (no data is lost).
  const rafIdRef = useRef<number | null>(null)
  useEffect(() => {
    const tick = () => {
      if (rafIdRef.current !== null) return // already a frame queued
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null
        const canvas = canvasRef.current
        if (canvas) {
          drawTrace(canvas, stateRef.current, showArmRef.current, hoverPoint)
        }
      })
    }
    const id = setInterval(tick, 100) // 10 Hz
    return () => {
      clearInterval(id)
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current)
    }
  }, [hoverPoint]) // hoverPoint changes need immediate redraw

  // For non-live interactions (pick point, mode changes) we still want an
  // immediate redraw so the UI feels snappy.
  useEffect(() => {
    draw()
  }, [
    state.recordingState,
    state.frozenT,
    state.prevTBuffer,
    state.showGhost,
    state.currentMove,
    state.previewTarget,
    state.bootPose,
    showArm,
    draw,
  ])

  const activeBuf = state.recordingState === 'REC' ? state.tBuffer : state.frozenT
  const last = activeBuf[activeBuf.length - 1]
  const errMm = last ? Math.sqrt((last.xi - last.xa) ** 2 + (last.yi - last.ya) ** 2) : null

  const recColor = 
    state.recordingState === 'REC'
      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.2)]'
      : state.recordingState === 'IDLE'
        ? 'bg-emerald-600 text-white border border-emerald-500 font-bold shadow-[0_0_8px_rgba(16,185,129,0.2)]'
        : 'bg-slate-800/60 text-slate-500 border border-slate-800'
  const recLabel =
    state.recordingState === 'REC'    ? '⏺ REC'
    : state.recordingState === 'IDLE' ? '⏹ IDLE'
    : '⏸ WAITING'

  const isLive = state.recordingState === 'REC'

  return (
    <div 
      className={cn(
        "bg-hmi-panel border rounded-lg overflow-hidden flex-1 min-h-0 flex flex-col transition-all duration-300 group/graph",
        // Base border — noticeably stronger than surrounding panels
        "border-slate-600/70",
        // Live glow aura when robot is actively recording (pulsing amber)
        isLive
          ? "shadow-[0_0_0_1px_rgba(245,158,11,0.25),0_0_18px_4px_rgba(245,158,11,0.12),0_4px_20px_rgba(0,0,0,0.5)]"
          : "shadow-[0_2px_12px_rgba(0,0,0,0.4)] hover:shadow-[0_0_0_1px_rgba(33,150,243,0.2),0_4px_20px_rgba(0,0,0,0.5)]",
        isFocused 
          ? "fixed inset-0 z-[100] m-0 rounded-none p-6 bg-hmi-bg border-0 shadow-none" 
          : "relative"
      )}
    >
      {/* Panel Header */}
      <div className={cn(
        "flex items-center justify-between border-b shrink-0 bg-hmi-panel",
        // Stronger header separator that matches the upgraded panel border
        isLive ? "border-amber-500/30" : "border-slate-600/50",
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
              {/* Subtle accent bar — turns amber/animated when live */}
              <span
                className={cn(
                  "w-1 h-4 rounded-full transition-colors duration-500",
                  isLive ? "bg-amber-500 animate-pulse" : "bg-hmi-ideal/60"
                )}
              />
              <p className="text-sm font-semibold text-slate-200 tracking-wide">XY Trace</p>
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
                // Pulse ring when actively recording
                isLive && "ring-1 ring-amber-500/40"
              )}
            >{recLabel}</Badge>
          </Tooltip>
        </div>

        <div className="flex items-center gap-1.5">
          <Tooltip content={isPicking ? "Cancel: Exit target coordinate selection mode." : "Pick Point: Click a point on the workspace graph to set it as target coordinates."} align="center">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={(e) => { e.stopPropagation(); setIsPicking(prev => !prev); if (isPicking) setHoverPoint(null); }} 
              className={cn(
                "h-5 px-1.5 text-[10px] border-slate-700/60 text-slate-300 bg-slate-900/60 hover:bg-slate-800/80", 
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
                "h-5 px-1.5 text-[10px] border-slate-700/60 text-slate-300 bg-slate-900/60 hover:bg-slate-800/80", 
                state.showGhost && "bg-slate-800 text-hmi-ideal border-hmi-ideal/30 hover:bg-slate-800/90"
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
                "h-5 px-1.5 text-[10px] border-slate-700/60 text-slate-300 bg-slate-900/60 hover:bg-slate-800/80", 
                showArm && "bg-slate-800 text-hmi-actual border-hmi-actual/30 hover:bg-slate-800/90"
              )}
            >
              Arm Links {showArm ? 'on' : 'off'}
            </Button>
          </Tooltip>
          <Tooltip content={isFocused ? "Collapse: Restores the panel to normal size." : "Expand: Maximizes the workspace trace."} align="center">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={(e) => { e.stopPropagation(); setIsFocused(!isFocused); }} 
              className="h-5 px-1.5 text-[10px] border-slate-700/60 text-slate-300 bg-slate-900/60 hover:bg-slate-800/80"
            >
              {isFocused ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
              <span className="ml-1">{isFocused ? 'Collapse' : 'Expand'}</span>
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Graph Area Wrapper */}
      <div className="relative flex-1 min-h-0 w-full">
        <canvas 
          ref={canvasRef} 
          className={cn(
            "absolute inset-0 w-full h-full",
            isPicking ? "cursor-crosshair" : ""
          )}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleCanvasClick}
        />

        {/* Pick Point Mode active banner */}
        {isPicking && (
          <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-amber-500 text-slate-950 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-[0_0_15px_rgba(245,158,11,0.45)] z-20 border border-amber-400 select-none animate-bounce">
            <Crosshair className="h-3.5 w-3.5 animate-spin" style={{ animationDuration: '3s' }} />
            <span>Click workspace to set target point (Esc to exit)</span>
          </div>
        )}

        {/* Vector HTML Legend Overlay */}
        <div className="absolute top-2 right-2 bg-slate-900/70 backdrop-blur-md border border-slate-800/85 p-2 rounded-lg shadow-lg flex flex-col gap-1 min-w-[95px] pointer-events-none select-none z-10">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-3.5 h-0.5 border-t-2 border-dashed border-hmi-ideal" />
            <span className="text-slate-300 font-medium">Ideal Path</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-3.5 h-0.5 bg-hmi-actual" />
            <span className="text-slate-300 font-medium">Actual Path</span>
          </div>
          {showArm && (
            <div className="flex items-center gap-2 text-xs">
              <div className="flex items-center gap-0.5">
                {/* J1 Link representation */}
                <span className="w-2.5 h-1.5 rounded-sm bg-blue-500/20 border border-blue-500/40 relative flex items-center">
                  <span className="absolute inset-x-0 h-0.5 bg-blue-500" />
                </span>
                {/* Connection dot */}
                <span className="w-1 h-1 rounded-full bg-orange-500 shrink-0" />
                {/* J2 Link representation */}
                <span className="w-2 h-1.2 rounded-sm bg-orange-500/20 border border-orange-500/40 relative flex items-center">
                  <span className="absolute inset-x-0 h-0.5 bg-orange-500" />
                </span>
              </div>
              <span className="text-slate-300 font-medium">Arm Links</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-hmi-start flex items-center justify-center bg-transparent scale-75" />
            <span className="text-slate-300 font-medium">Start Point</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {/* Flag icon: vertical pole + triangular pennant, matching canvas target marker */}
            <svg className="w-3 h-4 text-hmi-target" viewBox="0 0 9 14" fill="none">
              {/* Pole */}
              <line x1="1" y1="0" x2="1" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              {/* Triangular pennant */}
              <path d="M1 0 L9 3.5 L1 7 Z" fill="currentColor" />
            </svg>
            <span className="text-slate-300 font-medium">Target</span>
          </div>
        </div>

        {/* Glassmorphic Stats telemetry overlay — bottom-left */}
        <div className={cn(
          "absolute bottom-3 left-16 font-sans text-xs text-slate-300 backdrop-blur-md px-3 py-2 rounded-lg shadow-lg flex flex-col gap-1.5 min-w-[190px] z-10 transition-all duration-500",
          // Border brightens and gets a subtle glow when recording live telemetry
          isLive
            ? "bg-slate-900/85 border border-amber-500/30 shadow-[0_0_12px_2px_rgba(245,158,11,0.08)]"
            : "bg-slate-900/80 border border-slate-800/80"
        )}>
          <div className="flex justify-between items-center border-b border-slate-700/60 pb-1 mb-0.5">
            <div className="flex items-center gap-1.5">
              {/* Live dot — pulses when recording */}
              <span className={cn(
                "w-1.5 h-1.5 rounded-full shrink-0",
                isLive ? "bg-amber-500 animate-pulse" : "bg-slate-600"
              )} />
              <span className="font-bold text-slate-300 text-[11px] uppercase tracking-wider">Telemetry</span>
            </div>
            <span className="text-[10px] bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-400 font-normal">Move {state.moveCount}</span>
          </div>
          {last ? (
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[11px]">
              <span className="text-slate-500 font-sans text-left">Ideal X/Y:</span>
              <span className="text-hmi-ideal text-right font-medium">{last.xi.toFixed(1)}, {last.yi.toFixed(1)}</span>
              <span className="text-slate-500 font-sans text-left">Actual X/Y:</span>
              <span className="text-hmi-pwm-pos text-right font-medium">{last.xa.toFixed(1)}, {last.ya.toFixed(1)}</span>
              <span className="text-slate-500 font-sans text-left">Deviation:</span>
              <span className="text-hmi-error font-bold text-right">{errMm ? `${errMm.toFixed(2)} mm` : '--'}</span>
            </div>
          ) : state.bootPose ? (
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[11px]">
              <span className="text-slate-500 font-sans text-left">Ideal X/Y:</span>
              <span className="text-hmi-ideal text-right font-medium">{state.bootPose.x.toFixed(1)}, {state.bootPose.y.toFixed(1)}</span>
              <span className="text-slate-500 font-sans text-left">Actual X/Y:</span>
              <span className="text-hmi-pwm-pos text-right font-medium">{state.bootPose.x.toFixed(1)}, {state.bootPose.y.toFixed(1)}</span>
              <span className="text-slate-500 font-sans text-left">Deviation:</span>
              <span className="text-hmi-error font-bold text-right">0.00 mm</span>
            </div>
          ) : (
            <div className="text-slate-500 text-[11px] py-0.5 text-center font-sans">No active trajectory</div>
          )}
        </div>
      </div>
    </div>
  )
}

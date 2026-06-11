import type { HMIState, TPoint } from './hmi-types'

export interface Point2D {
  x: number
  y: number
}

/**
 * Gets the robot's current actual position from the HMI state.
 * Accepts HMIState or HMISlowState (tBuffer is optional — falls back to frozenT).
 */
export function getCurrentPosition(state: {
  recordingState: string
  tBuffer?: TPoint[]
  frozenT: TPoint[]
  bootPose: { x: number; y: number; th1: number; th2: number } | null
}): Point2D {
  const activeBuf = state.recordingState === 'REC'
    ? (state.tBuffer ?? state.frozenT)
    : state.frozenT
  const latestPoint = activeBuf.length > 0 ? activeBuf[activeBuf.length - 1] : null
  if (latestPoint) {
    return { x: latestPoint.xa, y: latestPoint.ya }
  } else if (state.bootPose) {
    return { x: state.bootPose.x, y: state.bootPose.y }
  }
  // Fallback to origin if no telemetry is present
  return { x: 0, y: 0 }
}

/**
 * Checks if a straight-line trajectory between p1 and p2 is safe,
 * meaning it does not violate workspace boundaries:
 * 1. Coordinates remain inside the outer boundary (R <= rMax).
 * 2. Coordinates remain outside the inner dead zone (R >= rMin).
 * 3. Coordinates remain within angular limits (Y >= 0).
 */
export function checkStraightLineTrajectory(
  p1: Point2D,
  p2: Point2D,
  rMin: number = 70.7,
  rMax: number = 170
): {
  isValid: boolean
  reason?: 'inner_violation' | 'outer_violation' | 'angle_violation' | 'endpoint_invalid'
  minDistance?: number
} {
  // 1. Verify target endpoint is valid first
  const r1Sq = p1.x * p1.x + p1.y * p1.y
  const r2Sq = p2.x * p2.x + p2.y * p2.y
  
  if (p2.y < 0) {
    return { isValid: false, reason: 'angle_violation' }
  }
  if (r2Sq < rMin * rMin) {
    return { isValid: false, reason: 'inner_violation', minDistance: Math.sqrt(r2Sq) }
  }
  if (r2Sq > rMax * rMax) {
    return { isValid: false, reason: 'outer_violation' }
  }

  // 2. Check inner boundary crossing along the segment
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const a = dx * dx + dy * dy
  
  // Same start and end point
  if (a === 0) {
    return { isValid: true }
  }
  
  const b = 2 * (p1.x * dx + p1.y * dy)
  const tVertex = -b / (2 * a)
  
  let minDistanceSq: number
  if (tVertex <= 0) {
    minDistanceSq = r1Sq
  } else if (tVertex >= 1) {
    minDistanceSq = r2Sq
  } else {
    minDistanceSq = r1Sq - (b * b) / (4 * a)
  }
  
  const minDistance = Math.sqrt(minDistanceSq)
  if (minDistance < rMin) {
    return { 
      isValid: false, 
      reason: 'inner_violation', 
      minDistance 
    }
  }
  
  return { isValid: true }
}

/**
 * Calculates a safe intermediate point (waypoint) to route around the inner singularity circle.
 * Employs the tangent-bisector intersection method to find the optimal bypass coordinate.
 */
export function calculateIntermediatePoint(
  p1: Point2D,
  p2: Point2D,
  rMin: number = 70.7,
  rMax: number = 170
): Point2D {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-8) {
    return { ...p1 }
  }

  // 1. Find the closest point V on the straight line segment to the origin
  const t = Math.max(0, Math.min(1, -(p1.x * dx + p1.y * dy) / lenSq))
  const vx = p1.x + t * dx
  const vy = p1.y + t * dy
  const vMag = Math.sqrt(vx * vx + vy * vy)

  // 2. Determine radial direction from origin
  let ux = 0
  let uy = 1
  if (vMag > 1e-5) {
    ux = vx / vMag
    uy = vy / vMag
  }

  const r1 = Math.sqrt(p1.x * p1.x + p1.y * p1.y)
  const r2 = Math.sqrt(p2.x * p2.x + p2.y * p2.y)

  // 3. Solve for required R_safe on start point side (p1)
  let rSafe1 = 0
  const cosD1 = r1 > 0 ? (p1.x * ux + p1.y * uy) / r1 : 0
  const sinD1Sq = Math.max(0, 1 - cosD1 * cosD1)
  const a1 = r1 * r1 * sinD1Sq - rMin * rMin
  if (a1 > 0) {
    const b1 = 2 * r1 * rMin * rMin * cosD1
    const c1 = -r1 * r1 * rMin * rMin
    const disc = b1 * b1 - 4 * a1 * c1
    if (disc >= 0) {
      rSafe1 = (-b1 + Math.sqrt(disc)) / (2 * a1)
    }
  }

  // 4. Solve for required R_safe on target point side (p2)
  let rSafe2 = 0
  const cosD2 = r2 > 0 ? (p2.x * ux + p2.y * uy) / r2 : 0
  const sinD2Sq = Math.max(0, 1 - cosD2 * cosD2)
  const a2 = r2 * r2 * sinD2Sq - rMin * rMin
  if (a2 > 0) {
    const b2 = 2 * r2 * rMin * rMin * cosD2
    const c2 = -r2 * r2 * rMin * rMin
    const disc = b2 * b2 - 4 * a2 * c2
    if (disc >= 0) {
      rSafe2 = (-b2 + Math.sqrt(disc)) / (2 * a2)
    }
  }

  // 5. Combine and apply safety margins/limits
  // Base default safe radius is 110 mm, we add a 5 mm safety margin
  let rSafe = Math.max(rSafe1, rSafe2, 110.0)
  rSafe += 5.0

  // Clamp within safe limits of reachable workspace
  const rMinLimit = rMin + 5.0
  const rMaxLimit = rMax - 5.0
  if (rSafe < rMinLimit) rSafe = rMinLimit
  if (rSafe > rMaxLimit) rSafe = rMaxLimit

  return {
    x: rSafe * ux,
    y: rSafe * uy,
  }
}


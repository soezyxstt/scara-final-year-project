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
 * Checks if the polar angle phi of (x, y) is within -30 and 210 degrees.
 * Invalid range is (-150, -30) degrees.
 * In Cartesian, this invalid region is defined by: y < -0.577350269 * abs(x).
 */
export function isAngleValid(x: number, y: number): boolean {
  return !(y < -0.577350269 * Math.abs(x))
}

function ccw(A: Point2D, B: Point2D, C: Point2D): boolean {
  return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x)
}

function intersect(A: Point2D, B: Point2D, C: Point2D, D: Point2D): boolean {
  return ccw(A, C, D) !== ccw(B, C, D) && ccw(A, B, C) !== ccw(A, B, D)
}

/**
 * Checks if a straight segment between p1 and p2 crosses the forbidden angular zone.
 */
export function pathCrossesForbiddenAngle(p1: Point2D, p2: Point2D): boolean {
  if (!isAngleValid(p1.x, p1.y) || !isAngleValid(p2.x, p2.y)) {
    return true
  }
  const ray1End = { x: 200, y: -115.4700538 }
  const ray2End = { x: -200, y: -115.4700538 }
  const origin = { x: 0, y: 0 }
  return intersect(p1, p2, origin, ray1End) || intersect(p1, p2, origin, ray2End)
}

/**
 * Checks if a straight-line trajectory between p1 and p2 is safe,
 * meaning it does not violate workspace boundaries:
 * 1. Coordinates remain inside the outer boundary (R <= rMax).
 * 2. Coordinates remain outside the inner dead zone (R >= rMin).
 * 3. Coordinates remain within angular limits (-30 <= phi <= 210 deg).
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
  
  if (!isAngleValid(p2.x, p2.y)) {
    return { isValid: false, reason: 'angle_violation' }
  }
  if (r2Sq < rMin * rMin) {
    return { isValid: false, reason: 'inner_violation', minDistance: Math.sqrt(r2Sq) }
  }
  if (r2Sq > rMax * rMax) {
    return { isValid: false, reason: 'outer_violation' }
  }
  
  // Check path crossing forbidden angle
  if (pathCrossesForbiddenAngle(p1, p2)) {
    return { isValid: false, reason: 'angle_violation' }
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
  const rSafe = 120.0 // safe comfortable radius in mm

  const theta0 = Math.atan2(p1.y, p1.x)
  const theta1 = Math.atan2(p2.y, p2.x)

  // Shortest angular difference in [-PI, PI]
  let thetaDiff = theta1 - theta0
  while (thetaDiff < -Math.PI) thetaDiff += 2 * Math.PI
  while (thetaDiff > Math.PI) thetaDiff -= 2 * Math.PI

  const candAngles = [
    theta0 + thetaDiff / 2,
    theta0 + thetaDiff / 2 + Math.PI
  ].map(a => {
    let normalized = a
    while (normalized < -Math.PI) normalized += 2 * Math.PI
    while (normalized > Math.PI) normalized -= 2 * Math.PI
    return normalized
  })

  let bestPoint: Point2D | null = null
  let minPathLen = Infinity

  for (const angle of candAngles) {
    const pCand = {
      x: rSafe * Math.cos(angle),
      y: rSafe * Math.sin(angle)
    }

    // Check if the candidate itself is in the valid angular sector
    if (!isAngleValid(pCand.x, pCand.y)) {
      continue
    }

    // Check if both segments (p1 -> pCand and pCand -> p2) are safe
    const path1 = checkStraightLineTrajectory(p1, pCand, rMin, rMax)
    const path2 = checkStraightLineTrajectory(pCand, p2, rMin, rMax)

    if (path1.isValid && path2.isValid) {
      const len = Math.hypot(pCand.x - p1.x, pCand.y - p1.y) + Math.hypot(p2.x - pCand.x, p2.y - pCand.y)
      if (len < minPathLen) {
        minPathLen = len
        bestPoint = pCand
      }
    }
  }

  if (bestPoint) {
    return bestPoint
  }

  // Fallback to top-center (90 degrees) at safe radius
  return {
    x: 0,
    y: rSafe
  }
}


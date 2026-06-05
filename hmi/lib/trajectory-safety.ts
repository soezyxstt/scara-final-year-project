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
  rMin: number = 45,
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

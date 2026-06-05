import type { TPoint } from './hmi-types'

/**
 * Calculates the Cross Tracking Error (CTE) for each actual point in the trajectory
 * relative to the desired path formed by the sequence of ideal points.
 * 
 * Compares squared distances to avoid calling Math.sqrt inside the loop.
 */
export function computeCTEList(tBuf: TPoint[]): number[] {
  const n = tBuf.length
  if (n === 0) return []
  if (n === 1) {
    const p = tBuf[0]
    return [Math.sqrt((p.xa - p.xi) ** 2 + (p.ya - p.yi) ** 2)]
  }

  // Precompute segments of the ideal path
  const segments = []
  for (let i = 0; i < n - 1; i++) {
    const Ax = tBuf[i].xi
    const Ay = tBuf[i].yi
    const Bx = tBuf[i + 1].xi
    const By = tBuf[i + 1].yi
    const vx = Bx - Ax
    const vy = By - Ay
    const v_sq = vx * vx + vy * vy
    segments.push({ Ax, Ay, vx, vy, v_sq })
  }

  const ctes = new Array(n)
  for (let j = 0; j < n; j++) {
    const Px = tBuf[j].xa
    const Py = tBuf[j].ya
    let minSqDist = Infinity

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const wx = Px - seg.Ax
      const wy = Py - seg.Ay
      let sqDist
      if (seg.v_sq === 0) {
        sqDist = wx * wx + wy * wy
      } else {
        let t = (wx * seg.vx + wy * seg.vy) / seg.v_sq
        if (t < 0) t = 0
        else if (t > 1) t = 1
        const dx = wx - t * seg.vx
        const dy = wy - t * seg.vy
        sqDist = dx * dx + dy * dy
      }
      if (sqDist < minSqDist) {
        minSqDist = sqDist
      }
    }
    ctes[j] = Math.sqrt(minSqDist)
  }
  return ctes
}

/**
 * Computes the Mean Cross Tracking Error (MCTE) as the integral of CTE over actual distance
 * divided by the total actual distance travelled (A_path / D).
 */
export function computeMCTE(tBuf: TPoint[], ctes: number[]): number {
  if (tBuf.length === 0) return 0
  let totalArea = 0
  let totalDist = 0
  for (let j = 0; j < tBuf.length - 1; j++) {
    const dx = tBuf[j + 1].xa - tBuf[j].xa
    const dy = tBuf[j + 1].ya - tBuf[j].ya
    const ds = Math.sqrt(dx * dx + dy * dy)
    const cteAvg = (ctes[j] + ctes[j + 1]) / 2
    totalArea += cteAvg * ds
    totalDist += ds
  }
  if (totalDist === 0) {
    // Fallback if no movement: simple average CTE
    return ctes.reduce((a, b) => a + b, 0) / ctes.length
  }
  return totalArea / totalDist
}

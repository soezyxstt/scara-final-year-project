import type { DSample, TPoint } from './hmi-types'

/** Resolve original sample times before any display reduction. Legacy runs use
 * matched D timestamps, then an estimated D span when packet counts differ. */
export function trajectoryTimes(points: readonly TPoint[], samples: readonly DSample[] = []): number[] {
  const firstTimedPoint = points.find(point => Number.isFinite(point.t))?.t
  const origin = samples[0]?.t ?? firstTimedPoint ?? 0
  const lastD = samples[samples.length - 1]?.t
  return points.map((point, index) => {
    if (Number.isFinite(point.t)) return (point.t! - origin) / 1000
    if (samples.length === points.length) return (samples[index].t - origin) / 1000
    if (lastD !== undefined && samples.length > 1 && points.length > 1) {
      return ((samples[0].t - origin) + (lastD - samples[0].t) * index / (points.length - 1)) / 1000
    }
    return index * 0.02
  })
}

/** Input is ordered telemetry, so cursor snapping need not scan the run. */
export function nearestTimePoint<T extends { t: number }>(rows: readonly T[], time: number | null): T | null {
  if (time === null || rows.length === 0) return null
  let left = 0, right = rows.length - 1
  while (left < right) {
    const mid = (left + right) >>> 1
    if (rows[mid].t < time) left = mid + 1
    else right = mid
  }
  const previous = rows[Math.max(0, left - 1)]
  return Math.abs(previous.t - time) <= Math.abs(rows[left].t - time) ? previous : rows[left]
}

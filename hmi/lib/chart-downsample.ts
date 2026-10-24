export type ChartRow = Record<string, number | null | undefined>
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/**
 * Select original observations only. Each bucket keeps every series' min/max,
 * in input order, plus endpoints and explicit missing-data boundaries.
 * Gap boundaries or a very small budget may exceed maxPoints; never draw false continuity.
 */
export function peakPreservingDownsample<T extends object>(rows: readonly T[], maxPoints: number, keys: readonly string[]): T[] {
  const budget = Number.isFinite(maxPoints) ? Math.max(2, Math.floor(maxPoints)) : rows.length
  if (rows.length <= budget) return rows.slice()
  const uniqueKeys = [...new Set(keys)]
  if (uniqueKeys.length === 0) return [rows[0], rows[rows.length - 1]]
  const selected = new Set<number>([0, rows.length - 1])
  const buckets = Math.max(1, Math.floor((budget - 2) / (2 * uniqueKeys.length)))
  const interior = rows.length - 2
  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = 1 + Math.floor(bucket * interior / buckets)
    const end = 1 + Math.floor((bucket + 1) * interior / buckets)
    for (const key of uniqueKeys) {
      let minimum = Infinity, maximum = -Infinity, minIndex = -1, maxIndex = -1
      for (let index = start; index < end; index++) {
        const value = (rows[index] as Record<string, unknown>)[key]
        if (!isNumber(value)) continue
        if (value < minimum) { minimum = value; minIndex = index }
        if (value > maximum) { maximum = value; maxIndex = index }
      }
      if (minIndex !== -1) selected.add(minIndex)
      if (maxIndex !== -1) selected.add(maxIndex)
    }
  }
  for (const key of uniqueKeys) {
    let previousMissing = false
    for (let index = 0; index < rows.length; index++) {
      // Absent keys in a sparse timestamp union are not recorded gaps.
      const missing = Object.hasOwn(rows[index], key) && !isNumber((rows[index] as Record<string, unknown>)[key])
      if (missing !== previousMissing) {
        if (index > 0) selected.add(index - 1)
        selected.add(index)
      }
      previousMissing = missing
    }
  }
  return [...selected].sort((a, b) => a - b).map(index => rows[index])
}

/** Exact timestamp union; never pair by index or invent interpolated readings. */
export function mergeTimestampRows(datasets: readonly { runId: string; data: readonly ChartRow[] }[], xKey: string, keys: readonly string[]): ChartRow[] {
  const merged = new Map<number, ChartRow>()
  for (const dataset of datasets) {
    for (const row of dataset.data) {
      const x = row[xKey]
      if (!isNumber(x)) continue
      let target = merged.get(x)
      if (!target) { target = { [xKey]: x }; merged.set(x, target) }
      for (const key of keys) if (Object.hasOwn(row, key)) target[`${dataset.runId}_${key}`] = row[key]
    }
  }
  return [...merged.entries()].sort(([a], [b]) => a - b).map(([, row]) => row)
}

/** Keep real boundary observations so numeric-axis clipping can draw a zoomed line. */
export function sliceChartWindow<T extends ChartRow>(rows: readonly T[], xKey: string, domain: readonly [number, number] | null): T[] {
  if (!domain || rows.length === 0) return rows.slice()
  const low = Math.min(...domain), high = Math.max(...domain)
  const bound = (value: number, inclusive: boolean) => {
    let left = 0, right = rows.length
    while (left < right) {
      const middle = (left + right) >>> 1
      const x = rows[middle][xKey] as number
      if (x < value || inclusive && x === value) left = middle + 1
      else right = middle
    }
    return left
  }
  return rows.slice(Math.max(0, bound(low, false) - 1), Math.min(rows.length, bound(high, true) + 1))
}

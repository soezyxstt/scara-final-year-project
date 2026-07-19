export const EXPERIMENT_RUNS_PER_CONDITION = 4
export const EXPERIMENT_TOTAL_RUNS = 8

export interface ExperimentSlot {
  slot: number
  condition: 'A' | 'B'
  direction: 'forward' | 'return'
  repetition: 1 | 2
}

export interface ExperimentTPoint {
  tMs: number
  xi: number
  yi: number
  xa: number
  ya: number
}

/** Deterministic 2F + 2B plan for each of the two OFAT conditions. */
export function getExperimentSlot(slot: number): ExperimentSlot {
  if (!Number.isInteger(slot) || slot < 1 || slot > EXPERIMENT_TOTAL_RUNS) {
    throw new RangeError(`Experiment slot must be 1-${EXPERIMENT_TOTAL_RUNS}; received ${slot}.`)
  }
  const indexInCondition = (slot - 1) % EXPERIMENT_RUNS_PER_CONDITION
  return {
    slot,
    condition: slot <= EXPERIMENT_RUNS_PER_CONDITION ? 'A' : 'B',
    direction: indexInCondition % 2 === 0 ? 'forward' : 'return',
    repetition: indexInCondition < 2 ? 1 : 2,
  }
}

/** Parse the current telemetry schema: T,t,xi,yi,xa,ya. */
export function parseExperimentTPoint(parts: string[]): ExperimentTPoint | null {
  if (parts.length !== 6 || parts[0] !== 'T') return null
  const [tMs, xi, yi, xa, ya] = parts.slice(1).map(Number)
  if (![tMs, xi, yi, xa, ya].every(Number.isFinite)) return null
  return { tMs, xi, yi, xa, ya }
}

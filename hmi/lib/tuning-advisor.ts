/**
 * tuning-advisor.ts
 *
 * Post-run PID tuning advisor for the SCARA HMI.
 *
 * UNIT CONTRACTS (enforced — do NOT change without updating thresholds):
 *   time[]          — milliseconds (converted to seconds internally before calculus)
 *   error[]         — radians
 *   errorVelocity[] — rad/s  (= v_desired − v_actual, per-joint)
 *
 * THRESHOLD BASIS:
 *   settlingError   — 0.0035 rad  ≈ 0.20°
 *   iae             — 0.05  rad·s (reasonable for a sub-2 s move at <0.1 rad avg error)
 *   chatterVariance — 500   (rad/s²)²  (acceleration-error variance gate)
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TelemetryRun {
  /** Sample timestamps in milliseconds from firmware. */
  time: number[]
  /** Joint angle error in radians: θ_desired − θ_actual. */
  error: number[]
  /** Velocity error in rad/s: ω_desired − ω_actual. */
  errorVelocity: number[]
}

export interface ExtractedFeatures {
  /** Zero crossings of errorVelocity strictly after the peak-magnitude index. */
  nz: number
  /** Integral Absolute Error (rad·s), trapezoidal rule. */
  iae: number
  /** |error| at the last sample — proxy for steady-state error (rad). */
  settlingError: number
  /** True when post-peak acceleration-error variance exceeds threshold. */
  isChattering: boolean
}

export type TuningAdviceSeverity = 'critical' | 'suggestion' | 'info' | 'success'

export interface TuningAdvice {
  jointId: string
  action: string
  reason: string
  severity: TuningAdviceSeverity
}

// ---------------------------------------------------------------------------
// Thresholds (all dimensionally consistent with the unit contracts above)
// ---------------------------------------------------------------------------

/** Variance of acceleration error (rad/s²)² that triggers a chatter warning. */
const CHATTER_VARIANCE_THRESHOLD = 500

/** Settling error gate in radians (~0.20°). */
const SETTLING_ERROR_THRESHOLD = 0.0035

/** IAE gate in rad·s. */
const IAE_THRESHOLD = 0.05

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns the value if it is a finite number, otherwise null. */
function finiteAt(values: number[], index: number): number | null {
  const v = values[index]
  return Number.isFinite(v) ? v : null
}

/**
 * Converts a millisecond delta to seconds.
 * Since the firmware emits timestamps in milliseconds, we divide by 1000.
 */
function msToSeconds(ms: number): number {
  return ms / 1000
}

/** Returns −1, 0, or +1 for the sign of value. */
function sign(value: number): -1 | 0 | 1 {
  if (value > 0) return 1
  if (value < 0) return -1
  return 0
}

// ---------------------------------------------------------------------------
// Core computation functions
// ---------------------------------------------------------------------------

/**
 * Returns the index of the sample whose |errorVelocity| is largest.
 * This marks the end of the initial drive transient.
 */
function peakVelocityIndex(errorVelocity: number[]): number {
  let peakIndex = 0
  let peakMagnitude = -Infinity

  for (let i = 0; i < errorVelocity.length; i++) {
    const v = finiteAt(errorVelocity, i)
    if (v === null) continue
    const mag = Math.abs(v)
    if (mag > peakMagnitude) {
      peakMagnitude = mag
      peakIndex = i
    }
  }

  return peakIndex
}

/**
 * Counts sign changes of errorVelocity starting strictly after startIndex.
 * Samples that are exactly zero are skipped (they do not increment the counter
 * and do not update the "previous sign" state).
 */
function countZeroCrossings(errorVelocity: number[], startIndex: number): number {
  let crossings = 0
  let prevSign: -1 | 0 | 1 = 0

  for (let i = startIndex + 1; i < errorVelocity.length; i++) {
    const v = finiteAt(errorVelocity, i)
    if (v === null) continue

    const cur = sign(v)
    if (cur === 0) continue               // skip exact zeros

    if (prevSign !== 0 && cur !== prevSign) {
      crossings++
    }
    prevSign = cur
  }

  return crossings
}

/**
 * Trapezoidal-rule integration of |error| over time.
 *
 *   IAE = Σ 0.5 · (|e[i]| + |e[i−1]|) · Δt_s
 *
 * where Δt_s is the time step in *seconds* (converted from ms).
 */
function integrateAbsoluteError(time: number[], error: number[]): number {
  const length = Math.min(time.length, error.length)
  let iae = 0

  for (let i = 1; i < length; i++) {
    const e_curr = finiteAt(error, i)
    const e_prev = finiteAt(error, i - 1)
    const t_curr = finiteAt(time, i)
    const t_prev = finiteAt(time, i - 1)

    if (e_curr === null || e_prev === null || t_curr === null || t_prev === null) continue

    const dt_s = msToSeconds(t_curr - t_prev)
    if (dt_s <= 0) continue

    iae += 0.5 * (Math.abs(e_prev) + Math.abs(e_curr)) * dt_s
  }

  return iae
}

/**
 * Computes the variance of the numerical derivative of errorVelocity
 * (i.e. the acceleration error, a_e = Δω_e / Δt) for all samples
 * strictly after peakIndex.
 *
 * Units: (rad/s²)²
 *
 * Returns 0 if there are fewer than 2 valid derivative samples.
 */
function accelerationVarianceAfterPeak(
  time: number[],
  errorVelocity: number[],
  peakIndex: number
): number {
  const accelerations: number[] = []
  const length = Math.min(time.length, errorVelocity.length)

  for (let i = Math.max(peakIndex + 1, 1); i < length; i++) {
    const v_curr = finiteAt(errorVelocity, i)
    const v_prev = finiteAt(errorVelocity, i - 1)
    const t_curr = finiteAt(time, i)
    const t_prev = finiteAt(time, i - 1)

    if (v_curr === null || v_prev === null || t_curr === null || t_prev === null) continue

    const dt_s = msToSeconds(t_curr - t_prev)
    if (dt_s <= 0) continue

    accelerations.push((v_curr - v_prev) / dt_s)   // rad/s²
  }

  if (accelerations.length < 2) return 0

  const mean = accelerations.reduce((s, a) => s + a, 0) / accelerations.length

  return (
    accelerations.reduce((s, a) => s + (a - mean) ** 2, 0) / accelerations.length
  )
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extracts the four diagnostic scalar features from a single telemetry run.
 *
 * Safe for empty or single-element arrays — returns zero/false defaults.
 */
export function extractFeatures(run: TelemetryRun): ExtractedFeatures {
  const length = Math.min(
    run.time.length,
    run.error.length,
    run.errorVelocity.length
  )

  if (length === 0) {
    return { nz: 0, iae: 0, settlingError: 0, isChattering: false }
  }

  const time          = run.time.slice(0, length)
  const error         = run.error.slice(0, length)
  const errorVelocity = run.errorVelocity.slice(0, length)

  const peakIndex  = peakVelocityIndex(errorVelocity)
  const accelVar   = accelerationVarianceAfterPeak(time, errorVelocity, peakIndex)

  return {
    nz:            countZeroCrossings(errorVelocity, peakIndex),
    iae:           integrateAbsoluteError(time, error),
    settlingError: Math.abs(error[length - 1] ?? 0),
    isChattering:  accelVar > CHATTER_VARIANCE_THRESHOLD,
  }
}

/**
 * 4-tier priority rule engine.
 *
 * Priority order (first match wins):
 *   1. Chattering (critical)    — Kd too high or noisy derivative
 *   2. Steady-state offset      — Ki too low
 *   3. Underdamped oscillation  — Kp too high / Kd too low
 *   4. Sluggish / high IAE      — Kp too low
 *   5. Default success
 */
export function generateTuningAdvice(
  jointId: string,
  features: ExtractedFeatures
): TuningAdvice {
  // Priority 1 — chattering
  if (features.isChattering) {
    return {
      jointId,
      action: 'Decrease Kd immediately, or add/increase derivative filter smoothing.',
      reason:
        'Post-peak acceleration-error variance exceeds threshold — ' +
        'indicates high-frequency chatter driven by derivative noise.',
      severity: 'critical',
    }
  }

  // Priority 2 — persistent steady-state offset, no oscillation
  if (features.settlingError > SETTLING_ERROR_THRESHOLD && features.nz <= 1) {
    return {
      jointId,
      action: 'Increase Ki slightly.',
      reason:
        `Residual settling error (${(features.settlingError * (180 / Math.PI)).toFixed(2)}°) ` +
        'persists after the move with no repeated oscillation — integrator too weak.',
      severity: 'suggestion',
    }
  }

  // Priority 3 — underdamped oscillation
  if (features.nz > 2) {
    return {
      jointId,
      action: 'Increase Kd, or reduce Kp slightly.',
      reason:
        `${features.nz} post-peak velocity-error zero crossings detected — ` +
        'system is underdamped and oscillating around the setpoint.',
      severity: 'suggestion',
    }
  }

  // Priority 4 — sluggish, high integrated error, no oscillation
  if (features.iae > IAE_THRESHOLD && features.nz <= 1) {
    return {
      jointId,
      action: 'Increase Kp.',
      reason:
        `IAE = ${features.iae.toFixed(4)} rad·s is above threshold with no oscillation — ` +
        'proportional gain is too low and the response is sluggish.',
      severity: 'info',
    }
  }

  // Default — well-tuned
  return {
    jointId,
    action: 'Maintain current gains — response is well-damped.',
    reason:
      `Low settling error (${(features.settlingError * (180 / Math.PI)).toFixed(2)}°), ` +
      `low IAE (${features.iae.toFixed(4)} rad·s), and ≤2 zero crossings detected.`,
    severity: 'success',
  }
}

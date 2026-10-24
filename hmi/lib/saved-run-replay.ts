import type { Run, Sample, TrajectoryPoint } from './db/schema'
import { ARM_L1_MM, ARM_L2_MM, forwardKinematics } from './scara-geometry'

export interface ReplayPoint { xi: number; yi: number; xa: number; ya: number }
export interface ReplayPose { th1: number; th2: number; th1d: number | null; th2d: number | null }
interface Timed<T> { time: number; value: T }
export interface ReplayRecording {
  durationMs: number
  jointFrames: Timed<ReplayPose>[]
  pathFrames: Timed<ReplayPoint>[]
  timing: 'recorded' | 'estimated' | 'snapshot'
  coordinatesOnly: boolean
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const lerp = (a: number, b: number, amount: number) => a + (b - a) * amount
const angleLerp = (a: number, b: number, amount: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * amount

export function buildReplayRecording({ run, samples, trajectoryPoints }: {
  run: Pick<Run, 'elapsedTime' | 'startedAt' | 'endedAt'>
  samples: readonly Sample[]
  trajectoryPoints: readonly TrajectoryPoint[]
}): ReplayRecording {
  const timedSamples = samples.filter(sample => finite(sample.t)).toSorted((a, b) => a.t - b.t)
  const firstTime = timedSamples[0]?.t ?? 0
  const sampleSpan = (timedSamples.at(-1)?.t ?? firstTime) - firstTime
  const storedDuration = finite(run.elapsedTime) && run.elapsedTime > 0 ? run.elapsedTime * 1000 : 0
  const wallDuration = finite(run.endedAt) && finite(run.startedAt) ? Math.max(0, run.endedAt - run.startedAt) : 0
  const durationMs = sampleSpan > 0 ? sampleSpan : storedDuration || wallDuration
  const jointFrames: Timed<ReplayPose>[] = []
  for (const sample of timedSamples) {
    if (!finite(sample.th1) || !finite(sample.th2)) continue
    const value = { th1: sample.th1, th2: sample.th2, th1d: finite(sample.th1d) ? sample.th1d : null, th2d: finite(sample.th2d) ? sample.th2d : null }
    const frame = { time: Math.max(0, sample.t - firstTime), value }
    if (jointFrames.at(-1)?.time === frame.time) jointFrames[jointFrames.length - 1] = frame
    else jointFrames.push(frame)
  }
  const points = trajectoryPoints.filter(point => finite(point.xa) && finite(point.ya))
    .toSorted((a, b) => a.seq - b.seq)
    .map(point => ({ seq: point.seq, value: { xa: point.xa!, ya: point.ya!, xi: finite(point.xi) ? point.xi : point.xa!, yi: finite(point.yi) ? point.yi : point.ya! } }))
  // The persisted T-point schema has sequence numbers but no timestamps.
  // Its path timing is estimated independently; never pair T and D packets by index.
  const seqStart = points[0]?.seq ?? 0
  const seqSpan = (points.at(-1)?.seq ?? seqStart) - seqStart
  const pathFrames = points.map((point, index) => ({
    time: points.length <= 1 ? durationMs : durationMs * (seqSpan > 0 ? (point.seq - seqStart) / seqSpan : index / (points.length - 1)),
    value: point.value,
  }))
  const hasMotion = jointFrames.length >= 2 || pathFrames.length >= 2
  return {
    durationMs: hasMotion ? durationMs : 0,
    jointFrames,
    pathFrames,
    timing: !hasMotion || durationMs <= 0 ? 'snapshot' : sampleSpan > 0 && jointFrames.length >= 2 ? 'recorded' : 'estimated',
    coordinatesOnly: jointFrames.length < 2 && pathFrames.length >= 2,
  }
}

function framePair<T>(frames: readonly Timed<T>[], time: number) {
  if (frames.length === 0) return null
  let left = 0, right = frames.length
  while (left < right) {
    const middle = (left + right) >>> 1
    if (frames[middle].time <= time) left = middle + 1
    else right = middle
  }
  const before = frames[Math.max(0, left - 1)]
  const after = frames[Math.min(left, frames.length - 1)]
  const fraction = after.time > before.time ? clamp((time - before.time) / (after.time - before.time), 0, 1) : 0
  return { before, after, fraction, end: left }
}

function interpolatePoint(a: ReplayPoint, b: ReplayPoint, fraction: number): ReplayPoint {
  return { xi: lerp(a.xi, b.xi, fraction), yi: lerp(a.yi, b.yi, fraction), xa: lerp(a.xa, b.xa, fraction), ya: lerp(a.ya, b.ya, fraction) }
}

function inverseKinematics(x: number, y: number) {
  const cos2 = clamp((x * x + y * y - ARM_L1_MM ** 2 - ARM_L2_MM ** 2) / (2 * ARM_L1_MM * ARM_L2_MM), -1, 1)
  const th2 = Math.acos(cos2)
  const th1 = Math.atan2(y, x) - Math.atan2(ARM_L2_MM * Math.sin(th2), ARM_L1_MM + ARM_L2_MM * Math.cos(th2))
  return { th1, th2 }
}

export function replayFrameAt(recording: ReplayRecording, requestedMs: number, includeTrail = true) {
  const time = clamp(finite(requestedMs) ? requestedMs : 0, 0, recording.durationMs)
  const path = framePair(recording.pathFrames, time)
  const joints = framePair(recording.jointFrames, time)
  let point: ReplayPoint | null = path ? interpolatePoint(path.before.value, path.after.value, path.fraction) : null
  let pose: ReplayPose | null = null
  if (joints && !recording.coordinatesOnly) {
    const { before, after, fraction } = joints
    const interpolateDesired = (key: 'th1d' | 'th2d') => {
      const a = before.value[key], b = after.value[key]
      return a === null || b === null ? null : angleLerp(a, b, fraction)
    }
    pose = { th1: angleLerp(before.value.th1, after.value.th1, fraction), th2: angleLerp(before.value.th2, after.value.th2, fraction), th1d: interpolateDesired('th1d'), th2d: interpolateDesired('th2d') }
    if (!point || recording.pathFrames.length < 2) {
      const actual = forwardKinematics(pose.th1, pose.th2)
      const desired = forwardKinematics(pose.th1d ?? pose.th1, pose.th2d ?? pose.th2)
      point = { xa: actual.tipX, ya: actual.tipY, xi: desired.tipX, yi: desired.tipY }
    }
  } else if (point) {
    const actual = inverseKinematics(point.xa, point.ya)
    const desired = inverseKinematics(point.xi, point.yi)
    pose = { ...actual, th1d: desired.th1, th2d: desired.th2 }
  }
  const trail = path && includeTrail ? recording.pathFrames.slice(0, path.end).map(frame => frame.value) : []
  if (includeTrail && point && (trail.length === 0 || path?.fraction)) trail.push(point)
  return { time, point, pose, trail }
}

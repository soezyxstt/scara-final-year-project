import assert from 'node:assert/strict'
import test from 'node:test'
import { buildReplayRecording, replayFrameAt } from './saved-run-replay'
import { forwardKinematics } from './scara-geometry'
import type { Sample, TrajectoryPoint } from './db/schema'

const run = { elapsedTime: 8, startedAt: 1000, endedAt: 9000 }
const sample = (t: number, th1: number | null, th2 = 1): Sample => ({ t, th1, th2, th1d: th1, th2d: th2 } as Sample)
const point = (seq: number, xa: number, ya: number): TrajectoryPoint => ({ seq, xa, ya, xi: xa, yi: ya } as TrajectoryPoint)
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`)

test('joint playback honors irregular recorded timestamps instead of sample indices', () => {
  const recording = buildReplayRecording({ run, samples: [sample(5000, 0), sample(5100, 1), sample(6000, 2)], trajectoryPoints: [] })
  assert.equal(recording.durationMs, 1000)
  assert.equal(recording.timing, 'recorded')
  near(replayFrameAt(recording, 100).pose!.th1, 1)
  near(replayFrameAt(recording, 550).pose!.th1, 1.5)
})

test('trajectory and joint samples use independent clocks when packet counts differ', () => {
  const recording = buildReplayRecording({ run, samples: [sample(100, 0), sample(150, 0.5), sample(2100, 1)], trajectoryPoints: [point(0, 90, 100), point(10, -70, 100)] })
  assert.equal(recording.pathFrames[1].time, 2000)
  near(replayFrameAt(recording, 1000).point!.xa, 10)
  const frame = replayFrameAt(recording, 1000)
  assert.equal(frame.trail.length, 2)
  assert.equal(frame.trail[1].xa, 10)
  assert.ok(frame.pose!.th1 > 0.5 && frame.pose!.th1 < 1)
})

test('coordinate-only recordings use stored duration and shared physical geometry', () => {
  const recording = buildReplayRecording({ run, samples: [], trajectoryPoints: [point(0, 90, 100), point(1, -70, 100)] })
  assert.equal(recording.durationMs, 8000)
  assert.equal(recording.timing, 'estimated')
  assert.equal(recording.coordinatesOnly, true)
  const frame = replayFrameAt(recording, 4000)
  const actual = forwardKinematics(frame.pose!.th1, frame.pose!.th2)
  near(actual.tipX, frame.point!.xa)
  near(actual.tipY, frame.point!.ya)
})

test('missing time data remains a snapshot instead of inventing playback timing', () => {
  const recording = buildReplayRecording({ run: { elapsedTime: null, startedAt: 0, endedAt: null }, samples: [], trajectoryPoints: [point(0, 90, 100), point(1, -70, 100)] })
  assert.equal(recording.durationMs, 0)
  assert.equal(recording.timing, 'snapshot')
  assert.equal(replayFrameAt(recording, 4000).point!.xa, -70)
})

test('invalid points and null joints never become a fake origin or NaN pose', () => {
  const recording = buildReplayRecording({ run, samples: [sample(10, null), sample(20, NaN)], trajectoryPoints: [{ seq: 0, xa: null, ya: null, xi: null, yi: null } as TrajectoryPoint] })
  const frame = replayFrameAt(recording, 50)
  assert.equal(frame.pose, null)
  assert.equal(frame.point, null)
  assert.equal(recording.durationMs, 0)
})

test('out-of-order and repeated timestamps are normalized deterministically', () => {
  const recording = buildReplayRecording({ run, samples: [sample(200, 2), sample(100, 0), sample(200, 1), sample(300, 2)], trajectoryPoints: [] })
  assert.equal(recording.jointFrames.length, 3)
  near(replayFrameAt(recording, 100).pose!.th1, 1)
})

test('seeking clamps to endpoints and the full trail is preserved at the end', () => {
  const recording = buildReplayRecording({ run, samples: [], trajectoryPoints: [point(0, 90, 100), point(1, 10, 100), point(2, -70, 100)] })
  assert.equal(replayFrameAt(recording, -500).point!.xa, 90)
  assert.equal(replayFrameAt(recording, 9000).point!.xa, -70)
  assert.equal(replayFrameAt(recording, 9000).trail.length, 3)
  assert.equal(replayFrameAt(recording, NaN).time, 0)
})

test('angle interpolation takes the short arc across encoder wrapping', () => {
  const recording = buildReplayRecording({ run, samples: [sample(0, Math.PI - 0.1), sample(1000, -Math.PI + 0.1)], trajectoryPoints: [] })
  near(replayFrameAt(recording, 500).pose!.th1, Math.PI)
})

test('a single recorded pose is displayed with its correct Cartesian position', () => {
  const recording = buildReplayRecording({ run, samples: [sample(0, 0, 0)], trajectoryPoints: [] })
  const frame = replayFrameAt(recording, 0)
  assert.equal(recording.durationMs, 0)
  near(frame.point!.xa, 170)
  near(frame.point!.ya, 0)
})

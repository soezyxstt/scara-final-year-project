import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getDemoExperimentData,
  getDemoRunWithData,
  listDemoExperimentRuns,
  listDemoRuns,
} from './demo-data'

test('all five public thesis groups retain their physical runs and samples', async () => {
  // EXP-4's CSV repeats the same four baseline runs for OFF/ON. They should
  // contribute once per physical run, otherwise comparison statistics are biased.
  const counts = {
    'EXP-1': [8, 6474], 'EXP-2': [8, 6586], 'EXP-3': [8, 6684],
    'EXP-4': [28, 16812], 'EXP-5': [8, 6531],
  }
  for (const [experimentId, [runCount, sampleCount]] of Object.entries(counts)) {
    const data = await getDemoExperimentData(experimentId)
    assert.equal(data.runs.length, runCount, experimentId)
    assert.equal(data.samples.length, sampleCount, experimentId)
    assert.equal(data.metrics.length, runCount, experimentId)
    assert.equal(new Set(data.runs.map(run => run.id)).size, runCount)
    assert.ok(data.metrics.some(metric => metric.eefErrorRms !== null))
    assert.ok(data.runs.every(run => run.kp1 === null && run.createdAt === null))
    assert.ok(data.samples.every(sample => sample.dtheta1 === null))
    assert.ok(data.metrics.every(metric => Object.values(metric).every(value =>
      typeof value !== 'number' || Number.isFinite(value))))
  }
})

test('the default recording has real joint timing and no fabricated velocity channels', async () => {
  const runs = await listDemoRuns()
  assert.equal(runs.length, 52)
  assert.equal((await listDemoExperimentRuns()).length, 52)
  const data = await getDemoRunWithData(runs[0].id)
  assert.ok(data)
  assert.ok(data.samples.length > 0)
  assert.ok(data.samples.at(-1)!.t > data.samples[0].t)
  assert.ok(data.trajectoryPoints.length > 0)
  assert.ok(data.samples.every(sample => sample.dth1 === null && sample.th1Raw === null))
  assert.equal(data.run.userId, '')
  assert.equal(data.run.aiSuggestion, null)
  assert.equal(data.run.gainsJson, null)
})

test('unpublished identifiers are never resolved by the public dataset adapter', async () => {
  assert.equal(await getDemoRunWithData('private-unpublished-run'), null)
  assert.deepEqual(await getDemoExperimentData('private-experiment'), { runs: [], metrics: [], samples: [] })
})

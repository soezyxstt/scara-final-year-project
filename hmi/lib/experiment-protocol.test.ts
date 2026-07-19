import assert from 'node:assert/strict'
import test from 'node:test'
import { getExperimentSlot, getExperimentTotalRuns, parseExperimentTPoint, usesSharedBaseline } from './experiment-protocol'

test('experiment plan contains 2 forward and 2 return runs per condition', () => {
  const slots = Array.from({ length: 8 }, (_, index) => getExperimentSlot(index + 1))
  for (const condition of ['A', 'B'] as const) {
    const group = slots.filter(slot => slot.condition === condition)
    assert.equal(group.filter(slot => slot.direction === 'forward').length, 2)
    assert.equal(group.filter(slot => slot.direction === 'return').length, 2)
    assert.deepEqual(group.map(slot => slot.repetition), [1, 1, 2, 2])
  }
})

test('dynamic-model experiments reuse a four-run shared baseline', () => {
  for (const experimentId of ['EXP-2', 'EXP-3', 'EXP-4']) {
    assert.equal(usesSharedBaseline(experimentId), true)
    assert.equal(getExperimentTotalRuns(experimentId), 4)
  }
  assert.deepEqual(
    Array.from({ length: getExperimentTotalRuns('EXP-2') }, (_, index) => getExperimentSlot(index + 1).direction),
    ['forward', 'return', 'forward', 'return'],
  )
  assert.equal(getExperimentTotalRuns('EXP-1'), 8)
  assert.equal(getExperimentTotalRuns('EXP-5'), 8)
})

test('T packet parser keeps timestamp and Cartesian columns aligned', () => {
  assert.deepEqual(parseExperimentTPoint(['T', '1250', '140', '45', '139.5', '45.2']), {
    tMs: 1250,
    xi: 140,
    yi: 45,
    xa: 139.5,
    ya: 45.2,
  })
  assert.equal(parseExperimentTPoint(['T', '1250', '140', 'bad', '139.5', '45.2']), null)
  assert.equal(parseExperimentTPoint(['T', '140', '45', '139.5', '45.2']), null)
})

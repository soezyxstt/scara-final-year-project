import assert from 'node:assert/strict'
import test from 'node:test'
import { getExperimentSlot, parseExperimentTPoint } from './experiment-protocol'

test('experiment plan contains 2 forward and 2 return runs per condition', () => {
  const slots = Array.from({ length: 8 }, (_, index) => getExperimentSlot(index + 1))
  for (const condition of ['A', 'B'] as const) {
    const group = slots.filter(slot => slot.condition === condition)
    assert.equal(group.filter(slot => slot.direction === 'forward').length, 2)
    assert.equal(group.filter(slot => slot.direction === 'return').length, 2)
    assert.deepEqual(group.map(slot => slot.repetition), [1, 1, 2, 2])
  }
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

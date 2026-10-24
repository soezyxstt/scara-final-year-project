import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeTimestampRows, peakPreservingDownsample, sliceChartWindow, type ChartRow } from './chart-downsample'

test('downsampling keeps narrow positive and negative spikes from every series', () => {
  const rows = Array.from({ length: 20000 }, (_, t) => ({ t, a: 0, b: 0 }))
  rows[137].a = 90
  rows[143].a = -80
  rows[151].b = 70
  rows[159].b = -60
  const reduced = peakPreservingDownsample(rows, 400, ['a', 'b'])
  for (const index of [0, 137, 143, 151, 159, rows.length - 1]) assert.ok(reduced.includes(rows[index]))
  assert.ok(reduced.length <= 400)
})

test('output contains only original observations in their original order', () => {
  const rows = Array.from({ length: 5000 }, (_, t) => ({ t: t * t, y: Math.sin(t / 7) }))
  const reduced = peakPreservingDownsample(rows, 200, ['y'])
  assert.ok(reduced.every(row => rows.includes(row)))
  assert.ok(reduced.every((row, index) => index === 0 || row.t > reduced[index - 1].t))
  assert.equal(reduced[0].t, 0)
  assert.equal(reduced.at(-1)!.t, rows.at(-1)!.t)
  assert.equal(rows.length, 5000)
})

test('missing readings retain both sides of every gap instead of drawing false continuity', () => {
  const rows: ChartRow[] = Array.from({ length: 1000 }, (_, t) => ({ t, y: t }))
  for (let index = 201; index <= 245; index++) rows[index].y = null
  rows[700].y = NaN
  const reduced = peakPreservingDownsample(rows, 20, ['y'])
  for (const index of [200, 201, 245, 246, 699, 700, 701]) assert.ok(reduced.includes(rows[index]), String(index))
})

test('small inputs and empty data keep all samples without mutation', () => {
  const rows = [{ t: 0, y: 1 }, { t: 1, y: 2 }]
  assert.deepEqual(peakPreservingDownsample(rows, 100, ['y']), rows)
  assert.deepEqual(peakPreservingDownsample([], 100, ['y']), [])
  assert.deepEqual(peakPreservingDownsample(rows, NaN, ['y']), rows)
})

test('timestamp union does not pair recordings with different sample intervals by index', () => {
  const merged = mergeTimestampRows([
    { runId: 'slow', data: [{ t: 0, y: 1 }, { t: 100, y: 2 }, { t: 300, y: 3 }] },
    { runId: 'fast', data: [{ t: 50, y: 7 }, { t: 200, y: 8 }] },
  ], 't', ['y'])
  assert.deepEqual(merged.map(row => row.t), [0, 50, 100, 200, 300])
  assert.deepEqual(merged[1], { t: 50, fast_y: 7 })
  assert.equal(Object.hasOwn(merged[1], 'slow_y'), false)
  assert.equal(Object.hasOwn(merged[2], 'fast_y'), false)
})

test('timestamp union preserves exact null observations and all coincident readings', () => {
  assert.deepEqual(mergeTimestampRows([
    { runId: 'a', data: [{ t: 0, y: null }, { t: 2, y: 3 }] },
    { runId: 'b', data: [{ t: 0, y: 4 }] },
  ], 't', ['y']), [{ t: 0, a_y: null, b_y: 4 }, { t: 2, a_y: 3 }])
})

test('invalid X coordinates are discarded instead of becoming a fabricated time zero', () => {
  assert.deepEqual(mergeTimestampRows([{ runId: 'a', data: [{ t: null, y: 9 }, { t: NaN, y: 8 }, { t: 12, y: 7 }] }], 't', ['y']), [{ t: 12, a_y: 7 }])
})

test('explicit gaps remain visible even if their count exceeds the display budget', () => {
  const rows = Array.from({ length: 200 }, (_, t) => ({ t, y: t % 2 ? null : t }))
  const reduced = peakPreservingDownsample(rows, 10, ['y'])
  assert.equal(reduced.length, rows.length)
})


test('zoom windows preserve original neighboring observations without interpolation', () => {
  const rows = [{ t: 0, y: 1 }, { t: 1000, y: 2 }, { t: 2000, y: 3 }]
  assert.deepEqual(sliceChartWindow(rows, 't', [400, 600]), [rows[0], rows[1]])
  assert.deepEqual(sliceChartWindow(rows, 't', [2000, 2100]), [rows[1], rows[2]])
})

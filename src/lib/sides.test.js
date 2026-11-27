// npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSide, sideChoices, sideMentions, sideNotes, splitSided } from './sides.js'
import { coverage } from './coverage.js'

const line = (extra) => ({ id: 's1', speaker: 'patient', text: 'My shoulder hurts.', regions: [], unsided: ['right_shoulder'], ...extra })

test('sided regions come from the region ids', () => {
  assert.deepEqual(splitSided('right_shoulder'), { side: 'right', part: 'shoulder' })
  assert.equal(splitSided('lower_back'), null)
  assert.deepEqual(sideChoices('right_shoulder'), [
    { side: 'right', label: 'Right', region: 'right_shoulder' },
    { side: 'left', label: 'Left', region: null },
  ])
  assert.deepEqual(sideChoices('left_knee').map((c) => c.region), [null, 'left_knee'])
})

test('“My shoulder hurts” adds no region until a side is picked; Right lights the right shoulder', () => {
  const s = line()
  assert.deepEqual(sideMentions({ segments: [s] })[0].label, 'Shoulder (side not said)')
  const patch = resolveSide(s, 'right_shoulder', 'right')
  assert.deepEqual(patch.regions, ['right_shoulder'])
  assert.deepEqual(patch.sides, { right_shoulder: 'right' })
  assert.deepEqual(sideNotes({ segments: [{ ...s, ...patch }] }), [])
})

test('Left for the shoulder: a text-only note, no region', () => {
  const s = line()
  const patch = resolveSide(s, 'right_shoulder', 'left')
  assert.deepEqual(patch.regions, [])
  assert.deepEqual(sideNotes({ segments: [{ ...s, ...patch }] }).map((m) => m.label), [
    'Left shoulder (mentioned; not shown on the body yet)',
  ])
})

test('an unsided mention does not count toward coverage of a marked side', () => {
  const visit = { painted: [{ region: 'right_shoulder', type: 'sharp', intensity: 5 }], segments: [line()] }
  assert.equal(coverage(visit).right_shoulder.status, 'not_discussed')
  const resolved = { ...visit, segments: [{ ...line(), ...resolveSide(line(), 'right_shoulder', 'right') }] }
  assert.equal(coverage(resolved).right_shoulder.status, 'patient_responded')
})

test('reports list each open note once', () => {
  const segments = [line({ id: 'a' }), line({ id: 'b' })]
  assert.equal(sideNotes({ segments }).length, 1)
})

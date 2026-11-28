// npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBrief, compareMarks, daysBetween } from './brief.js'

const last = {
  endedAt: '2026-11-20T15:40:00.000Z',
  visit: {
    goal: { text: 'Put plates on the top shelf' },
    painted: [
      { region: 'right_shoulder', type: 'sharp', intensity: 6 },
      { region: 'left_knee', type: 'aching', intensity: 4 },
    ],
    segments: [
      { id: 'a', speaker: 'pt', text: 'How is the shoulder?', regions: ['right_shoulder'] },
      { id: 'b', speaker: 'patient', text: 'About a six.', regions: [], rating: 6 },
    ],
    observations: [
      { id: 'o1', movement: 'Turn your head to the left', assessedRegion: 'neck', symptomRegion: 'right_shoulder', before: 5, after: 2, confirmed: true },
      { id: 'o2', movement: 'Raise your arm', assessedRegion: 'right_shoulder', symptomRegion: 'right_shoulder', before: 6, after: 6, confirmed: false },
    ],
    painArcs: { right_shoulder: { from: 70, to: 120 } },
    anatomyNotes: [{ id: 'n1', complaintRegion: 'right_shoulder', structure: { label: 'AC joint', anatomical: 'Acromioclavicular joint' } }],
    followUps: [{ id: 'f1', text: 'Follow-up in two weeks' }],
  },
}

test('the missed knee and the 5 → 2 movement check are in the brief', () => {
  const b = buildBrief(last, { painted: [] }, new Date('2026-11-27T09:00:00'))
  assert.deepEqual(b.missed.map((m) => m.region), ['left_knee'])
  assert.match(b.missed[0].text, /Left knee \(aching, 4\/10\): Never came up/)
  assert.equal(b.movementChecks[0].text, 'Turn your head to the left: right shoulder 5 → 2')
  assert.equal(b.movementChecks[0].region, 'neck')
})

test('since last visit, goal, not confirmed, arcs, anatomy, follow-ups', () => {
  const b = buildBrief(last, { painted: [] }, new Date('2026-11-27T09:00:00'))
  assert.equal(b.since.daysAgo, 7)
  assert.deepEqual(b.goal, { text: 'Put plates on the top shelf', discussed: false })
  assert.deepEqual(b.notConfirmed.map((o) => o.text), ['Raise your arm: right shoulder 6 → 6'])
  assert.deepEqual(b.painArcs, [{ region: 'right_shoulder', arc: { from: 70, to: 120 } }])
  assert.equal(b.anatomy[0].text, 'AC joint (Acromioclavicular joint)')
  assert.equal(b.followUps[0].text, 'Follow-up in two weeks')
  assert.deepEqual(b.corrections, [])
})

test('today vs last time: new, gone and changed, in numbers only', () => {
  const items = compareMarks(last.visit.painted, [
    { region: 'right_shoulder', type: 'sharp', intensity: 4 },
    { region: 'neck', type: 'aching', intensity: 3 },
  ])
  assert.deepEqual(
    items.map((i) => i.text),
    ['Right shoulder: 6/10 last time, 4/10 today', 'Neck: newly marked today, 3/10', 'Left knee: marked last time, not marked today'],
  )
  for (const i of items) assert.doesNotMatch(i.text, /improv|better|worse|worsen/i)
})

test('a PT review last time clears the missed item; no last visit means no brief', () => {
  const reviewed = { ...last, visit: { ...last.visit, coverageReview: { left_knee: { status: 'reviewed' } } } }
  assert.deepEqual(buildBrief(reviewed, { painted: [] }).missed, [])
  assert.equal(buildBrief(null, { painted: [] }), null)
})

test('unresolved corrections are listed', () => {
  const withCorrection = {
    ...last,
    visit: { ...last.visit, observations: [{ ...last.visit.observations[0], correction: { status: 'requested' } }] },
  }
  assert.equal(buildBrief(withCorrection, {}).corrections.length, 1)
})

test('days between ignores the time of day', () => {
  assert.equal(daysBetween('2026-11-26T23:00:00', new Date('2026-11-27T01:00:00')), 1)
})

test('mentions with no side said show under corrections', () => {
  const withUnsided = {
    ...last,
    visit: { ...last.visit, segments: [...last.visit.segments, { id: 'c', speaker: 'patient', text: 'My shoulder too.', regions: [], unsided: ['right_shoulder'] }] },
  }
  assert.deepEqual(buildBrief(withUnsided, {}).corrections.map((c) => c.text), ['Shoulder (side not said)'])
})

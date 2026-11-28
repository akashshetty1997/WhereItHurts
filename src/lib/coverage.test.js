// npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coverage, flaggedPain, goalCoverage, suggestCoverage } from './coverage.js'

const pt = (id, text, regions = []) => ({ id, speaker: 'pt', text, regions })
const patient = (id, text, regions = [], rating = null) => ({ id, speaker: 'patient', text, regions, rating })
const knee = { region: 'left_knee', type: 'aching', intensity: 0.4 }
const visitOf = (segments, extra = {}) => ({ painted: [knee], segments, ...extra })

test('never named: not_discussed', () => {
  const v = visitOf([pt('a', 'Let us look at your neck.', ['neck'])])
  assert.equal(coverage(v).left_knee.status, 'not_discussed')
  assert.deepEqual(coverage(v).left_knee.evidence, [])
})

test('PT asks, patient talks about something else: pt_asked, PT line quoted', () => {
  const v = visitOf([
    pt('a', 'Does your knee hurt?', ['left_knee']),
    patient('b', 'My neck has been the main thing lately.', ['neck']),
  ])
  assert.equal(coverage(v).left_knee.status, 'pt_asked')
  assert.deepEqual(coverage(v).left_knee.evidence, ['a'])
  assert.equal(flaggedPain(v)[0].coverage, 'pt_asked')
})

test('PT asks, nobody answers: pt_asked', () => {
  const v = visitOf([pt('a', 'Does your knee hurt?', ['left_knee'])])
  assert.equal(coverage(v).left_knee.status, 'pt_asked')
})

test('PT asks, patient answers with a rating: patient_responded with both lines', () => {
  const v = visitOf([
    pt('a', 'Does your knee hurt?', ['left_knee']),
    patient('b', 'Yes, about a four.'),
  ])
  assert.equal(coverage(v).left_knee.status, 'patient_responded')
  assert.deepEqual(coverage(v).left_knee.evidence, ['a', 'b'])
  assert.equal(flaggedPain(v).length, 0)
})

test('answers: yes/no, pain words, smart-pass rating', () => {
  for (const reply of ['No, not really.', 'It aches when I climb stairs.', 'Mm, it gets stiff.']) {
    assert.equal(suggestCoverage([pt('a', 'And the knee?', ['left_knee']), patient('b', reply)], 'left_knee').status, 'patient_responded', reply)
  }
  assert.equal(
    suggestCoverage([pt('a', 'And the knee?', ['left_knee']), patient('b', 'Hmm.', [], 3)], 'left_knee').status,
    'patient_responded',
  )
  assert.equal(
    suggestCoverage([pt('a', 'And the knee?', ['left_knee']), patient('b', 'I drove here today.')], 'left_knee').status,
    'pt_asked',
  )
})

test('patient names it on their own: patient_responded', () => {
  const v = visitOf([patient('a', 'My knee clicks on the stairs.', ['left_knee'])])
  assert.equal(coverage(v).left_knee.status, 'patient_responded')
})

test('PT review wins over the suggestion and clears the flag', () => {
  const v = visitOf([], { coverageReview: { left_knee: { status: 'reviewed', at: 'x' } } })
  assert.equal(coverage(v).left_knee.suggested, 'not_discussed')
  assert.equal(coverage(v).left_knee.status, 'reviewed')
  assert.equal(flaggedPain(v).length, 0)
})

test('goal: matching lines are evidence; the PT can correct it', () => {
  const goal = { text: 'Put plates on the top shelf' }
  const v = { painted: [], goal, segments: [pt('a', 'So reaching the top shelf is hard?'), patient('b', 'Yes.')] }
  assert.deepEqual(goalCoverage(v), { status: 'discussed', suggested: 'discussed', discussed: true, evidence: ['a'], review: null })
  const corrected = { ...v, goal: { ...goal, review: { status: 'not_discussed', at: 'x' } } }
  assert.equal(goalCoverage(corrected).discussed, false)
  assert.equal(goalCoverage({ painted: [], segments: [] }), null)
})

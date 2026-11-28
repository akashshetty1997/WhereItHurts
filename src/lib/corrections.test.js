// npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  acceptCorrection,
  correctionState,
  keepOriginal,
  ptReportStatus,
  requestCorrection,
  takeHomeLine,
} from './corrections.js'

const check = { id: 'obs-1', movement: 'Turn your head to the left', symptomRegion: 'right_shoulder', before: 5, after: 2, confirmed: null }
const apply = (o, patch) => ({ ...o, ...patch })

test('request: both versions kept, confirmed false, badge everywhere', () => {
  const o = apply(check, requestCorrection(check, { before: 5, after: 4 }, 't1'))
  assert.equal(correctionState(o), 'requested')
  assert.equal(o.confirmed, false)
  assert.deepEqual(o.correction.patientVersion, { before: 5, after: 4 })
  assert.deepEqual([o.before, o.after], [5, 2]) // recorded values untouched
  assert.equal(takeHomeLine(o), 'You said this doesn’t match. You remember 5 → 4. Your PT will review it.')
  assert.match(ptReportStatus(o), /Patient requested a correction\. Recorded: right shoulder, 5 → 2\. Patient: 5 → 4\./)
})

test('request needs something to correct; bad numbers are dropped', () => {
  assert.throws(() => requestCorrection(check, {}))
  assert.throws(() => requestCorrection(check, { before: 42 }))
  const patch = requestCorrection(check, { after: '3', region: 'left_knee', text: '  ' })
  assert.deepEqual(patch.correction.patientVersion, { after: 3, region: 'left_knee' })
})

test('accept: the patient’s values become the record, the original is kept', () => {
  const requested = apply(check, requestCorrection(check, { before: 5, after: 4 }, 't1'))
  const o = apply(requested, acceptCorrection(requested, 't2'))
  assert.equal(correctionState(o), 'accepted')
  assert.deepEqual([o.before, o.after], [5, 4])
  assert.deepEqual(o.correction.original, { before: 5, after: 2, symptomRegion: 'right_shoulder', movement: 'Turn your head to the left', response: null })
  assert.match(ptReportStatus(o), /Corrected by patient, accepted by PT \(recorded: right shoulder, 5 → 2\)/)
  assert.match(takeHomeLine(o), /went from 5 to 4 out of 10\. \(Corrected by you, accepted by your PT\.\)/)
})

test('accept a body part: the symptom region changes', () => {
  const requested = apply(check, requestCorrection(check, { region: 'neck' }))
  assert.equal(apply(requested, acceptCorrection(requested)).symptomRegion, 'neck')
})

test('keep original: a note is required; both versions and the note stay', () => {
  const requested = apply(check, requestCorrection(check, { before: 5, after: 4 }, 't1'))
  assert.throws(() => keepOriginal(requested, '  '))
  const o = apply(requested, keepOriginal(requested, 'Rated 2 on video, re-checked together', 't2'))
  assert.equal(correctionState(o), 'kept_original')
  assert.deepEqual([o.before, o.after], [5, 2])
  assert.match(ptReportStatus(o), /Patient remembered 5 → 4; PT kept the original: “Rated 2 on video, re-checked together”/)
  assert.match(takeHomeLine(o), /went from 5 to 2 out of 10\. You remembered 5 → 4\. Your PT noted:/)
})

test('take-home wording for confirmed and never-asked checks', () => {
  assert.equal(takeHomeLine({ ...check, confirmed: true }), 'When you did “Turn your head to the left”, your right shoulder went from 5 to 2 out of 10.')
  assert.match(takeHomeLine(check), /Not confirmed yet\.$/)
  assert.equal(ptReportStatus(check), 'Not asked')
})

test('accepted numbers update better / same / worse', () => {
  const recorded = { ...check, response: 'better' }
  const requested = apply(recorded, requestCorrection(recorded, { after: 5 }))
  assert.equal(apply(requested, acceptCorrection(requested)).response, 'same')
})

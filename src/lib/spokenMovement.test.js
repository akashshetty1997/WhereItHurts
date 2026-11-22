// npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spokenMovement } from './spokenMovement.js'

const pt = (text, movement) => ({ speaker: 'pt', text, movement })
const region = (segment) => spokenMovement(segment)?.region ?? null

test('raising the arm plays Reach Up', () => {
  assert.equal(region(pt('Raise your right arm up for me, slowly.')), 'right_shoulder')
  assert.equal(region(pt('Lift your arm up slowly.')), 'right_shoulder')
  assert.equal(region(pt('Can you reach up over your head?')), 'right_shoulder')
  assert.equal(region(pt('Okay, now show me.', 'Raise the arm overhead')), 'right_shoulder')
})

test('turning the head plays Turn Head, left or right', () => {
  assert.deepEqual(spokenMovement(pt('Let me check your neck. Slowly turn your head to the left.')), { region: 'neck', direction: 1 })
  assert.deepEqual(spokenMovement(pt('Now turn your head to the right.')), { region: 'neck', direction: -1 })
  assert.deepEqual(spokenMovement(pt('Look over your right shoulder for me.')), { region: 'neck', direction: -1 })
})

test('bending the knee plays Bend Knee', () => {
  assert.equal(region(pt('Bend your knee as far as it goes.')), 'left_knee')
  assert.equal(region(pt('Can you do a small squat?')), 'left_knee')
  assert.equal(region(pt('Bend your right knee.')), null) // only the left knee is modelled
})

test('other lines do not play anything', () => {
  assert.equal(region(pt("Let's work on your neck and shoulder, with exercises at home.")), null)
  assert.equal(region(pt('Lift your knee up for me.')), null)
  assert.equal(region(pt('What brings you in today?')), null)
  assert.equal(region({ speaker: 'patient', text: 'It aches when I reach up to put plates away.' }), null)
  assert.equal(region({ speaker: 'patient', text: 'It hurts when I turn my head.' }), null)
  assert.equal(region(null), null)
})

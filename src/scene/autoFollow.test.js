// npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAutoFollow, matchStructure, HOLD_MS, MANUAL_PAUSE_MS, HOME_AFTER_MS } from './autoFollow.js'

// A fake clock: timers run when time is advanced past them.
function fakeClock() {
  let t = 0
  let timers = []
  let next = 1
  return {
    now: () => t,
    setTimer: (fn, ms) => {
      const id = next++
      timers.push({ id, at: t + ms, fn })
      return id
    },
    clearTimer: (id) => (timers = timers.filter((x) => x.id !== id)),
    advance(ms) {
      const end = t + ms
      for (;;) {
        const due = timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0]
        if (!due) break
        timers = timers.filter((x) => x !== due)
        t = due.at
        due.fn()
      }
      t = end
    },
  }
}

function setup({ visit = true, canAnatomy = true, state = { anatomyOpen: false, simPlaying: false } } = {}) {
  const clock = fakeClock()
  const calls = []
  const body = {
    focus: (r) => calls.push(`focus ${r}`),
    showStructure: (r, id) => calls.push(`structure ${r} ${id}`),
    home: () => calls.push('home'),
    state: () => state,
  }
  const director = createAutoFollow(body, {
    isVisit: () => visit,
    isOn: () => true,
    canAnatomy: () => canAnatomy,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  })
  let n = 0
  const pt = (text, regions = []) => director.line({ id: `s${++n}`, speaker: 'pt', text, regions })
  const patient = (text, regions = []) => director.line({ id: `s${++n}`, speaker: 'patient', text, regions })
  return { clock, calls, director, pt, patient, state }
}

test('term matching: whole words, longest phrase first', () => {
  assert.equal(matchStructure('That is your rotator cuff.')?.id, 'FMA32544')
  assert.equal(matchStructure('The top rotator cuff muscle starts the lift.')?.id, 'FMA32544')
  assert.equal(matchStructure('This is your collarbone.')?.label, 'Collarbone')
  assert.equal(matchStructure('Feel the AC joint here.')?.id, 'right_ac_joint')
  assert.equal(matchStructure('C1 sits under the skull.')?.id, 'FMA12519')
  assert.equal(matchStructure('Your kneecap moves.', ['left_knee'])?.region, 'left_knee')
  assert.equal(matchStructure('The thigh bone in your leg.', ['left_leg'])?.region, 'left_leg')
  assert.equal(matchStructure('How is your shoulder?'), null)
  assert.equal(matchStructure('I like the atlases in that shop.'), null) // not a whole word
})

test('PT line with a region focuses it; patient lines never move the camera', () => {
  const { calls, pt, patient } = setup()
  patient('My neck hurts.', ['neck'])
  assert.deepEqual(calls, [])
  pt('Let’s look at your neck.', ['neck'])
  assert.deepEqual(calls, ['focus neck'])
})

test('three regions in one sentence move once', () => {
  const { calls, pt } = setup()
  pt('Neck, upper back and lower back.', ['neck', 'upper_back', 'lower_back'])
  assert.deepEqual(calls, ['focus neck'])
})

test('a named structure opens anatomy for PTs, and only focuses for patients', () => {
  const ptView = setup()
  ptView.pt('This is your collarbone.')
  assert.deepEqual(ptView.calls, ['structure right_shoulder FMA13322'])
  const patientView = setup({ canAnatomy: false })
  patientView.pt('This is your collarbone.')
  assert.deepEqual(patientView.calls, ['focus right_shoulder'])
})

test('hold: a view stays at least 4 s; only the newest pending move happens', () => {
  const { calls, pt, clock } = setup()
  pt('Your neck.', ['neck'])
  clock.advance(1000)
  pt('Your lower back.', ['lower_back'])
  pt('Your knee.', ['left_knee'])
  assert.deepEqual(calls, ['focus neck'])
  clock.advance(HOLD_MS)
  assert.deepEqual(calls, ['focus neck', 'focus left_knee'])
})

test('manual input pauses for 10 s', () => {
  const { calls, pt, clock, director } = setup()
  director.manual()
  pt('Your neck.', ['neck'])
  clock.advance(MANUAL_PAUSE_MS - 1)
  assert.deepEqual(calls, [])
  pt('Your knee.', ['left_knee'])
  clock.advance(1)
  assert.deepEqual(calls, ['focus left_knee'])
})

test('returns home after 15 s without a new region, but not while anatomy is open', () => {
  const a = setup()
  a.pt('Your neck.', ['neck'])
  a.clock.advance(HOME_AFTER_MS)
  assert.deepEqual(a.calls, ['focus neck', 'home'])

  const b = setup({ state: { anatomyOpen: true, simPlaying: false } })
  b.pt('Your neck.', ['neck'])
  b.clock.advance(HOME_AFTER_MS * 2)
  assert.deepEqual(b.calls, ['focus neck'])
})

test('never interrupts a movement simulation, and does nothing outside the visit', () => {
  const sim = setup({ state: { anatomyOpen: true, simPlaying: true } })
  sim.pt('Your neck.', ['neck'])
  assert.deepEqual(sim.calls, [])
  const before = setup({ visit: false })
  before.pt('Your neck.', ['neck'])
  assert.deepEqual(before.calls, [])
})

test('the same line improved later moves only if its target changed', () => {
  const { calls, director, clock } = setup()
  director.line({ id: 'x', speaker: 'pt', text: 'Look here.', regions: ['right_shoulder'] })
  director.line({ id: 'x', speaker: 'pt', text: 'Look here.', regions: ['right_shoulder', 'neck'] })
  assert.deepEqual(calls, ['focus right_shoulder'])
  clock.advance(HOLD_MS)
  director.line({ id: 'x', speaker: 'pt', text: 'Look here.', regions: ['right_shoulder'], structures: ['right_ac_joint'] })
  assert.deepEqual(calls, ['focus right_shoulder', 'structure right_shoulder right_ac_joint'])
})

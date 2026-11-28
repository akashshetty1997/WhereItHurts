// npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHistory, HISTORY_KEY, MAX_PER_OWNER } from './history.js'

function memoryStorage() {
  const data = new Map()
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  }
}

const visit = (id, endedAt, extra = {}) => ({
  visitId: id,
  endedAt,
  painted: [{ region: 'neck', type: 'aching', intensity: 5 }],
  segments: [],
  ...extra,
})

test('archive and list: newest first, per owner', () => {
  const h = createHistory(memoryStorage())
  h.archiveVisit(visit('a', '2026-11-01T10:00:00Z'), 'pt1')
  h.archiveVisit(visit('b', '2026-11-20T10:00:00Z'), 'pt1')
  h.archiveVisit(visit('c', '2026-11-10T10:00:00Z'), 'pt2')
  assert.deepEqual(h.listVisits('pt1').map((r) => r.id), ['b', 'a'])
  assert.deepEqual(h.listVisits('pt2').map((r) => r.id), ['c'])
  assert.equal(h.getLastVisit('pt1').id, 'b')
})

test('the same visit archived twice is kept once (the newer copy)', () => {
  const h = createHistory(memoryStorage())
  h.archiveVisit(visit('a', '2026-11-01T10:00:00Z'), 'pt1')
  h.archiveVisit(visit('a', '2026-11-02T10:00:00Z', { goal: { text: 'Walk the dog' } }), 'pt1')
  const all = h.listVisits('pt1')
  assert.equal(all.length, 1)
  assert.equal(all[0].visit.goal.text, 'Walk the dog')
})

test('empty visits are not kept', () => {
  const h = createHistory(memoryStorage())
  assert.equal(h.archiveVisit({ visitId: 'x', painted: [], segments: [] }, 'pt1'), null)
  assert.equal(h.listVisits('pt1').length, 0)
})

test('cap: at most 50 per owner, oldest dropped, other owners untouched', () => {
  const h = createHistory(memoryStorage())
  h.archiveVisit(visit('other', '2026-01-01T00:00:00Z'), 'pt2')
  for (let i = 0; i < MAX_PER_OWNER + 5; i++) {
    h.archiveVisit(visit(`v${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()), 'pt1')
  }
  const mine = h.listVisits('pt1')
  assert.equal(mine.length, MAX_PER_OWNER)
  assert.equal(mine.at(-1).id, 'v5') // v0–v4 dropped
  assert.equal(h.listVisits('pt2').length, 1)
})

test('patients: last visit for one patient, skipping the current one', () => {
  const h = createHistory(memoryStorage())
  h.archiveVisit(visit('a', '2026-11-01T10:00:00Z', { patientKey: 'JD' }), 'pt1')
  h.archiveVisit(visit('b', '2026-11-05T10:00:00Z', { patientKey: 'MK' }), 'pt1')
  h.archiveVisit(visit('c', '2026-11-09T10:00:00Z', { patientKey: 'JD' }), 'pt1')
  assert.equal(h.getLastVisit('pt1', { patientKey: 'JD' }).id, 'c')
  assert.equal(h.getLastVisit('pt1', { patientKey: 'JD', before: 'c' }).id, 'a')
  assert.equal(h.getLastVisit('pt1', { patientKey: 'ZZ' }), null)
})

test('a saved history from another version is ignored; broken storage fails quietly', () => {
  const storage = memoryStorage()
  storage.setItem(HISTORY_KEY, JSON.stringify({ version: 0, visits: [{ id: 'old', ownerId: 'pt1' }] }))
  const h = createHistory(storage)
  assert.deepEqual(h.listVisits('pt1'), [])
  const broken = createHistory({
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('full')
    },
  })
  assert.doesNotThrow(() => broken.archiveVisit(visit('a', '2026-11-01T10:00:00Z'), 'pt1'))
  assert.deepEqual(broken.listVisits('pt1'), [])
})

test('delete', () => {
  const h = createHistory(memoryStorage())
  h.archiveVisit(visit('a', '2026-11-01T10:00:00Z'), 'pt1')
  h.deleteVisit('a')
  assert.equal(h.listVisits('pt1').length, 0)
})

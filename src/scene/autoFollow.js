// Auto-follow: while the PT explains, the body follows (docs/NEXT_PHASE_PLAN.md → Task 1).
//
//   PT: "Let's look at your neck."          → the camera flies to the neck
//   PT: "This is your collarbone."          → Show Anatomy opens with the collarbone card (PT view)
//   Patient lines never move the camera.
//
// Rules: hold each view at least HOLD_MS, keep at most one pending move (the newest), pause for
// MANUAL_PAUSE_MS after anyone touches the body, go back to the whole body after HOME_AFTER_MS
// without a new body part (not while anatomy or a movement simulation is open), and never
// interrupt a movement simulation. The director is plain JS with an injectable clock, so it runs
// under `node --test`; App.jsx connects it to the store and the body.
import { REGIONS } from '../regions.js'
import TERMS from './anatomyTerms.json' with { type: 'json' }

export const HOLD_MS = 4000
export const MANUAL_PAUSE_MS = 10000
export const HOME_AFTER_MS = 15000

// ---------- words → structure ----------

const normalize = (text) => ` ${text.toLowerCase().replace(/[–—]/g, '-').replace(/[^a-z0-9-]+/g, ' ')} `

// term → entries, longest terms first, so "top rotator cuff muscle" wins over "rotator cuff".
function indexTerms(entries) {
  const byTerm = new Map()
  for (const e of entries) {
    for (const t of e.terms) {
      const key = normalize(t).trim()
      if (!key) continue
      byTerm.set(key, [...(byTerm.get(key) ?? []), e])
    }
  }
  return [...byTerm].sort((a, b) => b[0].length - a[0].length)
}
const INDEX = indexTerms(TERMS)

// The structure a sentence names, or null: { id, region, label, kind }. When a structure belongs to
// several regions (the femur: knee and leg), the one the sentence also names wins.
export function matchStructure(text, regions = [], index = INDEX) {
  const line = normalize(text ?? '')
  for (const [term, entries] of index) {
    if (!line.includes(` ${term} `)) continue
    const entry = entries.find((e) => regions.includes(e.region)) ?? entries[0]
    return { id: entry.id, region: entry.region, label: entry.label, kind: entry.kind }
  }
  return null
}

const byId = new Map(TERMS.map((e) => [e.id, e]))
export const structureById = (id) => byId.get(id) ?? null

// ---------- the director ----------

// What a line asks for: a structure (when the viewer can see anatomy), else the first region.
export function targetFor(segment, { canAnatomy }) {
  const regions = (segment.regions ?? []).filter((r) => r in REGIONS)
  const fromWords = matchStructure(segment.correctedText ?? segment.text, regions)
  const fromSmart = (segment.structures ?? []).map(structureById).find(Boolean)
  const structure = fromWords ?? (fromSmart && { id: fromSmart.id, region: fromSmart.region, label: fromSmart.label })
  if (structure && canAnatomy) {
    return { kind: 'structure', region: structure.region, id: structure.id, key: `s:${structure.id}`, label: structure.label }
  }
  const region = structure?.region ?? regions[0]
  return region ? { kind: 'focus', region, key: `r:${region}`, label: REGIONS[region] } : null
}

// body: { focus(region), showStructure(region, id), home(), state() → { anatomyOpen, simPlaying } }
// options: { isVisit(), isOn(), canAnatomy(), onStatus(target | null), now(), setTimer, clearTimer }
export function createAutoFollow(body, options) {
  const {
    isVisit,
    isOn,
    canAnatomy,
    onStatus = () => {},
    now = () => Date.now(),
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id),
  } = options
  let current = null // the target on screen
  let lastMoveAt = -Infinity
  let pausedUntil = -Infinity
  let pending = null
  let pendingTimer = null
  let homeTimer = null
  const acted = new Map() // segment id → target key already acted on

  const clear = (id) => id != null && clearTimer(id)

  function scheduleHome() {
    clear(homeTimer)
    homeTimer = setTimer(() => {
      homeTimer = null
      const { anatomyOpen, simPlaying } = body.state()
      if (anatomyOpen || simPlaying) return // the PT is still showing something
      body.home()
      current = null
      onStatus(null)
    }, HOME_AFTER_MS)
  }

  function go(target) {
    if (body.state().simPlaying) return // never interrupt a movement simulation
    if (target.kind === 'structure') body.showStructure(target.region, target.id)
    else body.focus(target.region)
    current = target
    lastMoveAt = now()
    onStatus(target)
    scheduleHome()
  }

  function flush() {
    pendingTimer = null
    const target = pending
    pending = null
    if (target) request(target)
  }

  function request(target) {
    const t = now()
    const wait = Math.max(pausedUntil - t, lastMoveAt + HOLD_MS - t)
    if (wait > 0) {
      pending = target // only the newest waits
      clear(pendingTimer)
      pendingTimer = setTimer(flush, wait)
      return
    }
    go(target)
  }

  return {
    // A new or improved conversation line.
    line(segment) {
      if (!isVisit() || !isOn() || segment.speaker === 'patient') return
      const target = targetFor(segment, { canAnatomy: canAnatomy() })
      if (!target || acted.get(segment.id) === target.key) return
      acted.set(segment.id, target.key)
      if (current?.key === target.key && !pending) {
        scheduleHome() // still talking about the same thing: stay
        return
      }
      request(target)
    },
    // Someone dragged, scrolled or used the keys on the body: they're in charge for a while.
    manual() {
      pausedUntil = now() + MANUAL_PAUSE_MS
      pending = null
      clear(pendingTimer)
      pendingTimer = null
      clear(homeTimer)
      homeTimer = null
      if (current) {
        current = null
        onStatus(null)
      }
    },
    stop() {
      clear(pendingTimer)
      clear(homeTimer)
      pending = null
      current = null
    },
  }
}

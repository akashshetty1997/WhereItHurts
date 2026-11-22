// Builds movement checks from the conversation (docs/PLAN.md → observations).
//
//   PT:      "How bad is the shoulder right now?"            -> symptom: right_shoulder
//   Patient: "About a five."                                -> rating 5, waiting for a movement
//   PT:      "Let me check your neck. Turn your head left."  -> movement + area assessed: neck
//   Patient: "Oh, the shoulder feels better. Maybe a two."  -> after: 2, response: better
//
// The PT can also fill or correct any field by hand in the Movement Check card.
import { visitStore } from '../visitStore'

let lastRegion = null // the most recent body part anyone mentioned
let lastRating = null // a pain number the patient said before a movement started
let counter = 0
const handled = new Set() // line ids whose movement / rating was already used

// After a page refresh the saved checks are back (src/visitStore.js): continue their numbering.
function nextId() {
  if (!counter) {
    const ids = (visitStore.get().observations ?? []).map((o) => Number(o.id?.split('-')[1]) || 0)
    counter = Math.max(0, ...ids)
  }
  return `obs-${++counter}`
}

// Safety net when /api/extract returns no movement (its keyword fallback doesn't look for one):
// a PT instruction like "Slowly turn your head to the left" → "Turn your head to the left".
const MOVEMENT_RE =
  /\b(turn|bend|lift|raise|reach|rotate|tilt|look|squat|step|stand|sit|walk|push|pull|straighten|extend|flex|lean|twist|shrug|kneel|lie)\b[^.?!]*/i
export function detectMovement(text) {
  const m = text.match(MOVEMENT_RE)
  if (!m) return null
  const phrase = m[0].trim().replace(/\s+/g, ' ')
  return phrase.charAt(0).toUpperCase() + phrase.slice(1)
}

export function responseFor(before, after) {
  if (before == null || after == null) return null
  if (after < before) return 'better'
  if (after > before) return 'worse'
  return 'same'
}

const openCheck = () => {
  const checks = visitStore.get().observations ?? []
  const last = checks[checks.length - 1]
  return last && last.after == null ? last : null
}

export function startCheck(patch = {}) {
  const check = {
    id: nextId(),
    movement: '',
    assessedRegion: null,
    symptomRegion: lastRegion,
    before: lastRating,
    after: null,
    response: null,
    quote: '',
    confirmed: null,
    ...patch,
  }
  visitStore.addObservation(check)
  return check
}

export function updateCheck(id, patch) {
  const current = (visitStore.get().observations ?? []).find((o) => o.id === id)
  if (!current) return
  const next = { ...current, ...patch }
  if (!('response' in patch) || patch.response == null) {
    next.response = next.response === 'moved' ? 'moved' : responseFor(next.before, next.after)
  }
  visitStore.updateObservation(id, next)
}

// Called for every new conversation line.
export function onLine(line) {
  const segment = {
    ...line,
    movement: line.movement ?? (line.speaker !== 'patient' ? detectMovement(line.text) : null),
  }
  const open = openCheck()
  if (segment.movement || segment.rating != null) handled.add(line.id)
  if (segment.movement) {
    // The PT named a movement: start a check (or name the open one). The body part the PT
    // mentioned with it is the area assessed.
    const assessed = segment.regions?.[0] ?? null
    if (open && !open.movement) updateCheck(open.id, { movement: segment.movement, assessedRegion: assessed ?? open.assessedRegion })
    else if (!open) startCheck({ movement: segment.movement, assessedRegion: assessed })
    lastRating = null
  } else if (segment.speaker === 'patient' && segment.rating != null) {
    if (open && open.movement && open.before != null) {
      // A rating after the movement: that's "after".
      updateCheck(open.id, {
        after: segment.rating,
        quote: segment.text,
        symptomRegion: open.symptomRegion ?? segment.regions?.[0] ?? lastRegion,
      })
    } else if (open && open.before == null) {
      updateCheck(open.id, { before: segment.rating })
    } else {
      lastRating = segment.rating
    }
  }
  // Remember the body part being discussed (not the one being tested).
  const symptom = segment.regions?.find((r) => r !== openCheck()?.assessedRegion)
  if (symptom) lastRegion = symptom
}

// The smart pass (src/panels/smartPass.js) found a movement or a rating the keywords missed.
// Only the latest line counts (an older one would land in the wrong check), and only once.
export function onLineUpdate(next, previous) {
  const latest = visitStore.get().segments.at(-1)
  if (latest?.id !== next.id || handled.has(next.id)) return
  const movement = !previous.movement && next.movement ? next.movement : null
  const rating = previous.rating == null && next.rating != null ? next.rating : null
  if (movement || rating != null) onLine({ ...next, movement, rating })
}

// New Visit: forget everything about the last one.
export function resetMovementCheck() {
  lastRegion = null
  lastRating = null
  counter = 0
  handled.clear()
}

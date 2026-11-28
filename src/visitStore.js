import { useSyncExternalStore } from 'react'
import { mockVisit } from './mockVisit'
import { flaggedPain, goalCoverage } from './lib/coverage'

// One visit state. Painting and speech write; the 3D body and UI only read.
// A real visit starts empty; mockVisit only supplies the shape and the speaker colors.
export const emptyVisit = () => ({
  ...structuredClone(mockVisit),
  goal: null,
  painted: [],
  segments: [],
  followUps: [],
  observations: [],
  anatomyNotes: [],
  painArcs: {}, // Reach Up: { right_shoulder: { from, to } } in degrees of arm raise
  coverageReview: {}, // the PT's own call per marked region: { [region]: { status, note?, at } }
})

// The visit is kept in this browser, so a page refresh mid-visit loses nothing. New Visit and
// Log Out clear it. Versioned, so an older saved shape is ignored instead of breaking the app.
const SAVE_KEY = 'whereithurts.visit'
const SAVE_VERSION = 1

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null')
    return saved?.version === SAVE_VERSION ? { ...emptyVisit(), ...saved.visit } : null
  } catch {
    return null
  }
}

function save(visit) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, visit }))
  } catch {
    // Storage full or blocked: the visit still works, it just won't survive a refresh.
  }
}

// Which step the visit is on and which body is shown, so a refresh comes back to the same screen.
const SESSION_KEY = 'whereithurts.session'

export function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}') ?? {}
  } catch {
    return {}
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Blocked storage: a refresh just starts at Mark Pain.
  }
}

export function clearSavedVisit() {
  try {
    localStorage.removeItem(SAVE_KEY)
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // Nothing to clear.
  }
}

let state = loadSaved() ?? emptyVisit()
const listeners = new Set()
const segmentListeners = new Set()
const segmentUpdateListeners = new Set()

function emit() {
  save(state)
  listeners.forEach((l) => l())
}

export const visitStore = {
  get: () => state,
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  setPainted(painted) {
    state = { ...state, painted }
    emit()
  },
  addSegment(segment) {
    state = { ...state, segments: [...state.segments, segment] }
    emit()
    segmentListeners.forEach((l) => l(segment))
  },
  // The smart pass (Claude) improves a line after it was shown: more regions, a rating, a movement.
  updateSegment(id, patch) {
    const current = state.segments.find((s) => s.id === id)
    if (!current) return
    const next = { ...current, ...patch }
    state = { ...state, segments: state.segments.map((s) => (s.id === id ? next : s)) }
    emit()
    segmentUpdateListeners.forEach((l) => l(next, current))
  },
  // The patient's goal: what they want to be able to do again (spoken or typed during intake).
  setGoal(text) {
    const clean = text.trim()
    state = { ...state, goal: clean ? { text: clean, discussed: false } : null }
    emit()
  },
  // Movement checks (docs/PLAN.md → observations): one per movement the PT tested.
  addObservation(observation) {
    state = { ...state, observations: [...(state.observations ?? []), observation] }
    emit()
  },
  updateObservation(id, patch) {
    state = {
      ...state,
      observations: (state.observations ?? []).map((o) => (o.id === id ? { ...o, ...patch } : o)),
    }
    emit()
  },
  addFollowUp(followUp) {
    if (state.followUps.some((f) => f.segmentId && f.segmentId === followUp.segmentId)) return
    state = { ...state, followUps: [...state.followUps, followUp] }
    emit()
  },
  // Show Anatomy → Add to Report: a structure the PT explained or examined, filed under the
  // complaint (region) it was shown for. { complaintRegion, structure, purpose, note }
  addAnatomyNote(note) {
    const id = `anat-${Date.now().toString(36)}`
    state = {
      ...state,
      anatomyNotes: [...(state.anatomyNotes ?? []), { id, time: new Date().toISOString(), ...note }],
    }
    emit()
    return id
  },
  // Reach Up: where raising the arm hurts, { from, to } in degrees, or null to clear.
  setPainArc(region, arc) {
    const painArcs = { ...(state.painArcs ?? {}) }
    if (arc) painArcs[region] = arc
    else delete painArcs[region]
    state = { ...state, painArcs }
    emit()
  },
  // Coverage review (src/lib/coverage.js): the PT confirms or corrects whether a marked pain came
  // up. { status, note? } or null to go back to the suggestion.
  setCoverageReview(region, review) {
    const coverageReview = { ...(state.coverageReview ?? {}) }
    if (review) coverageReview[region] = { ...review, at: new Date().toISOString() }
    else delete coverageReview[region]
    state = { ...state, coverageReview }
    emit()
  },
  // The same for the goal: { status: 'discussed' | 'not_discussed' } or null.
  setGoalReview(review) {
    if (!state.goal) return
    const goal = { ...state.goal }
    if (review) goal.review = { ...review, at: new Date().toISOString() }
    else delete goal.review
    state = { ...state, goal }
    emit()
  },
  removeAnatomyNote(id) {
    state = { ...state, anatomyNotes: (state.anatomyNotes ?? []).filter((n) => n.id !== id) }
    emit()
  },
  onSegment(listener) {
    segmentListeners.add(listener)
    return () => segmentListeners.delete(listener)
  },
  // (updated segment, previous version)
  onSegmentUpdate(listener) {
    segmentUpdateListeners.add(listener)
    return () => segmentUpdateListeners.delete(listener)
  },
  // New Visit: start over with nothing marked or said.
  reset(visit = emptyVisit()) {
    state = structuredClone(visit)
    emit()
  },
}

// The catch: marked pain that never came up, or that the PT asked about without an answer
// (src/lib/coverage.js). Each item is the painted entry plus { coverage, evidence }.
export function unmentioned(visit) {
  return flaggedPain(visit)
}

export function useVisit() {
  return useSyncExternalStore(visitStore.subscribe, visitStore.get)
}

// Did the goal come up? Word overlap with any line, unless the PT corrected it (src/lib/coverage.js).
export function goalDiscussed(visit) {
  return goalCoverage(visit)?.discussed ?? false
}

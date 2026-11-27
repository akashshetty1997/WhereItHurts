import { useSyncExternalStore } from 'react'
import { mockVisit } from './mockVisit'

// One visit state. Painting and speech write; the 3D body and UI only read.
// A real visit starts empty; mockVisit only supplies the shape and the speaker colors.
// Each visit has its own id and dates (history, reports), and a patient key: initials or a
// nickname the PT types (never real patient data), so past visits can be found per patient.
const newVisitId = () => globalThis.crypto?.randomUUID?.() ?? `visit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
export const emptyVisit = () => ({
  ...structuredClone(mockVisit),
  visitId: newVisitId(),
  startedAt: new Date().toISOString(),
  endedAt: null,
  status: 'in_progress', // 'in_progress' | 'ended'
  patientKey: null,
  goal: null,
  painted: [],
  segments: [],
  followUps: [],
  observations: [],
  anatomyNotes: [],
  painArcs: {}, // Reach Up: { right_shoulder: { from, to } } in degrees of arm raise
})

// The visit is kept in this browser, so a page refresh mid-visit loses nothing. New Visit and
// Log Out clear it. Versioned, so an older saved shape is ignored instead of breaking the app.
const SAVE_KEY = 'whereithurts.visit'
const SAVE_VERSION = 1

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null')
    if (saved?.version !== SAVE_VERSION) return null
    const visit = { ...emptyVisit(), ...saved.visit }
    // Saved before visits had their own ids: give it one.
    if (visit.visitId === mockVisit.visitId) visit.visitId = newVisitId()
    return visit
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

// Past Visits: a finished visit opened read-only. The current visit waits in `live` (and stays
// saved), nothing is saved while viewing, and every change is ignored.
let live = null

function emit() {
  if (!live) save(state)
  listeners.forEach((l) => l())
}

// Every change goes through here, so a past visit can't be changed.
const editable = () => !live

export const visitStore = {
  get: () => state,
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  setPainted(painted) {
    if (!editable()) return
    state = { ...state, painted }
    emit()
  },
  addSegment(segment) {
    if (!editable()) return
    state = { ...state, segments: [...state.segments, segment] }
    emit()
    segmentListeners.forEach((l) => l(segment))
  },
  // The smart pass (Claude) improves a line after it was shown: more regions, a rating, a movement.
  updateSegment(id, patch) {
    if (!editable()) return
    const current = state.segments.find((s) => s.id === id)
    if (!current) return
    const next = { ...current, ...patch }
    state = { ...state, segments: state.segments.map((s) => (s.id === id ? next : s)) }
    emit()
    segmentUpdateListeners.forEach((l) => l(next, current))
  },
  // The patient's goal: what they want to be able to do again (spoken or typed during intake).
  setGoal(text) {
    if (!editable()) return
    const clean = text.trim()
    state = { ...state, goal: clean ? { text: clean, discussed: false } : null }
    emit()
  },
  // Movement checks (docs/PLAN.md → observations): one per movement the PT tested.
  addObservation(observation) {
    if (!editable()) return
    state = { ...state, observations: [...(state.observations ?? []), observation] }
    emit()
  },
  updateObservation(id, patch) {
    if (!editable()) return
    state = {
      ...state,
      observations: (state.observations ?? []).map((o) => (o.id === id ? { ...o, ...patch } : o)),
    }
    emit()
  },
  addFollowUp(followUp) {
    if (!editable()) return
    if (state.followUps.some((f) => f.segmentId && f.segmentId === followUp.segmentId)) return
    state = { ...state, followUps: [...state.followUps, followUp] }
    emit()
  },
  // Show Anatomy → Add to Report: a structure the PT explained or examined, filed under the
  // complaint (region) it was shown for. { complaintRegion, structure, purpose, note }
  addAnatomyNote(note) {
    if (!editable()) return
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
    if (!editable()) return
    const painArcs = { ...(state.painArcs ?? {}) }
    if (arc) painArcs[region] = arc
    else delete painArcs[region]
    state = { ...state, painArcs }
    emit()
  },
  removeAnatomyNote(id) {
    if (!editable()) return
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
    live = null
    state = structuredClone(visit)
    emit()
  },
  // End Visit: stamp the end. Back to Marking reopens it (the end date is kept until it ends again).
  setStatus(status) {
    if (!editable() || state.status === status) return
    state = { ...state, status, ...(status === 'ended' ? { endedAt: new Date().toISOString() } : {}) }
    emit()
  },
  // Initials or a nickname for the patient (PT / Testing mode), or null.
  setPatientKey(key) {
    if (!editable()) return
    state = { ...state, patientKey: key?.trim() ? key : null } // trimmed when the visit is kept
    emit()
  },
  // Past Visits: open one read-only, then go back to the current visit.
  viewPast(visit) {
    if (!live) live = state
    state = structuredClone(visit)
    emit()
  },
  closePast() {
    if (!live) return
    state = live
    live = null
    emit()
  },
  isViewingPast: () => !!live,
}

// The whole "catch": painted regions minus every region mentioned in any segment.
export function unmentioned(visit) {
  const mentioned = new Set(visit.segments.flatMap((s) => s.regions))
  return visit.painted.filter((p) => !mentioned.has(p.region))
}

export function useVisit() {
  return useSyncExternalStore(visitStore.subscribe, visitStore.get)
}

// Did the goal come up? True when some line shares the goal's content words: one is enough for a
// short goal ("Put plates on the top shelf" → plates, shelf), two for a longer one.
const STOP_WORDS = new Set(['the', 'and', 'with', 'want', 'like', 'able', 'again', 'would', 'could', 'some', 'that', 'this', 'from', 'into', 'without', 'being'])
export function goalDiscussed(visit) {
  const words = (text) => new Set(text.toLowerCase().match(/[a-z]{4,}/g)?.filter((w) => !STOP_WORDS.has(w)) ?? [])
  if (!visit.goal?.text) return false
  const goal = words(visit.goal.text)
  if (!goal.size) return false
  const need = goal.size >= 4 ? 2 : 1
  return visit.segments.some((s) => [...words(s.text)].filter((w) => goal.has(w)).length >= need)
}

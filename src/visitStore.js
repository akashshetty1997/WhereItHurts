import { useSyncExternalStore } from 'react'
import { mockVisit } from './mockVisit'

// One visit state. Painting and speech write; the 3D body and UI only read.
// A real visit starts empty; mockVisit only supplies the shape and the speaker colors.
const emptyVisit = () => ({ ...structuredClone(mockVisit), painted: [], segments: [], followUps: [] })
let state = emptyVisit()
const listeners = new Set()
const segmentListeners = new Set()

function emit() {
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
  // The patient's goal: what they want to be able to do again (spoken or typed during intake).
  setGoal(text) {
    const clean = text.trim()
    state = { ...state, goal: clean ? { text: clean, discussed: false } : null }
    emit()
  },
  addFollowUp(followUp) {
    state = { ...state, followUps: [...state.followUps, followUp] }
    emit()
  },
  onSegment(listener) {
    segmentListeners.add(listener)
    return () => segmentListeners.delete(listener)
  },
  reset(visit = mockVisit) {
    state = structuredClone(visit)
    emit()
  },
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

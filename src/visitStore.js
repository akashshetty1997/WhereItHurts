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

// Auto-follow on/off (remembered in this browser) and what it's following now, for the toggle in
// the view controls and the "Following: Neck" chip on the body (src/scene/autoFollow.js).
import { useSyncExternalStore } from 'react'

const KEY = 'whereithurts.autoFollow'
let state = { on: readOn(), status: null } // status: a label like "Neck" or "Collarbone"
const listeners = new Set()

function readOn() {
  try {
    return localStorage.getItem(KEY) !== '0' // on unless turned off
  } catch {
    return true
  }
}

export const autoFollowState = {
  get: () => state,
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  set(patch) {
    state = { ...state, ...patch }
    if ('on' in patch) {
      try {
        localStorage.setItem(KEY, patch.on ? '1' : '0')
      } catch {
        // Blocked storage: the choice just isn't remembered.
      }
      if (!patch.on) state = { ...state, status: null }
    }
    listeners.forEach((l) => l())
  },
}

export function useAutoFollow() {
  return useSyncExternalStore(autoFollowState.subscribe, autoFollowState.get)
}

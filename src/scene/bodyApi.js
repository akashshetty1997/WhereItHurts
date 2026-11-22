// The body's public functions (docs/PLAN.md → Contract functions).
// BodyScene registers the implementation when it mounts; calls before that are ignored.
let impl = null
const clickListeners = new Set()

export function registerBody(next) {
  impl = next
}

// Light every mesh of a region in a color (e.g. the speaker's), fading out over ~2.5 s.
export function glow(region, color) {
  impl?.glow(region, color)
}

// Subscribe to region clicks. The callback gets a region id, or null for a miss. Returns unsubscribe.
export function onRegionClick(callback) {
  clickListeners.add(callback)
  return () => clickListeners.delete(callback)
}

export function emitRegionClick(region) {
  clickListeners.forEach((callback) => callback(region))
}

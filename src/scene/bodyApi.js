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

// Voice intake: show that the mic is open for this region (pulsing ring + "Listening…").
// Call with null when the patient stops speaking. The result arrives through setPainted().
export function setListening(region) {
  impl?.setListening(region)
}

// Select a region from outside the 3D view (the body-part list, keyboard users). The body shows
// the selection ring and, during intake, the pain card; region clicks fire as if it was tapped.
export function selectRegion(region) {
  impl?.select(region)
}

// The pain-path pulse: light travels along the regions in order (e.g. ['lower_back', 'left_leg']),
// in the speaker's color. Fired automatically for segments that have a path.
export function pulse(path, color) {
  impl?.pulse(path, color)
}

// Movement check "Before / After": show a region's pain at this rating (0–10) instead of the
// marked one, or (null, null) to go back.
export function showRatings(region, rating) {
  impl?.showRatings(region, rating)
}

// Show Anatomy (PT or Testing mode): reference bones and muscles inside a region, the skin
// see-through around it. null closes it.
export function showAnatomy(region) {
  impl?.showAnatomy(region)
}

// Show Anatomy layers: 'skin' | 'muscle' | 'bone' | 'mark' (the patient's own pain mark).
export function anatomyLayer(layer, visible) {
  impl?.anatomyLayer(layer, visible)
}

// Movement simulations (everyone): Reach Up, Turn Head, Bend Knee (src/scene/movements.js).
// playMovement plays one sweep (voice: the PT asked for it; direction -1 turns the other way) and
// returns to the skin afterwards. preloadAnatomy fetches the anatomy file ahead of time.
export function openMovement(region) {
  impl?.openMovement(region)
}
export function playMovement(region, label, direction) {
  impl?.playMovement(region, label, direction)
}
export function preloadAnatomy() {
  impl?.preloadAnatomy()
}

// Reports: a still of the whole body, 'front' or 'back', on white. Returns { url, aspect } (a PNG
// data URL and its width / height), or null before the body has mounted.
export function snapshot(side) {
  return impl?.snapshot(side) ?? null
}

// Subscribe to region clicks. The callback gets a region id, or null for a miss. Returns unsubscribe.
export function onRegionClick(callback) {
  clickListeners.add(callback)
  return () => clickListeners.delete(callback)
}

export function emitRegionClick(region) {
  clickListeners.forEach((callback) => callback(region))
}

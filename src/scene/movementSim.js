// The movement simulation engine: drives one region's rig (src/scene/movements.js) from the slider
// or Play, glows the muscles by how hard they work at that angle, and draws the band where the
// patient said it hurts, with a marker at the current angle.
import * as THREE from 'three'

const SWEEP_SECONDS = 4 // rest → peak → rest
const ACTIVE = new THREE.Color('#ffb14a') // a working muscle glows warm
const BAND_COLOR = new THREE.Color('#F78FB3') // the patient's color
// The band's ring is drawn in its own XY plane, then turned into the body plane it belongs to.
const PLANES = {
  frontal: new THREE.Euler(0, 0, 0), // facing the camera from the front
  sagittal: new THREE.Euler(0, Math.PI / 2, 0), // seen from the side
  horizontal: new THREE.Euler(-Math.PI / 2, 0, 0), // seen from above
}

export function createMovementSim(movement, entry, { reduceMotion = false } = {}) {
  const { rig, meshes } = entry
  const { activity, band: bandSpec, min, max } = movement
  const muscles = meshes.filter((m) => activity[m.userData.fma])
  const hidden = meshes.filter((m) => movement.hide?.includes(m.userData.fma))
  for (const m of muscles) m.userData.baseColor ??= m.material.color.clone()
  const ringAngle = (t) => THREE.MathUtils.degToRad(bandSpec.ringAngle(t))

  let angle = rig.rest
  let sweep = null // { t, from, peak, onEnd }
  const listeners = new Set()
  let shown = null // last whole degree listeners saw
  const notify = () => listeners.forEach((l) => l())

  // The band and the marker sit at the joint, in the body plane of the movement. They don't turn
  // with the bones.
  const plane = new THREE.Group()
  plane.position.copy(rig.bandAt)
  plane.rotation.copy(PLANES[bandSpec.plane])
  plane.visible = false
  rig.group.add(plane)
  const [inner, outer] = bandSpec.radii
  const bandMaterial = new THREE.MeshBasicMaterial({ color: BAND_COLOR, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
  const band = new THREE.Mesh(new THREE.BufferGeometry(), bandMaterial)
  band.renderOrder = 2
  band.visible = false
  plane.add(band)
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(inner - (outer - inner), outer + (outer - inner), 1, 1, -0.008, 0.016),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
  )
  marker.renderOrder = 3
  plane.add(marker)
  let arc = null

  function apply() {
    rig.set(angle)
    for (const m of muscles) m.material.color.copy(m.userData.baseColor).lerp(ACTIVE, activity[m.userData.fma](angle) * 0.85)
    marker.rotation.z = ringAngle(angle)
    const whole = Math.round(angle)
    if (whole !== shown) {
      shown = whole
      notify()
    }
  }

  const sim = {
    movement,
    get angle() {
      return angle
    },
    get playing() {
      return !!sweep
    },
    // For useSyncExternalStore: changes only when the whole degree or playing changes.
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    snapshot: () => `${shown}:${sweep ? 1 : 0}`,
    touched: false, // someone moved the slider: a voice sweep then stays open
    setAngle(theta) {
      sim.touched = true
      sweep = null
      angle = THREE.MathUtils.clamp(theta, min, max)
      apply()
    },
    // One sweep out to the peak and back to rest; direction -1 turns the other way (the neck).
    // onEnd when it's done, not when stopped.
    play(onEnd, direction = 1) {
      const peak = THREE.MathUtils.clamp(movement.peak * direction, min, max)
      if (reduceMotion) {
        angle = rig.rest
        apply()
        onEnd?.()
        return
      }
      sweep = { t: 0, from: angle, peak, onEnd }
      notify()
    },
    stop() {
      sweep = null
      notify()
    },
    // Called every frame. Returns true while the angle is inside the marked band.
    update(dt) {
      if (sweep) {
        sweep.t = Math.min(1, sweep.t + dt / SWEEP_SECONDS)
        const out = sweep.t < 0.5
        const k = out ? sweep.t * 2 : (sweep.t - 0.5) * 2
        const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2
        angle = out ? THREE.MathUtils.lerp(sweep.from, sweep.peak, ease) : THREE.MathUtils.lerp(sweep.peak, rig.rest, ease)
        apply()
        if (sweep.t === 1) {
          const done = sweep.onEnd
          sweep = null
          notify()
          done?.()
        }
      }
      const inside = !!arc && angle >= arc.from && angle <= arc.to
      bandMaterial.opacity = inside ? 0.6 + 0.25 * Math.sin(performance.now() / 160) : 0.4
      return inside
    },
    // { from, to } in degrees (from < to), or null.
    setArc(next) {
      arc = next && next.to > next.from ? next : null
      band.visible = !!arc
      if (!arc) return
      const a = ringAngle(arc.from)
      const b = ringAngle(arc.to)
      band.geometry.dispose()
      band.geometry = new THREE.RingGeometry(inner, outer, 48, 1, Math.min(a, b), Math.abs(b - a))
    },
    show(visible) {
      plane.visible = visible
      for (const m of hidden) m.visible = !visible
    },
    // Back to the model's resting pose and colors.
    reset() {
      sim.touched = false
      sweep = null
      angle = rig.rest
      apply()
      for (const m of muscles) m.material.color.copy(m.userData.baseColor)
      sim.show(false)
    },
  }
  apply()
  for (const m of muscles) m.material.color.copy(m.userData.baseColor)
  return sim
}
